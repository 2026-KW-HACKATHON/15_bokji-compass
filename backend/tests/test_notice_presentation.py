"""Notice wording and recovered branch assets, without DB/model/network access."""

import json
import re
from copy import deepcopy
from datetime import datetime
from pathlib import Path

import pytest

from app.modules.normalization.raw import load_raw_policies
from app.modules.presentation.public import format_notice_text, payment_schedule, policy_description
from app.modules.storage.catalog import card
from app.modules.storage.public import validate_draft

SEEDS = Path(__file__).resolve().parents[1] / "database" / "seeds"


@pytest.mark.parametrize("original,expected", [
    ("장학금은 2026년 12월 초 지급 예정이다.", "장학금은 2026년 12월 초 지급 예정."),
    ("장학금을 지급할 예정이다.", "장학금 지급 예정."),
    ("장학금을 지급한다.", "장학금 지급."),
    ("장학생을 선발하며, 장학금을 차등 지급한다.", "장학생 선발; 장학금 차등 지급."),
    ("재학생이 지원 대상이다.", "재학생이 지원 대상."),
    ("12월 초 지급 예정입니다.", "12월 초 지급 예정."),
    ("신청만으로 지원받을 수 있다.", "신청만으로 지원받을 수 있다."),
    ("지급 대상이 아니다.", "지급 대상이 아니다."),
    ("장학금을 지급하지 않을 예정이다.", "장학금을 지급하지 않을 예정."),
    ("최대 100만원을 차등 지급하며, 10월 중순 이후 선발완료순으로 후지급한다.",
     "최대 100만원 차등 지급; 10월 중순 이후 선발완료순으로 후지급."),
])
def test_notice_endings_preserve_amounts_qualifiers_and_negation(original, expected):
    assert format_notice_text(original) == expected


@pytest.mark.parametrize("original,expected", [
    ("❍ 장학금 지급 : 2026년 12월 초 지급 예정", "2026년 12월 초 지급 예정"),
    ("지급 예정 시기: 10월 15일(예정)", "10월 15일(예정)"),
    ("❏ 후지급 (10월 중순 이후 선발완료순으로 지급)", "10월 중순 이후 선발완료순으로 지급"),
    ("신청 기간: 2026년 10월 1일 ~ 10월 31일", None),
    ("지급방법: 계좌이체", None),
    ("지급일: 미정", None),
    ("지급일: 99월 1일", None),
    ("지급일: 10월 15일\n지급일: 11월 15일", None),
])
def test_payment_schedule_does_not_invent_dates_or_resolve_conflicts(original, expected):
    fields = {"text": original}
    assert payment_schedule(fields) == expected
    assert fields["text"] == original


def test_recovered_kwangwoon_sources_are_normalized_pipeline_inputs():
    records = load_raw_policies(SEEDS / "kwangwoon_notices.json")
    assert len(records) == len({item.policy_key for item in records}) == 190
    assert all(item.organization == "광운대학교" and item.fields.get("text") for item in records)


@pytest.mark.parametrize("purpose", [
    "월세 자금 대출을 보증해 주거비 부담을 덜어주는 제도입니다.", "", "   ", None,
])
def test_card_uses_purpose_for_description_and_preserves_detailed_benefits(purpose):
    benefit = "보증 한도: 최대 1,152만원 이내. 대출금액의 80% 보증."
    record = {
        "policy_key": "rent-guarantee", "revision_id": "revision",
        "source_json": {
            "title": "주택금융공사 월세자금보증", "organization": "한국주택금융공사",
            "source_url": "https://example.com/rent",
            "fields": {"purpose_summary": purpose, "benefits": "원천 지원 내용"},
        },
        "draft_json": {"overview": {"benefits": {"status": "specified", "text": benefit}}},
        "category": "주거", "created_at": datetime(2026, 10, 6),
    }
    before = deepcopy(record)
    result = card(record)
    expected = (purpose or "").strip() or "월세 자금 대출에 필요한 보증을 지원하는 제도입니다."
    assert result["summary"] == expected
    assert result["benefit"] == benefit
    assert record == before


@pytest.mark.parametrize("title", [
    "주택금융공사 월세자금보증", "친환경 에너지절감장비 보급",
    "유아학비 (누리과정) 지원", "장애인자립자금대여",
])
def test_legacy_services_have_brief_descriptions_without_repeating_limits(title):
    result = policy_description(title, None, "최대 1,152만원, 대출금액의 80% 지원")
    assert 10 < len(result) < 65
    assert "1,152" not in result and "80%" not in result


def test_unknown_service_falls_back_to_available_benefits():
    assert policy_description("새 지원사업", None, "훈련비를 지원합니다.") == "훈련비 지원."


@pytest.mark.parametrize("identity,payment", [
    ("4515059d908acf6b", "2026년 12월 초 지급 예정"),
    ("f5020b993c490914", "10월 중순 이후 선발완료순으로 지급"),
])
def test_recovered_overviews_show_nominal_summaries_without_changing_source(identity, payment):
    value = json.loads((SEEDS / "kwangwoon_published_policies" / (identity + ".json"))
                      .read_text(encoding="utf-8"))
    before = deepcopy(value)
    validate_draft(value)
    result = card({"policy_key": value["source"]["policy_key"], "revision_id": identity,
                   "source_json": value["source"], "draft_json": value,
                   "category": value["overview"]["category"], "created_at": datetime(2026, 10, 6)})
    assert result["summary"] == format_notice_text(value["overview"]["benefits"]["text"])
    assert result["paymentSchedule"] == payment
    assert "예정이다" not in result["summary"] and "지급한다" not in result["summary"]
    assert value == before


def test_restored_published_sql_contains_expected_rows_without_deletion():
    sql = (SEEDS / "kwangwoon_published_policies.sql").read_text(encoding="utf-8")
    assert sql.rstrip().endswith("COMMIT;")
    for table, count in {"condition_documents": 2, "policy_revision_details": 2,
                         "condition_entries": 27, "policy_publication_events": 2,
                         "policies": 2, "policy_requirements": 8}.items():
        assert len(re.findall(rf"INSERT INTO `{table}` ", sql)) == count
    assert re.search(r"\b(?:DELETE|DROP|TRUNCATE)\b", sql) is None
