import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createLocalePreference,
  initialLocale,
  translateUi,
} from "../src/i18n/model.js";
import { mobileMessages } from "../../packages/core/src/i18n/mobileMessages.js";
import { translate } from "../../packages/core/src/i18n/index.js";
import { financeError, questionTitle } from "../src/features/finance/i18n.js";
import { policyPath } from "../src/features/policies/model.js";

test("mobile catalogs contain real translations for all four foreign languages", () => {
  assert.ok(Object.keys(mobileMessages).length > 400);
  for (const [source, entry] of Object.entries(mobileMessages)) {
    for (const locale of ["en", "zh", "vi", "ja"]) {
      assert.equal(typeof entry[locale], "string", `${source}: ${locale}`);
      assert.ok(entry[locale].trim(), `${source}: ${locale}`);
      assert.ok(
        !/[가-힣]/.test(entry[locale]),
        `${source}: ${locale} contains untranslated Korean`,
      );
    }
  }
  assert.equal(translateUi("zh", "내 계정"), "我的账户");
  assert.equal(translateUi("vi", "로그인"), "Đăng nhập");
  assert.equal(translateUi("ja", "공고 검색"), "公示を検索");
});

test("mobile known copy handles JSX whitespace and unknown content remains byte-for-byte unchanged", () => {
  assert.equal(
    translateUi("en", "나에게 필요한 지원,\n여기서 찾아보세요"),
    "Find the support you need here",
  );
  const source = "외국인 지원 2026\n홍길동의 질문 <script>";
  assert.equal(translateUi("en", source), source);
  assert.equal(translateUi("ko", source), source);
  assert.ok(
    translateUi("en", "{name}님", { name: "Nguyễn Văn A" }).includes(
      "Nguyễn Văn A",
    ),
  );
});

test("ordered browser/device language detection uses supported regional variants", () => {
  assert.equal(initialLocale(["fr-FR", "vi-VN", "en-US"]), "vi");
  assert.equal(initialLocale(["zh-Hant-TW"]), "zh");
  assert.equal(initialLocale(["ja-JP"]), "ja");
  assert.equal(initialLocale(["fr"]), "ko");
});

test("preference survives restart and slow restoration never overwrites an explicit choice", async () => {
  let stored = "zh";
  let restore;
  const storage = {
    read: () =>
      new Promise((resolve) => {
        restore = resolve;
      }),
    write: async (value) => {
      stored = value;
    },
  };
  const preference = createLocalePreference(storage, ["en-US"]);
  assert.equal(preference.getSnapshot(), "en");
  const loading = preference.restore();
  await preference.setLocale("vi");
  restore("ja");
  await loading;
  assert.equal(preference.getSnapshot(), "vi");
  assert.equal(stored, "vi");
  const restarted = createLocalePreference(
    { read: async () => stored, write: storage.write },
    ["ko"],
  );
  await restarted.restore();
  assert.equal(restarted.getSnapshot(), "vi");
});

test("rapid preference changes persist in order; storage failures keep usable UI", async () => {
  const written = [];
  const preference = createLocalePreference({
    read: async () => {
      throw new Error("unavailable");
    },
    write: async (value) => {
      written.push(value);
      if (value === "en") throw new Error("quota");
    },
  });
  await preference.restore();
  const first = preference.setLocale("en");
  const second = preference.setLocale("ja");
  await Promise.all([first, second]);
  assert.equal(preference.getSnapshot(), "ja");
  assert.deepEqual(written, ["en", "ja"]);
  assert.equal(preference.getStorageError(), false);
});

test("invalid saved preferences keep detected language; raw and JSON preferences both restore", async () => {
  for (const saved of ["fr", '"fr"', "{invalid", '["en"]', "", null]) {
    const preference = createLocalePreference(
      { read: async () => saved, write: async () => {} },
      ["vi-VN"],
    );
    await preference.restore();
    assert.equal(preference.getSnapshot(), "vi", `saved ${saved}`);
  }
  for (const saved of ["en", '"en"']) {
    const preference = createLocalePreference(
      { read: async () => saved, write: async () => {} },
      ["vi-VN"],
    );
    await preference.restore();
    assert.equal(preference.getSnapshot(), "en");
  }
  const failure = createLocalePreference({
    read: async () => null,
    write: async () => {
      throw new Error("quota");
    },
  });
  await failure.setLocale("ja");
  assert.equal(failure.getSnapshot(), "ja");
  assert.equal(failure.getStorageError(), true);
});

test("generated finance question titles and validation are localized without changing input identifiers", () => {
  const t = (source, values) => translate("en", source, values);
  assert.match(
    questionTitle(
      { id: "member-1-earned", title: "unused" },
      { members: [1, 2, 3], vehicles: [] },
      t,
    ),
    /^Household member 2 \/ 3 · /,
  );
  assert.match(
    questionTitle(
      { id: "vehicle-0-value", title: "unused" },
      { members: [], vehicles: [1] },
      t,
    ),
    /^Vehicle 1 \/ 1 · /,
  );
  assert.equal(
    financeError("가구원 수을(를) 입력해 주세요.", t),
    "Enter Household size.",
  );
});

test("translated category labels never change the Korean API filter values", () => {
  const params = new URL(
    policyPath({ category: "주거", region: "서울" }),
    "https://example.test",
  ).searchParams;
  assert.equal(params.get("category"), "주거");
  assert.equal(params.get("region"), "서울");
  assert.equal(translateUi("en", "주거"), "Housing");
});

test("external content has explicit original-text boundaries in mobile rendering", async () => {
  const assistant = await readFile(
    new URL("../src/features/assistant/AssistantChat.tsx", import.meta.url),
    "utf8",
  );
  const ui = await readFile(
    new URL("../src/components/ui.tsx", import.meta.url),
    "utf8",
  );
  const text = await readFile(
    new URL("../src/i18n/LocalizedText.tsx", import.meta.url),
    "utf8",
  );
  assert.match(assistant, /<Copy original>\{answer\.answer\}/);
  assert.match(assistant, /<Copy original>\{item\.quote\}/);
  assert.match(assistant, /<OriginalContentNotice\s*\/>/);
  assert.match(ui, /<Copy\s+original\s+title=\{title\}/);
  assert.match(
    text,
    /accessibilityLabel=\{\s*original\s*\?\s*props\.accessibilityLabel\s*:/,
  );
});
