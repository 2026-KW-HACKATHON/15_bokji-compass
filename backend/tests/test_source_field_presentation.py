"""Source objects become display text without changing saved evidence or calendar data."""

import json
from copy import deepcopy
from datetime import datetime

import pytest

from app.modules.normalization.raw import normalize_record
from app.modules.policy_translation.public import display_fields, source_hash
from app.modules.presentation.public import format_source_field, format_source_fields
from app.modules.storage.catalog import card


def structured_record():
    """Synthetic provider response shared with the browser regression test."""
    source = normalize_record({
        "servId": "display-fixture", "servNm": "가사·간병 방문 지원사업",
        "jurMnofNm": "테스트 복지기관", "tgtrDtlCn": "돌봄이 필요한 가구",
        "alwServCn": "가사·간병 방문 서비스 지원", "applPeriod": "상시 신청",
        "baslawList": [
            {"servSeCode": "030", "servSeDetailNm": "사회서비스 이용 및 이용권 관리에 관한 법률"},
            {"servSeCode": "030", "servSeDetailNm": "사회복지사업법"},
        ],
        "inqplCtadrList": [
            {"servSeCode": "010", "servSeDetailNm": "사회서비스전자바우처",
             "servSeDetailLink": "1566-3232"},
            {"servSeCode": "010", "servSeDetailNm": "보건복지상담센터", "servSeDetailLink": "129"},
        ],
        "applmetList": [
            {"servSeCode": "070", "servSeDetailNm": "신청기관연락처목록",
             "servSeDetailLink": "주소지 읍·면·동 주민센터에서 신청"},
            {"servSeCode": "070", "servSeDetailNm": "조사기관연락처목록",
             "servSeDetailLink": "시·군·구청에서 조사 및 심사"},
            {"servSeCode": "070", "servSeDetailNm": "이의신청접수기관연락처목록",
             "servSeDetailLink": "이의가 있는 경우 담당 시·군·구청에 신청"},
        ],
        "basfrmList": [
            {"servSeCode": "040", "servSeDetailNm": "서비스 신청서.hwpx",
             "servSeDetailLink": "https://example.gov/form?file=1&format=hwpx"},
        ],
    }).model_dump(mode="json")
    source["fields"]["links"] = json.dumps([
        {"label": "온라인 신청 안내", "url": "https://example.gov/apply"},
    ], ensure_ascii=False)
    return {
        "policy_key": source["policy_key"], "revision_id": "display-revision",
        "source_json": source, "draft_json": {"overview": {}},
        "category": "건강·돌봄", "created_at": datetime(2026, 10, 8),
    }


@pytest.mark.parametrize("raw,expected", [
    ({"servSeCode": "030", "servSeDetailNm": "사회복지사업법"}, "사회복지사업법"),
    ({"inqplNm": "담당부서", "inqplCtadr": "02-1234-5678"}, "담당부서: 02-1234-5678"),
    ({"applmetNm": "방문 신청", "applmetCn": "주민센터 방문"}, "방문 신청: 주민센터 방문"),
    ({"basfrmNm": "신청서", "basfrmLink": "https://example.gov/form.hwp"},
     "신청서: https://example.gov/form.hwp"),
    ({"baslawNm": "가상 법령"}, "가상 법령"),
    ({"items": [{"title": "첨부 파일", "url": "https://example.gov/file"}]},
     "첨부 파일: https://example.gov/file"),
    ({"name": "추가 안내", "phone": "129", "email": "help@example.gov", "address": "주민센터"},
     "추가 안내: 129\n이메일: help@example.gov\n주소: 주민센터"),
    ({"새 항목": {"unknownText": "추가 지원 조건"}, "servSeCode": "030"},
     "새 항목: 추가 지원 조건"),
    ({"name": "본인 부담금", "value": 0}, "본인 부담금: 0"),
    ({"name": "제출 필요", "value": False}, "제출 필요: 아니요"),
    ({"servSeDetailNm": "주민센터", "servSeDetailLink": "주민센터"}, "주민센터"),
    (["신분증", "신청서", "신분증"], "신분증\n신청서\n신분증"),
    ({"wrapper": json.dumps({"baslawNm": "중첩 법령"}, ensure_ascii=False)}, "중첩 법령"),
    ([None, {}, {"servSeCode": "010"}], ""),
])
def test_structured_fields_preserve_meaning_and_order_without_api_keys(raw, expected):
    original = json.dumps(raw, ensure_ascii=False)
    result = format_source_field(original)
    assert result == expected
    assert format_source_field(result) == result


@pytest.mark.parametrize("text", [
    "  담당부서 02-1234-5678\n평일 09:00 ~ 18:00  ",
    "[별지 1] 소득·재산 신고서", "{작성 안내} 신청서 작성",
    "[잘못된 JSON", '<img src=x onerror="alert(1)">',
])
def test_plain_text_and_incomplete_bracketed_prose_pass_through_verbatim(text):
    assert format_source_field(text) == text


def test_empty_objects_and_internal_metadata_are_omitted():
    assert format_source_fields({
        "laws": "[]", "attachments": "{}", "contact": "   ",
        "_editor_category": "교육", "benefits": "최대 100만원 지원",
    }) == {"benefits": "최대 100만원 지원"}


@pytest.mark.parametrize("full", [False, True])
@pytest.mark.parametrize("overview_override", [False, True])
def test_cards_clean_source_and_overview_without_mutation(full, overview_override):
    record = structured_record()
    fields = record["source_json"]["fields"]
    if overview_override:
        record["draft_json"]["overview"] = {
            name: {"status": "specified", "text": fields[name], "evidence": []}
            for name in ("contact", "application_method")
        }
    original = deepcopy(record)
    result = card(record, full=full)
    assert result["contact"] == "사회서비스전자바우처: 1566-3232\n보건복지상담센터: 129"
    assert result["applicationMethod"] == (
        "신청: 주소지 읍·면·동 주민센터에서 신청\n조사 및 심사: 시·군·구청에서 조사 및 심사\n"
        "이의 신청: 이의가 있는 경우 담당 시·군·구청에 신청"
    )
    assert result["scheduleStatus"] == "ongoing"
    assert result["applicationStart"] is None and result["applicationEnd"] is None
    if full:
        assert result["sourceFields"]["laws"] == (
            "사회서비스 이용 및 이용권 관리에 관한 법률\n사회복지사업법"
        )
        assert result["sourceFields"]["attachments"] == (
            "서비스 신청서.hwpx: https://example.gov/form?file=1&format=hwpx"
        )
        assert result["sourceFields"]["links"] == "온라인 신청 안내: https://example.gov/apply"
        assert result["sourceFields"]["contact"] == result["contact"]
        assert result["sourceFields"]["application_method"] == result["applicationMethod"]
        assert "servSe" not in json.dumps(result["sourceFields"])
        # Display changes select a new translation cache entry automatically.
        old = display_fields({**result, "sourceFields": fields})
        assert source_hash(display_fields(result)) != source_hash(old)
    else:
        assert result["sourceFields"] == {}
    assert record == original
    assert json.loads(fields["contact"])[0]["servSeCode"] == "010"
