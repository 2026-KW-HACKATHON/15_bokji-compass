import test from "node:test";
import assert from "node:assert/strict";
import { parsePolicy } from "../src/features/policies/model.js";
import { createApi } from "../src/services/api.js";

const original = {
  id: "source/a?b",
  revisionId: "12345678-1234-1234-1234-123456789abc",
  title: "외국인 주거 지원",
  summary: "원문 요약",
  tags: ["주거"],
  category: "주거",
  region: "서울",
  audience: "등록 외국인",
  organization: "담당 기관",
  benefit: "월세 지원",
  applicationPeriod: "2026년 10월",
  content: "공고 원문 본문",
  paymentSchedule: "월말",
  gender: "무관",
  contact: "02-123-4567",
  applicationMethod: "온라인 신청",
  otherConditions: ["거주 조건 확인"],
  sourceFields: { text: "공고 원문 본문", application_method: "온라인 신청" },
  sourceUrl: "https://example.test/original",
  applicationUrl: "https://example.test/apply",
};
const translations = {
  en: {
    title: "Housing support for foreign residents",
    summary: "Original summary",
    audience: "Registered foreign residents",
    organization: "Responsible office",
    benefit: "Rent support",
    applicationPeriod: "2026-10",
    content: "Original notice body",
    paymentSchedule: "End of month",
    gender: "Any",
    contact: "02-123-4567",
    applicationMethod: "Apply online",
    otherConditions: ["Check residence requirements"],
    sourceFields: {
      text: "Original notice body",
      application_method: "Apply online",
    },
  },
  zh: {
    title: "外国居民住房援助",
    summary: "原文摘要",
    audience: "已登记外国居民",
    organization: "负责机构",
    benefit: "租金援助",
    applicationPeriod: "2026年10月",
    content: "公告原文正文",
    paymentSchedule: "月底",
    gender: "不限",
    contact: "02-123-4567",
    applicationMethod: "网上申请",
    otherConditions: ["确认居住条件"],
    sourceFields: { text: "公告原文正文", application_method: "网上申请" },
  },
  vi: {
    title: "Hỗ trợ nhà ở cho cư dân nước ngoài",
    summary: "Tóm tắt gốc",
    audience: "Cư dân nước ngoài đã đăng ký",
    organization: "Cơ quan phụ trách",
    benefit: "Hỗ trợ tiền thuê",
    applicationPeriod: "Tháng 10 năm 2026",
    content: "Nội dung thông báo gốc",
    paymentSchedule: "Cuối tháng",
    gender: "Không giới hạn",
    contact: "02-123-4567",
    applicationMethod: "Đăng ký trực tuyến",
    otherConditions: ["Kiểm tra điều kiện cư trú"],
    sourceFields: {
      text: "Nội dung thông báo gốc",
      application_method: "Đăng ký trực tuyến",
    },
  },
  ja: {
    title: "外国人住民向け住宅支援",
    summary: "原文の概要",
    audience: "登録済みの外国人住民",
    organization: "担当機関",
    benefit: "家賃支援",
    applicationPeriod: "2026年10月",
    content: "公示の原文本文",
    paymentSchedule: "月末",
    gender: "不問",
    contact: "02-123-4567",
    applicationMethod: "オンライン申請",
    otherConditions: ["居住条件を確認"],
    sourceFields: {
      text: "公示の原文本文",
      application_method: "オンライン申請",
    },
  },
};
const response = (language) => ({
  policy_id: original.id,
  revision_id: original.revisionId,
  source_language: "ko",
  source_hash: "a".repeat(64),
  language,
  translation: translations[language],
  cached: false,
});

test("mobile preserves original body and supplementary policy details for translation and original toggle", () => {
  const policy = parsePolicy(original);
  assert.equal(policy.content, original.content);
  assert.equal(policy.applicationMethod, original.applicationMethod);
  assert.deepEqual(policy.otherConditions, original.otherConditions);
  assert.deepEqual(policy.sourceFields, original.sourceFields);
  assert.equal(policy.applicationUrl, original.applicationUrl);
  const unsafe = parsePolicy({
    ...original,
    sourceFields: { text: "본문", invalid: {}, _editor_private: "omit" },
    applicationUrl: "javascript:alert(1)",
  });
  assert.deepEqual(unsafe.sourceFields, { text: "본문" });
  assert.equal(unsafe.applicationUrl, null);
});

test("mobile requests translated full policy text for all four foreign languages and preserves canonical identity", async () => {
  const calls = [];
  const api = createApi(async (path, options) => {
    calls.push({ path, options });
    return response(
      new URL(path, "https://example.test").searchParams.get("language"),
    );
  });
  const policy = parsePolicy(original);
  for (const locale of ["en", "zh", "vi", "ja"]) {
    const display = await api.policyTranslations.translate(policy, locale, {
      priority: 10,
    });
    assert.equal(display.title, translations[locale].title);
    assert.equal(display.content, translations[locale].content);
    assert.deepEqual(
      display.otherConditions,
      translations[locale].otherConditions,
    );
    assert.equal(display.id, policy.id);
    assert.equal(display.revisionId, policy.revisionId);
    assert.equal(display.category, policy.category);
    assert.equal(display.region, policy.region);
    assert.equal(display.sourceUrl, policy.sourceUrl);
    assert.equal(display.applicationUrl, policy.applicationUrl);
  }
  assert.equal(policy.title, original.title);
  assert.equal(policy.content, original.content);
  assert.equal(calls.length, 4);
  assert.match(
    calls[0].path,
    /^\/v1\/policies\/source%2Fa%3Fb\/translation\?language=en$/,
  );
  assert.equal(calls[0].options.timeoutMs, 65000);
  assert.equal(calls[0].options.body, undefined);
  await api.policyTranslations.translate(policy, "en");
  assert.equal(calls.length, 4, "Repeat display uses in-memory cache");
  assert.equal(await api.policyTranslations.translate(policy, "ko"), policy);
  assert.equal(calls.length, 4, "Korean needs no translation API");
});

test("mobile translation failure retains canonical data and retry issues a new request", async () => {
  let failed = true;
  const api = createApi(async () => {
    if (failed) throw new Error("unavailable");
    return response("en");
  });
  const policy = parsePolicy(original);
  await assert.rejects(
    api.policyTranslations.translate(policy, "en"),
    /unavailable/,
  );
  assert.equal(policy.title, original.title);
  failed = false;
  assert.equal(
    (await api.policyTranslations.translate(policy, "en")).title,
    translations.en.title,
  );
});

test("missing notice fields stay absent in translation validation and use localized UI fallbacks", async () => {
  const sparse = parsePolicy({
    ...original,
    audience: "",
    organization: null,
    benefit: "",
    applicationPeriod: "",
  });
  const api = createApi(async () => ({
    ...response("en"),
    translation: {
      ...translations.en,
      audience: "",
      organization: "",
      benefit: "",
      applicationPeriod: "",
      paymentSchedule: null,
      budgetNotice: null,
    },
  }));
  // A genuinely absent optional payment field is represented as an empty string by the parser.
  sparse.paymentSchedule = "";
  const display = await api.policyTranslations.translate(sparse, "en");
  assert.equal(display.audience, "Eligibility needs checking");
  assert.equal(display.organization, "Organization needs checking");
  assert.equal(display.benefit, "Check the official notice");
  assert.equal(display.paymentSchedule, null);
  assert.equal(sparse.audience, "지원 대상 확인 필요");
});

test("canonical source fields retain Korean and custom keys so full translation keysets agree", async () => {
  const policy = parsePolicy({
    ...original,
    sourceFields: {
      eligibility: "등록 외국인",
      제출서류: "거주 증명",
      constructor: "공식 조건",
    },
  });
  assert.deepEqual(Object.keys(policy.sourceFields), [
    "eligibility",
    "제출서류",
    "constructor",
  ]);
  const api = createApi(async () => ({
    ...response("en"),
    translation: {
      ...translations.en,
      sourceFields: {
        eligibility: "Registered foreign residents",
        제출서류: "Proof of residence",
        constructor: "Official conditions",
      },
    },
  }));
  const display = await api.policyTranslations.translate(policy, "en");
  assert.equal(display.sourceFields.제출서류, "Proof of residence");
  assert.equal(policy.sourceFields.제출서류, "거주 증명");
});
