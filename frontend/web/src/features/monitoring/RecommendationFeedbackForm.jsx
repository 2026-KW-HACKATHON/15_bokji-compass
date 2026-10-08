import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import { recommendationFeedbackReasons } from './monitoringModel.js';
import Icon from '../../shared/ui/Icon.jsx';

export default function RecommendationFeedbackForm({ disabled, onSave, error = false }) {
  const { t } = useI18n();
  const id = useId();
  const trigger = useRef(null);
  const form = useRef(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) form.current?.querySelector('input')?.focus();
  }, [open]);
  useEffect(() => {
    if (error) form.current?.querySelector('button[type="submit"]')?.focus();
  }, [error]);

  function close() {
    setOpen(false);
    setReason('');
    trigger.current?.focus();
  }
  return (
    <div className="recommendation-feedback">
      <button
        ref={trigger}
        type="button"
        className="recommendation-dismiss"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={`${id}-form`}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Icon name="x" size={16} />
        {t('이 공고 추천하지 않기')}
        <Icon name="down" size={16} className="recommendation-dismiss-chevron" />
      </button>
      {open && (
        <form
          ref={form}
          id={`${id}-form`}
          className="recommendation-feedback-panel"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !disabled) {
              event.preventDefault();
              close();
            }
          }}
          onSubmit={(event) => {
            event.preventDefault();
            if (reason && !disabled) onSave(reason);
          }}
        >
          <fieldset disabled={disabled}>
            <legend className="sr-only">{t('이 공고를 추천하지 않는 이유')}</legend>
            <div className="recommendation-feedback-reasons">
              {recommendationFeedbackReasons.map(([value, label]) => (
                <label key={value} className={reason === value ? 'is-selected' : ''}>
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
            {error && (
              <p className="recommendation-feedback-error" role="alert">
                {t('제외하지 못해 공고를 다시 표시했어요. 다시 시도해 주세요.')}
              </p>
            )}
            <div className="recommendation-feedback-actions">
              <button
                className="button secondary"
                type="button"
                disabled={disabled}
                onClick={close}
              >
                {t('취소')}
              </button>
              <button className="button primary" type="submit" disabled={!reason || disabled}>
                {t(disabled ? '저장 중…' : '추천에서 제외')}
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </div>
  );
}
