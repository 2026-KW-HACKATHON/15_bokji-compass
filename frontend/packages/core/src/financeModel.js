export const MAX_MONEY = 1_000_000_000_000;
export const MAX_HOUSEHOLD_SIZE = 100;
export const financeRegions = [
  ['unknown', '모름'],
  ['seoul', '서울'],
  ['gyeonggi', '경기'],
  ['jeonnam_gwangju', '전남광주통합특별시'],
  ['metropolitan', '광역시·세종·창원'],
  ['other', '그 밖의 지역'],
];
export const deductionTypes = [
  ['unknown', '모름'],
  ['ordinary', '추가 특례 없음'],
  ['student', '학생'],
  ['registered_disabled', '등록 장애인'],
  ['north_korean_defector', '북한이탈주민'],
  ['rehabilitation', '직업재활사업 참여'],
  ['other', '그 밖의 특례'],
];
export const occupationTypes = [
  ['unknown', '선택 안 함'],
  ['employee', '직장인'],
  ['self_employed', '자영업자'],
  ['freelancer', '프리랜서'],
  ['student', '학생'],
  ['homemaker', '주부'],
  ['military', '군인'],
  ['unemployed', '무직·구직 중'],
  ['retired', '은퇴자'],
  ['other', '기타'],
];
export const recipientTypes = [
  ['unknown', '모름'],
  ['none', '해당 없음'],
  ['near_poor', '차상위계층'],
  ['basic', '국민기초생활수급자'],
];
export const vehicleKinds = [
  ['unknown', '모름'],
  ['passenger', '승용차'],
  ['small_van', '소형 승합차'],
  ['small_truck', '소형 화물차'],
  ['other', '그 밖의 차량'],
];
export const vehicleUses = [
  ['unknown', '모름'],
  ['ordinary', '일상생활·출퇴근'],
  ['livelihood', '운송·배달 등 수입 활동'],
  ['disability', '장애인 이동'],
  ['veteran', '국가유공자 사용'],
];
export const earnedIncomeBases = [
  ['unknown', '모름'],
  ['gross', '세전 금액'],
  ['net', '실수령액 (세후)'],
];
export const businessIncomeBases = [
  ['unknown', '모름'],
  ['net_expenses', '필요경비 차감 후'],
  ['revenue', '매출액 (경비 차감 전)'],
];
export const vehicleOwnerships = [
  ['unknown', '모름'],
  ['household_full', '본인·가구원 단독명의'],
  ['joint', '공동 명의'],
  ['leased', '리스·장기렌트'],
  ['other', '회사·가구원 외 다른 사람 명의'],
];
export const vehicleRegistrationUses = [
  ['unknown', '등록증 미확인'],
  ['non_commercial', '비영업용 (자가용)'],
  ['commercial', '영업용'],
];
export const vehicleValueBases = [
  ['unknown', '모름'],
  ['official', '공고의 공적 조회 가액'],
  ['market', '구입 가격·중고 시세'],
];
export const vehicleSubsidies = [
  ['unknown', '모름'],
  ['none', '보조금 없음'],
  ['received', '보조금 있음'],
];
export const emptyMember = () => ({
  age: null,
  occupation: 'unknown',
  earned_income: null,
  business_income: null,
  earned_income_basis: 'unknown',
  business_income_basis: 'unknown',
  other_income: null,
  private_transfer_income: null,
  deduction: 'unknown',
});
export const emptyVehicle = () => ({
  value: null,
  kind: 'unknown',
  use: 'unknown',
  ownership: 'unknown',
  registration_use: 'unknown',
  value_basis: 'unknown',
  eco_subsidy: 'unknown',
  displacement_cc: null,
  age_years: null,
  seats: null,
});
export const emptyFinancialProfile = () => ({
  schema_version: 1,
  reference_year: 2026,
  household_size: 1,
  region: 'unknown',
  household_scope_confirmed: false,
  minor_children: null,
  recipient_status: 'unknown',
  members: [emptyMember()],
  assets: {
    housing: null,
    rental_deposit: null,
    general: null,
    financial: null,
  },
  debts: { bank: null, public: null, other: null },
  vehicle_status: 'unknown',
  vehicles: [],
  additional_review: false,
});
export function parseInteger(value, label, { min = 0, max = MAX_MONEY, required = false } = {}) {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) {
    if (required) throw new Error(label + '을(를) 입력해 주세요.');
    return null;
  }
  const text = String(value).trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text))
    throw new Error(label + '은(는) 0 이상의 정수로 입력해 주세요.');
  const number = Number(text.replaceAll(',', ''));
  if (!Number.isSafeInteger(number) || number < min || number > max)
    throw new Error(label + '의 입력 범위를 확인해 주세요.');
  return number;
}
// Only UI edits carry a unit. API profiles and existing drafts remain integer won.
export const moneyInput = (value) => ({ unit: 'manwon', value });
const isMoneyInput = (value) => value?.unit === 'manwon' && typeof value.value === 'string';
export function parseMoney(value, label, { required = false } = {}) {
  if (!isMoneyInput(value)) return parseInteger(value, label, { required });
  const text = value.value.trim();
  if (!text) {
    if (required) throw new Error(`${label}을(를) 입력하거나 없음·모름을 선택해 주세요.`);
    return null;
  }
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{0,4})?$/.test(text))
    throw new Error(
      label + '은(는) 만원 단위 숫자로 입력해 주세요. 소수점은 넷째 자리까지 가능해요.',
    );
  const [whole, fraction = ''] = text.replaceAll(',', '').split('.');
  const won = Number(whole) * 10000 + Number(fraction.padEnd(4, '0'));
  if (!Number.isSafeInteger(won) || won < 0 || won > MAX_MONEY)
    throw new Error(label + '의 입력 범위를 확인해 주세요.');
  return won;
}
export function moneyInputValue(value) {
  if (isMoneyInput(value)) return value.value;
  const won = parseInteger(value, '금액');
  if (won === null) return '';
  const fraction = String(won % 10000)
    .padStart(4, '0')
    .replace(/0+$/, '');
  return formatNumber(Math.floor(won / 10000)) + (fraction ? '.' + fraction : '');
}
function choice(value, options, label) {
  if (!options.some(([key]) => key === value)) throw new Error(label + '을(를) 선택해 주세요.');
  return value;
}
export function toFinancialProfile(draft) {
  if (!draft || typeof draft !== 'object') throw new Error('입력 정보를 확인해 주세요.');
  const household_size = parseInteger(draft.household_size, '가구원 수', {
    min: 1,
    max: MAX_HOUSEHOLD_SIZE,
    required: true,
  });
  if (!Array.isArray(draft.members) || draft.members.length !== household_size)
    throw new Error('가구원 수와 소득 입력 인원을 확인해 주세요.');
  const minor_children = parseInteger(draft.minor_children, '18세 미만 자녀 수', {
    max: household_size,
  });
  const vehicle_status = choice(
    draft.vehicle_status,
    [['none'], ['owned'], ['unknown']],
    '차량 보유 여부',
  );
  if (
    !Array.isArray(draft.vehicles) ||
    draft.vehicles.length > 10 ||
    (vehicle_status === 'owned' && !draft.vehicles.length) ||
    (vehicle_status !== 'owned' && draft.vehicles.length)
  )
    throw new Error('차량 보유 여부와 차량 목록을 확인해 주세요.');
  const moneyGroup = (source, fields) =>
    Object.fromEntries(fields.map(([key, label]) => [key, parseMoney(source?.[key], label)]));
  return {
    schema_version: 1,
    reference_year: parseInteger(draft.reference_year, '기준 연도', {
      min: 2000,
      max: 2100,
      required: true,
    }),
    household_size,
    region: choice(draft.region, financeRegions, '지역'),
    household_scope_confirmed: draft.household_scope_confirmed === true,
    minor_children,
    recipient_status: choice(draft.recipient_status, recipientTypes, '지원 대상 구분'),
    members: draft.members.map((member, index) => ({
      age: parseInteger(member.age, '가구원 ' + (index + 1) + ' 나이', {
        max: 120,
      }),
      occupation: choice(member.occupation ?? 'unknown', occupationTypes, '직업군'),
      ...moneyGroup(member, [
        ['earned_income', '근로소득'],
        ['business_income', '사업소득'],
        ['other_income', '기타 소득'],
        ['private_transfer_income', '정기적으로 받는 돈'],
      ]),
      deduction: choice(member.deduction, deductionTypes, '공제 유형'),
      earned_income_basis: choice(
        member.earned_income_basis ?? 'unknown',
        earnedIncomeBases,
        '근로소득 금액 기준',
      ),
      business_income_basis: choice(
        member.business_income_basis ?? 'unknown',
        businessIncomeBases,
        '사업소득 금액 기준',
      ),
    })),
    assets: moneyGroup(draft.assets, [
      ['housing', '거주 중인 소유 주택'],
      ['rental_deposit', '전월세 보증금'],
      ['general', '기타 일반재산'],
      ['financial', '금융재산'],
    ]),
    debts: moneyGroup(draft.debts, [
      ['bank', '금융기관 부채'],
      ['public', '공공기관 부채'],
      ['other', '추가 확인이 필요한 부채'],
    ]),
    vehicle_status,
    vehicles: draft.vehicles.map((vehicle, index) => ({
      value: parseMoney(vehicle.value, '차량 ' + (index + 1) + ' 가액'),
      kind: choice(vehicle.kind, vehicleKinds, '차종'),
      use: choice(vehicle.use, vehicleUses, '차량 용도'),
      ownership: choice(vehicle.ownership ?? 'unknown', vehicleOwnerships, '차량 명의'),
      registration_use: choice(
        vehicle.registration_use ?? 'unknown',
        vehicleRegistrationUses,
        '등록증상 용도',
      ),
      value_basis: choice(vehicle.value_basis ?? 'unknown', vehicleValueBases, '차량 금액 기준'),
      eco_subsidy: choice(vehicle.eco_subsidy ?? 'unknown', vehicleSubsidies, '저공해차 보조금'),
      displacement_cc: parseInteger(vehicle.displacement_cc, '배기량', {
        max: 20000,
      }),
      age_years: parseInteger(vehicle.age_years, '차량 사용 연수', { max: 100 }),
      seats: parseInteger(vehicle.seats, '승차 정원', { min: 1, max: 100 }),
    })),
    additional_review: draft.additional_review === true,
  };
}
const formatter = new Intl.NumberFormat('ko-KR');
export function formatNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? formatter.format(value)
    : '확인 필요';
}
export const formatMoney = (value) =>
  typeof value === 'number' && Number.isSafeInteger(value)
    ? formatter.format(value) + '원'
    : '확인 필요';
export function officialSourceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
export function parseCalculation(value) {
  const numberOrNull = (item) =>
    item === null ||
    (typeof item === 'number' &&
      Number.isFinite(item) &&
      Math.abs(item) <= Number.MAX_SAFE_INTEGER);
  const stringList = (items) =>
    Array.isArray(items) && items.every((item) => typeof item === 'string');
  if (
    !value ||
    !Number.isInteger(value.reference_year) ||
    typeof value.rules_version !== 'string' ||
    !value.median ||
    !['base', 'monthly_income', 'ratio_percent'].every((key) => numberOrNull(value.median[key])) ||
    !Array.isArray(value.median.thresholds) ||
    !value.median.thresholds.every(
      (item) => numberOrNull(item.percent) && numberOrNull(item.amount),
    ) ||
    !value.assets ||
    !['gross_total', 'net_total', 'without_vehicles', 'vehicle_total', 'debt_total'].every((key) =>
      numberOrNull(value.assets[key]),
    ) ||
    !Array.isArray(value.assessments) ||
    !value.assessments.every(
      (item) =>
        typeof item.rule_id === 'string' &&
        typeof item.label === 'string' &&
        ['estimated', 'needs_review'].includes(item.status) &&
        Array.isArray(item.checks) &&
        item.checks.every(
          (check) =>
            typeof check.label === 'string' &&
            numberOrNull(check.value) &&
            numberOrNull(check.limit) &&
            ['within', 'over', 'unknown'].includes(check.state),
        ) &&
        stringList(item.missing) &&
        stringList(item.notes) &&
        Array.isArray(item.breakdown) &&
        item.breakdown.every((part) => typeof part.label === 'string' && numberOrNull(part.amount)),
    ) ||
    !Array.isArray(value.sources) ||
    !value.sources.every(
      (source) => typeof source.title === 'string' && typeof source.url === 'string',
    ) ||
    !stringList(value.notes)
  )
    throw new Error('계산 결과를 읽지 못했습니다. 다시 계산해 주세요.');
  return value;
}
