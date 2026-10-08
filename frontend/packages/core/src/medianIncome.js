import { MAX_HOUSEHOLD_SIZE, parseInteger, parseMoney, moneyInput } from './financeModel.js';

// Official 2026 table, verified 2026-10-06. Keep aligned with backend finance/rules.py.
export const medianReference = {
  year: 2026,
  source: 'https://www.mohw.go.kr/menu.es?mid=a10708010900',
  amounts: [2564238, 4199292, 5359036, 6494738, 7556719, 8555952, 9515150],
};
export const medianPercents = [50, 60, 80, 100, 120, 150, 180, 200];

export function medianForHousehold(value) {
  const size = parseInteger(value, '가구원 수', {
    min: 1,
    max: MAX_HOUSEHOLD_SIZE,
    required: true,
  });
  const amounts = medianReference.amounts;
  return size <= 7 ? amounts[size - 1] : amounts[6] + (size - 7) * (amounts[6] - amounts[5]);
}

export function monthlyIncomeRatio(text, base) {
  const income = parseMoney(moneyInput(text), '가구 전체 월소득');
  return income === null ? null : { income, percent: Math.round((income / base) * 1000) / 10 };
}
