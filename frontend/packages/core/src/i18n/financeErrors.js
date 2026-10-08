export function translateFinanceHint(hint, t) {
  if (typeof hint !== "string") return t(hint);
  const entry = hint.match(
    /^(\d{4})년 (\d{1,2})월부터 (\d{4})년 (\d{1,2})월까지 가구원 모두가 받은 돈을 합산해 주세요\. 가구원 사이에 주고받은 돈은 중복 입력하지 않아요\.$/,
  );
  if (!entry) return t(hint);
  return t(
    "{start}부터 {end}까지 가구원 모두가 받은 돈을 합산해 주세요. 가구원 사이에 주고받은 돈은 중복 입력하지 않아요.",
    {
      start: t("{year}년 {month}월", { year: entry[1], month: entry[2] }),
      end: t("{year}년 {month}월", { year: entry[3], month: entry[4] }),
    },
  );
}

export function translateFinanceLabel(label, t) {
  if (typeof label !== "string") return t(label);
  const entry = label.match(/^(\d{4})년 (\d{1,2})월 (지원금 합계|받은 횟수)$/);
  if (!entry) return t(label);
  const month = t("{year}년 {month}월", { year: entry[1], month: entry[2] });
  return t("{month} " + entry[3], { month });
}

// Only for messages produced by the local finance model/flow, never arbitrary policy text.
const suffixes = [
  "을(를) 입력해 주세요.",
  "은(는) 0 이상의 정수로 입력해 주세요.",
  "의 입력 범위를 확인해 주세요.",
  "을(를) 입력하거나 없음·모름을 선택해 주세요.",
  "은(는) 만원 단위 숫자로 입력해 주세요. 소수점은 넷째 자리까지 가능해요.",
  "을(를) 선택해 주세요.",
];
export function translateFinanceError(message, t) {
  if (typeof message !== "string") return t(message);
  for (const suffix of suffixes) {
    if (!message.endsWith(suffix)) continue;
    const label = message.slice(0, -suffix.length);
    const member = label.match(/^가구원 (\d+) 나이$/);
    const vehicle = label.match(/^차량 (\d+) 가액$/);
    const localized = member
      ? t("가구원 {index} 나이", { index: member[1] })
      : vehicle
        ? t("차량 {index} 가액", { index: vehicle[1] })
        : translateFinanceLabel(label, t);
    return t("{label}" + suffix, { label: localized });
  }
  return t(message);
}
