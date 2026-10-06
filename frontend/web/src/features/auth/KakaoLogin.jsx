import { useEffect, useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { authRequest } from './authApi.js';

export function kakaoOutcomeError(outcome) {
  if (!outcome || outcome === 'complete') return '';
  return outcome === 'cancelled'
    ? '카카오 로그인을 취소했어요. 다시 시도할 수 있어요.'
    : outcome === 'expired'
      ? '로그인 요청이 만료됐어요. 카카오 로그인을 다시 눌러 주세요.'
      : '카카오 로그인에 연결하지 못했어요. 다시 시도해 주세요.';
}

export default function KakaoLogin({
  busy,
  onBusy,
  onError,
  onAvailability,
  label = '카카오 로그인',
}) {
  const [enabled, setEnabled] = useState(null);
  const [starting, setStarting] = useState(false);
  const pending = useRef(null);
  useEffect(() => {
    if (enabled !== null) onAvailability?.(enabled);
  }, [enabled, onAvailability]);
  useEffect(() => {
    const controller = new AbortController();
    authRequest('kakao/status', undefined, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setEnabled(result.enabled === true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setEnabled(false);
      });
    return () => {
      controller.abort();
      if (pending.current) {
        pending.current.abort();
        onBusy(false);
      }
    };
  }, [onBusy]);

  async function start() {
    if (busy || pending.current || !enabled) return;
    const controller = new AbortController();
    pending.current = controller;
    setStarting(true);
    onBusy(true);
    onError('');
    try {
      const result = await authRequest('kakao/start', {}, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const url = new URL(result.authorization_url);
      if (url.origin !== 'https://kauth.kakao.com' || url.pathname !== '/oauth/authorize')
        throw new Error('카카오 로그인 주소를 확인하지 못했어요.');
      window.location.assign(url.href);
    } catch (error) {
      if (!controller.signal.aborted) onError(error.message);
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) {
        setStarting(false);
        onBusy(false);
      }
    }
  }

  return (
    <div className="kakao-login-section">
      <button
        type="button"
        className="button full kakao-login-button"
        disabled={Boolean(busy) || starting || !enabled}
        onClick={start}
      >
        <MessageCircle size={20} aria-hidden="true" />
        {starting ? '카카오로 이동 중…' : label}
      </button>
      {enabled === null && <p role="status">로그인 방법을 확인하고 있어요…</p>}
      {enabled === false && (
        <p className="auth-field-hint">
          카카오 로그인을 준비 중이에요. 아이디로 가입하거나 로그인할 수 있어요.
        </p>
      )}
    </div>
  );
}
