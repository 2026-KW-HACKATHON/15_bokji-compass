import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../../shared/ui/Icon.jsx';
import { authRequest } from './authApi.js';
import PasswordInput from './PasswordInput.jsx';
import SignupWizard from './SignupWizard.jsx';
import KakaoSignup from './KakaoSignup.jsx';
import KakaoLogin, { kakaoOutcomeError } from './KakaoLogin.jsx';
import AuthLayout from './AuthLayout.jsx';

export default function AuthPage({ type, onLogin, easy }) {
  const outcome = new URLSearchParams(window.location.hash.split('?')[1]).get('kakao');
  if (type === 'signup' && outcome === 'complete') return <KakaoSignup onLogin={onLogin} />;
  return type === 'signup' ? (
    <SignupWizard key={outcome || 'regular'} outcome={outcome} easy={easy} />
  ) : (
    <LoginForm key={outcome || 'regular'} onLogin={onLogin} outcome={outcome} easy={easy} />
  );
}

function LoginForm({ onLogin, outcome, easy }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [kakaoBusy, setKakaoBusy] = useState(false);
  const [error, setError] = useState(() => kakaoOutcomeError(outcome));
  const [invalidField, setInvalidField] = useState('');
  const [credentialsOpen, setCredentialsOpen] = useState(Boolean(easy));
  const showCredentials = easy || credentialsOpen;
  const usernameRef = useRef(null);
  const errorRef = useRef(null);
  const pending = useRef(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    if (easy) setCredentialsOpen(true);
  }, [easy]);
  const onAvailability = useCallback((enabled) => {
    if (!enabled) setCredentialsOpen(true);
  }, []);
  function toggleCredentials() {
    const next = !credentialsOpen;
    setCredentialsOpen(next);
    if (next) requestAnimationFrame(() => usernameRef.current?.focus());
  }
  async function submit(event) {
    event.preventDefault();
    if (pending.current || kakaoBusy) return;
    setError('');
    setInvalidField('');
    if (!/^[a-zA-Z0-9_]{4,20}$/.test(username)) {
      setInvalidField('username');
      setError('아이디는 영문, 숫자, 밑줄(_)을 사용해 4~20자로 입력해 주세요.');
      return;
    }
    if (password.length < 8) {
      setInvalidField('password');
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
    <AuthLayout
      type="login"
      title="로그인"
      description={
        easy ? '아이디와 비밀번호를 입력해 주세요.' : '반가워요. 편한 방법으로 로그인해 주세요.'
      }
    >
      {error && (
        <p id="login-error" ref={errorRef} tabIndex={-1} role="alert" className="auth-error">
          {error}
        </p>
      )}
      {!easy && (
        <div className="auth-login-alternative">
          <KakaoLogin
            busy={busy || kakaoBusy}
            onBusy={setKakaoBusy}
            onError={setError}
            onAvailability={onAvailability}
          />
          <div className="auth-method-divider">또는</div>
        </div>
      )}
      <button
        type="button"
        className="auth-id-choice"
        aria-expanded={showCredentials}
        aria-controls="id-login-panel"
        disabled={busy || kakaoBusy}
        onClick={toggleCredentials}
      >
        <Icon name="user" size={18} /> 아이디로 로그인 <Icon name="down" size={18} />
      </button>
      <div id="id-login-panel" className="auth-id-panel" hidden={!showCredentials}>
        <form onSubmit={submit} noValidate aria-label="로그인 정보">
          {busy && <p role="status">로그인하는 중입니다…</p>}
          <fieldset className="auth-fields" disabled={busy || kakaoBusy}>
            <div className="auth-input-group">
              <label className="field-label" htmlFor="auth-username">
                아이디
              </label>
              <input
                ref={usernameRef}
                id="auth-username"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
                maxLength={20}
                placeholder="가입한 아이디"
                aria-invalid={invalidField === 'username' || undefined}
                aria-describedby={invalidField === 'username' ? 'login-error' : undefined}
              />
            </div>
            <PasswordInput
              id="auth-password"
              name="password"
              label="비밀번호"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="비밀번호"
              aria-invalid={invalidField === 'password' || undefined}
              aria-describedby={invalidField === 'password' ? 'login-error' : undefined}
            />
            <button className="button primary full" type="submit">
              {busy ? '로그인 중…' : '로그인'}
            </button>
          </fieldset>
        </form>
      </div>
      {easy && (
        <div className="auth-easy-alternative">
          <p>카카오로도 로그인할 수 있어요.</p>
          <KakaoLogin
            busy={busy || kakaoBusy}
            onBusy={setKakaoBusy}
            onError={setError}
            onAvailability={onAvailability}
          />
        </div>
      )}
      <p className="auth-switch">
        처음 방문하셨나요? <a href="#signup">회원가입</a>
      </p>
    </AuthLayout>
  );
}
