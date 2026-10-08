"""Provider detail evidence remains available to extraction without fetching attachments."""

import hashlib
import json

from app.modules.normalization.raw import normalize_record


def test_gov24_preserves_application_documents_laws_and_contact():
    record = normalize_record({
        "서비스ID": "0001", "서비스명": "가상 공고", "지원내용": "월세 지원",
        "신청기한": "2026-12-31", "신청방법": "방문 신청||온라인 신청",
        "구비서류": "주민등록등본", "접수기관": "담당 주민센터",
        "온라인신청사이트URL": "https://example.gov/apply", "전화문의": "담당부서 02-0000-0000",
        "법령": "가상 법령 제1조", "지원유형": "현금", "수정일시": "20261002000000",
    })
    assert record.fields["benefits"] == "월세 지원"
    assert record.fields["application_period"] == "2026-12-31"
    assert record.fields["application_method"] == "방문 신청||온라인 신청"
    assert record.fields["documents"] == "주민등록등본"
    assert record.fields["laws"] == "가상 법령 제1조"
    assert "수정일시" not in record.fields


def test_bokjiro_repeated_details_keep_order_and_attachment_metadata_only():
    row = {
        "servId": "B1", "servNm": "가상 공고", "tgtrDtlCn": "신청자 만 19세 이상",
        "alwServCn": "수업료 지원", "applPeriod": "2026-10-01 ~ 2026-10-31",
        "applmetList": [{"applmetNm": "상담", "applmetCn": "첫 단계"},
                        {"applmetNm": "신청", "applmetCn": "둘째 단계"}],
        "basfrmList": [{"basfrmNm": "신청서", "basfrmLink": "https://example.gov/form.hwp"}],
        "inqplCtadrList": [{"inqplNm": "담당부서", "inqplCtadr": "02-0000-0000"}],
        "baslawList": [{"baslawNm": "가상 법령"}], "crtrYr": "2026",
    }
    record = normalize_record(row)
    assert json.loads(record.fields["application_method"]) == row["applmetList"]
    assert json.loads(record.fields["attachments"]) == row["basfrmList"]
    assert record.fields["application_period"] == row["applPeriod"]
    assert "가상 법령" in record.fields["laws"]
    expected = hashlib.sha256(json.dumps(row, ensure_ascii=False, sort_keys=True,
                                         separators=(",", ":")).encode()).hexdigest()
    assert record.source_hash == expected


def test_notice_field_contract_and_record_hash_are_unchanged():
    row = {"document_id": "A", "title": "가상 공고", "text": "원문\r\n두 번째 줄",
           "source_url": "https://example.gov/A", "collected_at": "2026-10-02"}
    record = normalize_record(row)
    assert record.fields == {"text": "원문\n두 번째 줄"}
    expected = hashlib.sha256(json.dumps(row, ensure_ascii=False, sort_keys=True,
                                         separators=(",", ":")).encode()).hexdigest()
    assert record.source_hash == expected


def test_notice_maps_explicit_application_period():
    record = normalize_record({
        "document_id": "A", "title": "가상 공고", "text": "모집 공고",
        "application_period": "신청 기간: 2026-10-01 ~ 2026-10-31",
        "application_method": "온라인 신청",
        "application_url": "https://example.gov/apply",
        "contact": "담당부서 02-1234-5678",
        "published_date": "2026-09-01",
        "modified_date": "2026-09-12",
        "links": '[{"label":"신청","url":"https://example.gov/apply"}]',
        "source_url": "https://example.gov/A",
    })
    assert record.fields["application_period"] == "신청 기간: 2026-10-01 ~ 2026-10-31"
    assert record.fields["application_method"] == "온라인 신청"
    assert record.fields["application_url"] == "https://example.gov/apply"
    assert record.fields["contact"] == "담당부서 02-1234-5678"
    assert record.fields["published_date"] == "2026-09-01"
    assert record.fields["modified_date"] == "2026-09-12"
    assert record.fields["links"] == '[{"label":"신청","url":"https://example.gov/apply"}]'
