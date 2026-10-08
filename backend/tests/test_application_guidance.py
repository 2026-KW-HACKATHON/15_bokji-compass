"""Operational application metadata is derived only from the original notice."""

import json
from copy import deepcopy
from datetime import datetime

import pytest

from app.modules.presentation.application import application_guide
from app.modules.storage.catalog import card


def record(fields, overview=None):
    return {
        "policy_key": "gov24:application-fixture", "revision_id": "application-revision",
        "source_json": {
            "title": "가상의 신청 지원", "organization": "가상 기관",
            "source_url": "https://example.gov/notice/7", "fields": fields,
        },
        "draft_json": {"overview": overview or {}}, "category": "생활·금융",
        "created_at": datetime(2026, 10, 8),
    }


@pytest.mark.parametrize("full", [False, True])
def test_catalog_exposes_original_application_guide_on_cards_and_details(full):
    original = record({
        "application_method": "온라인 또는 센터 방문 신청\n전화 신청: 02-1234-5678",
        "application_url": "https://example.gov/register/selectApplication.do?program=7",
        "contact": "상담전화: 1350", "receipt_agency": "가상 센터 (가상시 청사 2층)",
        "documents": "신분증\n대리 신청인 경우: 위임장 및 대리인 신분증\n등본 또는 가족관계증명서",
    })
    before = deepcopy(original)
    result = card(original, full=full)
    guide = result["applicationGuide"]
    assert set(guide) == {
        "methodText", "onlineUrl", "phones", "visitText", "documents", "documentsStatus",
        "documentsNote",
    }
    assert guide["methodText"] == before["source_json"]["fields"]["application_method"]
    assert guide["onlineUrl"] == before["source_json"]["fields"]["application_url"]
    assert guide["phones"] == [
        {"number": "02-1234-5678", "label": "전화 신청", "kind": "application"},
        {"number": "1350", "label": "상담전화", "kind": "inquiry"},
    ]
    assert guide["visitText"] == "온라인 또는 센터 방문 신청\n가상 센터 (가상시 청사 2층)"
    assert guide["documentsStatus"] == "listed"
    assert [item["label"] for item in guide["documents"]] == [
        "신분증", "대리 신청인 경우: 위임장 및 대리인 신분증", "등본 또는 가족관계증명서",
    ]
    assert all(len(item["id"]) <= 128 for item in guide["documents"])
    assert original == before


@pytest.mark.parametrize("url", [
    "javascript:alert(1)", "data:text/html,apply", "//example.gov/apply",
    "https://name:password@example.gov/apply", "https://example.gov:broken/apply",
    "https://example.gov", "https://example.gov/", "https://example.gov/portal",
    "https://example.gov/cm/main.do", "https://example.gov/index.html",
    "https://example.gov/contact", "https://example.gov/inquiry/form",
    "https://example.gov/help.html", "https://example.gov/member/login.do",
    "https://example.gov/notice/7", "https://example.gov/notice/7#apply",
    "HTTPS://EXAMPLE.GOV/notice/7/", "https://example.gov/board/view.do?id=7",
    "https://example.gov/cm/c/f/1100/selecSystInfo.do?systId=7",
    "https://example.gov/apply https://other.gov/apply", "https://example.gov/\napply",
    "https://example.gov\\other/apply",
])
def test_unsafe_notice_home_or_ambiguous_urls_do_not_become_application_actions(url):
    guide = application_guide({"application_url": url}, source_url="https://example.gov/notice/7")
    assert guide["onlineUrl"] is None


def test_related_links_or_online_method_without_application_url_do_not_guess_destination():
    guide = application_guide({
        "application_method": "센터를 방문하거나 온라인, 우편, 전화로 신청",
        "links": "온라인 신청: https://example.gov/register",
        "attachments": "신청서: https://example.gov/form.hwp", "contact": "상담전화 1350",
    })
    assert guide["onlineUrl"] is None
    assert guide["phones"] == [{"number": "1350", "label": "상담전화", "kind": "inquiry"}]
    assert guide["documentsStatus"] == "unknown"
    assert guide["documents"] == []


@pytest.mark.parametrize("method,contact,kind", [
    ("전화 신청: 02-1234-5678", "", "application"),
    ("02-1234-5678로 전화 신청", "", "application"),
    ("전화로 신청 (02-1234-5678)", "", "application"),
    ("전화 신청 가능", "센터: 02-1234-5678", "inquiry"),
    ("전화 신청", "상담전화: 02-1234-5678", "inquiry"),
    ("전화 신청 불가 (문의 02-1234-5678)", "", "inquiry"),
    ("전화 신청 안내·상담: 02-1234-5678", "", "inquiry"),
    ("방문으로만 신청 (전화 02-1234-5678)", "", "inquiry"),
])
def test_application_phone_requires_a_supported_number_relationship(method, contact, kind):
    phones = application_guide({"application_method": method, "contact": contact})["phones"]
    assert len(phones) == 1
    assert phones[0]["kind"] == kind


def test_structured_source_fields_keep_all_documents_and_phone_roles():
    fields = {
        "documents": json.dumps([
            "신분증", "주민등록등본 또는 가족관계증명서", "해당자: 장애인증명서", "신분증",
            "임대차계약서", "소득 확인 서류", "재직증명서", "별도 심사가 필요한 경우: 추가 자료",
        ], ensure_ascii=False),
        "application_method": json.dumps([
            {"applmetNm": "전화 신청", "applmetCn": "1577-1234"},
            {"applmetNm": "방문 신청", "applmetCn": "주소지 주민센터"},
        ], ensure_ascii=False),
        "contact": json.dumps([
            {"inqplNm": "상담 부서", "inqplCtadr": "1577-1234"},
            {"inqplNm": "문의처", "inqplCtadr": "129"},
        ], ensure_ascii=False),
    }
    guide = application_guide(fields)
    assert len(guide["documents"]) == 7  # Do not truncate a real preparation checklist.
    assert guide["documents"][-1]["label"] == "별도 심사가 필요한 경우: 추가 자료"
    assert guide["phones"][0]["kind"] == "application"
    assert guide["phones"][1]["kind"] == "inquiry"
    assert guide["visitText"] == "방문 신청: 주소지 주민센터"
    reordered = application_guide({"documents": "임대차계약서\n신분증"})
    assert reordered["documents"][1]["id"] == guide["documents"][0]["id"]
    changed = application_guide({"documents": "신분증 사본"})
    assert changed["documents"][0]["id"] != guide["documents"][0]["id"]


def test_invalid_numbers_and_fax_routes_never_become_telephone_actions():
    guide = application_guide({
        "application_method": "전화 신청: 000-1234-5678\n전화 신청: 02-1234-5678",
        "contact": "팩스 신청: 02-4444-5555\nFax: 02-2222-3333\n상담전화: 1350",
    })
    assert [phone["number"] for phone in guide["phones"]] == ["02-1234-5678", "1350"]
    assert guide["phones"][0]["kind"] == "application"


@pytest.mark.parametrize("source", [
    "문의 사이트: https://example.gov/registration",
    "참고 사이트: https://example.gov/registration",
    "신청 안내: https://example.gov/registration",
    "사이트: https://example.gov/registration",
])
def test_a_valid_url_citation_still_requires_an_original_application_destination_label(source):
    guide = application_guide({"text": source}, {
        "application_url": {
            "status": "specified", "text": "https://example.gov/registration",
            "evidence": [{"source_field": "text", "quote": source}],
        },
    })
    assert guide["onlineUrl"] is None


def test_an_original_application_label_can_support_a_url_only_citation():
    fields = {"text": "신청 페이지\nhttps://example.gov/selectApply.do?program=7"}
    guide = application_guide(fields, {
        "application_url": {
            "status": "specified", "text": "https://example.gov/selectApply.do?program=7",
            "evidence": [{"source_field": "text", "quote": (
                "https://example.gov/selectApply.do?program=7"
            )}],
        },
    })
    assert guide["onlineUrl"] == "https://example.gov/selectApply.do?program=7"


@pytest.mark.parametrize("fields", [
    {"application_method": "온라인 신청: https://example.gov/apply/42"},
    {"application_method": "인터넷 접수\nhttps://example.gov/selectApplication.do?program=7"},
    {"text": "신청방법\n온라인 신청: https://example.gov/apply/42\n구비서류: 신분증"},
])
def test_explicit_original_application_method_can_supply_the_actual_application_url(fields):
    guide = application_guide(fields)
    assert guide["onlineUrl"] in {
        "https://example.gov/apply/42", "https://example.gov/selectApplication.do?program=7",
    }


@pytest.mark.parametrize("method", [
    "사이트: https://example.gov/apply/42",
    "문의 사이트: https://example.gov/apply/42",
    "온라인 신청 안내: https://example.gov/apply/42",
    "온라인 신청: https://example.gov/contact",
    "온라인 신청: https://example.gov/notice/42",
    "온라인 신청: https://example.gov/",
    "온라인 신청: https://example.gov/apply/42\n온라인 접수: https://other.gov/registration",
])
def test_method_urls_need_a_single_supported_application_destination(method):
    assert application_guide({"application_method": method})["onlineUrl"] is None


@pytest.mark.parametrize("text", ["해당없음", "없음", "구비서류: 없음", "- 제출서류 없음"])
def test_explicit_document_absence_differs_from_missing_information(text):
    guide = application_guide({"documents": text})
    assert guide["documentsStatus"] == "none"
    assert guide["documents"] == []
    assert guide["documentsNote"] == text
    assert application_guide({})["documentsStatus"] == "unknown"


def test_conditional_documents_are_not_overridden_by_no_document_marker():
    guide = application_guide({"documents": "해당없음\n대리 신청 시: 위임장\n기관 문의"})
    assert guide["documentsStatus"] == "listed"
    assert guide["documents"][0]["label"] == "대리 신청 시: 위임장"
    assert guide["documentsNote"] == "해당없음\n기관 문의"


def test_original_labelled_body_is_bounded_and_form_absence_is_not_document_absence():
    guide = application_guide({"text": (
        "지원대상: 장애인\n신청방법\n센터를 방문하거나 온라인, 우편, 전화로 신청\n"
        "신 청 서\n해당없음\n문의처: 상담전화 1350\n지원내용: 지원금 지급"
    )})
    assert guide["methodText"] == "센터를 방문하거나 온라인, 우편, 전화로 신청"
    assert guide["documentsStatus"] == "unknown"
    assert guide["documents"] == []
    assert "신청서: 해당없음" in guide["documentsNote"]
    assert guide["phones"] == [{"number": "1350", "label": "상담전화", "kind": "inquiry"}]
    required = application_guide({"text": (
        "구비서류: 신분증\n대리 신청인 경우: 위임장\n등본 또는 가족관계증명서\n"
        "신청기간: 상시\n지원대상: 근로자"
    )})
    assert required["documentsStatus"] == "listed"
    assert len(required["documents"]) == 3
    assert "근로자" not in str(required["documents"])


@pytest.mark.parametrize("form", ["신청서", "- 신청서", "2. 신청서"])
def test_an_application_form_in_required_document_list_does_not_start_a_new_section(form):
    guide = application_guide({"text": (
        f"제출서류\n신분증\n{form}\n소득증명서\n신청방법: 센터 방문 신청"
    )})
    assert [item["label"] for item in guide["documents"]] == ["신분증", form, "소득증명서"]
    assert guide["documentsNote"] == ""
    assert guide["methodText"] == "센터 방문 신청"


def test_explicit_no_documents_and_a_separate_form_heading_are_distinct():
    guide = application_guide({"text": "구비서류: 없음\n신청서\n해당없음\n문의처: 담당 기관"})
    assert guide["documentsStatus"] == "none"
    assert guide["documents"] == []
    assert guide["documentsNote"] == "없음\n신청서: 해당없음"


def test_valid_overview_citations_use_original_quotes_and_invalid_evidence_is_ignored():
    fields = {"text": "센터에 방문하여 신청합니다.\n온라인 신청: https://example.gov/registration"}
    overview = {
        "application_method": {
            "status": "specified", "text": "Apply in person (a translated summary)",
            "evidence": [{"source_field": "text", "quote": "센터에 방문하여 신청합니다."}],
        },
        "application_url": {
            "status": "specified", "text": "https://example.gov/registration",
            "evidence": [{"source_field": "text", "quote": (
                "온라인 신청: https://example.gov/registration"
            )}],
        },
        "documents": {
            "status": "specified", "text": "신분증",
            "evidence": [{"source_field": "text", "quote": "존재하지 않는 서류 요구"}],
        },
    }
    guide = application_guide(fields, overview)
    assert guide["methodText"] == "센터에 방문하여 신청합니다."
    assert guide["onlineUrl"] == "https://example.gov/registration"
    assert guide["documentsStatus"] == "unknown"
    overview["application_url"]["evidence"] = []
    overview["application_method"]["evidence"].append({"source_field": "bad", "quote": "fake"})
    invalid = application_guide(fields, overview)
    assert invalid["methodText"] == ""
    assert invalid["onlineUrl"] is None


def test_eligibility_is_never_converted_to_required_documents_or_an_application_route():
    guide = application_guide({
        "eligibility": "장애인증명서 보유자 및 근로자: 02-1234-5678",
        "selection": "소득 증빙을 확인해 선정", "application_method": "인터넷 신청",
    })
    assert guide["documents"] == []
    assert guide["documentsStatus"] == "unknown"
    assert guide["onlineUrl"] is None
    assert guide["phones"] == []
    unsupported = application_guide({"eligibility": "장애인증명서 보유자"}, {
        "documents": {"status": "specified", "text": "장애인증명서", "evidence": [
            {"source_field": "eligibility", "quote": "장애인증명서 보유자"},
        ]},
    })
    assert unsupported["documents"] == []
    assert unsupported["documentsStatus"] == "unknown"


@pytest.mark.parametrize("destination", [
    "https://example.gov/notices/42",
    "https://www.gov.kr/portal/rcvfvrSvc/dtlEx/142100000001",
])
def test_other_official_notice_urls_are_not_application_destinations(destination):
    assert application_guide({"application_url": destination},
                             source_url="https://different.gov/policy/42")["onlineUrl"] is None
