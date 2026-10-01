import FinanceHelp from './FinanceHelp.jsx';
import { fieldValue, visibleFields } from './financeFlow.js';
import { formatMoney, formatNumber } from './financeModel.js';

const numericValue = (value) => (typeof value === 'number' ? formatNumber(value) : (value ?? ''));

function FinanceField({ field, draft, onChange }) {
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
  return (
    <div className="finance-field">
      {money ? (
        <span id={`${field.id}-label`} className="finance-field-label">
          {field.label}
        </span>
      ) : (
        <label htmlFor={field.id}>{field.label}</label>
      )}
      {money && (
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
              onClick={() =>
                onChange(
                  field.path,
                  key === 'none' ? 0 : key === 'unknown' ? null : presence === 'yes' ? value : '',
                )
              }
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
            inputMode="numeric"
            autoComplete="off"
            value={numericValue(value)}
            onChange={(event) => onChange(field.path, event.target.value)}
            placeholder="모르면 비워두세요"
            aria-describedby={hintId}
          />
          <span aria-hidden="true">{field.unit ?? '원'}</span>
        </div>
      )}
      {money && presence !== 'yes' && (
        <small>
          {presence === 'none'
            ? '0원으로 계산해요.'
            : '확인 필요로 남겨두고 다음으로 갈 수 있어요.'}
        </small>
      )}
      {field.hint && <small id={hintId}>{field.hint}</small>}
    </div>
  );
}

export function QuestionFields({ question, draft, onChange, onAddVehicle, onRemoveVehicle }) {
  return (
    <>
      {question.id === 'debts' && (
        <button
          type="button"
          className="text-button"
          onClick={() => onChange('debts', { bank: 0, public: 0, other: 0 })}
        >
          부채가 모두 없어요
        </button>
      )}
      <div className="finance-grid">
        {visibleFields(question, draft).map((field) => (
          <FinanceField key={field.path} field={field} draft={draft} onChange={onChange} />
        ))}
      </div>
      {question.id === 'vehicles' && draft.vehicle_status === 'owned' && (
        <div className="finance-vehicle-list">
          <p className="finance-help">
            차량은 한 대씩 입력해요. 보유하거나 빌려 쓰는 차량 수에 맞춰 추가해 주세요.
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
  const number = Number(String(value).replaceAll(',', ''));
  return field.type === 'money' ? formatMoney(number) : `${formatNumber(number)}${field.unit}`;
}

export function FinanceReview({ questions, draft, onEdit }) {
  return (
    <div className="finance-review">
      {questions.map((question) => (
        <article key={question.id}>
          <div className="finance-review-heading">
            <h3>{question.title}</h3>
            <button
              type="button"
              className="text-button"
              aria-label={`${question.title} 수정`}
              onClick={() => onEdit(question.id)}
            >
              수정
            </button>
          </div>
          <dl className="finance-facts">
            {visibleFields(question, draft).map((field) => (
              <div key={field.path}>
                <dt>{field.label}</dt>
                <dd>{displayValue(field, draft)}</dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
    </div>
  );
}
