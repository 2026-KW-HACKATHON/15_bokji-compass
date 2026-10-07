// Display fallbacks are UI copy, never facts sent to the translation validator.
export const policyTranslationFallbacks = Object.freeze({
  audience: '지원 대상 확인 필요',
  organization: '기관 확인 필요',
  benefit: '상세 안내 확인',
  applicationPeriod: '공식 공고에서 확인',
});

export function emptyTranslationFields(item) {
  const inherited = new Set(
    Array.isArray(item.translationSourceEmptyFields) ? item.translationSourceEmptyFields : [],
  );
  return Object.entries(policyTranslationFallbacks)
    .filter(
      ([key, fallback]) =>
        typeof item[key] !== 'string' || (inherited.has(key) && item[key] === fallback),
    )
    .map(([key]) => key);
}

function fallbackFields(policy) {
  return (
    Array.isArray(policy.translationSourceEmptyFields) ? policy.translationSourceEmptyFields : []
  ).filter(
    (key) =>
      Object.hasOwn(policyTranslationFallbacks, key) &&
      policy[key] === policyTranslationFallbacks[key],
  );
}

export function policyTranslationSource(policy) {
  const fields = fallbackFields(policy);
  return fields.length
    ? { ...policy, ...Object.fromEntries(fields.map((key) => [key, ''])) }
    : policy;
}

export function restoreTranslationFallbacks(original, translated, t) {
  const fields = fallbackFields(original);
  return {
    ...translated,
    ...Object.fromEntries(
      fields.filter((key) => !translated[key]?.trim()).map((key) => [key, t(original[key])]),
    ),
  };
}
