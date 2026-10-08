"""Source-backed application routes and preparation; no eligibility or URL guesses."""

import hashlib
import re
from urllib.parse import urlsplit, urlunsplit

from app.modules.presentation.source_fields import format_source_field

_METHOD_NAMES = ("application_method", "application_methods")
_DOCUMENT_NAMES = ("documents", "required_documents", "submission_documents")
_DOCUMENT_LABELS = {"제출서류", "구비서류", "필요서류", "신청서류"}
_HEADINGS = (
    "신청방법", "접수방법", "신청절차", "접수절차", "신청기간", "접수기간", "신청기한",
    "신청서", "제출서류", "구비서류", "필요서류", "신청서류", "지원대상", "선정기준",
    "지원내용", "신청대상", "문의처", "문의", "전화문의", "접수기관", "유의사항", "참고사항",
    "첨부파일", "접수처", "담당부서", "처리절차", "기타", "사업목적", "개요",
)
_HEADER = re.compile(
    r"^\s*(?:[○●◎■□◆◇▶▷•*-]+\s*|[0-9]+[.)]\s*)?"
    r"(?P<label>" + "|".join(r"\s*".join(word) for word in _HEADINGS) + r")"
    r"\s*(?:[:：]\s*(?P<value>.*)|$)"
)
_URL = re.compile(r"https?://[^\s<>\"']+", re.IGNORECASE)
_PHONE = re.compile(
    r"(?<![0-9])(?:"
    r"(?:\+82[-\s]?[0-9]{1,2}|0[0-9]{1,3})[-\s.)]?[0-9]{3,4}[-\s.]?[0-9]{4}"
    r"|1[568][0-9]{2}[-\s]?[0-9]{4}|1[0-9]{2,3})(?![0-9])"
)
_PHONE_APPLICATION = re.compile(
    r"(?:전화|유선)\s*(?:로|를\s*통한|를\s*통해|으로)?\s*(?:신청|접수)"
    r"|(?:신청|접수)\s*(?:전화|번호)"
)
_VALID_PHONE = re.compile(r"(?:0[1-9]\d{7,9}|1\d{2,3}|1[568]\d{6}|\+[1-9]\d{7,14})")
_FAX = re.compile(r"팩스|FAX", re.IGNORECASE)
_INQUIRY = re.compile(r"상담|문의|안내\s*전화|팩스|FAX", re.IGNORECASE)
_NEGATIVE_PHONE = re.compile(
    r"(?:전화|유선)[^\n.;]{0,20}(?:불가|안\s*됨|않|불가능|받지|제외)"
    r"|(?:방문|온라인)\s*(?:만|으로만)\s*(?:신청|접수)"
)
_NO_DOCUMENTS = re.compile(
    r"^(?:(?:구비|제출|필요|신청)\s*서류\s*[:：]?\s*)?"
    r"(?:해당\s*없음|없음|없습니다|불필요|제출\s*서류\s*없음|별도\s*서류\s*없음)"
    r"[.。]?$"
)
_UNKNOWN_DOCUMENTS = re.compile(
    r"^(?:미정|미기재|확인\s*필요|공고(?:문)?\s*(?:참조|확인)|"
    r"(?:첨부\s*(?:파일|서류)|신청\s*기관)\s*(?:참조|확인|문의)|"
    r"(?:담당\s*)?(?:기관|부서|센터)\s*(?:에\s*)?(?:문의|확인)(?:\s*필요)?)$"
)
_NO_FORM = re.compile(r"^신청서\s*[:：]?\s*(?:해당\s*없음|없음|불필요)[.。]?$")
_APPLICATION_DESTINATION = re.compile(
    r"(?:신청|접수|등록)\s*(?:하기|URL|사이트|페이지|주소|링크|홈페이지|웹페이지|바로가기)"
    r"|(?:온라인|인터넷|웹|홈페이지|사이트)\s*(?:에서|로|를\s*통해)?\s*(?:신청|접수|등록)"
    r"|(?:신청|접수|등록)\s*[:：]\s*<URL>"
    r"|\b(?:apply|application|registration)\b", re.IGNORECASE
)
_INFORMATION_DESTINATION = re.compile(
    r"문의|상담|참고|공고|(?:신청|접수|등록)\s*(?:방법\s*)?안내"
    r"|\b(?:contact|inquiry|help|notice|information)\b", re.IGNORECASE
)


def _body_section(text, labels):
    """Only a labelled source block can supply a missing operational detail."""
    selected, lines, previous_label, block_lines = False, [], "", []
    for line in text.splitlines():
        heading = _HEADER.fullmatch(line)
        if heading and re.sub(r"\s", "", heading["label"]) == "신청서":
            # An application form inside a required-documents list is a document,
            # not a new section heading. Explicit document absence ends that list.
            none_only = bool(block_lines) and all(
                _NO_DOCUMENTS.fullmatch(item.strip()) for item in block_lines
            )
            if previous_label in _DOCUMENT_LABELS and not heading["value"] and not none_only:
                heading = None
        if heading:
            label = re.sub(r"\s", "", heading["label"])
            previous_label, block_lines = label, []
            selected = label in labels
            if heading["value"]:
                block_lines.append(heading["value"])
            if selected and heading["value"]:
                lines.append(heading["value"])
        elif line.strip():
            block_lines.append(line)
            if selected:
                lines.append(line)
    return "\n".join(lines).strip()


def _cited_source(fields, overview, names, labels):
    """Use the original quotes, not a model summary or translated display value."""
    for name in names:
        section = (overview or {}).get(name)
        if not isinstance(section, dict) or section.get("status") not in {
            "specified", "unrestricted"
        }:
            continue
        evidence = section.get("evidence")
        if not isinstance(evidence, list) or not evidence:
            continue
        quotes = []
        for item in evidence:
            if not isinstance(item, dict):
                break
            original = fields.get(item.get("source_field"))
            quote = item.get("quote")
            if not isinstance(original, str) or not isinstance(quote, str) or not quote.strip():
                break
            if quote not in original:
                break
            text = format_source_field(quote, field=name).strip()
            if name in _DOCUMENT_NAMES and item["source_field"] not in _DOCUMENT_NAMES:
                # A cited eligibility term (e.g. disability certificate holder) is
                # not proof that an applicant must submit that certificate.
                block = _body_section(original, labels)
                excerpt = _body_section(text, labels)
                if not block or (quote not in block and not (excerpt and excerpt in block)):
                    break
            # A broad body citation is narrowed only by its source's own headings.
            quotes.append(_body_section(text, labels) or text)
        else:
            return "\n".join(dict.fromkeys(quotes))
    return ""


def _section(fields, overview, names, labels):
    for name in names:
        if isinstance(value := fields.get(name), str):
            text = format_source_field(value, field=name).strip()
            if text:
                return text
    body = fields.get("text")
    if isinstance(body, str) and (text := _body_section(body, labels)):
        return text
    return _cited_source(fields, overview, names, labels)


def _canonical_url(value):
    try:
        parsed = urlsplit(value)
        # Credentials, controls, bare protocol-relative links and unsafe schemes are not routes.
        if (
            parsed.scheme.lower() not in {"http", "https"}
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or re.search(r"[\s\x00-\x1f\x7f\\]", value)
        ):
            return None
        parsed.port  # Reject malformed ports without changing the official target.
        return urlunsplit((
            parsed.scheme.lower(), parsed.netloc.lower(), parsed.path.rstrip("/"),
            parsed.query, "",
        ))
    except ValueError:
        return None


def _supports_destination(text, target):
    lines = text.splitlines()
    for index, line in enumerate(lines):
        if target not in line:
            continue
        # URL path words (e.g. /registration) are not a source application label.
        context = _URL.sub("<URL>", line)
        if not _APPLICATION_DESTINATION.search(context) and index and len(lines[index - 1]) < 100:
            context = _URL.sub("<URL>", lines[index - 1]) + "\n" + context
        if (
            _APPLICATION_DESTINATION.search(context)
            and not _INFORMATION_DESTINATION.search(context)
        ):
            return True
    return False


def _online_url(fields, overview, source_url, method):
    # Online availability, attachments, or related links alone do not identify
    # registration. A source application-method line can name a concrete destination.
    text = _section(fields, overview, ("application_url",), ())
    method_supported = False
    if not text:
        method_urls = list(dict.fromkeys(
            url for url in _URL.findall(method) if _supports_destination(method, url)
        ))
        if len(method_urls) == 1:
            text, method_supported = method_urls[0], True
    matches = list(dict.fromkeys(_URL.findall(text)))
    if len(matches) != 1:
        return None
    target = matches[0]
    canonical = _canonical_url(target)
    if canonical is None or canonical == _canonical_url(source_url or ""):
        return None
    if _INFORMATION_DESTINATION.search(_URL.sub("", text)):
        return None
    raw_url = fields.get("application_url")
    explicit = isinstance(raw_url, str) and format_source_field(
        raw_url, field="application_url"
    ).strip()
    if not explicit and not method_supported:
        # A valid citation proves that a URL exists, not that it accepts applications.
        # Require the original nearby label to identify the same URL as 신청/접수/등록.
        supported = False
        section = (overview or {}).get("application_url") or {}
        for evidence in section.get("evidence", []):
            original = fields.get(evidence.get("source_field"), "")
            if not isinstance(original, str):
                continue
            if _supports_destination(original, target):
                supported = True
        if not supported:
            return None
    parsed = urlsplit(target)
    path = parsed.path.lower().rstrip("/")
    # A provider's generic home or notice viewer is not the actual application page.
    if not path or re.search(
        r"/(?:index|main|home|default|login)(?:\.(?:html?|jsp|do|php|aspx?))?$", path
    ) or path in {"/portal", "/intro", "/landing"}:
        return None
    if re.search(
        r"(?:^|/)(?:notices?|news|board|information|svcdtl|service-detail|contact|inquiry|help)"
        r"(?:/|\.|$)"
        r"|(?:selec|select)(?:syst|system|service)info|wlfareinfo|/rcvfvrsvc/dtlex", path
    ):
        return None
    return target


def _phones(method, contact, application_phone):
    result = {}
    for text, explicit in ((method, False), (contact, False), (application_phone, True)):
        for line in text.splitlines():
            for match in _PHONE.finditer(line):
                number = re.sub(r"[^0-9+-]", "", match.group())
                if not _VALID_PHONE.fullmatch(number.replace("-", "")):
                    continue
                # Classify against the surrounding clause rather than another number's label.
                before = re.split(r"[;；,，/|]", line[:match.start()])[-1]
                after = re.split(r"[;；,，/|]", line[match.end():])[0]
                context = before + after
                if _FAX.search(context):
                    continue
                application = explicit or bool(_PHONE_APPLICATION.search(context))
                if _INQUIRY.search(context) or _NEGATIVE_PHONE.search(context):
                    application = False
                kind = "application" if application else "inquiry"
                label = context.strip(" :：()[]-·\t")
                label = label or ("전화 신청" if application else "문의 전화")
                previous = result.get(number)
                if previous is None or kind == "application":
                    result[number] = {"number": number, "label": label, "kind": kind}
    return list(result.values())


def _documents(text):
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return [], "unknown", (
            "필요한 서류가 공고에 명시되어 있지 않아요. "
            "신청 전에 담당 기관에 확인해 주세요."
        )
    labels, notes, none = [], [], []
    for line in lines:
        bare = re.sub(r"^(?:[○●◎■□◆◇▶▷•*-]+\s*|[0-9]+[.)]\s*)", "", line)
        if _NO_DOCUMENTS.fullmatch(bare):
            none.append(line)
        elif _UNKNOWN_DOCUMENTS.fullmatch(bare) or _NO_FORM.fullmatch(bare):
            notes.append(line)
        else:
            labels.append(line)
    if labels:
        # Alternatives and conditional lines remain one checklist entry, verbatim.
        return [
            {"id": "doc-" + hashlib.sha256(label.encode("utf-8")).hexdigest(), "label": label}
            for label in dict.fromkeys(labels)
        ], "listed", "\n".join([*none, *notes])
    if notes:
        return [], "unknown", "\n".join([*none, *notes])
    return [], "none", "\n".join(none)


def application_guide(fields, overview=None, *, source_url=None):
    """Return additive card metadata from original fields; never call HTTP, DB or a model."""
    method = _section(fields, overview, _METHOD_NAMES, {"신청방법", "접수방법", "신청절차"})
    contact = _section(fields, overview, ("contact",), {"문의처", "문의", "전화문의"})
    application_phone = _section(fields, overview, ("application_phone",), ())
    documents, documents_status, documents_note = _documents(_section(
        fields, overview, _DOCUMENT_NAMES, _DOCUMENT_LABELS
    ))
    form_note = _section(fields, overview, ("application_form",), {"신청서"})
    if form_note:
        documents_note = "\n".join(filter(None, (documents_note, "신청서: " + form_note)))
    visit = "\n".join(line for line in method.splitlines() if "방문" in line)
    agency = _section(fields, overview, ("receipt_agency",), {"접수기관"})
    if visit and agency and agency not in visit:
        visit += "\n" + agency
    return {
        "methodText": method,
        "onlineUrl": _online_url(fields, overview, source_url, method),
        "phones": _phones(method, contact, application_phone),
        "visitText": visit,
        "documents": documents,
        "documentsStatus": documents_status,
        "documentsNote": documents_note,
    }
