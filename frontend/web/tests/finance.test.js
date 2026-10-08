import test from 'node:test';
import assert from 'node:assert/strict';
import { createFinanceApi } from '../src/features/finance/financeApi.js';
import {
  emptyFinancialProfile,
  emptyMember,
  emptyVehicle,
  toFinancialProfile,
  parseInteger,
  parseCalculation,
  formatMoney,
  moneyInput,
  moneyInputValue,
  parseMoney,
  officialSourceUrl,
  occupationTypes,
} from '../src/features/finance/financeModel.js';
import {
  financeQuestions,
  validateQuestion,
  visibleFields,
} from '../src/features/finance/financeFlow.js';

const calculation = () => ({
  reference_year: 2026,
  rules_version: 'test-2026',
  median: {
    base: 2564238,
    monthly_income: 0,
    ratio_percent: 0,
    thresholds: [{ percent: 50, amount: 1282119 }],
  },
  assets: {
    gross_total: null,
    net_total: null,
    without_vehicles: null,
    vehicle_total: 0,
    debt_total: null,
  },
  assessments: [
    {
      rule_id: 'basic-2026',
      label: '생계급여 기본 산식',
      status: 'needs_review',
      checks: [{ label: '소득인정액', value: null, limit: 820556, state: 'unknown' }],
      missing: ['재산 금액 확인'],
      notes: ['자격 확정 아님'],
      breakdown: [{ label: '공제액', amount: 0 }],
    },
  ],
  sources: [{ title: '공식 자료', url: 'https://www.mohw.go.kr/' }],
  notes: ['입력값에 따른 추정'],
});
const response = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});

test('financial profile preserves unknown values and explicit zero without adding unapproved fields', () => {
  const draft = emptyFinancialProfile();
  draft.members[0].earned_income = '0';
  draft.members[0].other_income = '   ';
  draft.members[0].private_transfer_income = '1,000';
  draft.members[0].password = 'never send';
  draft.assets.rental_deposit = '10,000,000';
  draft.assets.housing = '';
  draft.token = 'never send';
  const raw = toFinancialProfile(draft);
  assert.equal(raw.members[0].earned_income, 0);
  assert.equal(raw.members[0].other_income, null);
  assert.equal(raw.members[0].private_transfer_income, 1000);
  assert.equal(raw.assets.rental_deposit, 10000000);
  assert.equal(raw.assets.housing, null);
  assert.equal(raw.minor_children, null);
  assert.equal(Object.hasOwn(raw, 'token'), false);
  assert.equal(Object.hasOwn(raw.members[0], 'password'), false);
  assert.equal(draft.members[0].earned_income, '0');
});
test('finance numeric inputs reject exponents, malformed separators, decimals and unsafe amounts', () => {
  for (const value of [
    '1e4',
    '-1',
    '1.5',
    '12,34',
    Infinity,
    NaN,
    '1000000000001',
    '9007199254740993',
  ])
    assert.throws(() => parseInteger(value, '금액'));
  assert.equal(parseInteger('1,000,000,000,000', '금액'), 1000000000000);
  assert.equal(parseInteger('', '금액'), null);
  assert.equal(parseInteger('0', '금액'), 0);
  assert.equal(formatMoney(null), '확인 필요');
  assert.equal(formatMoney(0), '0원');
  assert.equal(formatMoney(1000000), '1,000,000원');
});

test('manwon input converts exactly to integer won while preserving unknown, zero and limits', () => {
  for (const [text, won] of [
    ['500', 5_000_000],
    ['1,200.5', 12_005_000],
    ['45.6789', 456_789],
    ['0.0001', 1],
    ['0.1', 1_000],
    ['1.0015', 10_015],
    ['0', 0],
    ['0.', 0],
    ['', null],
    ['   ', null],
    ['100,000,000', 1_000_000_000_000],
  ]) {
    assert.equal(parseMoney(moneyInput(text), '보증금'), won, text);
  }
  for (const text of [
    '0.00001',
    '100000000.0001',
    '1e4',
    '-1',
    '12,34',
    '1,000.2,3',
    'NaN',
    'Infinity',
    '.',
  ]) {
    assert.throws(() => parseMoney(moneyInput(text), '보증금'), undefined, text);
  }
  assert.equal(parseMoney(null, '보증금'), null);
  assert.equal(parseMoney(0, '보증금'), 0);
  assert.equal(parseMoney(500, '보증금'), 500);
  assert.equal(parseMoney('5,000,000', '보증금'), 5_000_000);
  assert.throws(() => parseMoney('1.5', '보증금'));
  assert.throws(() => parseMoney({ unit: 'manwon', value: 500 }, '보증금'));
  assert.throws(() => parseMoney({ unit: 'unknown', value: '500' }, '보증금'));
});

test('saved won amounts display in manwon without rounding and unfinished edits retain their text', () => {
  for (const [won, displayed] of [
    [null, ''],
    [0, '0'],
    [1, '0.0001'],
    [10_015, '1.0015'],
    [456_789, '45.6789'],
    [5_000_000, '500'],
    [10_000_000, '1,000'],
    [1_000_000_000_000, '100,000,000'],
  ]) {
    assert.equal(moneyInputValue(won), displayed);
    assert.equal(parseMoney(moneyInput(displayed), '보증금'), won);
  }
  assert.equal(moneyInputValue('456,789'), '45.6789');
  for (const text of ['', '0', '0.', '0.00001', '1,2', '-5']) {
    assert.equal(moneyInputValue(structuredClone(moneyInput(text))), text);
  }
});

test('all money fields use manwon only for UI drafts and API normalization stays idempotent', async () => {
  const draft = emptyFinancialProfile();
  Object.assign(draft.members[0], {
    age: '65',
    earned_income: moneyInput('200'),
    business_income: moneyInput('123.4567'),
    other_income: moneyInput('0'),
    private_transfer_income: moneyInput(''),
  });
  draft.assets = {
    housing: moneyInput('10,000'),
    rental_deposit: moneyInput('500'),
    general: moneyInput('0.0001'),
    financial: moneyInput('45.6789'),
  };
  draft.debts = {
    bank: moneyInput('100'),
    public: moneyInput('20.5'),
    other: moneyInput('0'),
  };
  draft.vehicle_status = 'owned';
  draft.vehicles = [{ ...emptyVehicle(), value: moneyInput('700'), displacement_cc: '1600' }];
  const raw = toFinancialProfile(draft);
  assert.deepEqual(
    Object.fromEntries(
      ['earned_income', 'business_income', 'other_income', 'private_transfer_income'].map((key) => [
        key,
        raw.members[0][key],
      ]),
    ),
    {
      earned_income: 2_000_000,
      business_income: 1_234_567,
      other_income: 0,
      private_transfer_income: null,
    },
  );
  assert.deepEqual(raw.assets, {
    housing: 100_000_000,
    rental_deposit: 5_000_000,
    general: 1,
    financial: 456_789,
  });
  assert.deepEqual(raw.debts, { bank: 1_000_000, public: 205_000, other: 0 });
  assert.equal(raw.vehicles[0].value, 7_000_000);
  assert.equal(raw.vehicles[0].displacement_cc, 1600);
  assert.equal(raw.members[0].age, 65);
  assert.deepEqual(toFinancialProfile(raw), raw);
  assert.deepEqual(draft.assets.rental_deposit, moneyInput('500'));
  const submitted = [];
  const api = createFinanceApi({
    fetchImpl: async (_, options) => {
      submitted.push(JSON.parse(options.body));
      return response(calculation());
    },
  });
  await api.calculate(draft);
  await api.calculate(raw);
  await api.calculate(raw, { allowApproximation: true });
  assert.deepEqual(
    submitted.map(({ profile }) => profile),
    [raw, raw, raw],
  );
  assert.deepEqual(
    submitted.map(({ allow_approximation }) => allow_approximation),
    [false, false, true],
  );
});

test('money validation handles editable invalid text and keeps income basis conditional', () => {
  const draft = emptyFinancialProfile();
  const question = financeQuestions(draft).find((item) => item.id === 'member-0-earned');
  draft.members[0].earned_income = moneyInput('');
  assert.match(validateQuestion(question, draft).message, /입력하거나 없음·모름을 선택/);
  assert.equal(validateQuestion(question, draft).field, 'finance-earned-0');
  draft.members[0].earned_income = null;
  assert.equal(validateQuestion(question, draft), null);
  draft.members[0].earned_income = moneyInput('0.00001');
  assert.equal(visibleFields(question, draft).length, 1);
  assert.match(validateQuestion(question, draft).message, /넷째 자리/);
  assert.equal(validateQuestion(question, draft).field, 'finance-earned-0');
  draft.members[0].earned_income = moneyInput('0.0001');
  assert.equal(visibleFields(question, draft).length, 2);
  assert.equal(validateQuestion(question, draft).field, 'finance-earned-basis-0');
  draft.members[0].earned_income_basis = 'gross';
  assert.equal(validateQuestion(question, draft), null);
  draft.members[0].earned_income = moneyInput('0');
  assert.equal(visibleFields(question, draft).length, 1);
  assert.equal(validateQuestion(question, draft), null);
  draft.members[0].earned_income = moneyInput('200');
  draft.members[0].earned_income_basis = 'unknown';
  const basisQuestion = financeQuestions(draft).find((item) => item.id === 'member-0-earned');
  assert.equal(validateQuestion(basisQuestion, draft).field, 'finance-earned-basis-0');
  draft.members[0].earned_income_basis = 'gross';
  assert.equal(validateQuestion(basisQuestion, draft), null);

  draft.members[0].business_income = moneyInput('500');
  const businessQuestion = financeQuestions(draft).find((item) => item.id === 'member-0-business');
  assert.equal(validateQuestion(businessQuestion, draft).field, 'finance-business-basis-0');
  draft.members[0].business_income_basis = 'net_expenses';
  assert.equal(validateQuestion(businessQuestion, draft), null);
});
test('income and vehicle facts stay separate and older drafts need basis confirmation', () => {
  const draft = emptyFinancialProfile();
  draft.members[0].earned_income = '2,000,000';
  draft.members[0].earned_income_basis = 'net';
  draft.members[0].business_income = '5,000,000';
  draft.members[0].business_income_basis = 'revenue';
  draft.vehicle_status = 'owned';
  draft.vehicles = [
    {
      ...emptyVehicle(),
      value: '20,000,000',
      use: 'livelihood',
      ownership: 'joint',
      registration_use: 'non_commercial',
      value_basis: 'market',
      eco_subsidy: 'received',
    },
  ];
  const raw = toFinancialProfile(draft);
  assert.equal(raw.members[0].earned_income, 2_000_000);
  assert.equal(raw.members[0].earned_income_basis, 'net');
  assert.equal(raw.members[0].business_income_basis, 'revenue');
  assert.equal(raw.vehicles[0].value, 20_000_000);
  assert.equal(raw.vehicles[0].use, 'livelihood');
  assert.equal(raw.vehicles[0].registration_use, 'non_commercial');
  assert.equal(raw.vehicles[0].ownership, 'joint');
  assert.equal(raw.vehicles[0].eco_subsidy, 'received');
  delete draft.members[0].earned_income_basis;
  delete draft.members[0].business_income_basis;
  for (const key of ['ownership', 'registration_use', 'value_basis', 'eco_subsidy'])
    delete draft.vehicles[0][key];
  const older = toFinancialProfile(draft);
  assert.equal(older.members[0].earned_income_basis, 'unknown');
  assert.equal(older.members[0].business_income_basis, 'unknown');
  assert.equal(older.vehicles[0].ownership, 'unknown');
  assert.equal(older.vehicles[0].registration_use, 'unknown');
  assert.equal(older.vehicles[0].value_basis, 'unknown');
  assert.equal(older.vehicles[0].eco_subsidy, 'unknown');
  draft.vehicles[0].registration_use = 'guessed-from-business-owner';
  assert.throws(() => toFinancialProfile(draft), /登録|등록/);
});
test('finance profile enforces household, children, vehicle and enum coherence', () => {
  let draft = emptyFinancialProfile();
  draft.household_size = 2;
  assert.throws(() => toFinancialProfile(draft), /가구원 수/);
  draft.members.push(emptyMember());
  assert.equal(toFinancialProfile(draft).members.length, 2);
  draft.minor_children = 3;
  assert.throws(() => toFinancialProfile(draft), /자녀 수/);
  draft = emptyFinancialProfile();
  draft.members[0].age = 121;
  assert.throws(() => toFinancialProfile(draft), /나이/);
  draft.members[0].age = 0;
  draft.vehicle_status = 'owned';
  assert.throws(() => toFinancialProfile(draft), /차량/);
  draft.vehicles = [emptyVehicle()];
  assert.equal(toFinancialProfile(draft).vehicles[0].seats, null);
  draft.vehicles[0].seats = 0;
  assert.throws(() => toFinancialProfile(draft), /승차 정원/);
  draft.vehicles = [];
  draft.vehicle_status = 'none';
  draft.region = 'unlisted';
  assert.throws(() => toFinancialProfile(draft), /지역/);
});

test('occupation is not asked for calculations and legacy values remain compatible', () => {
  const draft = emptyFinancialProfile();
  delete draft.members[0].occupation;
  assert.equal(toFinancialProfile(draft).members[0].occupation, 'unknown');
  const basic = financeQuestions(draft).find((question) => question.id === 'member-0-basic');
  assert.equal(
    basic.fields.some((field) => field.path.endsWith('.occupation')),
    false,
  );
  assert.equal(validateQuestion(basic, draft), null);
  for (const [occupation] of occupationTypes) {
    draft.members[0].occupation = occupation;
    assert.equal(validateQuestion(basic, draft), null);
    const member = toFinancialProfile(draft).members[0];
    assert.equal(member.occupation, occupation);
    assert.equal(member.deduction, 'unknown');
    assert.equal(member.earned_income, null);
  }
  draft.members[0].occupation = 'unsupported';
  assert.equal(validateQuestion(basic, draft), null);
  assert.throws(() => toFinancialProfile(draft), /직업군/);
});

test('large households keep the actual count and unified region without changing optional checks', () => {
  const draft = emptyFinancialProfile();
  draft.household_size = 13;
  draft.members = Array.from({ length: 13 }, emptyMember);
  draft.region = 'jeonnam_gwangju';
  const household = financeQuestions(draft)[0];
  assert.equal(validateQuestion(household, draft), null);
  const profile = toFinancialProfile(draft);
  assert.equal(profile.household_size, 13);
  assert.equal(profile.members.length, 13);
  assert.equal(profile.region, 'jeonnam_gwangju');
  assert.equal(profile.household_scope_confirmed, false);
  assert.equal(profile.additional_review, false);
  for (const count of ['', 0, 101, '12.5']) {
    draft.household_size = count;
    assert.equal(validateQuestion(household, draft).field, 'finance-household');
  }
});
test('calculation requires usable server fields and permits unknown results without making eligibility claims', () => {
  const data = calculation();
  assert.equal(parseCalculation(data), data);
  assert.throws(() =>
    parseCalculation({ ...data, median: { ...data.median, ratio_percent: Infinity } }),
  );
  assert.throws(() =>
    parseCalculation({ ...data, assessments: [{ ...data.assessments[0], status: 'eligible' }] }),
  );
  assert.throws(() =>
    parseCalculation({ ...data, assessments: [{ ...data.assessments[0], missing: null }] }),
  );
  assert.throws(() => parseCalculation({ ...data, approximations: [1] }));
  assert.equal(officialSourceUrl('javascript:alert(1)'), null);
  assert.equal(officialSourceUrl('https://secret:password@example.com/'), null);
  assert.equal(officialSourceUrl('https://www.mohw.go.kr/'), 'https://www.mohw.go.kr/');
});
test('public finance calls omit cookies and member calls require explicit save consent', async () => {
  const calls = [];
  const profile = emptyFinancialProfile();
  const api = createFinanceApi({
    baseUrl: '/api/',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response(
        url.endsWith('/calculate')
          ? calculation()
          : url.endsWith('/rules')
            ? { rules: [] }
            : url.endsWith('/delete')
              ? { deleted: true }
              : { profile, calculation: calculation(), updated_at: '2026-09-25T00:00:00Z' },
      );
    },
  });
  await api.calculate(profile);
  await api.rules();
  await assert.rejects(api.saveProfile(profile), /동의/);
  assert.equal(calls.length, 2);
  await api.getProfile();
  await api.saveProfile(profile, { consent: true });
  await api.deleteProfile();
  assert.equal(calls[0].url, '/api/v1/finance/calculate');
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[1].options.credentials, 'omit');
  assert.equal(calls[0].options.headers['X-Auth-Request'], undefined);
  for (const call of calls.slice(2)) {
    assert.equal(call.options.credentials, 'include');
    assert.equal(call.options.headers['X-Auth-Request'], '1');
  }
  assert.deepEqual(JSON.parse(calls[3].options.body), { profile, consent: true });
  assert.equal(calls[4].options.method, 'POST');
  assert.equal(calls[4].options.body, '{}');
});
test('no stored profile is a normal response and failures never become example calculations', async () => {
  const emptyApi = createFinanceApi({
    fetchImpl: async () => response({ profile: null, calculation: null, updated_at: null }),
  });
  assert.deepEqual(await emptyApi.getProfile(), {
    profile: null,
    calculation: null,
    updated_at: null,
  });
  await assert.rejects(emptyApi.calculate(emptyFinancialProfile()), /계산 결과/);
  const failing = createFinanceApi({
    fetchImpl: async () => response({ detail: '계산 서버 점검 중' }, 503),
  });
  await assert.rejects(failing.calculate(emptyFinancialProfile()), /계산 서버 점검 중/);
  const malformed = createFinanceApi({ fetchImpl: async () => response({ bad: true }) });
  await assert.rejects(malformed.calculate(emptyFinancialProfile()), /계산 결과/);
  await assert.rejects(malformed.deleteProfile(), /삭제 결과/);
});
test('finance requests distinguish timeout and cancellation and skip an already cancelled request', async () => {
  let count = 0;
  const pending = (_, options) => {
    count += 1;
    return new Promise((resolve, reject) =>
      options.signal.addEventListener(
        'abort',
        () => reject(new DOMException('Aborted', 'AbortError')),
        { once: true },
      ),
    );
  };
  const api = createFinanceApi({ timeoutMs: 5, fetchImpl: pending });
  await assert.rejects(api.rules(), /응답이 늦어지고/);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(api.rules({ signal: abort.signal }), { name: 'AbortError' });
  assert.equal(count, 1);
  const controller = new AbortController();
  const work = createFinanceApi({ timeoutMs: 1000, fetchImpl: pending }).rules({
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(work, { name: 'AbortError' });
});
