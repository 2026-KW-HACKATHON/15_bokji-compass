import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import { useEffect, useRef, useState } from 'react';
import { countChoices, readCount } from '../../../../packages/core/src/countChoices.js';

/**
 * Controlled exact-count field with a grouped first choice.
 * onChange receives an exact number, null (unknown/pending exact selection), or manual input text.
 * groupFrom/manualFrom only affect presentation; saved values are never capped or rounded.
 * The main select uses id, the exact select `${id}-exact`, and manual input `${id}-count`.
 */
export default function CountField({
  id,
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  groupFrom = 3,
  manualFrom = 9,
  allowUnknown = true,
  unknownLabel = '모름 · 확인 필요',
  zeroLabel = '없음 (0명)',
  exactLabel = '실제 인원',
  hint,
  className = 'finance-field',
}) {
  const { t, intlLocale } = useI18n();

  const [inputMode, setInputMode] = useState(null);
  const lastEdited = useRef(value);
  const choices = countChoices({ min, max, groupFrom, manualFrom });
  const count = readCount(value);
  const empty = value == null || String(value).trim() === '';
  const malformed = !empty && count === null;
  const invalid = !empty && (count === null || count < min || count > choices.max);
  const manual = inputMode === 'manual' || count >= manualFrom || malformed;
  const grouped = manual || inputMode === 'group' || count >= groupFrom;
  const primaryValue = grouped ? 'group' : count === null ? 'unknown' : String(count);
  const exactValue = manual ? 'manual' : count >= groupFrom ? String(count) : '';
  const hintId = hint ? `${id}-hint` : undefined;
  const exactHintId = `${id}-exact-hint`;
  const manualHintId = `${id}-count-hint`;
  const unavailableCommon = !grouped && count !== null && !choices.common.includes(count);
  const unavailableExact = grouped && !manual && count !== null && !choices.exact.includes(count);
  const textValue = value == null ? '' : String(value);

  useEffect(() => {
    const previousCount = readCount(lastEdited.current);
    const nextCount = readCount(value);
    const same =
      previousCount !== null && nextCount !== null
        ? previousCount === nextCount
        : String(lastEdited.current ?? '') === String(value ?? '');
    if (!same) setInputMode(null);
    lastEdited.current = value;
  }, [value]);

  function change(next) {
    lastEdited.current = next;
    onChange(next);
  }

  function selectPrimary(key) {
    if (key === 'group') {
      setInputMode(count >= manualFrom ? 'manual' : 'group');
      if (count === null || count < groupFrom) change(null);
    } else {
      setInputMode(null);
      change(key === 'unknown' ? null : Number(key));
    }
  }

  return (
    <div className={className}>
      <label htmlFor={id}>{t(label)}</label>
      <select
        id={id}
        value={primaryValue}
        aria-describedby={hintId}
        aria-invalid={invalid || undefined}
        onChange={(event) => selectPrimary(event.target.value)}
      >
        <option value="unknown" disabled={!allowUnknown}>
          {allowUnknown ? t(unknownLabel) : t('선택해 주세요')}
        </option>
        {choices.common.map((number) => (
          <option key={number} value={number}>
            {number === 0 ? t(zeroLabel) : t('{value1}명', { value1: number })}
          </option>
        ))}
        {unavailableCommon && (
          <option value={count} disabled>
            {count}
            {t('명 (입력 범위 확인)')}{' '}
          </option>
        )}
        {(choices.grouped || grouped) && (
          <option value="group" disabled={!choices.grouped}>
            {groupFrom}
            {t('명 이상')}{' '}
          </option>
        )}
      </select>
      {grouped && (
        <>
          <label htmlFor={`${id}-exact`}>{t(exactLabel)}</label>
          <select
            id={`${id}-exact`}
            value={exactValue}
            aria-describedby={exactHintId}
            aria-invalid={invalid || undefined}
            onChange={(event) => {
              const key = event.target.value;
              setInputMode(key === 'manual' ? 'manual' : 'group');
              if (key === 'manual') {
                if (count === null || count < manualFrom) change(null);
              } else change(key === '' ? null : Number(key));
            }}
          >
            <option value="">{t('정확한 인원을 선택해 주세요')}</option>
            {choices.exact.map((number) => (
              <option key={number} value={number}>
                {number}
                {t('명')}{' '}
              </option>
            ))}
            {unavailableExact && (
              <option value={count} disabled>
                {count}
                {t('명 (가구원 수 확인)')}{' '}
              </option>
            )}
            {(choices.manual || manual) && (
              <option value="manual" disabled={!choices.manual}>
                {manualFrom}
                {t('명 이상 · 직접 입력')}{' '}
              </option>
            )}
          </select>
          <small id={exactHintId}>
            {' '}
            {t('계산에는 실제 인원을 사용해요. 정확한 인원을 선택해 주세요.')}{' '}
          </small>
        </>
      )}
      {manual && (
        <>
          <label htmlFor={`${id}-count`}>
            {t(exactLabel)} {t('직접 입력')}
          </label>
          <div className="finance-number">
            <input
              id={`${id}-count`}
              inputMode="numeric"
              autoComplete="off"
              value={textValue}
              aria-describedby={manualHintId}
              aria-invalid={invalid || undefined}
              onChange={(event) => {
                setInputMode('manual');
                change(event.target.value);
              }}
              onBlur={() => {
                // Typing 12 goes through 1; keep the input mounted until the edit is finished.
                if (count !== null && count >= min && count < manualFrom) setInputMode(null);
              }}
            />
            <span aria-hidden="true">{t('명')}</span>
          </div>
          <small id={manualHintId}>
            {t('최대')} {choices.max}
            {t('명까지 실제 인원을 입력해 주세요.')}
          </small>
        </>
      )}
      {hint && <small id={hintId}>{t(hint)}</small>}
    </div>
  );
}
