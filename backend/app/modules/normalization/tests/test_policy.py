from datetime import date

import pytest

from app.modules.normalization.policy import normalize_gov24_service


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