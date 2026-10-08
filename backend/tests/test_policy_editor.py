"""Human edits: validation, optimistic concurrency, publication and live catalog consistency."""

from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy

import pytest
from sqlalchemy import delete, insert, select

from app.modules.ingestion.models import records
from app.modules.storage import catalog, editor
from app.modules.storage.publication import PublicationConflict, set_publication_status
from tests.test_policy_database import draft, source

pytest_plugins = ["tests.test_policy_database"]


def edit_input(record, **changes):
    return editor.PolicyEditInput.model_validate({
        **{key: record[key] for key in ("version", "title", "organization", "source_url",
                                       "fields", "category", "display", "published")},
        "note": "수정 회귀 테스트", **changes})


def test_manual_draft_preserves_raw_and_validates_summary_category_conditions():
    original = draft(source())
    before = deepcopy(original)
    data = editor.PolicyEditInput(version="a" * 64, title="수정한 제목", organization="수정 기관",
        fields=original["source"]["fields"], category="교육", published=True, note="조건 수정",
        display={"summary": "새 요약", "age": "만 19세 이상", "region": "전국",
                 "region_status": "unrestricted"})
    value = editor.build_manual_draft(original["source"]["policy_key"], data, original)
    assert original == before
    assert value["overview"]["category"] == "교육"
    assert value["overview"]["region_conditions"]["status"] == "unrestricted"
    assert value["editorial"]["summary"] == "새 요약"
    assert value["analysis"] == original["analysis"]
    assert value["source"]["fields"]["text"] == original["source"]["fields"]["text"]
    assert value["source"]["source_hash"] != original["source"]["source_hash"]


def test_bad_manual_condition_code_or_quote_rejected_without_mutating_original():
    original = draft(source())
    for field, value in [("state_code", 7), ("evidence_quote", "원문에 없는 근거")]:
        analysis = deepcopy(original["analysis"])
        analysis["conditions"][0][field] = value
        data = editor.PolicyEditInput(version="a" * 64, title="제목", organization="기관",
            fields=original["source"]["fields"], category="주거", published=False, note="검증",
            display={}, analysis=analysis)
        with pytest.raises(ValueError):
            editor.build_manual_draft(original["source"]["policy_key"], data, original)
    with pytest.raises(ValueError):
        editor.build_manual_draft(original["source"]["policy_key"],
                                  data.model_copy(update={"analysis": {}}), original)


def test_manual_summary_does_not_truncate_long_source_and_unsafe_url_rejected():
    data = editor.PolicyEditInput(version="a" * 64, title="제목", organization="기관",
        fields={"text": "공고 본문\n" * 20000}, category="기타", published=False,
        note="본문 보존", display={"summary": "요약"})
    value = editor.build_manual_draft("test:long-editor", data, {})
    assert value["source"]["fields"]["text"] == data.fields["text"]
    with pytest.raises(ValueError):
        editor.PolicyEditInput.model_validate({**data.model_dump(), "source_url": "javascript:bad"})
    with pytest.raises(ValueError):
        editor.DisplayInput(other="가" * 301)


def published_fixture(repository):
    original = draft(source())
    saved = repository.import_draft(original)["records"][0]["revision_id"]
    set_publication_status(repository, saved, action="publish", expected_status="draft",
                           actor_id="editor-test", note="기존 공고 공개")
    return original, saved, original["source"]["policy_key"]


def test_save_changes_live_catalog_keeps_prior_revision_and_blocks_auto_overwrite(repository):
    original, first, key = published_fixture(repository)
    read = editor.read_policy_edit(repository, key)
    change = edit_input(read, title="관리자 수정 " + key, organization="변경 기관", category="교육",
        display={**read["display"], "summary": "프론트에 반영할 새 요약", "benefits": "교육비 지원",
                 "application_period": "2026년 10월 1일부터 10월 31일까지"})
    saved = editor.save_policy_edit(repository, key, change, "admin-test")
    item = catalog.get_policy(repository, key)
    assert item["title"] == change.title and item["summary"] == "프론트에 반영할 새 요약"
    assert item["category"] == "교육" and item["organization"] == "변경 기관"
    assert item["applicationStart"] == "2026-10-01" and item["applicationEnd"] == "2026-10-31"
    assert catalog.list_policies(repository, q=key, category="교육")["total"] == 1
    assert catalog.list_policies(repository, q=key, category="주거")["total"] == 0
    assert catalog.list_calendar(repository, month="2026-10", q=key)["total"] == 1
    assert repository.get_revision(first, published_only=False)["draft_json"] == original
    assert saved["revisionId"] != first and saved["published"]
    with pytest.raises(PublicationConflict):
        editor.save_policy_edit(repository, key, change, "stale-admin")
    repository.auto_publish = True
    auto = repository.import_draft({**original, "method": "new-ai-after-edit"})
    ai_revision = auto["records"][0]["revision_id"]
    assert repository.get_revision(ai_revision, published_only=False)["review_status"] == "draft"
    assert catalog.get_policy(repository, key)["revisionId"] == saved["revisionId"]
    with repository.engine.connect() as c:
        legacy = c.execute(select(repository.tables["policies"]).where(
            repository.tables["policies"].c.source_key == key)).mappings().one()
    assert legacy["title"] == change.title


def test_nonpublic_save_removes_old_publication_and_two_stale_edits_cannot_both_win(repository):
    _, _, key = published_fixture(repository)
    read = editor.read_policy_edit(repository, key)
    data = edit_input(read, published=False)
    def save(_):
        try:
            return editor.save_policy_edit(repository, key, data, "admin-test")
        except PublicationConflict:
            return None
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(save, [1, 2]))
    assert sum(value is not None for value in results) == 1
    assert catalog.get_policy(repository, key) is None
    assert not editor.read_policy_edit(repository, key)["published"]


def test_raw_unanalyzed_policy_can_be_found_edited_and_published(repository):
    s = source()
    key = s.policy_key
    repository.start_run([s], {"origin": "isolated-raw-editor-test"})
    with repository.engine.begin() as c:
        c.execute(insert(records).values(policy_key=key, provider="test", external_id=key,
            source_json=s.model_dump(), content_hash="a" * 64, last_seen_at=1,
            next_check_at=1))
    try:
        result = editor.list_editable_policies(repository, q=key, status="raw")
        assert result["total"] == 1 and result["items"][0]["policy_key"] == key
        read = editor.read_policy_edit(repository, key)
        assert read["revisionId"] is None and read["reviewStatus"] == "raw"
        saved = editor.save_policy_edit(repository, key, edit_input(read, published=True), "admin")
        assert saved["published"] and catalog.get_policy(repository, key)
    finally:
        with repository.engine.begin() as c:
            c.execute(delete(records).where(records.c.policy_key == key))
