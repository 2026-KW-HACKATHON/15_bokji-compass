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
  return financeGroups
    .slice(0, 5)
    .map((title, index) => ({
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
export function reviewValue(field, draft) {
  const value = fieldValue(draft, field.path);
  if (field.type === "check") return value ? "예" : "미확인";
  if (field.countChoices)
    return value == null || value === "" ? "확인 필요" : `${value}명`;
  if (field.type === "select")
    return (
      field.options.find(([key]) => String(key) === String(value))?.[1] ||
      "모름"
    );
  if (field.type === "money") {
    try {
      return formatMoney(parseMoney(value, field.label));
    } catch {
      return "입력 확인 필요";
    }
  }
  return value == null || value === ""
    ? "확인 필요"
    : `${value}${field.unit || ""}`;
}
export function reviewRows(section, draft) {
  return section.questions.flatMap((question) =>
    visibleFields(question, draft).map((field) => ({
      key: field.path,
      label: /^(member|vehicle)-\d+-/.test(question.id)
        ? `${question.title.split(" · ")[0]} · ${field.label}`
        : field.label,
      value: reviewValue(field, draft),
    })),
  );
}
