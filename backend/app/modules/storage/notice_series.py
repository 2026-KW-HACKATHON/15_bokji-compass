"""Conservative, read-only grouping of a program's successive official notices.

Stored notice identities and revisions remain independent. Only an explicit
institution, year/period and an exact program name can produce a series; title
similarity and dates mentioned in the body are deliberately not evidence.
"""

import hashlib
import json
import re
import unicodedata
from collections import defaultdict
from datetime import date, datetime
from urllib.parse import parse_qs, urlsplit

from app.modules.normalization.source_urls import policy_source_url

_YEAR = re.compile(r"(?<!\d)((?:19|20)\d{2})(?!\d)(?:학년도|년도|년)?")
_PERIODS = (
    ("semester", re.compile(r"([12])학기"), "학기"),
    ("half", re.compile(r"(상|하)반기"), "반기"),
    ("quarter", re.compile(r"([1-4])분기"), "분기"),
    ("month", re.compile(r"(?<!\d)(1[0-2]|[1-9])월(?!\d)"), "월"),
)
_ROUND = re.compile(r"(?<!\d)(?:제)?(\d{1,2})(차|기|회)(?!산업)")
_APPLICATION_EXCEPTION = re.compile(
    r"모집(?!(?:신청|접수)?(?:결과|종료|완료|마감))|"
    r"추가(?:신청|접수|선발)(?!(?:기간)?(?:결과|종료|완료|마감))|"
    r"신청및(?:가구원동의|지급)"
)
_RESULT = re.compile(
    r"선발(?:확정|결과)|선정(?:확정|결과)|(?:최종)?합격(?:자)?(?:발표|명단|조회)|"
    r"선발자명단|선정자명단|선발완료|(?:신청|접수|모집)(?:결과|종료|완료|마감)"
)
_FOLLOWUP = re.compile(
    r"희망근로(?:기관|지)|가구원동의|(?:장학금)?지급(?:\(예정\))?(?:안내|일정)|"
    r"(?:신청자|선발자|선정자|합격자|수혜자|장학생)대상.*"
    r"(?:서류|교육|등록|근로지|근로기관|동의)|(?:선발|선정)된.*(?:제출|등록)"
)
_APPLICATION = re.compile(
    r"신청|접수|모집|재(?:공고|공지)|"
    r"(?:신규)?(?:장학생|지원대상자)?선발(?:안내|공고|계획|알림)"
)
_STAGE_TAILS = (
    r"(?:신청자대상)?희망근로(?:기관(?:\(근로지\))?|지)신청(?:기간)?(?:안내|공고)?",
    r"(?:신청자)?가구원동의(?:안내|공고)?",
    r"(?:장학생|학생|지원대상자)?지급(?:\(예정\))?(?:안내|일정)?",
    r"(?:신규)?(?:장학생|학생|지원대상자)?"
    r"(?:신청기간|신청|접수|모집|선발확정|선발결과|선정결과|선발자명단|"
    r"선정자명단|합격자발표|선발|선정)(?:및선발)?(?:안내|공고|계획|알림)?",
)
_TAIL = re.compile("(?:" + "|".join(_STAGE_TAILS) + ")$")
_CATEGORY_PREFIX = re.compile(
    r"^\[(?:등록/장학|등록|장학|교외장학(?:[-_][^\]]+)?|교내모집|이자지원)\]"
)
_EXTENSION = re.compile(r"[\(\[](?:신청|접수)?기간연장[^\)\]]*[\)\]]")
_REISSUE = re.compile(r"(?:재공고|재공지)(?=(?:안내|공고)?$)")
_NATIONAL_PREFIX = re.compile(
    r"^\[한국장학재단\](?=.*(?:국가근로장학|국가장학금|대학생청소년교육지원장학금))"
)
_FARM_SCHOLAR = re.compile(r"청년창업농장학생")
_PAYMENT = re.compile(r"지급(?:\(예정\))?(?:안내|일정)")
_PAYMENT_ROUND = re.compile(
    r"[\(\[](?:제)?\d{1,2}차(?:[-·]?(?:최종|마지막))?[\)\]]$"
)
_STAGE_RANK = {"application": 0, "followup": 1, "result": 2, None: 3}


def _text(value):
    return unicodedata.normalize("NFKC", str(value or "")).replace("\u200b", "").strip()


def _compact(value):
    return re.sub(r"\s+", "", _text(value))


def _source(record):
    value = record.get("source_json") or {}
    return value if isinstance(value, dict) else {}


def _title(record):
    return _text(_source(record).get("title") or record.get("title"))


def notice_stage(record):
    """Classify an explicit title action; body references never end an application."""
    title = _compact(_title(record))
    if _APPLICATION_EXCEPTION.search(title):
        return "application"
    if _RESULT.search(title):
        return "result"
    if _FOLLOWUP.search(title):
        return "followup"
    if _APPLICATION.search(title):
        return "application"
    return None


def _identity(record):
    source = _source(record)
    try:
        url = urlsplit(source.get("source_url") or "")
        query = {key.upper(): values for key, values in parse_qs(url.query).items()}
        duid = query.get("DUID")
        if (url.hostname in {"www.kw.ac.kr", "m.kw.ac.kr", "kw.ac.kr"}
                and url.path.rstrip("/") == "/ko/life/notice.jsp"
                and duid and re.fullmatch(r"\d+", duid[0])):
            return "kwangwoon:" + str(int(duid[0]))
    except ValueError:
        pass
    return "policy:" + str(record.get("policy_key") or source.get("policy_key") or "")


def _signature(record):
    if notice_stage(record) is None:
        return None
    source = _source(record)
    organization = _compact(source.get("organization"))
    organization = {"광운대": "광운대학교"}.get(organization, organization)
    title = _EXTENSION.sub("", _compact(_title(record)))
    years = {match.group(1) for match in _YEAR.finditer(title)}
    if not organization or len(years) != 1:
        return None
    year = next(iter(years))
    period = ("annual", "", "")
    found_periods = []
    for kind, pattern, suffix in _PERIODS:
        values = {match.group(1) for match in pattern.finditer(title)}
        if values:
            if len(values) != 1:
                return None
            found_periods.append((kind, next(iter(values)), suffix))
    # A title with a deadline month as well as a semester is ambiguous. Leaving
    # it separate is safer than guessing which dates identify the opportunity.
    if len(found_periods) > 1:
        return None
    if found_periods:
        period = found_periods[0]
    rounds = {match.group(1) + match.group(2) for match in _ROUND.finditer(title)}
    if len(rounds) > 1:
        return None
    round_name = next(iter(rounds), None)
    payment = notice_stage(record) == "followup" and bool(_PAYMENT.search(title))
    if payment and period[0] == "semester":
        # Disbursement installment 1/2/3/4 is not application round 1/2.
        # Its timeline is shared follow-up information, never a new opportunity.
        round_name = "payment"
    if not round_name and _APPLICATION_EXCEPTION.search(title):
        if re.search(r"추가(?:모집|신청|접수|선발)|재모집", title):
            round_name = "additional"
    stem = _CATEGORY_PREFIX.sub("", title)
    stem = _NATIONAL_PREFIX.sub("", stem)
    stem = _REISSUE.sub("", stem)
    if payment:
        stem = _PAYMENT_ROUND.sub("", stem)
    stem = _YEAR.sub("", stem)
    for _, pattern, _ in _PERIODS:
        stem = pattern.sub("", stem)
    stem = _ROUND.sub("", stem)
    stem = stem.replace("()", "")
    stem = re.sub(r"(?:추가|재)(?=모집|신청|접수|선발)", "", stem)
    stem = re.sub(r"국가근로장학(?:금(?:\(사업\))?|사업)", "국가근로장학금", stem)
    stem = _FARM_SCHOLAR.sub("청년창업농장학금", stem)
    stem = _TAIL.sub("", stem)
    # Preserve program modifiers and named institutions. Removing all words such
    # as '청년' or '장학' could merge unrelated opportunities.
    program = re.sub(r"[^\w가-힣]", "", stem).lower()
    if len(program) < 3 or program in {
        "장학금", "지원금", "지원사업", "지원안내", "장학생", "대상자", "수혜자", "근로자",
    }:
        return None
    return organization, program, year, period[0], period[1], round_name


def _replace_compact(value, pattern, replacement=""):
    """Apply semantic matches while retaining spaces and parentheses in the label."""
    compact = _compact(value)
    positions = [index for index, character in enumerate(value) if not character.isspace()]
    for match in reversed(list(pattern.finditer(compact))):
        start, end = positions[match.start()], positions[match.end() - 1] + 1
        value = value[:start] + replacement + value[end:]
    return value


def _program_display(record, canonical):
    stem = _replace_compact(_title(record), _CATEGORY_PREFIX)
    stem = _replace_compact(stem, _EXTENSION)
    stem = _replace_compact(stem, _NATIONAL_PREFIX)
    stem = _replace_compact(stem, _REISSUE)
    if notice_stage(record) == "followup" and _PAYMENT.search(_compact(stem)):
        stem = _replace_compact(stem, _PAYMENT_ROUND)
    stem = _replace_compact(stem, _YEAR)
    for _, pattern, _ in _PERIODS:
        stem = _replace_compact(stem, pattern)
    stem = _replace_compact(stem, _ROUND)
    stem = re.sub(r"\(\s*\)", "", stem)
    stem = _replace_compact(stem, re.compile(r"(?:추가|재)(?=모집|신청|접수|선발)"))
    stem = _replace_compact(stem, re.compile(r"국가근로장학(?:금(?:\(사업\))?|사업)"),
                            "국가근로장학금")
    stem = _replace_compact(stem, _FARM_SCHOLAR, "청년창업농장학금")
    stem = _replace_compact(stem, _TAIL)
    display = re.sub(r"\s+", " ", stem).strip(" -:·")
    normalized = re.sub(r"[^\w가-힣]", "", _compact(display)).lower()
    return display if normalized == canonical else canonical


def _series_id(signature):
    raw = json.dumps(signature, ensure_ascii=False, separators=(",", ":"))
    return "notice-series:" + hashlib.sha256(raw.encode()).hexdigest()[:20]


def _date(record):
    source = _source(record)
    fields = source.get("fields") or {}
    fields = fields if isinstance(fields, dict) else {}
    for value in (fields.get("published_date"), source.get("published_date"),
                  source.get("published_at"), record.get("created_at")):
        if isinstance(value, (date, datetime)):
            return value.date().isoformat() if isinstance(value, datetime) else value.isoformat()
        match = re.search(r"((?:19|20)\d{2})[-./](\d{1,2})[-./](\d{1,2})", _text(value))
        if match:
            try:
                return date(*map(int, match.groups())).isoformat()
            except ValueError:
                continue
    return ""


def _newest(record):
    created = record.get("created_at")
    created = created.isoformat() if isinstance(created, (datetime, date)) else _text(created)
    return _date(record), created, str(record.get("revision_id") or "")


def deduplicate_notice_records(records):
    """Choose current physical source aliases before any eligibility/stage filter.

    This does not choose a semantic program representative: different official
    pages remain available for their own eligibility and feedback checks.
    """
    records = list(records)
    latest = {}
    for index, record in enumerate(records):
        identity = _identity(record)
        identity = ("unknown", index) if identity == "policy:" else identity
        if identity not in latest or _newest(record) > _newest(records[latest[identity]]):
            latest[identity] = index
    return [dict(records[index]) for index in latest.values()]


def _groups(records):
    """Resolve unspecified rounds only when the complete input has one round."""
    signatures = [_signature(record) for record in records]
    rounds = defaultdict(set)
    unnumbered_applications = set()
    for record, signature in zip(records, signatures, strict=True):
        if signature and signature[-1] and signature[-1] != "payment":
            rounds[signature[:-1]].add(signature[-1])
        elif signature and notice_stage(record) == "application":
            unnumbered_applications.add(signature[:-1])
    parents = list(range(len(records)))

    def find(index):
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    def union(first, second):
        parents[find(second)] = find(first)

    by_semantic, by_identity = {}, {}
    for index, (record, signature) in enumerate(zip(records, signatures, strict=True)):
        existing = record.get("_notice_group") or {}
        frozen = record.get("_notice_series_resolved")
        semantic = frozen if isinstance(frozen, str) and frozen else None
        if not semantic:
            semantic = existing.get("id") if isinstance(existing, dict) else None
        if not semantic and signature:
            known_rounds = rounds[signature[:-1]]
            can_join_round = notice_stage(record) in {"followup", "result"}
            if (signature[-1] is None and can_join_round and len(known_rounds) == 1
                    and "additional" not in known_rounds
                    and signature[:-1] not in unnumbered_applications):
                signature = (*signature[:-1], next(iter(known_rounds)))
            elif signature[-1] is None and can_join_round and known_rounds:
                signature = None
            if signature:
                semantic = _series_id(signature)
            signatures[index] = signature
        if semantic:
            if semantic in by_semantic:
                union(by_semantic[semantic], index)
            else:
                by_semantic[semantic] = index
        identity = _identity(record)
        if identity != "policy:":
            if identity in by_identity:
                union(by_identity[identity], index)
            else:
                by_identity[identity] = index
    grouped = defaultdict(list)
    for index in range(len(records)):
        grouped[find(index)].append(index)
    return sorted(grouped.values(), key=lambda indices: indices[0]), signatures


def _metadata(records, indices, signatures):
    previous = [records[index].get("_notice_group") for index in indices]
    previous = [value for value in previous if isinstance(value, dict) and value.get("id")]
    # Recommenders may filter individual eligible rows after annotation. Preserve
    # the full series and source links rather than rebuilding it from that subset.
    if previous:
        return max(previous, key=lambda value: value.get("noticeCount", 0))
    distinct = {}
    for index in indices:
        record = records[index]
        identity = _identity(record)
        if identity not in distinct or _newest(record) > _newest(distinct[identity]):
            distinct[identity] = record
    notices = sorted(distinct.values(), key=_newest)
    if len(notices) < 2:
        return None
    signature = next((signatures[index] for index in indices if signatures[index]), None)
    if signature:
        organization, program, year, kind, value, round_name = signature
        suffix = {"semester": "학기", "half": "반기", "quarter": "분기", "month": "월"}
        period = (value + suffix[kind]) if kind != "annual" else ""
        round_label = {"additional": "추가 모집", "payment": "지급 안내"}.get(
            round_name, round_name or "")
        application = min(notices, key=lambda record: _STAGE_RANK[notice_stage(record)])
        program_label = _program_display(application, program)
        title = " ".join(filter(None, (organization, year + "년", period,
                                      program_label, round_label)))
        identity = _series_id(signature)
    else:
        title = _title(notices[-1])
        identity = _series_id((_identity(notices[-1]),))
    return {
        "id": identity,
        "title": title,
        "latestStage": notice_stage(notices[-1]),
        "noticeCount": len(notices),
        "notices": [{
            "id": record.get("policy_key") or _source(record).get("policy_key"),
            "revisionId": record.get("revision_id"),
            "title": _title(record),
            "stage": notice_stage(record),
            "publishedDate": _date(record),
            "sourceUrl": policy_source_url(record.get("policy_key"),
                                          _source(record).get("source_url"),
                                          record.get("popularity_listing")),
        } for record in notices],
    }


def annotate_records(records):
    """Freeze full-snapshot series decisions before later eligibility/text filters."""
    records = list(records)
    groups, signatures = _groups(records)
    result = [dict(record) for record in records]
    for indices in groups:
        metadata = _metadata(records, indices, signatures)
        first = indices[0]
        resolution = records[first].get("_notice_series_resolved")
        if not resolution:
            resolution = metadata["id"] if metadata else (
                _series_id(signatures[first]) if signatures[first]
                else _series_id(("unresolved", _identity(records[first]),
                                 records[first].get("revision_id"), _title(records[first]), first))
            )
        for index in indices:
            result[index]["_notice_series_resolved"] = resolution
            if metadata:
                result[index]["_notice_group"] = metadata
    return result


def _representative(records, indices):
    # Multiple imported aliases of one official URL are the same notice. Use
    # its newest version before preferring an application among different pages.
    latest = {}
    for index in indices:
        identity = _identity(records[index])
        if identity not in latest or _newest(records[index]) > _newest(records[latest[identity]]):
            latest[identity] = index
    unique = list(latest.values())
    best_stage = min(_STAGE_RANK[notice_stage(records[index])] for index in unique)
    candidates = [index for index in unique
                  if _STAGE_RANK[notice_stage(records[index])] == best_stage]
    return max(candidates, key=lambda index: _newest(records[index]))


def group_records(records):
    """One representative per series, in its first original position, before paging."""
    records = list(records)
    groups, signatures = _groups(records)
    result = []
    for indices in groups:
        representative = dict(records[_representative(records, indices)])
        metadata = _metadata(records, indices, signatures)
        if metadata:
            representative["_notice_group"] = metadata
        result.append(representative)
    return result


def group_matches(matches):
    """Group ranked (record, match) pairs without changing a chosen row's match."""
    matches = list(matches)
    records = [record for record, _ in matches]
    groups, signatures = _groups(records)
    result = []
    for indices in groups:
        index = _representative(records, indices)
        representative = dict(records[index])
        metadata = _metadata(records, indices, signatures)
        if metadata:
            representative["_notice_group"] = metadata
        result.append((representative, matches[index][1]))
    return result
