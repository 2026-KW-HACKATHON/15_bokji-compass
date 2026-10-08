"""Offline link recovery for existing published and newly collected services."""

from copy import deepcopy
from datetime import datetime

import pytest

from app.modules.normalization.raw import normalize_record
from app.modules.normalization.source_urls import policy_source_url
from app.modules.storage.catalog import card


@pytest.mark.parametrize("key,expected", [
    ("gov24:142100000001", "https://www.gov.kr/portal/rcvfvrSvc/dtlEx/142100000001"),
    ("bokjiro:WLF00005442", "https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/"
     "moveTWAT52011M.do?wlfareInfoId=WLF00005442"),
    ("notice:unlinked", None),
    ("gov24:../other", None),
    ("gov24:test-1", None),
    ("gov24:001", None),
    ("bokjiro:unrecognized", None),
    ("bokjiro:WLF１２３４５６７８", None),
    ("bokjiro:", None),
])
def test_missing_links_use_provider_identity_only(key, expected):
    assert policy_source_url(key) == expected


def test_supplied_original_precedes_listing_and_never_becomes_application_link():
    original = "https://example.gov/notice?id=1"
    listing = {"상세조회URL": "https://example.gov/listed-notice", "조회수": 10}
    assert policy_source_url("gov24:001", original, listing) == original
    assert policy_source_url("gov24:001", None, listing) == listing["상세조회URL"]
    assert policy_source_url("notice:001", None,
                             {"application_url": "https://example.gov/apply"}) is None


@pytest.mark.parametrize("value", ["javascript:alert(1)", "https://user:pass@example.gov/a",
                                  "https://[", "file:///notice"])
def test_nonpublic_links_are_not_exposed(value):
    assert policy_source_url("notice:001", value, {"url": value}) is None


def test_new_service_and_existing_published_card_recover_same_official_link():
    source = normalize_record({"서비스ID": "142100000001", "서비스명": "보조공학기기 지원",
                               "지원대상": "1인 중증장애인 사업주"})
    assert source.source_url == policy_source_url(source.policy_key)
    legacy = source.model_dump()
    legacy["source_url"] = None
    record = {"policy_key": source.policy_key, "revision_id": "legacy-revision",
              "source_json": legacy, "draft_json": {}, "category": None,
              "created_at": datetime(2026, 10, 8)}
    before = deepcopy(record)
    assert card(record, full=True)["sourceUrl"] == source.source_url
    assert record == before
