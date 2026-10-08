"""Published read model; structured filters precede complete local smart search."""

from datetime import date
from typing import Literal

from sqlalchemy import JSON, String, and_, func, inspect, literal, or_, select

from app.modules.ingestion.models import records as collection_records
from app.modules.ingestion.popularity import listing_popularity, view_count_expression
from app.modules.normalization.source_urls import policy_source_url
from app.modules.presentation.application import application_guide
from app.modules.presentation.public import (
    format_notice_text,
    format_source_field,
    format_source_fields,
    payment_schedule,
    policy_description,
)
from app.modules.search.public import search_records
from app.modules.search.relations import institution_names
from app.modules.storage.application_dates import (
    resolved_application_period,
)
from app.modules.storage.audience import audience_text, other_conditions
from app.modules.storage.categories import effective_category, effective_category_expression
from app.modules.storage.schedule_rules import resolve_calendar_schedule
from app.modules.storage.search import SearchScope, search_predicates

# UI labels differ from the names used in published overview text. Do not expand
# these to bare district names: e.g. both Seoul and Busan have a Gangseo-gu.
REGION_NAMES = {
    "서울": ("서울특별시", "서울시"),
    "경기": ("경기도",),
    "인천": ("인천광역시", "인천시"),
    "부산": ("부산광역시", "부산시"),
    "대구": ("대구광역시", "대구시"),
    "광주": ("광주광역시",),
    "대전": ("대전광역시", "대전시"),
    "울산": ("울산광역시", "울산시"),
    "세종": ("세종특별자치시", "세종시"),
    "강원": ("강원특별자치도", "강원도"),
    "충북": ("충청북도",),
    "충남": ("충청남도",),
    "전북": ("전북특별자치도", "전라북도"),
    "전남": ("전라남도",),
    "경북": ("경상북도",),
    "경남": ("경상남도",),
    "제주": ("제주특별자치도", "제주도", "제주시", "서귀포시"),
}
AUDIENCE_TERMS = {
    "청년": ("청년",),
    "가족": ("가족", "가구", "부모", "자녀", "아동", "영유아", "신혼", "한부모", "양육", "출산"),
    "어르신": ("어르신", "노인", "고령", "시니어"),
}


def region_matches(text, region):
    # Short province labels must be standalone; '광주' must not match 경기 광주시.
    if region in REGION_NAMES:
        return or_(
            text.regexp_match(r"(^|[^가-힣])" + region + r"([^가-힣]|$)"),
            *(text.contains(name, autoescape=True) for name in REGION_NAMES[region]),
        )
    return text.contains(region, autoescape=True)


def published_catalog(repository):
    documents = repository.tables["condition_documents"]
    details = repository.tables["policy_revision_details"]
    ranked = (
        select(
            documents.c.policy_key,
            documents.c.revision_id,
            documents.c.created_at,
            documents.c.source_json,
            details.c.draft_json,
            details.c.title,
            details.c.category,
            func.row_number()
            .over(
                partition_by=documents.c.policy_key,
                order_by=(documents.c.created_at.desc(), documents.c.revision_id.desc()),
            )
            .label("position"),
        )
        .join(details, details.c.revision_id == documents.c.revision_id)
        .where(documents.c.review_status == "published")
        .subquery()
    )
    return select(ranked).where(ranked.c.position == 1).subquery()


def json_text(column, path):
    return func.coalesce(
        func.nullif(func.json_unquote(func.json_extract(column, path)), "null"), ""
    )


def with_popularity(catalog, connection):
    # Older local schemas may have only policy tables. Do not initialize collection
    # tables on a public read or conceal failures when an existing table is broken.
    if not inspect(connection).has_table(collection_records.name):
        return select(
            catalog,
            literal(None, String).label("popularity_provider"),
            literal(None, JSON).label("popularity_listing"),
            literal(None).label("views"),
        ).subquery()
    return (
        select(
            catalog,
            collection_records.c.provider.label("popularity_provider"),
            collection_records.c.listing_json.label("popularity_listing"),
            view_count_expression(collection_records, dialect=connection.dialect.name).label(
                "views"
            ),
        )
        .outerjoin(collection_records, collection_records.c.policy_key == catalog.c.policy_key)
        .subquery()
    )


def card(record, *, full=False, reference_year=None, reference_month=None):
    source = record["source_json"]
    raw_fields = source["fields"]
    fields = format_source_fields(raw_fields)
    overview = record["draft_json"].get("overview") or {}
    editorial = record["draft_json"].get("editorial") or {}

    def section(name, fallback):
        value = overview.get(name) or {}
        return (
            format_source_field(value["text"], field=name)
            if value.get("status") in {"specified", "unrestricted"} and value.get("text")
            else fallback
        )

    category = effective_category(record)
    period = resolved_application_period(raw_fields, overview)
    return {
        "id": record["policy_key"],
        "revisionId": record["revision_id"],
        "title": source["title"],
        "organization": source["organization"],
        "summary": format_source_field(editorial.get("summary") or "", field="purpose_summary")
        or policy_description(
            source["title"],
            fields.get("purpose_summary"),
            section("benefits", fields.get("benefits") or "지원 내용 확인 필요"),
        ),
        "benefit": format_notice_text(
            section("benefits", fields.get("benefits") or "지원 내용 확인 필요")
        ),
        "region": format_notice_text(section("region_conditions", "지역 확인 필요")),
        "audience": format_notice_text(
            format_source_field(audience_text(fields, overview, editorial), field="eligibility")
        ),
        "paymentSchedule": payment_schedule(raw_fields),
        "applicationPeriod": period or "공식 공고에서 확인",
        **resolve_calendar_schedule(
            raw_fields,
            overview,
            record["draft_json"].get("application_calendar"),
            reference_year=reference_year,
            reference_month=reference_month,
        ),
        "date": record["created_at"].date().isoformat(),
        "sourceUrl": policy_source_url(
            record["policy_key"], source.get("source_url"), record.get("popularity_listing")
        ),
        "category": category,
        "tags": [category],
        "popularity": listing_popularity(
            record.get("popularity_provider"), record.get("popularity_listing")
        ),
        "content": (fields.get("text") or fields.get("eligibility") or "") if full else "",
        "gender": format_notice_text(section("gender_conditions", "")),
        "otherConditions": [
            format_notice_text(format_source_field(text, field="eligibility"))
            for text in other_conditions(fields, overview)
        ],
        **{
            name: format_notice_text(section(field, fields.get(field) or ""))
            for name, field in (("applicationMethod", "application_method"), ("contact", "contact"))
        },
        "applicationUrl": section("application_url", fields.get("application_url") or None),
        "applicationGuide": application_guide(
            raw_fields, overview, source_url=policy_source_url(
                record["policy_key"], source.get("source_url"), record.get("popularity_listing")
            ),
        ),
        "sourceFields": fields if full else {},
        "publishedDate": section("published_date", fields.get("published_date") or ""),
        "modifiedDate": section("modified_date", fields.get("modified_date") or ""),
    }


def filtered_catalog(
    repository,
    *,
    q="",
    search_scope: SearchScope = "all",
    category="",
    region="",
    audience="",
    tag="",
    provider="",
    organization="",
    connection=None,
):
    catalog = published_catalog(repository)
    if connection is not None:
        catalog = with_popularity(catalog, connection)
    query = select(catalog)
    query = query.where(*search_predicates(catalog, q, search_scope))
    if provider:
        query = query.where(catalog.c.policy_key.startswith(provider + ":", autoescape=True))
    if organization:
        query = query.where(json_text(catalog.c.source_json, "$.organization") == organization)
    for value in (category, tag):
        if value and value != "전체":
            query = query.where(effective_category_expression(catalog) == value)
    if region and region != "전국":
        region_status = json_text(catalog.c.draft_json, "$.overview.region_conditions.status")
        query = query.where(
            or_(
                and_(
                    region_status == "specified",
                    region_matches(
                        json_text(catalog.c.draft_json, "$.overview.region_conditions.text"), region
                    ),
                ),
                region_status == "unrestricted",
            )
        )
    if audience and audience != "전체":
        age_status = json_text(catalog.c.draft_json, "$.overview.age_conditions.status")
        age_text = json_text(catalog.c.draft_json, "$.overview.age_conditions.text")
        # Household/parenting conditions belong to other_conditions, not age_conditions.
        other_text = json_text(catalog.c.draft_json, "$.overview.other_conditions[*].text")
        terms = AUDIENCE_TERMS.get(audience, (audience,))
        query = query.where(
            or_(
                and_(
                    age_status.in_(("specified", "unrestricted")),
                    or_(*(age_text.contains(term, autoescape=True) for term in terms)),
                ),
                or_(*(other_text.contains(term, autoescape=True) for term in terms)),
            )
        )
    return catalog, query


def list_policies(
    repository,
    *,
    limit=20,
    offset=0,
    sort=None,
    q="",
    search_scope: SearchScope = "all",
    search_mode: Literal["smart", "literal"] = "smart",
    search_relation: Literal["publisher", "related"] | None = None,
    category="",
    region="",
    audience="",
    tag="",
    provider="",
    organization="",
    status="",
    age_bands=(),
    age_min=None,
    age_max=None,
    eligible_only=False,
    member=None,
):
    smart = bool(q.strip()) and search_mode == "smart" and search_scope == "all"
    sort = sort or ("relevance" if smart else "popular")
    if search_mode not in {"smart", "literal"}:
        raise ValueError("Invalid policy search mode")
    if search_relation not in {None, "publisher", "related"}:
        raise ValueError("Invalid policy search relation")
    with repository.engine.connect() as connection:
        catalog, query = filtered_catalog(
            repository,
            q="" if smart else q,
            search_scope=search_scope,
            category=category,
            region=region,
            audience=audience,
            tag=tag,
            provider=provider,
            organization=organization,
            connection=connection,
        )
        advanced = bool(
            status or age_bands or age_min is not None or age_max is not None or eligible_only
        )
        if eligible_only:
            documents = repository.tables["condition_documents"]
            if "canonical_json" in documents.c and "matching_enabled" in documents.c:
                query = query.add_columns(
                    documents.c.canonical_json,
                    documents.c.matching_enabled,
                    documents.c.review_status,
                ).join(documents, documents.c.revision_id == catalog.c.revision_id)
        if advanced:
            from app.modules.storage.explorer_filters import filter_records

            vocabulary = search_institution_vocabulary(repository, connection) if smart else ()
            recent = (catalog.c.created_at.desc(), catalog.c.policy_key)
            order = (catalog.c.title, catalog.c.policy_key) if sort == "name" else recent
            if sort == "popular":
                order = (catalog.c.views.is_not(None).desc(), catalog.c.views.desc(), *recent)
            records = filter_records(
                connection.execution_options(yield_per=100)
                .execute(query.order_by(*order))
                .mappings(),
                status=status,
                age_bands=age_bands,
                age_min=age_min,
                age_max=age_max,
                eligible_only=eligible_only,
                member=member,
            )
            if smart:
                matches, metadata = search_records(
                    records, q, sort=sort, institutions=vocabulary, relation=search_relation
                )
                total = len(matches)
                page = matches[offset : offset + limit]
            else:
                # SQL already orders these rows. Count the complete filtered
                # stream, but retain only the requested page's large JSON rows.
                page, metadata, total = [], None, 0
                for record in records:
                    if offset <= total < offset + limit:
                        page.append((record, None))
                    total += 1
            return {
                "items": [
                    {**card(record), **({"searchMatch": match} if match else {})}
                    for record, match in page
                ],
                "total": total,
                "nextCursor": str(offset + limit) if offset + limit < total else None,
                **(
                    {"search": metadata or literal_search_metadata(q, search_scope)}
                    if q.strip()
                    else {}
                ),
            }
        if smart:
            # No popular/recent shortlist: every filtered published revision is
            # interpreted before count, ordering and pagination.
            vocabulary = search_institution_vocabulary(repository, connection)
            records = connection.execution_options(yield_per=100).execute(query).mappings()
            matches, metadata = search_records(
                records, q, sort=sort, institutions=vocabulary, relation=search_relation
            )
            total = len(matches)
            return {
                "items": [
                    {**card(record), "searchMatch": match}
                    for record, match in matches[offset : offset + limit]
                ],
                "total": total,
                "nextCursor": str(offset + limit) if offset + limit < total else None,
                "search": metadata,
            }
        recent = (catalog.c.created_at.desc(), catalog.c.policy_key)
        order = (catalog.c.title, catalog.c.policy_key) if sort == "name" else recent
        if sort == "popular":
            # A measured zero precedes an unknown count. Deterministic ties keep
            # offset pagination stable while the underlying catalog is unchanged.
            order = (catalog.c.views.is_not(None).desc(), catalog.c.views.desc(), *recent)
        # Both statements share MySQL's repeatable-read snapshot.
        total = connection.scalar(select(func.count()).select_from(query.subquery()))
        records = connection.execute(query.order_by(*order).limit(limit).offset(offset)).mappings()
        items = [card(row) for row in records]
    result = {
        "items": items,
        "total": total,
        "nextCursor": str(offset + limit) if offset + limit < total else None,
    }
    if q.strip():
        result["search"] = literal_search_metadata(q, search_scope)
    return result


def list_calendar(
    repository,
    *,
    month,
    q="",
    search_scope: SearchScope = "all",
    search_mode: Literal["smart", "literal"] = "smart",
    search_relation: Literal["publisher", "related"] | None = None,
    category="",
    region="",
    audience="",
):
    year, number = map(int, month.split("-"))
    first = date(year, number, 1).isoformat()
    following = date(year + (number == 12), number % 12 + 1, 1).isoformat()
    items, undated = [], []
    total = undated_total = 0
    smart = bool(q.strip()) and search_mode == "smart" and search_scope == "all"
    if search_mode not in {"smart", "literal"}:
        raise ValueError("Invalid policy search mode")
    if search_relation not in {None, "publisher", "related"}:
        raise ValueError("Invalid policy search relation")
    metadata = None
    facet_counts = {"organization": 0, "content": 0}
    with repository.engine.connect() as connection:
        catalog, query = filtered_catalog(
            repository,
            q="" if smart else q,
            search_scope=search_scope,
            category=category,
            region=region,
            audience=audience,
            connection=connection,
        )
        vocabulary = search_institution_vocabulary(repository, connection) if smart else ()
        records = (
            connection.execution_options(yield_per=100)
            .execute(query.order_by(catalog.c.title, catalog.c.policy_key))
            .mappings()
        )
        if smart:
            matches, metadata = search_records(records, q, institutions=vocabulary)
        else:
            matches = ((record, None) for record in records)
        for record, match in matches:
            item = card(record, reference_year=year, reference_month=number)
            if match is not None:
                item["searchMatch"] = match
            start, end = item["applicationStart"], item["applicationEnd"]
            roles = set(match["relations"]) if match else set()
            selected = (
                not smart
                or search_relation is None
                or bool(
                    roles
                    & (
                        {"publisher"}
                        if search_relation == "publisher"
                        else {"target", "contextual", "student_general", "mention"}
                    )
                )
            )
            if not start and not end:
                if selected:
                    undated_total += 1
                if selected and len(undated) < 25:
                    undated.append(item)
                continue
            windows = item.get("applicationWindows") or [item]
            overlaps = any(
                (window["applicationStart"] < following and window["applicationEnd"] >= first)
                if window["applicationStart"] and window["applicationEnd"]
                else first <= (window["applicationStart"] or window["applicationEnd"]) < following
                for window in windows
            )
            if item["scheduleStatus"] == "ongoing" and start and not end:
                overlaps = start < following
            if overlaps:
                if "publisher" in roles:
                    facet_counts["organization"] += 1
                if roles & {"target", "contextual", "student_general", "mention"}:
                    facet_counts["content"] += 1
                if not selected:
                    continue
                total += 1
                if len(items) < 500:
                    items.append(item)
    result = {
        "month": month,
        "items": items,
        "total": total,
        "truncated": total > len(items),
        "undatedItems": undated,
        "undatedTotal": undated_total,
    }
    if q.strip():
        if metadata is not None:
            for alternative in metadata["alternatives"]:
                alternative["count"] = facet_counts[alternative["scope"]]
        result["search"] = metadata or literal_search_metadata(q, search_scope)
    return result


def literal_search_metadata(query, scope):
    return {
        "mode": "literal",
        "summary": {
            "all": "입력한 단어를 게시 기관과 공고 내용에서 찾았어요.",
            "organization": "입력한 단어를 게시 기관에서 찾았어요.",
            "content": "입력한 단어를 공고 내용에서 찾았어요.",
        }[scope],
        "originalQuery": query,
        "interpretedQuery": query,
        "corrections": [],
        "alternatives": [],
        "warnings": [],
    }


def search_institution_vocabulary(repository, connection):
    """Filters must not erase the known entity vocabulary used to interpret q."""
    published = published_catalog(repository)
    records = connection.execute(select(published.c.source_json, published.c.title)).mappings()
    return institution_names(records)


def get_policy(repository, policy_key):
    with repository.engine.connect() as connection:
        catalog = with_popularity(published_catalog(repository), connection)
        row = (
            connection.execute(select(catalog).where(catalog.c.policy_key == policy_key))
            .mappings()
            .first()
        )
        return card(row, full=True) if row else None


def explorer_options(repository):
    """Only distinct publishers of latest public revisions; no raw body or private rows."""
    published = published_catalog(repository)
    with repository.engine.connect() as connection:
        rows = connection.execute(
            select(
                published.c.policy_key,
                json_text(published.c.source_json, "$.organization").label("organization"),
            )
        ).mappings()
        providers = {}
        for row in rows:
            provider = row["policy_key"].split(":", 1)[0]
            if row["organization"]:
                providers.setdefault(provider, set()).add(row["organization"])
    return {
        "providers": [
            {"id": provider, "organizations": sorted(names)}
            for provider, names in sorted(providers.items())
        ]
    }
