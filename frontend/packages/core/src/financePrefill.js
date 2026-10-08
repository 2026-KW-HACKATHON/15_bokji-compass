import {
  emptyFinancialProfile,
  emptyMember,
  parseInteger,
  parseMoney,
  moneyInputValue,
  MAX_HOUSEHOLD_SIZE,
  emptyPrivateTransferHistory,
} from './financeModel.js';

const metropolitan = new Set(['인천', '부산', '대구', '광주', '대전', '울산', '세종', '창원']);
const otherRegions = new Set(['강원', '충북', '충남', '전북', '전남', '경북', '제주']);
export function financeRegionFor(value) {
  if (value === '서울') return 'seoul';
  if (value === '경기') return 'gyeonggi';
  if (value === '전남광주통합특별시') return 'jeonnam_gwangju';
  if (metropolitan.has(value)) return 'metropolitan';
  return otherRegions.has(value) ? 'other' : 'unknown';
}

export function knownHouseholdSize(value) {
  try {
    return parseInteger(value, '가구원 수', {
      min: 1,
      max: MAX_HOUSEHOLD_SIZE,
      required: true,
    });
  } catch {
    return null;
  }
}

export function quickDefaultsFromFinance(profile) {
  const size = knownHouseholdSize(profile?.household_size);
  const result = size === null ? {} : { householdSize: String(size), largeHousehold: size >= 7 };
  if (!profile?.members?.length || profile.members.length !== size) return result;
  let total = 0;
  try {
    for (const member of profile.members) {
      for (const field of [
        'earned_income',
        'business_income',
        'other_income',
        'private_transfer_income',
      ]) {
        const amount = parseMoney(member[field], '월소득');
        if (amount === null) return result;
        if (amount > 0 && field === 'earned_income' && member.earned_income_basis !== 'gross')
          return result;
        if (
          amount > 0 &&
          field === 'business_income' &&
          member.business_income_basis !== 'net_expenses'
        )
          return result;
        total += amount;
      }
    }
    result.monthlyIncome = moneyInputValue(total);
  } catch {
    // Incomplete or invalid drafts do not become a guessed household income.
  }
  return result;
}

export function applyQuickDefaults(draft, incoming, edited = new Set()) {
  return {
    ...draft,
    ...(!edited.has('householdSize') && incoming.householdSize
      ? {
          householdSize: incoming.householdSize,
          largeHousehold: Number(incoming.householdSize) >= 7,
        }
      : {}),
    ...(!edited.has('monthlyIncome') ? { monthlyIncome: incoming.monthlyIncome ?? '' } : {}),
  };
}

export function financialIncomeSignature(profile) {
  return JSON.stringify(
    profile?.members?.map((member) => [
      member.earned_income,
      member.earned_income_basis,
      member.business_income,
      member.business_income_basis,
      member.other_income,
      member.private_transfer_income,
    ]),
  );
}

export function financialDraftDefaults({
  user,
  recommendation,
  saved,
  quick,
  useQuickHousehold = false,
} = {}) {
  // Financial drafts contain only JSON values; this also works in Hermes.
  const draft = JSON.parse(JSON.stringify(saved ?? emptyFinancialProfile()));
  draft.private_transfer_history ??= emptyPrivateTransferHistory();
  if (!saved) {
    draft.region = financeRegionFor(user?.region ?? recommendation?.region);
    if (Number.isInteger(user?.age) && user.age >= 0 && user.age <= 120)
      draft.members[0].age = user.age;
    if (recommendation?.household === '혼자 살아요') draft.household_size = 1;
  }
  const count = useQuickHousehold ? knownHouseholdSize(quick?.householdSize) : null;
  if (count !== null && count !== draft.household_size) {
    draft.household_size = count;
    draft.members = Array.from(
      { length: count },
      (_, index) => draft.members[index] ?? emptyMember(),
    );
    draft.household_scope_confirmed = false;
    if (draft.private_transfer_history) draft.private_transfer_history.status = 'unknown';
    if (draft.minor_children > count) draft.minor_children = null;
  }
  return draft;
}
