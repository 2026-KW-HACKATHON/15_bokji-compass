const contentSourceKeys = ['text', 'purpose_summary', 'eligibility', 'selection', 'benefits'];
const normalize = (value) =>
  typeof value === 'string' ? value.toLocaleLowerCase('ko').replace(/\s+/g, '') : '';

// A formal university name can also appear as its familiar short name in a notice.
const alternatives = (term) => {
  const normalized = normalize(term);
  const formalUniversity = /^([가-힣]{2,})대학교$/.exec(normalized);
  return formalUniversity ? [normalized, formalUniversity[1] + '대'] : [normalized];
};

export function matchesPolicySearch(policy, query = '', searchScope = 'all') {
  if (!['all', 'organization', 'content'].includes(searchScope))
    throw new RangeError('검색 범위가 올바르지 않아요.');
  const terms = query.trim().split(/\s+/).filter(Boolean).map(alternatives);
  const organization = [normalize(policy.organization)];
  const content = [
    policy.title,
    policy.summary,
    policy.benefit,
    policy.content,
    ...contentSourceKeys.map((key) => policy.sourceFields?.[key]),
  ].map(normalize);
  const fields =
    searchScope === 'organization'
      ? organization
      : searchScope === 'content'
        ? content
        : [...organization, ...content];
  return terms.every((variants) =>
    fields.some((field) => variants.some((term) => field.includes(term))),
  );
}
