// Only locally generated finance descriptors are passed to these helpers.
// Never use them for policy prose, AI answers or arbitrary server text.
export { translateFinanceError as financeError } from "../../../../packages/core/src/i18n/index.js";
const memberTopics = {
  basic: "나이·공제 유형",
  earned: "월급이 있나요?",
  business: "사업소득이 있나요?",
  other: "그 밖에 받는 돈이 있나요?",
};
const vehicleTopics = {
  use: "명의와 사용 목적",
  value: "차량 가액",
  spec: "차량 제원과 보조금",
};

export function questionTitle(question, draft, t) {
  const member = question.id.match(
    /^member-(\d+)-(basic|earned|business|other)$/,
  );
  if (member)
    return t("가구원 {index} / {total} · {topic}", {
      index: Number(member[1]) + 1,
      total: draft.members.length,
      topic: t(memberTopics[member[2]]),
    });
  const vehicle = question.id.match(/^vehicle-(\d+)-(use|value|spec)$/);
  if (vehicle)
    return t("차량 {index} / {total} · {topic}", {
      index: Number(vehicle[1]) + 1,
      total: draft.vehicles.length,
      topic: t(vehicleTopics[vehicle[2]]),
    });
  return t(question.title);
}
