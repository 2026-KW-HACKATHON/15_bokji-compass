"""Prepared responses must reflect stored source text without synthesizing facts."""

import pytest

from app.modules.assistant.faq import prepared_faqs
from app.modules.normalization.raw import normalize_record


def source_record(**fields):
    source = normalize_record({"서비스ID": "faq-fixture", "서비스명": "검증용 공고",
        "소관기관명": "검증 기관", "지원내용": "교육비를 지원합니다.",
        "지원대상": "만 19세 이상", "선정기준": "기관 심사 후 선정",
        "신청기한": "2025년 1월 31일까지", **fields})
    return {"source_json": source.model_dump(), "review_status": "published"}


def test_prepared_topics_cite_original_fields_and_do_not_claim_current_eligibility():
    record = source_record()
    response = prepared_faqs(record, "revision")
    items = {item["id"]: item for item in response["items"]}
    assert set(items) == {"benefits", "eligibility", "period", "application",
                         "documents", "qualification"}
    assert "교육비를 지원합니다." in items["benefits"]["response"]["answer"]
    assert "기관 심사 후 선정" in items["eligibility"]["response"]["answer"]
    assert "2025년" in items["period"]["response"]["answer"]
    assert "현재 접수 중인지" in items["period"]["response"]["answer"]
    assert "정보가 없어요" in items["documents"]["response"]["answer"]
    assert items["documents"]["response"]["status"] == "insufficient_source"
    assert "확정할 수는 없어요" in items["qualification"]["response"]["answer"]
    for item in items.values():
        answer = item["response"]
        assert not answer["eligibility_decided"] and not answer["preview"]
        assert answer["response_type"] == "prepared"
        assert answer["source_url"] is None
        for citation in answer["citations"]:
            assert citation["quote"] in record["source_json"]["fields"][citation["source_field"]]


def test_missing_partial_and_long_sources_are_explicit_and_bounded():
    record = source_record(지원내용=" ", 선정기준="", 지원대상="조건 " * 2000)
    items = {item["id"]: item["response"] for item in prepared_faqs(record, "rev")["items"]}
    assert items["benefits"]["status"] == "insufficient_source"
    assert items["benefits"]["citations"] == []
    assert "원문 일부" in items["eligibility"]["answer"]
    assert "선정 기준 정보가 없어요" in items["eligibility"]["answer"]
    assert len(items["eligibility"]["answer"]) < 4000
    assert len(items["eligibility"]["citations"][0]["quote"]) <= 500


@pytest.mark.parametrize("status", ["draft", "reviewed", "rejected"])
def test_faq_never_publishes_unreviewed_sources(status):
    with pytest.raises(ValueError, match="published"):
        prepared_faqs({**source_record(), "review_status": status}, "revision")
