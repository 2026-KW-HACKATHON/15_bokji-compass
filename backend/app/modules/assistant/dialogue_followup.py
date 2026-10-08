"""Follow-up questions refer to public source identifiers, never an untrusted transcript."""

import re

from app.modules.storage.catalog import card

DETAIL_QUESTION = re.compile(
    r"서류|준비물|증빙|신청\s*(?:방법|절차|주소|전화|기간|기한)|"
    r"접수\s*(?:방법|기간)|마감|언제까지|어디.*신청|어떻게.*신청|"
    r"지원\s*(?:내용|금액|대상|자격)|얼마|신청.*(?:대상|자격)|누가.*신청|전화|연락처|문의처"
)
OTHER_SUBJECT = re.compile(
    r"어머니|아버지|부모님|남편|아내|배우자|자녀|우리\s*아이|친구|만약|가정하면"
)
REFER_BACK = re.compile(
    r"^(?:그럼|그러면|이\s*공고|그\s*공고|더\s*알려|더\s*추천|다른\s*공고|계속|다시\s*확인)"
)


def select_followup_revision(repository, state, question):
    """A selected notice, explicit ordinal/title, or sole prior candidate can be referenced."""
    revisions = state.candidate_revisions
    ordinal = re.search(r"(첫|두|세|네|다섯|\d+)\s*번째", question)
    if ordinal:
        index = {"첫": 1, "두": 2, "세": 3, "네": 4, "다섯": 5}.get(ordinal[1])
        index = int(ordinal[1]) if index is None else index
        return revisions[index - 1] if 1 <= index <= len(revisions) else None
    if repository:
        for revision in revisions:
            record = repository.get_revision(revision)
            if (record and record.get("review_status") == "published"
                    and record["title"] in question):
                return revision
    if state.revision_id:
        return state.revision_id
    return revisions[0] if len(revisions) == 1 else None


def source_followup_answer(record, question):
    """Use the same validated application metadata shown by the assistant's policy cards."""
    policy = card(record)
    guide = policy["applicationGuide"]
    if re.search(r"서류|준비물|증빙", question):
        if guide["documentsStatus"] == "listed":
            details = "\n".join("• " + item["label"] for item in guide["documents"])
            return f"‘{policy['title']}’의 공식 안내에 있는 준비 서류예요.\n{details}"
        if guide["documentsStatus"] == "none":
            return f"‘{policy['title']}’의 공식 안내에는 별도 제출 서류가 없다고 명시되어 있어요."
        return (f"‘{policy['title']}’의 준비 서류는 저장된 공식 안내에서 확인되지 않았어요. "
                "신청 담당 기관에 필요한 서류를 먼저 문의해 주세요.")
    if re.search(r"마감|언제까지|기간|기한", question):
        return (f"‘{policy['title']}’의 신청 기간: {policy['applicationPeriod']}\n"
                "현재 접수 중인지도 담당 기관이나 공식 신청 경로에서 확인해 주세요.")
    if re.search(r"방법|절차|주소|전화|어디|어떻게|연락처|문의처", question):
        lines = [guide["methodText"]] if guide["methodText"] else []
        if guide["onlineUrl"]:
            lines.append("온라인 신청: " + guide["onlineUrl"])
        for phone in guide["phones"]:
            label = "전화 신청" if phone["kind"] == "application" else "신청 방법 문의"
            lines.append(f"{label}: {phone['label']} {phone['number']}".strip())
        if guide["visitText"] and guide["visitText"] not in lines:
            lines.append(guide["visitText"])
        details = "\n".join(lines) or "신청 방법이 확인되지 않아 담당 기관에 문의가 필요해요."
        return f"‘{policy['title']}’의 신청 안내예요.\n{details}"
    if re.search(r"얼마|금액|지원\s*내용", question):
        return f"‘{policy['title']}’의 지원 내용: {policy['benefit']}"
    return (f"‘{policy['title']}’의 지원 대상: {policy['audience']}\n"
            "아래 조건 비교와 신청 제외 안내를 함께 확인해 주세요.")
