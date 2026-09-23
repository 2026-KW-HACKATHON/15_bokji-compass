import { useEffect, useState } from 'react';
import Icon from '../../shared/ui/Icon.jsx';
import { regions } from '../policies/policyModel.js';
import { authRequest } from './authApi.js';

export default function AuthPage({ type, onLogin }) {
  const signup = type === 'signup';
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [proof, setProof] = useState(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [retryAt, setRetryAt] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const verified = proof && proof.expiresAt > now;
  const codeActive = challenge && challenge.expiresAt > now;
  const retrySeconds = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const secondsLeft = Math.max(
    0,
    Math.ceil(((proof?.expiresAt || challenge?.expiresAt || 0) - now) / 1000),
  );
  const normalizedPhone = phone.replace(/[\s-]/g, '');

  async function run(action, callback) {
    if (busy) return;
    setBusy(action);
    setError('');
    setMessage('');
    try {
      await callback();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }
  function requestCode() {
    if (!/^010[0-9]{8}$/.test(normalizedPhone)) {
      setError('010으로 시작하는 휴대전화 번호 11자리를 입력해 주세요.');
      return;
    }
    run('request', async () => {
      setProof(null);
      setChallenge(null);
      setCode('');
      const result = await authRequest('phone/request', { phone: normalizedPhone });
      setChallenge({ ...result, expiresAt: Date.now() + result.expires_in * 1000 });
      setRetryAt(Date.now() + result.retry_after * 1000);
      setNow(Date.now());
      setMessage(
        result.development_code
          ? '개발용 인증번호가 발급됐어요. 실제 문자는 발송되지 않습니다.'
          : '인증번호를 문자로 보냈어요.',
      );
    });
  }
  function verifyCode() {
    if (!/^[0-9]{6}$/.test(code)) {
      setError('인증번호 6자리를 입력해 주세요.');
      return;
    }
    run('verify', async () => {
      const result = await authRequest('phone/verify', {
        phone: normalizedPhone,
        challenge_id: challenge.challenge_id,
        code,
      });
      setProof({
        token: result.verification_token,
        expiresAt: Date.now() + result.expires_in * 1000,
      });
      setCode('');
      setMessage('전화번호 인증을 완료했어요. 5분 이내에 가입을 완료해 주세요.');
    });
  }
  function submit(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (signup && data.password !== data.confirm_password) {
      setError('비밀번호와 비밀번호 확인이 일치하지 않아요.');
      return;
    }
    if (signup && !verified) {
      setError('전화번호 인증을 먼저 완료해 주세요.');
      return;
    }
    run('submit', async () => {
      if (signup) {
        const result = await authRequest('signup', {
          username: data.username,
          name: data.name,
          password: data.password,
          confirm_password: data.confirm_password,
          age: Number(data.age),
          gender: data.gender,
          region: data.region,
          phone: normalizedPhone,
          verification_token: proof.token,
        });
        setComplete(true);
        setProof(null);
        setChallenge(null);
        setPhone('');
        setMessage(result.message);
      } else {
        const result = await authRequest('login', {
          username: data.username,
          password: data.password,
        });
        onLogin(result.user);
      }
    });
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
        <h1>{signup ? '회원가입' : '로그인'}</h1>
        <p>
          {signup
            ? '나를 위한 복지 비서를 만날 준비를 해보세요.'
            : '나를 위한 복지 비서와 다시 시작하세요.'}
        </p>
        {complete ? (
          <div>
            <p role="status" className="notice-box">
              {message}
            </p>
            <a className="button primary full" href="#login">
              로그인하러 가기
            </a>
          </div>
        ) : (
          <form onSubmit={submit} aria-describedby="auth-status">
            <fieldset disabled={Boolean(busy)} className="auth-fields">
              {signup && (
                <label className="field-label">
                  이름
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={50}
                    pattern=".*\S.*"
                    placeholder="이름을 입력해 주세요"
                  />
                </label>
              )}
              <label className="field-label">
                아이디
                <input
                  name="username"
                  autoComplete="username"
                  required
                  minLength={4}
                  maxLength={20}
                  pattern="[a-zA-Z0-9_]{4,20}"
                  placeholder="영문·숫자·밑줄 4~20자"
                  aria-describedby="username-hint"
                />
              </label>
              <small id="username-hint">영문 대소문자는 구분하지 않아요.</small>
              <label className="field-label">
                비밀번호
                <input
                  type="password"
                  name="password"
                  autoComplete={signup ? 'new-password' : 'current-password'}
                  required
                  minLength={8}
                  maxLength={128}
                  pattern={signup ? '(?=.*[a-zA-Z])(?=.*[0-9]).{8,128}' : undefined}
                  title="영문과 숫자를 포함한 8~128자"
                  placeholder={
                    signup ? '영문과 숫자를 포함한 8자 이상' : '비밀번호를 입력해 주세요'
                  }
                />
              </label>
              {signup && (
                <>
                  <label className="field-label">
                    비밀번호 확인
                    <input
                      type="password"
                      name="confirm_password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      maxLength={128}
                      placeholder="비밀번호를 한 번 더 입력해 주세요"
                    />
                  </label>
                  <div className="auth-grid">
                    <label className="field-label">
                      나이 (만 나이)
                      <input
                        type="number"
                        name="age"
                        required
                        min="0"
                        max="120"
                        step="1"
                        placeholder="예: 25"
                      />
                    </label>
                    <label className="field-label">
                      성별
                      <select name="gender" required defaultValue="">
                        <option value="" disabled>
                          선택해 주세요
                        </option>
                        <option value="male">남성</option>
                        <option value="female">여성</option>
                        <option value="other">기타</option>
                        <option value="undisclosed">응답하지 않음</option>
                      </select>
                    </label>
                  </div>
                  <label className="field-label">
                    거주 지역
                    <select name="region" required defaultValue="">
                      <option value="" disabled>
                        시·도를 선택해 주세요
                      </option>
                      {regions
                        .filter((region) => region !== '전국')
                        .map((region) => (
                          <option key={region}>{region}</option>
                        ))}
                    </select>
                  </label>
                  <label className="field-label">
                    전화번호
                    <input
                      type="tel"
                      name="phone"
                      autoComplete="tel-national"
                      required
                      maxLength={20}
                      placeholder="010-1234-5678"
                      value={phone}
                      onChange={(event) => {
                        setPhone(event.target.value);
                        setChallenge(null);
                        setProof(null);
                        setCode('');
                        setMessage('');
                        setError('');
                      }}
                    />
                  </label>
                  <button
                    className="button secondary full"
                    type="button"
                    onClick={requestCode}
                    disabled={retrySeconds > 0 || Boolean(verified)}
                  >
                    {retrySeconds > 0
                      ? `${retrySeconds}초 후 재전송 가능`
                      : challenge
                        ? '인증번호 다시 받기'
                        : '인증번호 받기'}
                  </button>
                  {challenge && !verified && (
                    <>
                      {challenge.development_code && (
                        <p className="notice-box">
                          개발용 인증번호: <strong>{challenge.development_code}</strong>
                          <br />
                          실제 문자는 발송되지 않습니다.
                        </p>
                      )}
                      <label className="field-label">
                        문자 인증번호
                        <input
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          value={code}
                          onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                          placeholder="6자리 인증번호"
                        />
                      </label>
                      <button
                        className="button secondary full"
                        type="button"
                        onClick={verifyCode}
                        disabled={!codeActive || code.length !== 6}
                      >
                        인증번호 확인
                      </button>
                    </>
                  )}
                  {challenge && (
                    <p className="auth-timer">
                      {secondsLeft > 0
                        ? `${verified ? '인증 완료 · 가입' : '인증번호'} 유효 시간 ${Math.floor(secondsLeft / 60)}분 ${secondsLeft % 60}초`
                        : '인증 시간이 만료됐어요. 인증번호를 다시 받아 주세요.'}
                    </p>
                  )}
                </>
              )}
              <button className="button primary full" type="submit" disabled={signup && !verified}>
                {busy === 'submit' ? '처리 중…' : signup ? '회원가입' : '로그인'}
              </button>
            </fieldset>
            <div id="auth-status" aria-live="polite" aria-atomic="true">
              {busy && <p role="status">요청을 처리하고 있어요…</p>}
              {error && (
                <p role="alert" className="auth-error">
                  {error}
                </p>
              )}
              {message && (
                <p role="status" className="notice-box">
                  {message}
                </p>
              )}
            </div>
          </form>
        )}
        <p className="auth-switch">
          {signup ? '이미 계정이 있으신가요?' : '처음 오셨나요?'}{' '}
          <a href={signup ? '#login' : '#signup'}>{signup ? '로그인' : '회원가입'}</a>
        </p>
      </div>
    </section>
  );
}
