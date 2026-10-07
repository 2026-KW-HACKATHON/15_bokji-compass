import test from "node:test";
import assert from "node:assert/strict";
import {
  parseSearchMetadata,
  parseSearchMatch,
  effectivePolicySort,
  searchRelationForScope,
} from "../src/features/policies/searchMetadata.js";
import { parsePolicyPage, policyPath } from "../src/features/policies/model.js";

const search = {
  mode: "smart",
  summary: "대학생 등록금 지원으로 이해했어요.",
  originalQuery: "광운데 재학생 등록금 도와주는거",
  interpretedQuery: "광운대 대학생 등록금 지원",
  corrections: [{ from: "광운데", to: "광운대" }],
  alternatives: [{ scope: "all", label: "함께 찾은 공고", count: 1 }],
  warnings: [],
};
const searchMatch = {
  relations: ["student_general"],
  reason: "대학생 대상 등록금 지원이에요.",
  evidence: [{ field: "eligibility", quote: "국내 대학 재학생 대상" }],
};

test("mobile smart metadata preserves public interpretation, correction and grounded reasons", () => {
  const page = parsePolicyPage({
    items: [
      { id: "smart", title: "등록금 지원", summary: "", tags: [], searchMatch },
    ],
    total: 1,
    nextCursor: null,
    search: { ...search, privatePlan: "omitted" },
  });
  assert.deepEqual(page.search, search);
  assert.deepEqual(page.items[0].searchMatch, searchMatch);
  assert.deepEqual(
    parseSearchMatch({ ...searchMatch, score: 99 }),
    searchMatch,
  );
});

test("mobile optional metadata rejects wrong types, unsupported relations and ungrounded reasons", () => {
  for (const value of [
    { ...search, mode: "AI" },
    { ...search, corrections: [null] },
    { ...search, alternatives: [{ scope: "all", label: "전체", count: -1 }] },
    { ...search, summary: "x".repeat(1001) },
  ])
    assert.equal(parseSearchMetadata(value), null);
  for (const value of [
    { ...searchMatch, relations: ["eligible"] },
    { ...searchMatch, evidence: [] },
    {
      ...searchMatch,
      evidence: [{ field: "contact", quote: "광운대학교 문의" }],
    },
    { ...searchMatch, evidence: [{ field: "text", quote: "x".repeat(251) }] },
  ])
    assert.equal(parseSearchMatch(value), null);
  assert.equal(
    parsePolicyPage({
      items: [],
      total: 0,
      nextCursor: null,
      search: { broken: true },
    }).search,
    undefined,
  );
});

test("mobile auto search leaves smart ranking to the server and literal correction undo retains the typed query", () => {
  const params = (filters) =>
    new URL(policyPath(filters), "https://example.test").searchParams;
  assert.equal(params({ query: search.originalQuery }).has("sort"), false);
  assert.equal(params({ query: "" }).get("sort"), "popular");
  assert.equal(
    params({ query: search.originalQuery, sort: "popular" }).get("sort"),
    "popular",
  );
  const undo = params({ query: search.originalQuery, searchMode: "literal" });
  assert.equal(undo.get("q"), search.originalQuery);
  assert.equal(undo.get("search_mode"), "literal");
  const related = params({ query: "광운대", searchRelation: "related" });
  assert.equal(related.get("search_relation"), "related");
  assert.equal(related.has("search_scope"), false);
  assert.equal(related.has("search_mode"), false);
  assert.equal(searchRelationForScope("content"), "related");
  assert.equal(searchRelationForScope("organization"), "publisher");
  assert.equal(searchRelationForScope("all"), "");
  assert.equal(
    effectivePolicySort({ query: search.originalQuery }),
    "relevance",
  );
  assert.equal(
    effectivePolicySort({ query: search.originalQuery, searchMode: "literal" }),
    "popular",
  );
  assert.equal(
    effectivePolicySort({ query: search.originalQuery, sort: "name" }),
    "name",
  );
});
