import FinanceHelp from './FinanceHelp.jsx';
import { fieldValue, visibleFields } from './financeFlow.js';
import {
  formatMoney,
  formatNumber,
  moneyInput,
  moneyInputValue,
  parseMoney,
} from './financeModel.js';

const numericValue = (value) => (typeof value === 'number' ? formatNumber(value) : (value ?? ''));

function FinanceField({ field, draft, onChange, easy }) {
  const value = fieldValue(draft, field.path);
  const hintId = field.hint ? `${field.id}-hint` : undefined;
  if (field.type === 'check')
    return (
      <label className="finance-check">
        <input
          id={field.id}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(field.path, event.target.checked)}
        />
        {field.label}
      </label>
    );
  if (field.type === 'select')
    return (
      <div className="finance-field">
        <label htmlFor={field.id}>{field.label}</label>
        <select
          id={field.id}
          value={value ?? 'unknown'}
          aria-describedby={hintId}
          onChange={(event) => onChange(field.path, event.target.value)}
        >
          {field.options.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        {field.hint && <small id={hintId}>{field.hint}</small>}
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
      {money && easy ? (
        <label id={`${field.id}-label`} htmlFor={presence === 'yes' ? field.id : presenceId}>
          {field.label}
        </label>
      ) : money ? (
        <span id={`${field.id}-label`} className="finance-field-label">
          {field.label}
        </span>
      ) : (
        <label htmlFor={field.id}>{field.label}</label>
      )}
      {money && easy && (
        <select
          id={presenceId}
          className="finance-presence-select"
          aria-label={`${field.label} 입력 상태`}
          aria-describedby={
            [presence === 'yes' ? unitHintId : presence === 'none' ? presenceHintId : null, hintId]
              .filter(Boolean)
              .join(' ') || undefined
          }
          value={presence}
          onChange={(event) => changePresence(event.target.value)}
        >
          <option value="yes">금액 입력</option>
          <option value="none">없음 (0원)</option>
          <option value="unknown">모름 · 확인 필요</option>
        </select>
      )}
      {money && !easy && (
        <div className="finance-presence" role="group" aria-label={`${field.label} 여부`}>
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
              {label}
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
            placeholder={money ? '예: 500' : '모르면 비워두세요'}
            aria-describedby={[unitHintId, hintId].filter(Boolean).join(' ') || undefined}
          />
          <span aria-hidden="true">{money ? '만원' : field.unit}</span>
        </div>
      )}
      {money && presence === 'yes' && (
        <small id={unitHintId}>
          {easy ? '만원 단위로 입력합니다. ' : '만원 단위로 입력해요. '}
          {convertedAmount === null
            ? '예: 500 = 500만 원'
            : `입력한 금액: ${formatMoney(convertedAmount)}`}
        </small>
      )}
      {money && presence !== 'yes' && (!easy || presence === 'none') && (
        <small id={presenceHintId}>
          {presence === 'none'
            ? easy
              ? '0원으로 계산합니다.'
              : '0원으로 계산해요.'
            : easy
              ? '확인할 항목으로 남깁니다. 다음으로 진행할 수 있습니다.'
              : '확인 필요로 남겨두고 다음으로 갈 수 있어요.'}
        </small>
      )}
      {field.hint && <small id={hintId}>{field.hint}</small>}
    </div>
  );
}

export function QuestionFields({ question, draft, onChange, onAddVehicle, onRemoveVehicle, easy }) {
  return (
    <>
      {question.id === 'debts' && (
        <button
          type="button"
          className="text-button"
          onClick={() => onChange('debts', { bank: 0, public: 0, other: 0 })}
        >
          {easy ? '모든 부채를 없음으로 선택' : '부채가 모두 없어요'}
        </button>
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
            보유하거나 빌려 쓰는 차량 수에 맞춰 추가하세요. 차량별 정보를 입력합니다.
          </p>
          {draft.vehicles.map((_, i) => (
            <div key={i}>
              <span>차량 {i + 1}</span>
              {draft.vehicles.length > 1 && (
                <button type="button" className="text-button" onClick={() => onRemoveVehicle(i)}>
                  차량 {i + 1} 삭제
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
            차량 추가
          </button>
        </div>
      )}
      <FinanceHelp name={question.help} />
    </>
  );
}

function displayValue(field, draft) {
  const value = fieldValue(draft, field.path);
  if (field.type === 'check') return value ? '예' : '미확인';
  if (field.type === 'select')
    return field.options.find(([key]) => String(key) === String(value ?? 'unknown'))?.[1] ?? '모름';
  if (value == null || String(value).trim() === '') return '확인 필요';
  if (field.type === 'money') return formatMoney(parseMoney(value, field.label));
  const number = Number(String(value).replaceAll(',', ''));
  return `${formatNumber(number)}${field.unit}`;
}

export function FinanceReview({ questions, sections, draft, onEdit }) {
  const reviewSections =
    sections ?? questions.map((question) => ({ ...question, questions: [question] }));
  return (
    <div className="finance-review">
      {reviewSections.map((section) => (
        <article key={section.id}>
          <div className="finance-review-heading">
            <h3>{section.title}</h3>
            <button
              type="button"
              className="text-button"
              aria-label={`${section.title} 수정`}
              onClick={() => onEdit(section.questions[0].id)}
            >
              수정
            </button>
          </div>
          <dl className="finance-facts">
            {section.questions.flatMap((question) =>
              visibleFields(question, draft).map((field) => (
                <div key={field.path}>
                  <dt>{field.label}</dt>
                  <dd>{displayValue(field, draft)}</dd>
                </div>
              )),
            )}
          </dl>
        </article>
      ))}
    </div>
  );
}
