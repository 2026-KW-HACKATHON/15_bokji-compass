"""A notice series is a display grouping, never an overwrite of official source."""

import json
from copy import deepcopy
from datetime import datetime

import pytest

from app.core.config import BACKEND_ROOT
from app.modules.storage.notice_series import (
    annotate_records,
    deduplicate_notice_records,
    group_matches,
    group_records,
    notice_stage,
)


def record(title, *, key="notice:one", published="2026-05-21", organization="광운대학교",
           url=None, **fields):
    return {
        "policy_key": key,
        "revision_id": "revision-" + key,
        "title": title,
        "created_at": datetime(2026, 10, 8, 9),
        "source_json": {
            "policy_key": key, "title": title, "organization": organization,
            "source_url": url or "https://www.kw.ac.kr/ko/life/notice.jsp?DUID=" + key[-1],
            "fields": {"published_date": published, **fields},
        },
        "draft_json": {"overview": {"title": title}},
    }


def sample_notices():
    return [
        record("[등록/장학] 2026년도 2학기 국가근로장학금(사업) 학생 신청기간 안내",
               key="notice:1"),
        record("[등록/장학] 2026학년도 2학기 국가근로장학금(사업) 신청자 대상 "
               "희망근로기관(근로지) 신청 안내", key="notice:2", published="2026-08-06"),
        record("[등록/장학] 2026학년도 2학기 국가근로장학금(사업) 장학생 선발 확정 안내",
               key="notice:3", published="2026-08-25"),
    ]


def test_real_kwangwoon_source_groups_initial_followup_and_result_without_mutation():
    path = BACKEND_ROOT / "database/seeds/kwangwoon_notices.json"
    raw = json.loads(path.read_text(encoding="utf-8-sig"))
    selected = [value for value in raw
                if "2026" in value["title"] and "2학기" in value["title"]
                and "국가근로장학" in value["title"]]
    assert len(selected) == 3
    records = [record(value["title"], key=value["document_id"],
                      url=value["source_url"], published=value["published_date"])
               for value in selected]
    before = deepcopy(records)
    grouped = group_records(records)
    assert len(grouped) == 1
    item = grouped[0]
    assert "학생 신청기간" in item["source_json"]["title"]
    group = item["_notice_group"]
    assert group["title"] == "광운대학교 2026년 2학기 국가근로장학금"
    assert group["latestStage"] == "result"
    assert group["noticeCount"] == 3
    assert [notice["stage"] for notice in group["notices"]] == [
        "application", "followup", "result",
    ]
    assert {notice["sourceUrl"] for notice in group["notices"]} == {
        value["source_url"] for value in selected
    }
    assert records == before


def test_full_official_bundle_groups_verified_updates_and_preserves_recruitment_rounds():
    raw = json.loads((BACKEND_ROOT / "database/seeds/kwangwoon_notices.json").read_text(
        encoding="utf-8-sig"))
    records = [record(value["title"], key=value["document_id"],
                      url=value["source_url"], published=value["published_date"])
               for value in raw]
    before = deepcopy(records)
    grouped = group_records(records)
    assert len(records) == 190 and len(grouped) == 176
    groups = [row["_notice_group"] for row in grouped if row.get("_notice_group")]
    assert sorted(group["noticeCount"] for group in groups) == [2, 2, 2, 2, 3, 3, 4, 4]
    payments = [group for group in groups if group["title"].endswith("국가장학금 지급 안내")]
    assert len(payments) == 2
    assert {group["title"] for group in payments} == {
        "광운대학교 2025년 2학기 국가장학금 지급 안내",
        "광운대학교 2026년 1학기 국가장학금 지급 안내",
    }
    assert all(group["latestStage"] == "followup" for group in payments)
    assert all(notice["stage"] == "followup"
               for group in payments for notice in group["notices"])
    for title in ("2026학년도 1학기 국가장학금 1차 신청 안내",
                  "2026학년도 1학기 국가장학금 2차 신청 안내",
                  "2026학년도 2학기 국가장학금 1차 신청 안내",
                  "2026학년도 2학기 국가장학금 2차 신청 안내",
                  "2025학년도 2학기 화도 및 동해장학금 2차 신청 안내"):
        current = next(row for row in grouped if row["title"].endswith(title))
        assert "_notice_group" not in current
    # Additional Hadong/Donghae application explicitly calls itself the third
    # application in its body. It remains separate from the previous second round.
    extra = next(row for row in grouped if "화도 및 동해장학금 추가 신청" in row["title"])
    assert "_notice_group" not in extra
    assert records == before


@pytest.mark.parametrize("extension", [
    "(기간연장)", "[기간 연장]", "(신청기간 연장 3월 27일 18시까지)",
])
def test_same_round_extension_is_one_current_application_and_preserves_official_titles(extension):
    first = record("2026년 1학기 꿈드림장학금 1차 신청 안내", key="notice:1")
    updated = record(first["title"] + extension, key="notice:2", published="2026-06-21")
    grouped = group_records([first, updated])
    assert len(grouped) == 1
    assert grouped[0]["policy_key"] == updated["policy_key"]
    assert grouped[0]["_notice_group"]["title"] == "광운대학교 2026년 1학기 꿈드림장학금 1차"
    assert grouped[0]["_notice_group"]["latestStage"] == "application"
    assert [notice["title"] for notice in grouped[0]["_notice_group"]["notices"]] == [
        first["title"], updated["title"],
    ]


def test_reissue_without_new_recruitment_round_is_same_application():
    first = record("2026년 꿈드림 장학생 선발 안내", key="notice:1")
    updated = record("2026년 꿈드림 장학생 선발 재공고(기간연장) 안내", key="notice:2")
    grouped = group_records([first, updated])
    assert len(grouped) == 1 and grouped[0]["_notice_group"]["noticeCount"] == 2
    assert notice_stage(updated) == "application"


def test_extension_never_collapses_different_explicit_recruitment_rounds():
    first = record("2026년 2학기 꿈드림장학금 1차 신청 안내", key="notice:1")
    second = record("2026년 2학기 꿈드림장학금 2차 신청 안내(기간연장)", key="notice:2")
    assert len(group_records([first, second])) == 2


def test_national_foundation_prefix_is_removed_only_for_explicit_known_national_programs():
    first = record("[한국장학재단] 2026년도 대학생 청소년교육지원장학금(사업) 신청 안내",
                   key="notice:1")
    result = record("2026년도 대학생 청소년교육지원장학금(사업) 장학생 선발 결과 안내",
                    key="notice:2")
    assert len(group_records([first, result])) == 1
    ambiguous = [record("[한국장학재단] 2026년 꿈드림 장학금 신청 안내", key="notice:3"),
                 record("2026년 꿈드림 장학금 선발 결과 안내", key="notice:4")]
    assert len(group_records(ambiguous)) == 2


def test_farm_scholar_and_scholarship_alias_does_not_merge_other_agricultural_programs():
    first = record("2026년 2학기 농림축산식품부 청년창업농장학생 모집 안내", key="notice:1")
    extension = record("2026년 2학기 농림축산식품부 청년창업농장학금 신청 안내[기간연장]",
                       key="notice:2", published="2026-06-22")
    other = record("2026년 2학기 농림축산식품부 농식품인재 장학생 모집 안내", key="notice:3")
    grouped = group_records([first, extension, other])
    assert len(grouped) == 2 and grouped[0]["_notice_group"]["noticeCount"] == 2


def test_payment_installments_are_one_followup_group_and_do_not_close_application_rounds():
    application = record("2026학년도 1학기 국가장학금 1차 신청 안내", key="notice:1")
    second = record("2026학년도 1학기 국가장학금 2차 신청 안내", key="notice:2")
    payments = [record(f"2026학년도 1학기 국가장학금 지급 (예정)안내({number}차{suffix})",
                       key=f"notice:{number + 2}", published=f"2026-0{number + 4}-10")
                for number, suffix in ((1, ""), (2, ""), (3, ""), (4, "-최종"))]
    consent = record("2026-1학기 국가장학금 신청자 가구원 동의 안내", key="notice:7")
    grouped = group_records([application, second, *payments, consent])
    assert len(grouped) == 4
    assert all("_notice_group" not in row for row in grouped[:2])
    payment = next(row for row in grouped if row.get("_notice_group"))
    assert payment["_notice_group"]["noticeCount"] == 4
    assert payment["_notice_group"]["latestStage"] == "followup"
    assert payment["_notice_group"]["title"] == "광운대학교 2026년 1학기 국가장학금 지급 안내"
    frozen = annotate_records([application, second, *payments, consent])
    assert len(group_records([frozen[0], *frozen[2:6]])) == 2


@pytest.mark.parametrize("title, expected", [
    ("2026년 꿈드림 장학생 선발 결과 안내", "result"),
    ("2026년 꿈드림 장학생 최종합격자 발표", "result"),
    ("2026년 꿈드림 장학생 선정 결과 안내", "result"),
    ("2026년 꿈드림 신규 장학생 선발 안내", "application"),
    ("2026년 꿈드림 장학생 추가 선발 안내", "application"),
    ("2026년 꿈드림 선발 결과 및 추가모집 안내", "application"),
    ("2026년 꿈드림 장학생 모집 및 선발 일정 안내", "application"),
    ("2026년 꿈드림 선정자 대상 서류 제출 안내", "followup"),
    ("2026년 2학기 국가장학금 지급 (예정)안내(1차)", "followup"),
    ("2026-2학기 국가장학금 신청자 가구원 동의 안내", "followup"),
    ("2026년 꿈드림 장학금 지원 내용 안내", None),
    ("2026년 국가장학금 신청 및 가구원 동의 안내", "application"),
    ("2026년 생활장학금 신청 및 지급 안내", "application"),
    ("2026년 장학생 대상 교육비 지원사업 참여자 모집 안내", "application"),
    ("2026년 꿈드림 선발 결과 및 참여자 모집 안내", "application"),
    ("2026년 꿈드림 참여자 모집 결과 안내", "result"),
    ("2026년 꿈드림 참여자 모집 종료 안내", "result"),
    ("2026년 꿈드림 참여자 모집 마감 안내", "result"),
    ("2026년 국가근로 신청자 대상 희망근로기관 신청기간 안내", "followup"),
    ("2026년 꿈드림 접수 종료 안내", "result"),
    ("2026년 꿈드림 신청 마감 안내", "result"),
    ("2026년 꿈드림 참여자 모집 접수 종료 안내", "result"),
    ("2026년 꿈드림 장학생 추가 선발 결과 안내", "result"),
    ("2026년 꿈드림 접수 종료 및 추가 모집 안내", "application"),
])
def test_title_stage_does_not_hide_new_applications(title, expected):
    assert notice_stage(record(title)) == expected


def test_body_result_mentions_do_not_end_current_application():
    value = record("2026년 꿈드림 장학생 모집 안내", text="선발 결과는 12월에 발표합니다")
    assert notice_stage(value) == "application"


@pytest.mark.parametrize("different", [
    "2025년도 2학기 국가근로장학금(사업) 학생 신청기간 안내",
    "2026년도 1학기 국가근로장학금(사업) 학생 신청기간 안내",
    "2026년도 2학기 국가장학금 학생 신청기간 안내",
    "2026년도 2학기 교비근로장학 학생 신청기간 안내",
    "2026년도 2학기 국가근로장학금 방학 집중근로 학생 신청기간 안내",
    "2026년도 국가근로장학금 학생 신청기간 안내",
])
def test_other_year_semester_program_or_variant_is_a_separate_opportunity(different):
    first = sample_notices()[0]
    assert len(group_records([first, record(different, key="notice:4")])) == 2


def test_same_title_at_a_different_school_is_separate():
    first = sample_notices()[0]
    other = record(first["title"], key="notice:4", organization="경희대학교")
    assert len(group_records([first, other])) == 2


@pytest.mark.parametrize("titles", [
    ("꿈드림 장학생 신청 안내", "꿈드림 장학생 선발 결과 안내"),
    ("2026년 장학금 신청 안내", "2026년 장학금 선발 결과 안내"),
    ("2026년 1학기 및 2학기 꿈드림 장학생 신청 안내", "2026년 꿈드림 장학생 선발 결과 안내"),
    ("2026년~2027년 꿈드림 장학생 신청 안내", "2026년 꿈드림 장학생 선발 결과 안내"),
    ("2026년 동행 장학생 신청 안내", "2026년 동행지원 장학생 선발 결과 안내"),
])
def test_missing_or_ambiguous_period_and_similar_titles_do_not_merge(titles):
    assert len(group_records([record(titles[0], key="notice:1"),
                              record(titles[1], key="notice:2")])) == 2


def test_first_and_second_application_rounds_stay_separate_and_result_is_unambiguous():
    first = record("2026학년도 2학기 국가장학금 1차 신청 안내", key="notice:1")
    second = record("2026학년도 2학기 국가장학금 2차 신청 안내", key="notice:2")
    result = record("2026학년도 2학기 국가장학금 선발 결과 안내", key="notice:3")
    assert len(group_records([first, second, result])) == 3
    explicit = record("2026학년도 2학기 국가장학금 2차 선발 결과 안내", key="notice:4")
    groups = group_records([first, second, result, explicit])
    assert len(groups) == 3
    assert groups[1]["_notice_group"]["noticeCount"] == 2
    assert "2차" in groups[1]["_notice_group"]["title"]


def test_unknown_round_can_join_only_one_explicit_round():
    first = record("2026학년도 2학기 국가장학금 제1차 신청 안내", key="notice:1")
    result = record("2026학년도 2학기 국가장학금 선발 결과 안내", key="notice:2",
                    published="2026-08-25")
    grouped = group_records([first, result])
    assert len(grouped) == 1
    assert grouped[0]["_notice_group"]["latestStage"] == "result"
    assert "1차" in grouped[0]["_notice_group"]["title"]


@pytest.mark.parametrize("grouping", [group_records, annotate_records])
def test_full_snapshot_ambiguous_round_decision_cannot_change_in_filtered_subset(grouping):
    first = record("2026년 꿈드림 1차 학생 신청 안내", key="notice:1")
    second = record("2026년 꿈드림 2차 학생 신청 안내", key="notice:2")
    result = record("2026년 꿈드림 장학생 선발 확정 안내", key="notice:3")
    annotated = annotate_records([first, second, result])
    assert all(row.get("_notice_series_resolved") for row in annotated)
    filtered = grouping([annotated[0], annotated[2]])
    assert len(filtered) == 2
    assert all("_notice_group" not in row for row in filtered)
    matches = group_matches([(row, {"id": row["policy_key"]}) for row in filtered])
    assert len(matches) == 2
    assert matches[0][1]["id"] == first["policy_key"]


def test_full_snapshot_round_resolution_stays_fixed_through_multiple_subset_annotations():
    first = record("2026년 꿈드림 장학생 신청 안내", key="notice:1")
    second = record("2026년 꿈드림 2차 장학생 신청 안내", key="notice:2")
    result = record("2026년 꿈드림 장학생 선발 확정 안내", key="notice:3")
    annotated = annotate_records([first, second, result])
    filtered = annotate_records([annotated[0], annotated[2]])
    assert len(group_records(filtered)) == 2
    assert filtered[0]["_notice_series_resolved"] != filtered[1]["_notice_series_resolved"]
    assert all("_notice_group" not in row for row in filtered)


def test_unlabelled_additional_recruitment_is_a_distinct_cycle():
    first = record("2026년 꿈드림 장학생 모집 안내", key="notice:1")
    extra = record("2026년 꿈드림 장학생 추가모집 안내", key="notice:2")
    result = record("2026년 꿈드림 장학생 선발 결과 안내", key="notice:3")
    # Unspecified main round must not be inferred to be the only named additional cycle.
    # The result may refer to either cycle, so it must not close one by inference.
    assert len(group_records([first, extra, result])) == 3


def test_unnumbered_application_is_not_guessed_to_be_the_only_numbered_round():
    first = record("2026년 꿈드림 장학생 신청 안내", key="notice:1")
    second = record("2026년 꿈드림 장학생 2차 신청 안내", key="notice:2")
    result = record("2026년 꿈드림 장학생 선발 결과 안내", key="notice:3")
    assert len(group_records([first, second])) == 2
    assert len(group_records([first, second, result])) == 3


def test_unclassified_notice_stays_separate_instead_of_hiding_behind_stage_metadata():
    first = record("2026년 꿈드림 장학금 지원 내용 안내", key="notice:1")
    second = record("2026년 꿈드림 장학금 지원 내용 안내", key="notice:2")
    assert notice_stage(first) is None
    assert len(group_records([first, second])) == 2
    assert all("_notice_group" not in row for row in annotate_records([first, second]))


@pytest.mark.parametrize("program", [
    "화도 및 동해장학금", "교비근로장학(교내아르바이트)사업", "꿈드림 생활 장학금",
])
def test_series_label_preserves_program_spaces_and_parentheses(program):
    first = record(f"2026학년도 2학기 {program} 신청 안내", key="notice:1")
    result = record(f"2026학년도 2학기 {program} 장학생 선발 결과 안내", key="notice:2")
    group = group_records([first, result])[0]["_notice_group"]
    assert group["title"] == "광운대학교 2026년 2학기 " + program


def test_different_duid_host_and_tracking_variants_are_one_source_notice():
    first = record("2026년 꿈드림 장학생 모집 안내", key="notice:1",
                   url="https://www.kw.ac.kr/ko/life/notice.jsp?DUID=52803&tpage=1")
    same = record("2026년 꿈드림 장학생 모집 공고", key="notice:2",
                  url="https://m.kw.ac.kr/ko/life/notice.jsp?duid=052803&searchKey=1")
    grouped = group_records([first, same])
    assert len(grouped) == 1
    assert "_notice_group" not in grouped[0]
    assert first["policy_key"] != same["policy_key"]


def test_untrusted_duid_parameter_does_not_collapse_distinct_notices():
    first = record("무관한 공고 A", key="notice:1", url="https://example.com/?DUID=52803")
    second = record("무관한 공고 B", key="notice:2", url="https://example.com/?DUID=52803")
    assert len(group_records([first, second])) == 2


def test_same_source_page_updated_to_result_uses_latest_version_before_stage_preference():
    first = record("2026년 꿈드림 장학생 모집 안내", key="notice:1",
                   url="https://www.kw.ac.kr/ko/life/notice.jsp?DUID=52803",
                   published="2026-05-21")
    updated = record("2026년 꿈드림 장학생 선발 결과 안내", key="notice:2",
                     url="https://m.kw.ac.kr/ko/life/notice.jsp?DUID=52803",
                     published="2026-08-25")
    grouped = group_records([first, updated])
    assert len(grouped) == 1
    assert grouped[0]["policy_key"] == updated["policy_key"]
    assert notice_stage(grouped[0]) == "result"
    assert "_notice_group" not in grouped[0]


def test_physical_alias_dedup_prevents_old_application_surviving_result_filter():
    first = record("2026년 꿈드림 장학생 모집 안내", key="notice:1",
                   url="https://www.kw.ac.kr/ko/life/notice.jsp?DUID=52803",
                   published="2026-05-21")
    updated = record("2026년 꿈드림 장학생 선발 결과 안내", key="notice:2",
                     url="https://m.kw.ac.kr/ko/life/notice.jsp?DUID=52803&tpage=7",
                     published="2026-08-25")
    different = sample_notices()[0]
    source = [first, different, updated]
    before = deepcopy(source)
    records = deduplicate_notice_records(iter(source))
    assert [row["policy_key"] for row in records] == [updated["policy_key"],
                                                   different["policy_key"]]
    eligible = [row for row in annotate_records(records)
                if notice_stage(row) not in {"result", "followup"}]
    assert [row["policy_key"] for row in eligible] == [different["policy_key"]]
    assert source == before
    assert records[0] is not updated


def test_physical_dedup_does_not_choose_semantic_program_representative_early():
    records = sample_notices()
    assert len(deduplicate_notice_records(records)) == 3
    unrelated = [record("같은 제목", key="notice:1", url="https://example.org/?DUID=3"),
                 record("같은 제목", key="notice:2", url="https://example.org/?DUID=3")]
    assert len(deduplicate_notice_records(unrelated)) == 2


def test_records_without_trusted_source_identity_are_not_dropped_as_aliases():
    assert deduplicate_notice_records([{"title": "공고 A"}, {"title": "공고 B"}]) == [
        {"title": "공고 A"}, {"title": "공고 B"},
    ]


def test_representative_is_newest_application_but_latest_stage_uses_publication_date():
    original, followup, result = sample_notices()
    updated = record(original["title"], key="notice:4", published="2026-05-30")
    result["created_at"] = datetime(2026, 1, 1)
    grouped = group_records([result, followup, original, updated])
    assert grouped[0]["policy_key"] == updated["policy_key"]
    assert grouped[0]["_notice_group"]["latestStage"] == "result"
    reordered = group_records([original, updated, followup, result])
    assert reordered[0]["_notice_group"]["id"] == grouped[0]["_notice_group"]["id"]


def test_without_application_representative_prefers_followup_then_newest_result():
    _, followup, result = sample_notices()
    assert group_records([result, followup])[0]["policy_key"] == followup["policy_key"]
    early = record(result["title"], key="notice:4", published="2026-08-24")
    assert group_records([early, result])[0]["policy_key"] == result["policy_key"]


def test_ranked_group_keeps_original_representative_match_and_earliest_group_position():
    original, followup, result = sample_notices()
    different = record("2026년 꿈드림 장학생 모집 안내", key="notice:4")
    result_match = {"score": 100, "reason": "result quote"}
    different_match = {"score": 90, "reason": "different quote"}
    application_match = {"score": 80, "reason": "application quote"}
    matches = group_matches([(result, result_match), (different, different_match),
                             (original, application_match), (followup, {"score": 70})])
    assert len(matches) == 2
    assert matches[0][0]["policy_key"] == original["policy_key"]
    assert matches[0][1] is application_match
    assert matches[1][1] is different_match


def test_annotation_keeps_all_ids_and_filtered_matching_retains_full_series():
    records = sample_notices()
    annotated = annotate_records(records)
    assert [row["policy_key"] for row in annotated] == [row["policy_key"] for row in records]
    group = annotated[0]["_notice_group"]
    assert all(row["_notice_group"] == group for row in annotated)
    match = {"matched": True}
    filtered = group_matches([(annotated[0], match)])
    assert filtered[0][0]["_notice_group"] == group
    assert filtered[0][0]["_notice_group"]["noticeCount"] == 3
    assert filtered[0][1] is match
    assert all("_notice_group" not in row for row in records)


def test_explicit_source_date_is_normalized_but_missing_date_is_not_invented():
    records = sample_notices()
    records[0]["source_json"]["fields"]["published_date"] = "2026.5.21"
    records[1]["source_json"]["fields"]["published_date"] = "invalid"
    records[1]["created_at"] = None
    grouped = group_records(records)
    by_id = {notice["id"]: notice for notice in grouped[0]["_notice_group"]["notices"]}
    assert by_id[records[0]["policy_key"]]["publishedDate"] == "2026-05-21"
    assert by_id[records[1]["policy_key"]]["publishedDate"] == ""


def test_empty_iterators_are_supported():
    assert group_records(iter(())) == []
    assert group_matches(iter(())) == []
    assert annotate_records(iter(())) == []
    assert deduplicate_notice_records(iter(())) == []
