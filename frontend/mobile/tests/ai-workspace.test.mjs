import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "../src/services/client.js";
import { createApi } from "../src/services/api.js";
import {
  emptyMonitoringProfile,
  parseMonitoringSnapshot,
  parseMonitoringProfile,
} from "../src/features/ai/monitoringModel.js";
import { parseDialogue } from "../src/features/ai/dialogueApi.js";
import { assistantOverview } from "../src/features/ai/overview.js";
import { createTaskGate } from "../src/features/ai/taskGate.js";
import { chatPanelLayout } from "../src/features/assistant/panelLayout.js";

const policy = {
  id: "notice-1",
  title: "주택 수리",
  summary: "공개된 지원 안내",
  tags: [],
  revisionId: "11111111-1111-1111-1111-111111111111",
  region: "서울",
  category: "주거",
  benefit: "수리 비용",
  sourceUrl: "https://example.test/notice",
};
const profile = {
  ...emptyMonitoringProfile,
  interests: ["주거"],
  housing_tenure: "owner",
  building_year: 1990,
};
const candidate = {
  need_id: "housing-repair",
  policy_id: policy.id,
  policy,
  status: "needs_review",
  reason: "주택 상태 확인 필요",
  questions: ["주택 수리가 필요한가요?"],
  state: "preparing",
  active: true,
  schedule_status: "open",
};
const snapshot = {
  profile,
  enabled: true,
  updated_at: "2026-10-01T01:00:00Z",
  last_checked_at: null,
  needs: [
    {
      id: "housing-repair",
      title: "주거",
      reason: "확인 필요",
      keywords: ["집수리"],
      questions: ["주택 수리가 필요한가요?"],
    },
  ],
  candidates: [candidate],
  alerts: [
    {
      id: "alert-1",
      policy_id: policy.id,
      need_id: "housing-repair",
      title: "새 안내",
      body: "관련 공고를 찾았어요",
      created_at: "2026-10-01T01:00:00Z",
      read: false,
    },
  ],
  unread_count: 1,
  scan_status: "pending",
};
const dialogue = {
  answer: "현재 주택 상황을 알려주세요.",
  eligibility_decided: false,
  topic: "housing_repair",
  continuation: "c".repeat(43),
  missing_fields: [{ slot: "repair_needed", label: "수리 필요 여부" }],
  confirmed_fields: ["housing_tenure"],
  profile_draft: profile,
  can_save_profile: true,
  practical_steps: [],
  source_links: [],
  candidates: [candidate],
  catalog_status: "ready",
  follow_up: {
    slot: "repair_needed",
    question: "수리가 필요한가요?",
    input_type: "select",
    allow_unknown: true,
    options: [
      { value: true, label: "예" },
      { value: false, label: "아니요" },
    ],
  },
  selected_policy: null,
};

test("native AI requests share web contracts with bearer only and explicit saving consent", async () => {
  const calls = [];
  const api = createApi(
    createClient({
      baseUrl: "https://example.test/api",
      fetchImpl: async (url, options) => {
        calls.push({ url, ...options });
        return new Response(
          JSON.stringify(
            url.endsWith("/dialogue")
              ? dialogue
              : url.endsWith("/alerts/read")
                ? { updated: true }
                : snapshot,
          ),
        );
      },
    }),
  );
  const options = { token: "mobile-session" };
  await api.monitoring.read(options);
  await api.monitoring.save(profile, {
    ...options,
    consent: true,
    enabled: false,
  });
  await api.monitoring.preferences(false, options);
  await api.monitoring.refresh(options);
  await api.monitoring.state(candidate, "applied", options);
  await api.monitoring.readAlerts(["alert-1", "alert-1"], options);
  await api.dialogue.start("  집수리 지원  ", options);
  await api.dialogue.answer(
    dialogue.continuation,
    "repair_needed",
    null,
    options,
  );
  await api.dialogue.save(dialogue.continuation, {
    ...options,
    consent: true,
    confirmed: true,
  });
  await api.monitoring.remove(options);
  assert.equal(calls[0].method, "GET");
  assert.deepEqual(JSON.parse(calls[1].body), {
    profile,
    consent: true,
    enabled: false,
  });
  assert.deepEqual(JSON.parse(calls[4].body), {
    policy_id: policy.id,
    need_id: candidate.need_id,
    state: "applied",
  });
  assert.deepEqual(JSON.parse(calls[5].body), { ids: ["alert-1"] });
  assert.deepEqual(JSON.parse(calls[6].body), { question: "집수리 지원" });
  assert.deepEqual(JSON.parse(calls[7].body), {
    continuation: dialogue.continuation,
    answer: { slot: "repair_needed", value: null },
  });
  assert.deepEqual(JSON.parse(calls[8].body), {
    continuation: dialogue.continuation,
    consent: true,
    confirmed: true,
  });
  for (const call of calls) {
    assert.equal(call.headers.Authorization, "Bearer mobile-session");
    assert.equal(call.credentials, "omit");
    assert.equal(call.redirect, "error");
    if (call.body) {
      assert.equal(call.headers["X-Auth-Request"], "1");
      assert.equal(call.method, "POST");
    }
  }
});
test("AI rejects anonymous calls, invalid state and implicit account storage before HTTP", async () => {
  const api = createApi(async () => {
    assert.fail("must not send invalid data");
  });
  await assert.rejects(api.monitoring.read(), { status: 401 });
  await assert.rejects(api.dialogue.start("질문"), { status: 401 });
  assert.throws(
    () =>
      api.monitoring.save(profile, {
        token: "token",
        consent: false,
        enabled: true,
      }),
    { code: "consent_required" },
  );
  assert.throws(() => api.monitoring.state(candidate, "granted", {}), {
    code: "invalid_input",
  });
  await assert.rejects(
    api.dialogue.save("token", {
      token: "session",
      consent: true,
      confirmed: false,
    }),
    { code: "consent_required" },
  );
});
test("snapshot rejects mismatched policy IDs, duplicate records and malformed profile data", () => {
  const valid = parseMonitoringSnapshot(snapshot);
  assert.equal(valid.candidates[0].policy.id, policy.id);
  for (const change of [
    { candidates: [{ ...candidate, policy_id: "another-policy" }] },
    { candidates: [candidate, candidate] },
    { alerts: [snapshot.alerts[0], snapshot.alerts[0]] },
    { profile: { ...profile, disaster_occurred_on: "2026-02-30" } },
    { profile: { ...profile, building_year: 2999 } },
    { profile: { ...profile, repair_needed: "true" } },
  ])
    assert.throws(() => parseMonitoringSnapshot({ ...snapshot, ...change }), {
      code: "invalid_response",
    });
  assert.equal(
    parseMonitoringProfile({ ...profile, password: "do not forward" }).password,
    undefined,
  );
});
test("dialogue refuses invented eligibility, unsafe links, unconfirmed saves and malformed follow-ups", () => {
  assert.equal(parseDialogue(dialogue).follow_up.allow_unknown, true);
  for (const change of [
    { eligibility_decided: true },
    { confirmed_fields: ["password"] },
    { source_links: [{ label: "링크", url: "javascript:alert(1)" }] },
    { can_save_profile: true, confirmed_fields: [] },
    { follow_up: { ...dialogue.follow_up, options: [] } },
    { follow_up: { ...dialogue.follow_up, allow_unknown: false } },
    { candidates: [{ ...candidate, policy_id: "different" }] },
  ])
    assert.throws(() => parseDialogue({ ...dialogue, ...change }), {
      code: "invalid_response",
    });
});
test("overview deduplicates progress by policy and repeated questions, retaining inactive history", () => {
  const value = parseMonitoringSnapshot({
    ...snapshot,
    candidates: [
      candidate,
      { ...candidate, need_id: "other-need", active: false },
      {
        ...candidate,
        need_id: "archived",
        policy_id: "old",
        policy: { ...policy, id: "old" },
        active: false,
        state: "completed",
      },
    ],
  });
  const overview = assistantOverview(value, { region: "서울" });
  assert.equal(overview.active.length, 1);
  assert.equal(overview.questions.length, 1);
  assert.equal(overview.progress.length, 2);
  assert.equal(overview.progressCounts.preparing, 1);
  assert.equal(overview.progressCounts.completed, 1);
  assert.ok(overview.facts.includes("서울"));
  assert.equal(overview.newAlerts.length, 1);
});
test("cancelled requests never restore another screen's data or finish a replacement task", async () => {
  const gate = createTaskGate();
  const commits = [];
  const finishes = [];
  let resolveOld, resolveNew, oldSignal;
  const old = gate.run(
    (signal) => {
      oldSignal = signal;
      return new Promise((resolve) => {
        resolveOld = resolve;
      });
    },
    (value) => commits.push(value),
    assert.fail,
    () => finishes.push("old"),
  );
  gate.cancel();
  assert.equal(oldSignal.aborted, true);
  const next = gate.run(
    () =>
      new Promise((resolve) => {
        resolveNew = resolve;
      }),
    (value) => commits.push(value),
    assert.fail,
    () => finishes.push("new"),
  );
  resolveOld("private-old-account");
  await old;
  assert.equal(gate.isBusy(), true);
  assert.deepEqual(commits, []);
  assert.deepEqual(finishes, []);
  resolveNew("current-account");
  await next;
  assert.deepEqual(commits, ["current-account"]);
  assert.deepEqual(finishes, ["new"]);
});
test("a duplicate save is blocked until the current task completes", async () => {
  const gate = createTaskGate();
  let resolve;
  let calls = 0;
  const first = gate.run(
    () => {
      calls++;
      return new Promise((r) => {
        resolve = r;
      });
    },
    () => {},
    assert.fail,
    () => {},
  );
  await gate.run(
    () => {
      calls++;
    },
    assert.fail,
    assert.fail,
    assert.fail,
  );
  resolve();
  await first;
  assert.equal(calls, 1);
  assert.equal(gate.isBusy(), false);
});
test("floating chatbot preserves visible page and navigation on small, large, landscape and keyboard layouts", () => {
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [430, 932],
    [844, 390],
    [800, 1200],
  ]) {
    for (const easy of [false, true])
      for (const keyboardTop of [null, height * 0.57]) {
        const bottom = 24,
          top = 28,
          tabHeight = easy ? 100 : 70;
        const panel = chatPanelLayout({
          width,
          height,
          top,
          bottom,
          keyboardTop,
          tabHeight,
          easy,
        });
        const viewport = Math.min(height, keyboardTop ?? height);
        assert.ok(panel.width <= width - 16 && panel.width <= 440);
        assert.ok(panel.height > 40 && panel.height < viewport * 0.73);
        assert.ok(
          height - panel.bottom - panel.height >=
            top +
              (viewport -
                top -
                (keyboardTop === null ? tabHeight + bottom + 12 : 8)) *
                0.27,
        );
        assert.ok(
          panel.bottom >=
            (keyboardTop === null ? tabHeight + bottom : height - viewport),
        );
      }
  }
});
