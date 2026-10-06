// Buckets simplify the first choice; only an explicitly selected exact count is calculated.
// Empty and malformed input are deliberately not coerced to zero.
export function readCount(value) {
  if (value == null || String(value).trim() === '') return null;
  const text = String(value).trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text)) return null;
  const count = Number(text.replaceAll(',', ''));
  return Number.isSafeInteger(count) ? count : null;
}

export function countChoices({ min = 0, max = 100, groupFrom = 3, manualFrom = 9 } = {}) {
  const limit = Number.isInteger(max) && max >= min ? max : 100;
  return {
    common: Array.from(
      { length: Math.max(0, Math.min(groupFrom - 1, limit) - min + 1) },
      (_, i) => min + i,
    ),
    grouped: limit >= groupFrom,
    exact: Array.from(
      { length: Math.max(0, Math.min(manualFrom - 1, limit) - groupFrom + 1) },
      (_, i) => groupFrom + i,
    ),
    manual: limit >= manualFrom,
    max: limit,
  };
}
