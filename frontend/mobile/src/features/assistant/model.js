import { ApiError } from "../../services/client.js";

export const revisionPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
/** @returns {{revision_id: string, status: string, answer: string, citations: {source_field: string, quote: string}[], follow_up_questions: string[], response_type: string, preview: boolean, eligibility_decided: boolean}} */
export function parseAnswer(data, revisionId) {
  if (
    !data ||
    data.revision_id !== revisionId ||
    data.preview !== false ||
    data.eligibility_decided !== false ||
    !["grounded", "insufficient_source"].includes(data.status) ||
    typeof data.answer !== "string" ||
    !data.answer.trim() ||
    !Array.isArray(data.citations) ||
    !data.citations.every(
      (item) =>
        typeof item?.source_field === "string" &&
        typeof item?.quote === "string" &&
        item.quote.trim(),
    ) ||
    (data.status === "grounded" && data.citations.length === 0) ||
    !Array.isArray(data.follow_up_questions) ||
    !data.follow_up_questions.every((item) => typeof item === "string")
  ) {
    throw new ApiError(
      "답변의 근거를 확인하지 못했어요. 다시 질문해 주세요.",
      0,
      "invalid_response",
    );
  }
  return {
    revision_id: data.revision_id,
    status: data.status,
    answer: data.answer,
    citations: data.citations.map((item) => ({
      source_field: item.source_field,
      quote: item.quote,
    })),
    follow_up_questions: data.follow_up_questions,
    response_type: data.response_type === "prepared" ? "prepared" : "generated",
    preview: false,
    eligibility_decided: false,
  };
}
/** @returns {{id: string, question: string, response: ReturnType<typeof parseAnswer>}[]} */
export function parseFaqs(data, revisionId) {
  if (
    !data ||
    data.revision_id !== revisionId ||
    !Array.isArray(data.items) ||
    !data.items.length ||
    data.items.length > 12 ||
    data.items.some(
      (item) =>
        !item ||
        typeof item.id !== "string" ||
        !item.id.trim() ||
        typeof item.question !== "string" ||
        !item.question.trim() ||
        item.response?.response_type !== "prepared",
    ) ||
    new Set(data.items.map((item) => item.id)).size !== data.items.length
  ) {
    throw new ApiError(
      "기본 질문을 불러오지 못했어요. 다시 시도해 주세요.",
      0,
      "invalid_response",
    );
  }
  return data.items.map((item) => ({
    id: item.id,
    question: item.question,
    response: parseAnswer(item.response, revisionId),
  }));
}
export function createAssistantApi(request) {
  function validate(token, revisionId) {
    if (!token) throw new ApiError("로그인한 뒤 질문해 주세요.", 401);
    if (!revisionPattern.test(revisionId || ""))
      throw new ApiError(
        "최신 공고를 다시 선택해 주세요.",
        0,
        "invalid_revision",
      );
  }
  return {
    faqs: async (token, revisionId, signal) => {
      validate(token, revisionId);
      return parseFaqs(
        await request(
          "/v1/assistant/faqs?revision_id=" + encodeURIComponent(revisionId),
          { token, signal },
        ),
        revisionId,
      );
    },
    ask: async (token, revisionId, question, signal) => {
      validate(token, revisionId);
      const text = question.trim();
      if (!text || text.length > 2000)
        throw new ApiError("질문을 1~2,000자로 입력해 주세요.");
      return parseAnswer(
        await request("/v1/assistant/questions", {
          token,
          signal,
          timeoutMs: 70000,
          body: { revision_id: revisionId, question: text },
        }),
        revisionId,
      );
    },
  };
}
