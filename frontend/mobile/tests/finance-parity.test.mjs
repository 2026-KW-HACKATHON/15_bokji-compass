import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyFinancialProfile,
  emptyMember,
  moneyInput,
} from "@bokji/core/finance-model";
import {
  medianForHousehold,
  monthlyIncomeRatio,
} from "@bokji/core/median-income";
import { quickDefaultsFromFinance } from "@bokji/core/finance-prefill";
import { createFinanceState } from "../src/features/finance/state.js";
import {
  financeSections,
  validateSection,
} from "../src/features/finance/flow.js";
import { updateDraft } from "../src/features/finance/draft.js";

const auth = (id) => ({
  status: "signedIn",
  token: `${id}-token`,
  user: { id, age: 30, region: "서울" },
});
const guest = { status: "signedOut" };
const record = (profile) => ({
  profile,
  calculation: null,
  updated_at: profile ? "2026-10-07" : null,
});
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test("quick calculator uses same official table, exact large count, decimal won, zero and unknown as web", () => {
  assert.equal(medianForHousehold(4), 6494738);
  assert.equal(medianForHousehold(12), 9515150 + 5 * (9515150 - 8555952));
  assert.equal(monthlyIncomeRatio("", medianForHousehold(1)), null);
  assert.deepEqual(monthlyIncomeRatio("0", medianForHousehold(1)), {
    income: 0,
    percent: 0,
  });
  assert.equal(
    monthlyIncomeRatio("300.0001", medianForHousehold(1)).income,
    3000001,
  );
  assert.throws(() => medianForHousehold(""));
  assert.throws(() => medianForHousehold(101));
});

test("detail keeps five input sections plus review regardless of household and vehicles", () => {
  let draft = updateDraft(emptyFinancialProfile(), "household_size", 12);
  draft = updateDraft(draft, "vehicle_status", "owned");
  const sections = financeSections(draft);
  assert.equal(sections.length, 5);
  assert.equal(sections[1].questions.length, 48);
  assert.equal(sections[4].questions.length, 4);
  assert.equal(validateSection(sections[0], draft), null);
});

test("positive-income basis and explicitly selected empty amount block next step", () => {
  let draft = emptyFinancialProfile();
  draft.members[0].earned_income = moneyInput("");
  assert.match(
    validateSection(financeSections(draft)[1], draft).message,
    /입력/,
  );
  draft.members[0].earned_income = moneyInput("300");
  assert.match(
    validateSection(financeSections(draft)[1], draft).message,
    /기준/,
  );
  draft.members[0].earned_income_basis = "gross";
  assert.equal(validateSection(financeSections(draft)[1], draft), null);
  draft.members[0].earned_income = null;
  assert.equal(validateSection(financeSections(draft)[1], draft), null);
});

test("shrinking and restoring counts preserves omitted members; invalid exact count never allocates", () => {
  const cache = {};
  let draft = updateDraft(emptyFinancialProfile(), "household_size", 3, cache);
  draft.members[2].age = 51;
  draft = updateDraft(draft, "household_size", 1, cache);
  draft = updateDraft(draft, "household_size", 3, cache);
  assert.equal(draft.members[2].age, 51);
  const invalid = updateDraft(draft, "household_size", 1000000000, cache);
  assert.equal(invalid.members.length, 3);
  assert.ok(validateSection(financeSections(invalid)[0], invalid));
});

test("automatic saved profile fills pristine forms and correctly based income", async () => {
  const profile = emptyFinancialProfile();
  profile.household_size = 2;
  profile.members = Array.from({ length: 2 }, () => ({
    ...emptyMember(),
    earned_income: 0,
    business_income: 0,
    other_income: 0,
    private_transfer_income: 0,
  }));
  const form = createFinanceState({ getProfile: async () => record(profile) });
  await form.setIdentity(auth("a"));
  assert.equal(form.getSnapshot().draft.household_size, 2);
  assert.equal(form.getSnapshot().step, 5);
  assert.equal(form.getSnapshot().quick.monthlyIncome, "0");
  assert.equal(form.getSnapshot().quick.householdSize, "2");
  profile.members[0].earned_income = 1000000;
  assert.equal(quickDefaultsFromFinance(profile).monthlyIncome, undefined);
});

test("late prefill preserves both guest draft and edits made while lookup is pending", async () => {
  const pending = deferred();
  const form = createFinanceState({ getProfile: () => pending.promise });
  form.edit("assets.housing", moneyInput("500"));
  const load = form.setIdentity(auth("a"));
  form.editQuick("householdSize", "4");
  form.edit("members.0.age", 44);
  pending.resolve(record(emptyFinancialProfile()));
  await load;
  assert.equal(form.getSnapshot().draft.members[0].age, 44);
  assert.equal(form.getSnapshot().quick.householdSize, "4");
  assert.equal(form.getSnapshot().draft.assets.housing.value, "500");
});

test("logout and account switch erase finance state and reject late responses", async () => {
  const pending = deferred();
  let calls = 0;
  const form = createFinanceState({
    getProfile: () =>
      ++calls === 1 ? pending.promise : Promise.resolve(record(null)),
  });
  const load = form.setIdentity(auth("a"));
  form.edit("members.0.age", 71);
  await form.setIdentity(auth("b"));
  pending.resolve(record({ ...emptyFinancialProfile(), region: "gyeonggi" }));
  await load;
  assert.equal(form.getSnapshot().owner, "b");
  assert.equal(form.getSnapshot().draft.region, "seoul");
  assert.equal(form.getSnapshot().draft.members[0].age, 30);
  form.setIdentity(guest);
  assert.equal(form.getSnapshot().draft.members[0].age, null);
  assert.equal(form.getSnapshot().owner, null);
});

test("delete cancels pending profile read and does not resurrect saved values", async () => {
  const pending = deferred();
  const form = createFinanceState({
    getProfile: () => pending.promise,
    deleteProfile: async () => {},
  });
  const load = form.setIdentity(auth("a"));
  await form.run("delete");
  pending.resolve(record({ ...emptyFinancialProfile(), region: "gyeonggi" }));
  await load;
  assert.equal(form.getSnapshot().prefill, "empty");
  assert.equal(form.getSnapshot().draft.region, "unknown");
  assert.equal(form.getSnapshot().saved, false);
});

test("quick count continues into detail without allocating household income to a person", () => {
  const form = createFinanceState({});
  form.editQuick("householdSize", "");
  form.show("detail");
  assert.equal(form.getSnapshot().view, "quick");
  form.editQuick("householdSize", "8");
  form.editQuick("monthlyIncome", "500");
  form.show("detail");
  assert.equal(form.getSnapshot().draft.members.length, 8);
  assert.equal(form.getSnapshot().draft.members[0].earned_income, null);
});

test("foreground restoration restarts aborted prefill without overwriting edits", async () => {
  const pending = deferred();
  let calls = 0;
  const form = createFinanceState({
    getProfile: () =>
      ++calls === 1 ? pending.promise : Promise.resolve(record(null)),
  });
  const load = form.setIdentity(auth("a"));
  form.edit("members.0.age", 42);
  form.setIdentity({ status: "restoring" });
  await form.setIdentity(auth("a"));
  pending.resolve(record(emptyFinancialProfile()));
  await load;
  assert.equal(calls, 2);
  assert.equal(form.getSnapshot().prefill, "empty");
  assert.equal(form.getSnapshot().draft.members[0].age, 42);
});
