import { ApiError } from "../../services/client.js";

export const categories = [
  "전체",
  "생활·금융",
  "주거",
  "일자리",
  "교육",
  "건강·돌봄",
  "문화",
  "농림축산·어업",
  "사업·창업",
  "기타",
];
export const regions = [
  "전국",
  "서울",
  "경기",
  "인천",
  "부산",
  "대구",
  "광주",
  "대전",
  "울산",
  "세종",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주",
];
export function safeSourceUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function parsePolicy(item) {
  if (
    !item ||
    typeof item.id !== "string" ||
    !item.id.trim() ||
    typeof item.title !== "string" ||
    !item.title.trim() ||
    typeof item.summary !== "string" ||
    !Array.isArray(item.tags) ||
    !item.tags.every((tag) => typeof tag === "string")
  ) {
    throw new ApiError(
      "공고 정보를 읽을 수 없어요. 다시 시도해 주세요.",
      0,
      "invalid_response",
    );
  }
  const text = (key, fallback) =>
    typeof item[key] === "string" && item[key].trim() ? item[key] : fallback;
  return {
    id: item.id,
    revisionId:
      typeof item.revisionId === "string" &&
      /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(item.revisionId)
        ? item.revisionId
        : null,
    title: item.title,
    summary: item.summary,
    tags: [...new Set(item.tags)],
    category: text("category", "기타"),
    region: text("region", "지역 확인 필요"),
    audience: text("audience", "지원 대상 확인 필요"),
    organization: text("organization", "기관 확인 필요"),
    benefit: text("benefit", "공식 공고에서 확인"),
    applicationPeriod: text("applicationPeriod", "공식 공고에서 확인"),
    sourceUrl: safeSourceUrl(item.sourceUrl),
  };
}
/** @returns {{items: ReturnType<typeof parsePolicy>[], total: number, nextCursor: string | null}} */
export function parsePolicyPage(value) {
  if (
    !value ||
    !Array.isArray(value.items) ||
    !Number.isInteger(value.total) ||
    value.total < 0 ||
    !(
      value.nextCursor === null ||
      (typeof value.nextCursor === "string" && /^\d+$/.test(value.nextCursor))
    )
  ) {
    throw new ApiError(
      "공고 목록을 읽을 수 없어요. 다시 시도해 주세요.",
      0,
      "invalid_response",
    );
  }
  const items = value.items.map(parsePolicy);
  if (
    new Set(items.map((item) => item.id)).size !== items.length ||
    value.total < items.length
  )
    throw new ApiError(
      "공고 목록의 개수를 확인할 수 없어요.",
      0,
      "invalid_response",
    );
  return { items, total: value.total, nextCursor: value.nextCursor };
}
export function policyPath({
  query = "",
  category = "전체",
  region = "전국",
  sort = "popular",
  cursor = null,
  limit = 6,
} = {}) {
  const params = new URLSearchParams({ limit: String(limit), sort });
  if (query.trim()) params.set("q", query.trim());
  if (category !== "전체") params.set("category", category);
  if (region !== "전국") params.set("region", region);
  if (cursor !== null) params.set("cursor", cursor);
  return "/v1/policies?" + params.toString();
}
