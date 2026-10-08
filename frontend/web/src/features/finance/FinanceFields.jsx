import useFinanceI18n from './useFinanceI18n.js';
import FinanceHelp from './FinanceHelp.jsx';
import CountField from './CountField.jsx';
import { fieldValue, visibleFields } from './financeFlow.js';
import {
  moneyInput,
  moneyInputValue,
  parseMoney,
  MAX_HOUSEHOLD_SIZE,
  currentTransferMonth,
  emptyPrivateTransferHistory,
  repeatPrivateTransferMonths,
} from './financeModel.js';

function renderHint(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (!part.startsWith('**') || !part.endsWith('**')) return part;
    return <strong key={index}>{part.slice(2, -2)}</strong>;
  });
}

function FinanceField({ field, draft, onChange, easy }) {
  const {
    t,
    intlLocale,
    formatMoney,
    formatNumber,
    translateTitle,
    translateLabel,
    translateHint,
  } = useFinanceI18n();

  const numericValue = (value) => (typeof value === 'number' ? formatNumber(value) : (value ?? ''));
  const value = fieldValue(draft, field.path);
  const hintId = field.hint ? `${field.id}-hint` : undefined;
  const exampleId = field.example ? `${field.id}-example` : undefined;
  if (field.countChoices)
    return (
      <CountField
        id={field.id}
        label={translateLabel(field.label)}
        value={value}
        onChange={(next) => onChange(field.path, next)}
        min={field.min}
        max={field.max}
        hint={translateHint(field.hint)}
        {...field.countChoices}
      />
    );
  if (field.type === 'check')
    return (
      <div className="finance-check-field">
        <label className="finance-check">
          <input
            id={field.id}
            type="checkbox"
            checked={Boolean(value)}
            aria-describedby={hintId}
            onChange={(event) => onChange(field.path, event.target.checked)}
          />
          <span>
            {translateLabel(field.label)}
            {field.optional && <small className="finance-optional">{t('(선택)')}</small>}
          </span>
        </label>
        {field.hint && (
          <p className="finance-help" id={hintId}>
            {translateHint(field.hint)}
          </p>
        )}
      </div>
    );
  if (field.type === 'select')
    return (
      <div className="finance-field">
        <label htmlFor={field.id}>{translateLabel(field.label)}</label>
        <select
          id={field.id}
          value={value ?? (field.required ? '' : 'unknown')}
          aria-describedby={hintId}
          onChange={(event) => onChange(field.path, event.target.value)}
        >
          {field.required && (
            <option value="" disabled>
              {t('선택해 주세요')}
            </option>
          )}
          {field.options.map(([key, label]) => (
            <option key={key} value={key}>
              {t(label)}
            </option>
          ))}
        </select>
        {field.hint && <small id={hintId}>{translateHint(field.hint)}</small>}
      </div>
    );
  const money = field.type === 'money';
  const presence = value == null ? 'unknown' : value === 0 ? 'none' : 'yes';
  const unitHintId = money ? `${field.id}-unit` : undefined;
  const presenceId = `${field.id}-presence`;
  const presenceHintId = `${field.id}-presence-hint`;
  function changePresence(key) {
    onChange(
      field.path,
      key === 'none' ? 0 : key === 'unknown' ? null : presence === 'yes' ? value : moneyInput(''),
    );
  }
  let convertedAmount = null;
  if (money) {
    try {
      convertedAmount = parseMoney(value, field.label);
    } catch {
      // Preserve invalid text so the user can correct it; step validation explains the error.
    }
  }
  return (
    <div className="finance-field">
      <div className="finance-field-heading">
        {money && easy ? (
          <label id={`${field.id}-label`} htmlFor={presence === 'yes' ? field.id : presenceId}>
            {translateLabel(field.label)}
          </label>
        ) : money ? (
          <span id={`${field.id}-label`} className="finance-field-label">
            {translateLabel(field.label)}
          </span>
        ) : (
          <label htmlFor={field.id}>{translateLabel(field.label)}</label>
        )}
        {field.example && <small id={exampleId}>{t(field.example)}</small>}
      </div>
      {money && easy && (
        <select
          id={presenceId}
          className="finance-presence-select"
          aria-label={t('{value1} 입력 상태', { value1: translateLabel(field.label) })}
          aria-describedby={
            [
              presence === 'yes' ? unitHintId : presence === 'none' ? presenceHintId : null,
              exampleId,
              hintId,
            ]
              .filter(Boolean)
              .join(' ') || undefined
          }
          value={presence}
          onChange={(event) => changePresence(event.target.value)}
        >
          <option value="yes">{t('금액 입력')}</option>
          <option value="none">{t('없음 (0원)')}</option>
          <option value="unknown">{t('모름 · 확인 필요')}</option>
        </select>
      )}
      {money && !easy && (
        <div
          className="finance-presence"
          role="group"
          aria-label={t('{value1} 여부', { value1: translateLabel(field.label) })}
          aria-describedby={exampleId}
        >
          {[
            ['yes', '있어요'],
            ['none', '없어요'],
            ['unknown', '모르겠어요'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={presence === key}
              onClick={() => changePresence(key)}
            >
              {t(label)}
            </button>
          ))}
        </div>
      )}
      {(!money || presence === 'yes') && (
        <div className="finance-number">
          <input
            id={field.id}
            aria-labelledby={money ? `${field.id}-label` : undefined}
            inputMode={money ? 'decimal' : 'numeric'}
            autoComplete="off"
            value={money ? moneyInputValue(value) : numericValue(value)}
            onChange={(event) =>
              onChange(field.path, money ? moneyInput(event.target.value) : event.target.value)
            }
            placeholder={t(field.placeholder ?? (money ? '예: 500' : '모르면 비워두세요'))}
            aria-describedby={
              [unitHintId, exampleId, hintId].filter(Boolean).join(' ') || undefined
            }
          />
          <span aria-hidden="true">{money ? t('만원') : t(field.unit)}</span>
        </div>
      )}
      {money && presence === 'yes' && (
        <small id={unitHintId}>
          {easy ? t('만원 단위로 입력합니다. ') : t('만원 단위로 입력해요. ')}
          {convertedAmount === null
            ? t('예: 500 = 500만 원')
            : t('입력한 금액: {value1}', { value1: formatMoney(convertedAmount) })}
        </small>
      )}
      {money && presence !== 'yes' && (!easy || presence === 'none') && (
        <small id={presenceHintId}>
          {presence === 'none'
            ? easy
              ? t('0원으로 계산합니다.')
              : t('0원으로 계산해요.')
            : easy
              ? t('확인할 항목으로 남깁니다. 다음으로 진행할 수 있습니다.')
              : t('확인 필요로 남겨두고 다음으로 갈 수 있어요.')}
        </small>
      )}
      {field.hint && <small id={hintId}>{renderHint(translateHint(field.hint))}</small>}
    </div>
  );
}

export function QuestionFields({ question, draft, onChange, onAddVehicle, onRemoveVehicle, easy }) {
  const {
    t,
    intlLocale,
    formatMoney,
    formatNumber,
    translateTitle,
    translateLabel,
    translateHint,
  } = useFinanceI18n();

  const basicMember = question.id.match(/^member-(\d+)-basic$/);
  const memberIndex = basicMember ? Number(basicMember[1]) : null;
  return (
    <>
      {memberIndex !== null && (
        <button
          type="button"
          className="text-button"
          aria-label={t('가구원 {value1}의 소득 모두 없음으로 선택', { value1: memberIndex + 1 })}
          onClick={() =>
            onChange(`members.${memberIndex}`, {
              ...draft.members[memberIndex],
              earned_income: 0,
              business_income: 0,
              other_income: 0,
              private_transfer_income: 0,
            })
          }
        >
          {easy ? t('이 가구원의 소득 모두 없음으로 선택') : t('이 가구원의 소득이 모두 없어요')}
        </button>
      )}
      {question.id === 'debts' && (
        <button
          type="button"
          className="text-button"
          onClick={() => onChange('debts', { bank: 0, public: 0, other: 0 })}
        >
          {easy ? t('모든 부채를 없음으로 선택') : t('부채가 모두 없어요')}
        </button>
      )}
      {question.id === 'private-transfer' &&
        draft.private_transfer_history &&
        draft.private_transfer_history.as_of_month !== currentTransferMonth() && (
          <div className="finance-approximation-notice">
            <p>
              {t(
                '저장된 지원 내역의 기간이 지났어요. 이번 달 기준 최근 12개월로 다시 입력해 주세요.',
              )}
            </p>
            <button
              type="button"
              className="button secondary"
              onClick={() => onChange('private_transfer_history', emptyPrivateTransferHistory())}
            >
              {t('이번 달 기준으로 다시 입력')}
            </button>
          </div>
        )}
      {question.id === 'private-transfer-months' && (
        <div className="finance-help">
          <p>
            {t(
              '12개월 내내 같은 지원을 받았다면 첫 달의 금액·횟수를 입력한 뒤 아래 버튼을 누르세요.',
            )}
          </p>
          <button
            type="button"
            className="button secondary"
            disabled={!repeatPrivateTransferMonths(draft.private_transfer_history)}
            onClick={() =>
              onChange(
                'private_transfer_history',
                repeatPrivateTransferMonths(draft.private_transfer_history),
              )
            }
          >
            {t('첫 달 금액·횟수를 12개월에 동일하게 적용')}
          </button>
        </div>
      )}
      <div className="finance-grid">
        {visibleFields(question, draft).map((field) => (
          <FinanceField
            key={field.path}
            field={field}
            draft={draft}
            onChange={onChange}
            easy={easy}
          />
        ))}
      </div>
      {question.id === 'vehicles' && draft.vehicle_status === 'owned' && (
        <div className="finance-vehicle-list">
          <p className="finance-help">
            {' '}
            {t('보유하거나 빌려 쓰는 차량 수에 맞춰 추가하세요. 차량별 정보를 입력합니다.')}{' '}
          </p>
          {draft.vehicles.map((_, i) => (
            <div key={i}>
              <span>
                {t('차량')} {i + 1}
              </span>
              {draft.vehicles.length > 1 && (
                <button type="button" className="text-button" onClick={() => onRemoveVehicle(i)}>
                  {' '}
                  {t('차량')} {i + 1} {t('삭제')}{' '}
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="button secondary"
            disabled={draft.vehicles.length >= 10}
            onClick={onAddVehicle}
          >
            {' '}
            {t('차량 추가')}{' '}
          </button>
        </div>
      )}
      <FinanceHelp name={question.help} />
    </>
  );
}

function displayValue(field, draft, t, formatMoney, formatNumber) {
  const value = fieldValue(draft, field.path);
  if (field.path === 'household_size') {
    const count = Number(value);
    return Number.isInteger(count) && count >= 1 && count <= MAX_HOUSEHOLD_SIZE
      ? t('{value1}명', { value1: formatNumber(count) })
      : t('확인 필요');
  }
  if (field.type === 'check') return t(value ? '예' : '미확인');
  if (field.type === 'select')
    return t(
      field.options.find(([key]) => String(key) === String(value ?? 'unknown'))?.[1] ?? '모름',
    );
  if (value == null || String(value).trim() === '') return t('확인 필요');
  if (field.type === 'money') return formatMoney(parseMoney(value, field.label));
  const number = Number(String(value).replaceAll(',', ''));
  return `${formatNumber(number)}${t(field.unit)}`;
}

export function FinanceReview({ questions, sections, draft, onEdit }) {
  const {
    t,
    intlLocale,
    formatMoney,
    formatNumber,
    translateTitle,
    translateLabel,
    translateHint,
  } = useFinanceI18n();

  const reviewSections =
    sections ?? questions.map((question) => ({ ...question, questions: [question] }));
  return (
    <div className="finance-review">
      {reviewSections.map((section) => (
        <article key={section.id}>
          <div className="finance-review-heading">
            <h3>{translateTitle(section.title)}</h3>
            {onEdit && (
              <button
                type="button"
                className="text-button"
                aria-label={t('{value1} 수정', { value1: translateTitle(section.title) })}
                onClick={() => onEdit(section.questions[0].id)}
              >
                {' '}
                {t('수정')}{' '}
              </button>
            )}
          </div>
          <dl className="finance-facts">
            {section.questions.flatMap((question) =>
              visibleFields(question, draft).map((field) => (
                <div key={field.path}>
                  <dt>
                    {sections && /^(member|vehicle)-\d+-/.test(question.id)
                      ? `${translateTitle(question.title.split(' · ')[0])} · ${translateLabel(field.label)}`
                      : translateLabel(field.label)}
                  </dt>
                  <dd>{displayValue(field, draft, t, formatMoney, formatNumber)}</dd>
                </div>
              )),
            )}
          </dl>
        </article>
      ))}
    </div>
  );
}
