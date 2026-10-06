import { useEffect, useRef, useState } from 'react';
import AuthLayout from './AuthLayout.jsx';
import { authRequest } from './authApi.js';

export default function KakaoSignup({ onLogin }) {
  const [identity, setIdentity] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const errorRef = useRef(null);
  const pending = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    authRequest('kakao/pending', undefined, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setIdentity(result);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err.message);
          setExpired(err.status === 401);
        }
      });
    return () => {
      controller.abort();
      pending.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function run(action) {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(action);
    setError('');
    try {
      const result = await authRequest(`kakao/${action}`, {}, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (action === 'cancel') window.location.hash = 'signup';
      else onLogin(result.user, 'profile?setup=1');
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err.message);
        if (err.status === 401 || err.status === 409) setExpired(true);
      }
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy('');
    }
  }

  return (
    <AuthLayout
      type="signup"
      title="카카오로 가입하기"
      description="이름이나 나이 등을 입력하지 않아도 가입할 수 있어요."
    >
      {error && (
        <p role="alert" ref={errorRef} tabIndex={-1} className="auth-error">
          {error}
        </p>
      )}
      {identity && !expired && (
        <p className="notice-box">
          {identity.name
            ? `${identity.name}님의 카카오 인증이 완료됐어요.`
            : '카카오 인증이 완료됐어요.'}
        </p>
      )}
      {!identity && !error && <p role="status">카카오 인증을 확인하고 있어요…</p>}
      <p className="auth-field-hint">맞춤 안내를 위한 나이와 지역은 가입 후 선택할 수 있어요.</p>
      <div className="auth-fields">
        <button
          type="button"
          className="button primary full"
          disabled={Boolean(busy) || !identity || expired}
          onClick={() => run('complete')}
        >
          {busy === 'complete' ? '가입하는 중…' : '가입하고 시작하기'}
        </button>
        <button
          type="button"
          className="text-button"
          disabled={Boolean(busy)}
          onClick={() => run('cancel')}
        >
          {busy === 'cancel' ? '돌아가는 중…' : '가입 방법 다시 선택'}
        </button>
      </div>
    </AuthLayout>
  );
}
