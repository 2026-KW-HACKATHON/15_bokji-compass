"""Real reference bundle validation; no production writes, network or model calls."""

from datetime import date

from app.modules.storage.focus_data import _source_identity, focus_drafts
from app.modules.storage.repository import validate_draft


def test_reference_bundle_is_complete_and_keeps_qualification_unknown():
    drafts = focus_drafts(as_of=date(2026, 10, 8))
    assert sum(d["source"]["organization"] == "광운대학교" for d in drafts) == 190
    assert sum(d["source"]["policy_key"].startswith("local:") for d in drafts) == 20
    assert len({_source_identity(d["source"]) for d in drafts}) == len(drafts)
    for draft in drafts:
        assert validate_draft(draft) == draft
        assert draft["matching_enabled"] is False
        if draft.get("method") == "official-reference":
            assert draft["canonical"]["coverage"] == "partial"
            assert draft["canonical"]["logic"]["op"] == "unknown"
            assert all(condition["state_code"] == 9
                       for condition in draft["canonical"]["conditions"])


def test_notice_identity_ignores_listing_tracking_and_host_variant():
    original = {"policy_key": "notice:old", "source_url":
        "https://www.kw.ac.kr/ko/life/notice.jsp?BoardMode=view&DUID=52803&srCategoryId=4"}
    changed = {"policy_key": "notice:new", "source_url":
        "https://m.kw.ac.kr/ko/life/notice.jsp?DUID=52803&tpage=4&searchKey=1"}
    assert _source_identity(original) == _source_identity(changed)
    assert _source_identity({**changed, "source_url":
        "https://example.org/notice?DUID=52803"}) != _source_identity(original)
