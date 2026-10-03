import { useEffect, useRef, useState } from 'react';
import Icon from '../../shared/ui/Icon.jsx';
import { authRequest } from './authApi.js';
import PasswordInput from './PasswordInput.jsx';
import SignupWizard from './SignupWizard.jsx';
import KakaoLogin, { kakaoOutcomeError } from './KakaoLogin.jsx';

export default function AuthPage({ type, onLogin }) {
  const outcome = new URLSearchParams(window.location.hash.split('?')[1]).get('kakao');
  return type === 'signup' ? (
    <SignupWizard
      key={outcome || 'regular'}
      kakaoComplete={outcome === 'complete'}
      onLogin={onLogin}
      outcome={outcome}
    />
  ) : (
    <LoginForm key={outcome || 'regular'} onLogin={onLogin} outcome={outcome} />
  );
}

function LoginForm({ onLogin, outcome }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [kakaoBusy, setKakaoBusy] = useState(false);
  const [error, setError] = useState(() => kakaoOutcomeError(outcome));
  const errorRef = useRef(null);
  const pending = useRef(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  async function submit(event) {
    event.preventDefault();
    if (pending.current || kakaoBusy) return;
    setError('');
    if (!/^[a-zA-Z0-9_]{4,20}$/.test(username)) {
      setError('아이디는 영문, 숫자, 밑줄(_)을 사용해 4~20자로 입력해 주세요.');
      return;
    }
    if (password.length < 8) {
      setError('비밀번호를 8자 이상 입력해 주세요.');
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    try {
      const result = await authRequest(
        'login',
        { username, password },
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) onLogin(result.user);
    } catch (err) {
      if (!controller.signal.aborted) setError(err.message);
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="auth-page">
      <a className="back-link" href="#home">
        ← 홈으로 돌아가기
      </a>
      <div className="auth-card">
        <span className="round-icon">
          <Icon name="user" size={28} />
        </span>
        <h1>로그인</h1>
        <p>아이디와 비밀번호를 입력해 주세요.</p>
        <KakaoLogin busy={busy || kakaoBusy} onBusy={setKakaoBusy} onError={setError} />
        <p className="auth-divider">또는 아이디로 로그인</p>
        <form onSubmit={submit} noValidate aria-label="로그인 정보">
          {error && (
            <p ref={errorRef} tabIndex={-1} role="alert" className="auth-error">
              {error}
            </p>
          )}
          {busy && <p role="status">로그인하는 중입니다…</p>}
          <fieldset className="auth-fields" disabled={busy || kakaoBusy}>
            <label className="field-label" htmlFor="auth-username">
              아이디
            </label>
            <input
              id="auth-username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              maxLength={20}
            />
            <PasswordInput
              id="auth-password"
              name="password"
              label="비밀번호"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button className="button primary full" type="submit">
              {busy ? '로그인 중…' : '로그인'}
            </button>
          </fieldset>
        </form>
        <p className="auth-switch">
          처음 방문하셨나요? <a href="#signup">회원가입</a>
        </p>
      </div>
    </section>
  );
}
