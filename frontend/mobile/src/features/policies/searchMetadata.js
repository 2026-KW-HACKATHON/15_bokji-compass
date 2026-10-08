const scopes = ["all", "organization", "content"];
const evidenceFields = [
  "title",
  "organization",
  "text",
  "purpose_summary",
  "eligibility",
  "selection",
  "benefits",
  "_editor_summary",
  "_editor_benefits",
  "_editor_region",
  "_editor_age",
  "_editor_gender",
  "_editor_other",
];
const relations = [
  "publisher",
  "target",
  "contextual",
  "student_general",
  "mention",
  "benefit",
  "literal",
];
const text = (value, limit, allowEmpty = false) =>
  typeof value === "string" &&
  value.length <= limit &&
  (allowEmpty || value.trim().length > 0);
const array = (value, limit, valid) =>
  Array.isArray(value) && value.length <= limit && value.every(valid);

/**
 * @typedef {{mode: 'smart'|'literal', summary: string, originalQuery: string,
 * interpretedQuery: string, corrections: {from:string,to:string}[],
 * alternatives: {scope:'all'|'organization'|'content',label:string,count:number}[], warnings:string[]}} SearchMetadata
 * @typedef {{relations:string[], reason:string, evidence:{field:string,quote:string}[]}} SearchMatch
 */

/** @returns {SearchMetadata | null} */
export function parseSearchMetadata(value) {
  if (
    !value ||
    !["smart", "literal"].includes(value.mode) ||
    !text(value.summary, 1000) ||
    !text(value.originalQuery, 200, true) ||
    !text(value.interpretedQuery, 500, true) ||
    !array(
      value.corrections,
      10,
      (item) => item && text(item.from, 200) && text(item.to, 200),
    ) ||
    !array(
      value.alternatives,
      3,
      (item) =>
        item &&
        scopes.includes(item.scope) &&
        text(item.label, 200) &&
        Number.isSafeInteger(item.count) &&
        item.count >= 0,
    ) ||
    (value.warnings !== undefined &&
      !array(value.warnings, 10, (item) => text(item, 500)))
  )
    return null;
  if (
    new Set(value.alternatives.map((item) => item.scope)).size !==
    value.alternatives.length
  )
    return null;
  return {
    mode: value.mode,
    summary: value.summary,
    originalQuery: value.originalQuery,
    interpretedQuery: value.interpretedQuery,
    corrections: value.corrections.map(({ from, to }) => ({ from, to })),
    alternatives: value.alternatives.map(({ scope, label, count }) => ({
      scope,
      label,
      count,
    })),
    warnings: [...(value.warnings || [])],
  };
}

/** @returns {SearchMatch | null} */
export function parseSearchMatch(value) {
  if (
    !value ||
    !text(value.reason, 1000) ||
    !array(value.relations, 7, (relation) => relations.includes(relation)) ||
    !value.relations.length ||
    !array(
      value.evidence,
      3,
      (item) =>
        item && evidenceFields.includes(item.field) && text(item.quote, 250),
    ) ||
    !value.evidence.length
  )
    return null;
  return {
    relations: [...new Set(value.relations)],
    reason: value.reason,
    evidence: value.evidence.map(({ field, quote }) => ({ field, quote })),
  };
}

export function searchRelationForScope(scope) {
  return scope === "organization"
    ? "publisher"
    : scope === "content"
      ? "related"
      : "";
}

export function effectivePolicySort(filters = {}) {
  if (filters.sort && filters.sort !== "auto") return filters.sort;
  return filters.query?.trim() &&
    (!filters.searchScope || filters.searchScope === "all") &&
    filters.searchMode !== "literal"
    ? "relevance"
    : "popular";
}
