// Ported from web/assistant/dialogueModel.js; keep the response contract aligned.
import {
  disasterTypes,
  housingTenures,
  housingTypes,
} from "./monitoringModel.js";

const labels = {
  occupation: "현재 활동",
  household: "함께 사는 가족",
  interests: "관심 분야",
  housing_tenure: "주택 소유·거주 형태",
  housing_type: "주택 종류",
  building_year: "건축 연도",
  repair_needed: "주택 수리 필요",
  job_seeking: "구직 중",
  disaster_type: "재난 종류",
  disaster_damage: "실제 재난 피해",
  disaster_occurred_on: "피해 발생일",
};
export function confirmedFacts(dialogue) {
  return dialogue.confirmed_fields.map((field) => {
    const value = dialogue.profile_draft[field];
    const option = {
      housing_tenure: housingTenures,
      housing_type: housingTypes,
      disaster_type: disasterTypes,
    }[field];
    return {
      field,
      label: labels[field],
      value:
        value === null
          ? "아직 모름"
          : typeof value === "boolean"
            ? value
              ? "예"
              : "아니요"
            : Array.isArray(value)
              ? value.join(", ") || "없음"
              : option
                ? option.find(([key]) => key === value)?.[1] || value
                : field === "building_year"
                  ? `${value}년`
                  : value,
    };
  });
}
export function dialogueError(error) {
  if (error.status === 401) return "로그인 상태를 다시 확인해 주세요.";
  if ([404, 409, 410].includes(error.status))
    return "대화 시간이 지났거나 정보가 바뀌었어요. 새 대화을 시작해 주세요.";
  if (error.status === 422)
    return "입력한 정보의 형식을 확인해 주세요. 건축 연도는 네 자리 숫자로 입력할 수 있어요.";
  if (error.status === 429)
    return "질문이 잠시 몰렸어요. 조금 뒤에 다시 시도해 주세요.";
  return error.message || "대화를 불러오지 못했어요. 다시 시도해 주세요.";
}

// Navigation state stays in React memory and is scoped to the signed-in account
// and selected policy. Consent and pending requests must never travel with it.
export function restoreDialogueSession(session, owner, revisionId = null) {
  const sameContext =
    Boolean(owner) &&
    session?.owner === owner &&
    session?.revisionId === revisionId;
  const source = sameContext ? session : {};
  return {
    owner,
    revisionId,
    question: typeof source.question === "string" ? source.question : "",
    dialogue: source.dialogue || null,
    exchanges: Array.isArray(source.exchanges) ? source.exchanges : [],
    input: typeof source.input === "string" ? source.input : "",
    saved: typeof source.saved === "string" ? source.saved : "",
    candidateLimit:
      Number.isInteger(source.candidateLimit) && source.candidateLimit >= 3
        ? source.candidateLimit
        : 3,
  };
}
