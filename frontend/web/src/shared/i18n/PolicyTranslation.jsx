import { useEffect, useRef, useState } from 'react';
import { createPolicyTranslationClient } from '../../../../packages/core/src/i18n/policyTranslation.js';
import { request } from '../api/client.js';
import {
  policyTranslationSource,
  restoreTranslationFallbacks,
} from '../../features/policies/policyTranslationModel.js';
import { useI18n } from './I18nProvider.jsx';
import './policy-translation.css';

// The client owns shared requests and caching; component cancellation only detaches its subscriber.
const translations = createPolicyTranslationClient({ request });

export function useTranslatedPolicy(original, { priority = 0, enabled = true } = {}) {
  const { locale, t } = useI18n();
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [showOriginal, setShowOriginal] = useState(false);
  useEffect(() => {
    setShowOriginal(false);
  }, [locale, original?.id, original?.revisionId]);
  useEffect(() => {
    if (locale === 'ko' || !original || !enabled) {
      setResult(null);
      return undefined;
    }
    const controller = new AbortController();
    setResult({ original, locale, state: 'loading', translated: null, error: '' });
    translations
      .translate(policyTranslationSource(original), locale, { signal: controller.signal, priority })
      .then((translated) => {
        if (!controller.signal.aborted)
          setResult({
            original,
            locale,
            state: 'ready',
            translated: restoreTranslationFallbacks(original, translated, t),
            error: '',
          });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({ original, locale, state: 'error', translated: null, error: error.message });
      });
    return () => controller.abort();
  }, [original, locale, attempt, priority, enabled, t]);
  const current = result?.original === original && result?.locale === locale ? result : null;
  return {
    policy:
      locale !== 'ko' && !showOriginal && current?.state === 'ready'
        ? current.translated
        : original,
    original,
    state: locale === 'ko' ? 'original' : !enabled ? 'idle' : current?.state || 'loading',
    error: current?.error || '',
    retry: () => setAttempt((value) => value + 1),
    showOriginal,
    setShowOriginal,
  };
}

// Long saved/calendar lists only enqueue notices near the viewport.
export function useVisibleTranslatedPolicy(original, options = {}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (visible || !ref.current) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '150px' },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [visible]);
  const translation = useTranslatedPolicy(original, { ...options, enabled: visible });
  return { ...translation, ref };
}

export function PolicyTranslationStatus({ translation, controls = false }) {
  const { locale, t } = useI18n();
  if (locale === 'ko') return null;
  const { state, showOriginal, setShowOriginal, retry } = translation;
  if (state === 'idle') return null;
  const message =
    state === 'loading'
      ? '공고를 번역하고 있어요. 한국어 원문을 먼저 표시합니다.'
      : state === 'error'
        ? '공고 번역을 불러오지 못했어요. 한국어 원문을 표시합니다.'
        : showOriginal
          ? '한국어 원문을 표시하고 있어요.'
          : 'AI 번역 · 신청 조건은 공식 원문에서 확인해 주세요.';
  return (
    <div
      className={'policy-translation-status' + (state === 'error' ? ' is-error' : '')}
      aria-label={t('공고 번역 안내')}
    >
      <p role="status">{t(message)}</p>
      {state === 'error' && (
        <button type="button" className="text-button" onClick={retry}>
          {t('번역 다시 시도')}
        </button>
      )}
      {controls && state === 'ready' && (
        <button
          type="button"
          className="text-button"
          aria-pressed={showOriginal}
          onClick={() => setShowOriginal((value) => !value)}
        >
          {t(showOriginal ? '번역 보기' : '한국어 원문 보기')}
        </button>
      )}
    </div>
  );
}

export function TranslatedPolicyTitle({ policy, as: Element = 'span' }) {
  const translation = useVisibleTranslatedPolicy(policy);
  return (
    <>
      <Element ref={translation.ref}>{translation.policy.title}</Element>
      <PolicyTranslationStatus translation={translation} />
    </>
  );
}
