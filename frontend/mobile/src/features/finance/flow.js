import {
  financeGroups,
  financeQuestions,
  fieldValue,
  visibleFields,
  validateQuestion,
} from "@bokji/core/finance-flow";
import { formatMoney, parseMoney } from "@bokji/core/finance-model";

export function financeSections(draft) {
  const questions = financeQuestions(draft);
  return financeGroups.slice(0, 5).map((title, index) => ({
    title,
    index,
    questions: questions.filter((question) => question.group === index),
  }));
}
export function validateSection(section, draft) {
  for (const question of section.questions) {
    const error = validateQuestion(question, draft);
    if (error) return error;
  }
  return null;
}
export function reviewValue(field, draft, display = {}) {
  const t = display.t || ((value) => value);
  const money = display.formatMoney || formatMoney;
  const value = fieldValue(draft, field.path);
  if (field.type === "check") return t(value ? "예" : "미확인");
  if (field.countChoices)
    return value == null || value === ""
      ? t("확인 필요")
      : display.t
        ? t("{count}명", { count: value })
        : `${value}명`;
  if (field.type === "select")
    return t(
      field.options.find(([key]) => String(key) === String(value))?.[1] ||
        "모름",
    );
  if (field.type === "money") {
    try {
      return money(parseMoney(value, field.label));
    } catch {
      return t("입력 확인 필요");
    }
  }
  return value == null || value === ""
    ? t("확인 필요")
    : `${value}${t(field.unit || "")}`;
}
export function reviewRows(section, draft, display = {}) {
  const t = display.t || ((value) => value);
  return section.questions.flatMap((question) =>
    visibleFields(question, draft).map((field) => ({
      key: field.path,
      label: /^(member|vehicle)-\d+-/.test(question.id)
        ? display.t
          ? `${t(question.id.startsWith("member-") ? "가구원 {index} / {total}" : "차량 {index} / {total}", { index: Number(question.id.split("-")[1]) + 1, total: question.id.startsWith("member-") ? draft.members.length : draft.vehicles.length })} · ${t(field.label)}`
          : `${question.title.split(" · ")[0]} · ${field.label}`
        : t(field.label),
      value: reviewValue(field, draft, display),
    })),
  );
}
