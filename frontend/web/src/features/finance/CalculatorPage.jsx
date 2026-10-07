import useFinanceI18n from './useFinanceI18n.js';
import Icon from '../../shared/ui/Icon.jsx';
import CountField from './CountField.jsx';
import { MAX_HOUSEHOLD_SIZE } from './financeModel.js';
import {
  medianReference,
  medianPercents,
  medianForHousehold,
  monthlyIncomeRatio,
} from './medianIncome.js';
import './calculator.css';

export default function CalculatorPage({ draft, onChange, prefill, hasSavedProfile }) {
  const { t, formatMoney, formatNumber, translateError } = useFinanceI18n();

  let base = null;
  let householdError = '';
  let ratio = null;
  let incomeError = '';
  try {
    base = medianForHousehold(draft.householdSize);
  } catch (error) {
    householdError = error.message;
  }
  if (base !== null) {
    try {
      ratio = monthlyIncomeRatio(draft.monthlyIncome, base);
    } catch (error) {
      incomeError = error.message;
    }
  }
  return (
    <section className="calculator-page median-page">
      <div className="page-heading">
        <span className="eyebrow">
          {medianReference.year}
          {t('년 기준')}
        </span>
        <h1>{t('중위소득 빠르게 확인')}</h1>
        <p>{t('가구원 수만 선택하면 기준 중위소득을 바로 볼 수 있어요.')}</p>
        <a className="text-button calculator-entry" href="#calculator-details">
          {' '}
          {t('소득·재산 상세 계산')} <Icon name="arrow" size={16} />
        </a>
      </div>
      {prefill?.status === 'loading' && (
        <p className="finance-intro" role="status">
          {' '}
          {t('회원의 소득·재산 정보를 불러오고 있어요…')}{' '}
        </p>
      )}
      {hasSavedProfile && (
        <p className="finance-intro">
          {' '}
          {t(
            '입력한 소득·재산 정보에서 가구원 수와 확인된 월소득을 미리 채웠어요. 지금 기준으로 바뀐 값만 수정해 주세요.',
          )}{' '}
        </p>
      )}
      {prefill?.status === 'error' && (
        <div className="notice-box" role="status">
          <p>{t('저장 정보를 불러오지 못했어요. 현재 입력은 유지됩니다.')}</p>
          <button type="button" className="text-button" onClick={prefill.retry}>
            {' '}
            {t('저장 정보 다시 불러오기')}{' '}
          </button>
        </div>
      )}
      <section className="finance-section median-quick" aria-labelledby="median-input-title">
        <h2 id="median-input-title">{t('우리 가구의 중위소득 기준')}</h2>
        <div className="finance-grid">
          <div>
            <CountField
              id="median-household"
              label={t('가구원 수')}
              value={draft.householdSize}
              onChange={(value) =>
                onChange({
                  ...draft,
                  householdSize: value == null ? '' : String(value),
                  largeHousehold: Number(value) >= 7,
                })
              }
              min={1}
              max={MAX_HOUSEHOLD_SIZE}
              groupFrom={7}
              manualFrom={12}
              allowUnknown={false}
              exactLabel="실제 가구원 수"
              hint={t(
                '본인을 포함한 가구원 수예요. 사업마다 심사에 포함하는 가구원이 다를 수 있어요.',
              )}
            />
            <p
              id="median-household-error"
              className="auth-error"
              role={householdError ? 'alert' : undefined}
            >
              {translateError(householdError)}
            </p>
          </div>
          <div className="finance-field">
            <label htmlFor="median-income">{t('가구 전체 월소득 (선택 · 만원)')}</label>
            <div className="finance-number">
              <input
                id="median-income"
                inputMode="decimal"
                autoComplete="off"
                placeholder={t('예: 300')}
                value={draft.monthlyIncome}
                aria-invalid={Boolean(incomeError)}
                aria-describedby="median-income-help median-income-error"
                onChange={(event) => onChange({ ...draft, monthlyIncome: event.target.value })}
              />
              <span aria-hidden="true">{t('만원')}</span>
            </div>
            <small id="median-income-help">
              {' '}
              {t(
                '가구원 전체의 근로·사업·연금 등 월소득을 합산하세요. 근로소득은 세전, 사업소득은 필요경비 차감 후 금액이에요. 소득이 없으면 0을 입력하세요.',
              )}{' '}
            </small>
            <p
              id="median-income-error"
              className="auth-error"
              role={incomeError ? 'alert' : undefined}
            >
              {translateError(incomeError)}
            </p>
          </div>
        </div>
        <div className="median-summary" aria-live="polite" aria-atomic="true">
          <p>
            {base === null
              ? t('가구원 수를 확인해 주세요')
              : t('{value1}인 가구 · 기준 중위소득 100%', { value1: draft.householdSize })}
          </p>
          {base !== null && (
            <strong>
              {formatMoney(base)}
              <small> {t('/ 월')}</small>
            </strong>
          )}
          {ratio && (
            <p className="median-ratio">
              {t('입력한 월소득 {income}은 기준 중위소득의 {ratio}%예요.', {
                income: formatMoney(ratio.income),
                ratio: formatNumber(ratio.percent),
              })}
            </p>
          )}
        </div>
        <p className="finance-help">
          {' '}
          {t(
            '월소득 비율은 입력한 소득을 기준 금액과 단순 비교한 값이에요. 지원 심사에 쓰는 소득인정액은 소득 공제와 재산의 소득환산액 등을 별도로 반영해요.',
          )}{' '}
        </p>
      </section>
      {base !== null && (
        <section className="finance-section" aria-labelledby="median-threshold-title">
          <h2 id="median-threshold-title">{t('비율별 기준 금액')}</h2>
          <dl className="median-thresholds">
            {medianPercents.map((percent) => (
              <div key={percent} className={percent === 100 ? 'median-base' : undefined}>
                <dt>{percent}%</dt>
                <dd>
                  {formatMoney(Math.round((base * percent) / 100))}
                  <small> {t('/ 월')}</small>
                </dd>
              </div>
            ))}
          </dl>
          <a className="text-button" href={medianReference.source} target="_blank" rel="noreferrer">
            {' '}
            {t('보건복지부 공식 기준 보기')} <Icon name="external" size={16} />
          </a>
        </section>
      )}
      <section className="finance-section median-detail-entry">
        <div>
          <h2>{t('소득·재산까지 자세히 계산하려면')}</h2>
          <p>
            {' '}
            {t(
              '가구원별 소득, 공제, 재산, 부채, 차량을 입력하고 사업별 참고 결과를 확인할 수 있어요. 회원은 동의 후 정보를 저장하고 불러올 수 있어요.',
            )}{' '}
          </p>
        </div>
        <a className="button primary" href="#calculator-details">
          {' '}
          {t('상세 정보 입력하기')} <Icon name="arrow" />
        </a>
      </section>
    </section>
  );
}
