import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import Icon from '../../shared/ui/Icon.jsx';
import { regions } from '../policies/policyModel.js';
import { authRequest } from './authApi.js';

const steps = ['계정 만들기', '기본 정보'];
const initialFields = {
  username: '',
  password: '',
  confirm_password: '',
  name: '',
  age: '',
  gender: '',
  region: '',
};

export default function AuthPage({ type, onLogin, easy = false }) {
  const signup = type === 'signup';
  const [fields, setFields] = useState(initialFields);
  const [step, setStep] = useState(0);
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [invalidField, setInvalidField] = useState('');
  const [complete, setComplete] = useState(false);
  const errorRef = useRef(null);
  const headings = useRef([]);
  const formRef = useRef(null);
  const completeRef = useRef(null);
  useEffect(() => {
    if (complete) completeRef.current?.focus();
  }, [complete]);
  useEffect(() => {
    if (!error || busy) return;
    const frame = requestAnimationFrame(() => {
      errorRef.current?.focus();
      errorRef.current?.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(frame);
  }, [error, busy]);
  const kakaoComplete =
    signup && new URLSearchParams(window.location.hash.split('?')[1]).get('kakao') === 'complete';
  const [kakaoEnabled, setKakaoEnabled] = useState(null);
  const [pendingReady, setPendingReady] = useState(false);
  useEffect(() => {
    let active = true;
    authRequest('kakao/status')
      .then((result) => {
        if (active) setKakaoEnabled(result.enabled);
      })
      .catch(() => {
        if (active) setKakaoEnabled(false);
      });
    const outcome = new URLSearchParams(window.location.hash.split('?')[1]).get('kakao');
    if (kakaoComplete) {
      setStep(1);
      authRequest('kakao/pending')
        .then((result) => {
          if (active) {
            setFields((current) => ({ ...current, name: result.name }));
            setPendingReady(true);
          }
        })
        .catch((err) => {
          if (active) setError(err.message);
        });
    } else if (outcome) {
      setError(
        outcome === 'cancelled'
          ? '카카오 로그인을 취소했어요. 다시 시도할 수 있어요.'
          : outcome === 'expired'
            ? '로그인 요청이 만료됐어요. 카카오 로그인을 다시 눌러 주세요.'
            : '카카오 로그인에 연결하지 못했어요. 다시 시도해 주세요.',
      );
    }
    return () => {
      active = false;
    };
  }, [kakaoComplete]);

  function startKakao() {
    run('kakao', async () => {
      const result = await authRequest('kakao/start', {});
      const url = new URL(result.authorization_url);
      if (url.origin !== 'https://kauth.kakao.com' || url.pathname !== '/oauth/authorize')
        throw new Error('카카오 로그인 주소를 확인하지 못했어요.');
      window.location.assign(url.href);
    });
  }

  function showError(text, field = '', section = step) {
    setError(text);
    setInvalidField(field);
    setMessage('');
    if (signup && easy) setStep(section);
  }
  function moveStep(next) {
    setStep(next);
    setError('');
    setInvalidField('');
    setMessage('');
    requestAnimationFrame(() => headings.current[next]?.focus());
  }
  function fieldProps(name) {
    return {
      id: 'auth-' + name,
      name,
      value: fields[name],
      'aria-invalid': invalidField === name || undefined,
      'aria-describedby': invalidField === name ? 'auth-error' : undefined,
      onChange: (event) => {
        setFields((current) => ({ ...current, [name]: event.target.value }));
        if (invalidField === name) {
          setError('');
          setInvalidField('');
        }
      },
    };
  }
  function validate(section) {
    if (section === 0) {
      if (!/^[a-zA-Z0-9_]{4,20}$/.test(fields.username))
        return ['아이디는 영문, 숫자, 밑줄(_)을 사용해 4~20자로 입력해 주세요.', 'username'];
      if (
        fields.password.length < 8 ||
        fields.password.length > 128 ||
        (signup && (!/[a-zA-Z]/.test(fields.password) || !/[0-9]/.test(fields.password)))
      )
        return [
          signup
            ? '비밀번호는 영문과 숫자를 포함해 8~128자로 입력해 주세요.'
            : '비밀번호를 8자 이상 입력해 주세요.',
          'password',
        ];
      if (signup && fields.password !== fields.confirm_password)
        return ['비밀번호가 일치하지 않습니다. 다시 입력해 주세요.', 'confirm_password'];
    }
    if (section === 1) {
      if (!fields.name.trim() || fields.name.length > 50 || /[\x00-\x1f]/.test(fields.name))
        return ['이름을 입력해 주세요.', 'name'];
      if (
        fields.age === '' ||
        !Number.isInteger(Number(fields.age)) ||
        Number(fields.age) < 0 ||
        Number(fields.age) > 120
      )
        return ['만 나이를 0~120 사이의 숫자로 입력해 주세요.', 'age'];
      if (!['male', 'female', 'other', 'undisclosed'].includes(fields.gender))
        return [
          '성별을 선택해 주세요. 원하지 않으면 ‘응답하지 않음’을 선택할 수 있습니다.',
          'gender',
        ];
      if (!regions.filter((region) => region !== '전국').includes(fields.region))
        return ['거주 지역을 선택해 주세요.', 'region'];
    }
    return null;
  }
  async function run(action, callback) {
    if (busy) return;
    setBusy(action);
    setError('');
    setInvalidField('');
    setMessage('');
    try {
      await callback();
    } catch (err) {
      showError(err.message);
    } finally {
      setBusy('');
    }
  }
  function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (signup && !kakaoComplete && easy && step < 1) {
      const issue = validate(step);
      if (issue) showError(...issue, step);
      else moveStep(step + 1);
      return;
    }
    for (const section of kakaoComplete ? [1] : signup ? [0, 1] : [0]) {
      const issue = validate(section);
      if (issue) {
        showError(...issue, section);
        return;
      }
    }
    run('submit', async () => {
      if (kakaoComplete) {
        const result = await authRequest('kakao/complete', {
          name: fields.name,
          age: Number(fields.age),
          gender: fields.gender,
          region: fields.region,
        });
        onLogin(result.user);
      } else if (signup) {
        const result = await authRequest('signup', {
          ...fields,
          age: Number(fields.age),
        });
        setComplete(true);
        setFields(initialFields);
        setMessage(result.message);
      } else {
        const result = await authRequest('login', {
          username: fields.username,
          password: fields.password,
        });
        onLogin(result.user);
      }
    });
  }
  function passwordField(name, label, hint) {
    const visible = Boolean(visiblePasswords[name]);
    return (
      <div className="auth-password-field">
        <label className="field-label" htmlFor={'auth-' + name}>
          {label}
        </label>
        <div className="auth-password-control">
          <input
            {...fieldProps(name)}
            type={visible ? 'text' : 'password'}
            autoComplete={signup ? 'new-password' : 'current-password'}
            required
            minLength={8}
            maxLength={128}
            aria-describedby={
              [hint ? name + '-hint' : '', invalidField === name ? 'auth-error' : '']
                .filter(Boolean)
                .join(' ') || undefined
            }
          />
          <button
            type="button"
            className="auth-password-toggle"
            aria-label={label + (visible ? ' 숨기기' : ' 보기')}
            aria-pressed={visible}
            aria-controls={'auth-' + name}
            onClick={() => setVisiblePasswords((current) => ({ ...current, [name]: !visible }))}
          >
            {visible ? (
              <EyeOff size={20} aria-hidden="true" />
            ) : (
              <Eye size={20} aria-hidden="true" />
            )}
            <span>{visible ? '숨기기' : '보기'}</span>
          </button>
        </div>
        {hint && (
          <small className="auth-field-hint" id={name + '-hint'}>
            {hint}
          </small>
        )}
      </div>
    );
  }
  function sectionHeading(index, description) {
    return (
      <>
        <h2
          className="auth-section-heading"
          tabIndex={-1}
          ref={(element) => {
            headings.current[index] = element;
          }}
          id={'auth-step-' + index}
        >
          <span aria-hidden="true">{index + 1}</span> {steps[index]}
        </h2>
        <p className="auth-section-description">{description}</p>
      </>
    );
  }
  return (
    <section className="auth-page">
      <a className="back-link" href="#home">
        ← 홈으로 돌아가기
      </a>
      <div className={'auth-card' + (signup ? ' auth-card-signup' : '')}>
        <span className="round-icon">
          <Icon name="user" size={28} />
        </span>
        <h1>{signup ? '회원가입' : '로그인'}</h1>
        <p>
          {signup
            ? kakaoComplete
              ? '카카오 인증이 완료됐어요. 복지 안내에 필요한 기본 정보를 입력해 주세요.'
              : '계정 정보와 기본 정보를 입력해 주세요.'
            : '아이디와 비밀번호를 입력해 주세요.'}
        </p>
        {!complete && (
          <div className="kakao-login-section">
            <button
              type="button"
              className="button full kakao-login-button"
              onClick={startKakao}
              disabled={Boolean(busy) || !kakaoEnabled}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M12 3C6.5 3 2 6.5 2 10.8c0 2.8 1.9 5.3 4.7 6.7l-1 3.5c-.1.4.3.6.6.4l4.2-2.8 1.5.1c5.5 0 10-3.5 10-7.9S17.5 3 12 3Z"
                />
              </svg>
              {busy === 'kakao'
                ? '카카오로 이동 중…'
                : kakaoComplete
                  ? '다른 카카오 계정으로 로그인'
                  : '카카오 로그인'}
            </button>
            {kakaoEnabled === false && (
              <p className="auth-field-hint">
                카카오 로그인을 준비 중이에요. 아이디로 가입하거나 로그인할 수 있어요.
              </p>
            )}
            {kakaoEnabled === null && <p role="status">로그인 방법을 확인하고 있어요…</p>}
            {!kakaoComplete && (
              <p className="auth-divider">또는 아이디로 {signup ? '가입' : '로그인'}</p>
            )}
          </div>
        )}
        {complete ? (
          <div ref={completeRef} tabIndex={-1}>
            <p role="status" className="notice-box">
              {message}
            </p>
            <a className="button primary full" href="#login">
              로그인하러 가기
            </a>
          </div>
        ) : (
          <form
            ref={formRef}
            onSubmit={submit}
            noValidate
            aria-label={signup ? '회원가입 정보' : '로그인 정보'}
          >
            {signup && easy && !kakaoComplete && (
              <ol className="auth-progress" aria-label="회원가입 단계">
                {steps.map((label, index) => (
                  <li
                    key={label}
                    aria-current={step === index ? 'step' : undefined}
                    data-complete={index < step && !validate(index)}
                  >
                    <span aria-hidden="true">
                      {index < step && !validate(index) ? '✓' : index + 1}
                    </span>
                    <span>{label}</span>
                  </li>
                ))}
              </ol>
            )}
            <div className="auth-form-status">
              {error && (
                <p ref={errorRef} tabIndex={-1} id="auth-error" role="alert" className="auth-error">
                  {error}
                </p>
              )}
              {busy && (
                <p role="status">
                  {busy === 'kakao'
                    ? '카카오로 이동 중입니다…'
                    : signup
                      ? '가입하는 중입니다…'
                      : '로그인하는 중입니다…'}
                </p>
              )}
              {message && (
                <p role="status" className="notice-box">
                  {message}
                </p>
              )}
            </div>
            <fieldset disabled={Boolean(busy)} className="auth-fields">
              <section
                className="auth-section"
                hidden={kakaoComplete || (signup && easy && step !== 0)}
                aria-labelledby={signup ? 'auth-step-0' : undefined}
              >
                {signup && sectionHeading(0, '로그인할 때 사용할 아이디와 비밀번호를 정해 주세요.')}
                <label className="field-label" htmlFor="auth-username">
                  아이디
                </label>
                <input
                  {...fieldProps('username')}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  minLength={4}
                  maxLength={20}
                  pattern="[a-zA-Z0-9_]{4,20}"
                  aria-describedby={
                    invalidField === 'username' ? 'username-hint auth-error' : 'username-hint'
                  }
                />
                <small className="auth-field-hint" id="username-hint">
                  영문, 숫자, 밑줄(_) 4~20자. 대소문자는 구분하지 않습니다.
                </small>
                {passwordField(
                  'password',
                  '비밀번호',
                  signup ? '영문과 숫자를 포함해 8자 이상 입력해 주세요.' : '',
                )}
                {signup &&
                  passwordField(
                    'confirm_password',
                    '비밀번호 확인',
                    '같은 비밀번호를 한 번 더 입력해 주세요.',
                  )}
              </section>
              {signup && (
                <>
                  <section
                    className="auth-section"
                    hidden={easy && step !== 1}
                    aria-labelledby="auth-step-1"
                  >
                    {sectionHeading(1, '이름과 거주 지역 등 기본 정보를 입력해 주세요.')}
                    <label className="field-label" htmlFor="auth-name">
                      이름
                    </label>
                    <input {...fieldProps('name')} autoComplete="name" required maxLength={50} />
                    <div className="auth-grid">
                      <div>
                        <label className="field-label" htmlFor="auth-age">
                          나이 (만 나이)
                        </label>
                        <input
                          {...fieldProps('age')}
                          type="number"
                          inputMode="numeric"
                          required
                          min="0"
                          max="120"
                          step="1"
                          placeholder="예: 65"
                        />
                      </div>
                      <div>
                        <label className="field-label" htmlFor="auth-gender">
                          성별
                        </label>
                        <select {...fieldProps('gender')} required>
                          <option value="" disabled>
                            선택해 주세요
                          </option>
                          <option value="male">남성</option>
                          <option value="female">여성</option>
                          <option value="other">기타</option>
                          <option value="undisclosed">응답하지 않음</option>
                        </select>
                      </div>
                    </div>
                    <label className="field-label" htmlFor="auth-region">
                      거주 지역
                    </label>
                    <select {...fieldProps('region')} required>
                      <option value="" disabled>
                        시·도를 선택해 주세요
                      </option>
                      {regions
                        .filter((region) => region !== '전국')
                        .map((region) => (
                          <option key={region}>{region}</option>
                        ))}
                    </select>
                  </section>
                </>
              )}
              <div className="auth-step-actions">
                {signup && !kakaoComplete && easy && step > 0 && (
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => moveStep(step - 1)}
                  >
                    이전
                  </button>
                )}
                <button
                  className="button primary full"
                  type="submit"
                  data-auth-submit
                  disabled={kakaoComplete && !pendingReady}
                >
                  {busy === 'submit'
                    ? '처리 중…'
                    : signup && !kakaoComplete && easy && step < 1
                      ? '다음'
                      : signup
                        ? '회원가입'
                        : '로그인'}
                </button>
              </div>
            </fieldset>
          </form>
        )}
        <p className="auth-switch">
          {signup ? '이미 가입하셨나요?' : '아직 계정이 없으신가요?'}{' '}
          <a href={signup ? '#login' : '#signup'}>{signup ? '로그인' : '회원가입'}</a>
        </p>
      </div>
    </section>
  );
}
