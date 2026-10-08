import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import { recommendationFeedbackReasons } from './monitoringModel.js';

export default function RecommendationFeedbackForm({ disabled, onSave }) {
  const { t } = useI18n();
  const id = useId();
  const trigger = useRef(null);
  const form = useRef(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) form.current?.querySelector('input')?.focus();
  }, [open]);
  return (
    <div className="recommendation-feedback">
      <button
        ref={trigger}
        className="text-button recommendation-dismiss"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={`${id}-form`}
        onClick={() => setOpen(!open)}
      >
        {t('이 공고 추천하지 않기')}
      </button>
      {open && (
        <form
          ref={form}
          id={`${id}-form`}
          onSubmit={(event) => {
            event.preventDefault();
            if (reason && !disabled) onSave(reason);
          }}
        >
          <fieldset disabled={disabled}>
            <legend>{t('이 공고를 추천하지 않는 이유')}</legend>
            <div className="recommendation-feedback-reasons">
              {recommendationFeedbackReasons.map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name={`${id}-reason`}
                    value={value}
                    checked={reason === value}
                    onChange={() => setReason(value)}
                    required
                  />
                  <span>{t(label)}</span>
                </label>
              ))}
            </div>
            <p className="fine-print">
              {reason === 'not_interested'
                ? t('이 공고를 제외하고, 비슷한 공고의 추천 순위를 낮춰요.')
                : t(
                    '이 공고를 다시 추천하지 않아요. 제외한 공고는 언제든 다시 추천받을 수 있어요.',
                  )}
            </p>
            <div className="monitoring-actions">
              <button className="button secondary" type="submit" disabled={!reason || disabled}>
                {t(disabled ? '저장 중…' : '추천에서 제외')}
              </button>
              <button
                className="text-button"
                type="button"
                disabled={disabled}
                onClick={() => {
                  setOpen(false);
                  setReason('');
                  trigger.current?.focus();
                }}
              >
                {t('취소')}
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </div>
  );
}
