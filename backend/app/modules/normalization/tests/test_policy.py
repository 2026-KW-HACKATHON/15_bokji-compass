from datetime import date

import pytest

from app.modules.normalization.policy import (
    normalize_api_service,
    normalize_api_services,
    normalize_bokjiro_service,
    normalize_gov24_service,
)


def test_normalize_gov24_service_creates_policy_and_requirement_rows() -> None:
    normalized = normalize_gov24_service(
        {
            "서비스ID": "119200000001",
            "서비스명": "친환경 에너지절감장비 보급",
            "소관기관명": "해양수산부",
            "신청기한": "2026-01-01 ~ 2026-12-31",
            "지원대상": "연근해 허가를 가진 어업인",
            "선정기준": "거주 지역별 수요조사 결과를 반영",
            "지원내용": "에너지 절감 장비 지원",
        }
    )

    assert normalized.policy["title"] == "친환경 에너지절감장비 보급"
    assert normalized.policy["organization"] == "해양수산부"
    assert normalized.policy["source_url"] == "gov24://service/119200000001"
    assert normalized.policy["application_start"] == date(2026, 1, 1)
    assert normalized.policy["application_end"] == date(2026, 12, 31)
    assert normalized.policy["is_synthetic"] is False
    assert len(normalized.requirements) == 2
    assert normalized.requirements[0].condition_type == "other"
    assert normalized.requirements[1].condition_type == "residence_region"


def test_normalize_gov24_service_keeps_unknown_period_and_missing_conditions() -> None:
    normalized = normalize_gov24_service(
        {"serviceId": "A-1", "serviceNm": "상시 지원", "orgNm": "기관"}
    )

    assert normalized.policy["application_start"] is None
    assert normalized.policy["application_end"] is None
    assert normalized.requirements[0].information_state == "not_stated"


def test_normalize_gov24_service_requires_title() -> None:
    with pytest.raises(ValueError, match="service name"):
        normalize_gov24_service({"서비스ID": "A-1"})


def test_normalize_bokjiro_service_creates_schema_rows() -> None:
    normalized = normalize_bokjiro_service(
        {
            "servId": "WLF-1",
            "servNm": "부모급여",
            "jurMnofNm": "보건복지부",
            "servDtlLink": "https://www.bokjiro.go.kr/service/WLF-1",
            "applPeriod": "2026.01.01 ~ 2026.12.31",
            "tgtrDtlCn": "만 2세 미만 아동",
            "slctCritCn": "소득 기준 없음",
        }
    )

    assert normalized.policy["title"] == "부모급여"
    assert normalized.policy["source_url"] == "https://www.bokjiro.go.kr/service/WLF-1"
    assert normalized.policy["application_start"] == date(2026, 1, 1)
    assert normalized.policy["application_end"] == date(2026, 12, 31)
    assert normalized.policy["is_synthetic"] is False
    assert [row.condition_type for row in normalized.requirements] == ["age", "other"]


def test_normalize_api_services_rejects_duplicate_records() -> None:
    with pytest.raises(ValueError, match="Duplicate API service IDs"):
        normalize_api_services(
            "bokjiro",
            [
                {"servId": "WLF-1", "servNm": "부모급여"},
                {"servId": "WLF-1", "servNm": "부모급여"},
            ],
        )


def test_invalid_provider_is_rejected_even_for_an_empty_page():
    with pytest.raises(ValueError, match="Unsupported provider"):
        normalize_api_service("typo", {"servId": "WLF-1", "servNm": "가상 정책"})
    with pytest.raises(ValueError, match="Unsupported provider"):
        normalize_api_services("typo", [])


@pytest.mark.parametrize("provider,id_key,title_key,url_key", [
    ("gov24", "서비스ID", "서비스명", "상세조회URL"),
    ("bokjiro", "servId", "servNm", "servDtlLink"),
])
def test_duplicate_source_id_rejected_even_when_detail_urls_differ(
    provider, id_key, title_key, url_key,
):
    records = [{id_key: "SAME", title_key: "가상", url_key: f"https://example.org/{i}"}
               for i in range(2)]
    with pytest.raises(ValueError, match="Duplicate API service IDs"):
        normalize_api_services(provider, records)


def test_distinct_ids_may_share_an_agency_detail_url():
    rows = [{"serviceId": str(i), "serviceNm": "가상", "detailUrl": "https://example.org/shared"}
            for i in range(2)]
    result = normalize_api_services("gov24", rows)
    assert len(result) == 2
    assert all(item.policy["source_url"] == "https://example.org/shared" for item in result)


@pytest.mark.parametrize("identity", [None, "", "  ", [], {}, False])
def test_api_entrypoint_requires_a_real_service_identifier(identity):
    with pytest.raises(ValueError, match="service ID"):
        normalize_api_services("gov24", [{"serviceId": identity, "serviceNm": "가상"}])


@pytest.mark.parametrize("records", [None, {}, "invalid", [None]])
def test_invalid_api_page_shape_fails_with_value_error(records):
    with pytest.raises(ValueError):
        normalize_api_services("gov24", records)


def test_api_empty_page_and_provider_specific_fallback():
    assert normalize_api_services("gov24", []) == ()
    row = normalize_api_service("bokjiro", {"servId": "001", "servNm": "가상"})
    assert row.policy["source_url"] == "bokjiro://service/001"
    assert row.policy["review_status"] == "draft"
    assert row.requirements[0].information_state == "not_stated"


def test_reversed_period_is_not_returned_as_database_ready():
    with pytest.raises(ValueError, match="application period"):
        normalize_api_service("bokjiro", {"servId": "001", "servNm": "가상",
                                         "applPeriod": "2026-12-31 ~ 2026-01-01"})
