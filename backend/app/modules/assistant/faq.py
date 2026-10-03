"""Prepared FAQ replies from a published source; no model calls or user profiling."""

from app.contracts.assistance import PolicyAnswer
from app.contracts.parsing import SourcePolicy

# Copy and topic selection live here, rather than in an LLM prompt or the browser.
FAQ_TOPICS = (
    ("benefits", "어떤 지원을 받을 수 있나요?", (("benefits", "지원 내용"),)),
    ("eligibility", "누가 신청할 수 있나요?",
     (("eligibility", "지원 대상"), ("selection", "선정 기준"))),
    ("period", "언제까지 신청하나요?", (("application_period", "신청 기간"),)),
    ("application", "어떻게 신청하나요?", (("application_method", "신청 방법"),)),
    ("documents", "어떤 서류를 준비하나요?", (("required_documents", "준비 서류"),)),
    ("qualification", "신청 전에 무엇을 확인해야 하나요?", ()),
)


def prepared_faqs(record: dict, revision_id: str) -> dict:
    if record["review_status"] != "published":
        raise ValueError("Only published sources can supply member FAQs")
    source = SourcePolicy.model_validate(record["source_json"])
    items = []
    for identity, question, sections in FAQ_TOPICS:
        citations, paragraphs = [], []
        missing = []
        for key, label in sections:
            original = source.fields.get(key, "").strip()
            if not original:
                missing.append(label)
                continue
            # Bound large source fields while clearly marking omissions. The evidence
            # remains an exact substring, independent of the display copy.
            excerpt = original[:1200]
            if len(original) > 1200:
                excerpt += "\n(원문 일부입니다. 전체 내용은 공식 공고에서 확인해 주세요.)"
            paragraphs.append(f"{label}\n{excerpt}")
            citations.append({"source_field": key, "quote": original[:500]})
        if identity == "qualification":
            answer = ("가입한 지역과 연령대만으로 지원 여부를 확정할 수는 없어요. "
                      "‘누가 신청할 수 있나요?’에서 지원 대상과 선정 기준을 확인한 뒤, "
                      "담당 기관에 본인의 상황을 문의해 주세요. "
                      "최종 지원 여부는 기관의 심사로 결정돼요.")
        else:
            answer = "저장된 공고 원문을 기준으로 안내해요.\n\n" if paragraphs else ""
            answer += "\n\n".join(paragraphs)
            if missing:
                answer += ("\n\n" if paragraphs else "") + (
                    f"저장된 공고에는 {'·'.join(missing)} 정보가 없어요. "
                    "공식 공고 또는 담당 기관에서 확인해 주세요.")
            if identity == "period":
                answer += "\n현재 접수 중인지도 공식 공고에서 다시 확인해 주세요."
        response = PolicyAnswer(
            status="grounded" if citations else "insufficient_source", answer=answer,
            citations=citations, follow_up_questions=[],
        ).model_dump()
        items.append({"id": identity, "question": question, "response": {
            **response, "revision_id": revision_id, "policy_key": source.policy_key,
            "source_url": source.source_url, "review_status": "published",
            "eligibility_decided": False, "preview": False, "response_type": "prepared",
        }})
    return {"revision_id": revision_id, "items": items}
