import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import Icon from '../../shared/ui/Icon.jsx';
import { regions } from '../policies/policyModel.js';
import { authRequest } from './authApi.js';

const steps = ['계정 만들기', '기본 정보', '전화번호 인증'];
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
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [proof, setProof] = useState(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [invalidField, setInvalidField] = useState('');
  const [complete, setComplete] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [retryAt, setRetryAt] = useState(0);
  const errorRef = useRef(null);
  const headings = useRef([]);
  const codeRef = useRef(null);
  const formRef = useRef(null);
  const completeRef = useRef(null);
  useEffect(() => {
    if (!signup) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [signup]);
  useEffect(() => {
    if (complete) completeRef.current?.focus();
  }, [complete]);
  const verified = Boolean(proof && proof.expiresAt > now);
  const codeActive = Boolean(challenge && challenge.expiresAt > now);
  const retrySeconds = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const secondsLeft = Math.max(
    0,
    Math.ceil(((proof?.expiresAt || challenge?.expiresAt || 0) - now) / 1000),
  );
  const normalizedPhone = phone.replace(/[\s-]/g, '');

  function showError(text, field = '', section = step) {
    setError(text);
    setInvalidField(field);
    setMessage('');
    if (signup && easy) setStep(section);
    requestAnimationFrame(() => {
      errorRef.current?.focus();
      errorRef.current?.scrollIntoView({ block: 'nearest' });
    });
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
    if (section === 2 && !/^010[0-9]{8}$/.test(normalizedPhone))
      return ['010으로 시작하는 휴대전화 번호 11자리를 입력해 주세요.', 'phone'];
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
  function requestCode() {
    setStep(2);
    const issue = validate(2);
    if (issue) {
      showError(...issue, 2);
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
          ? '시험용 인증번호를 아래에서 확인해 주세요. 실제 문자는 발송되지 않습니다.'
          : '문자로 받은 인증번호를 입력해 주세요.',
      );
      requestAnimationFrame(() => codeRef.current?.focus());
    });
  }
  function verifyCode() {
    setStep(2);
    if (!codeActive) {
      showError('인증 시간이 지났습니다. 인증번호를 다시 받아 주세요.', 'code', 2);
      return;
    }
    if (!/^[0-9]{6}$/.test(code)) {
      showError('인증번호 6자리를 입력해 주세요.', 'code', 2);
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
      setNow(Date.now());
      setCode('');
      setMessage('전화번호를 확인했습니다. 5분 안에 회원가입 버튼을 눌러 주세요.');
      requestAnimationFrame(() => formRef.current?.querySelector('[data-auth-submit]')?.focus());
    });
  }
  function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (signup && easy && step < 2) {
      const issue = validate(step);
      if (issue) showError(...issue, step);
      else moveStep(step + 1);
      return;
    }
    for (const section of signup ? [0, 1, 2] : [0]) {
      const issue = validate(section);
      if (issue) {
        showError(...issue, section);
        return;
      }
    }
    if (signup && !verified) {
      showError('전화번호 인증을 먼저 완료해 주세요.', 'phone', 2);
      return;
    }
    run('submit', async () => {
      if (signup) {
        const result = await authRequest('signup', {
          ...fields,
          age: Number(fields.age),
          phone: normalizedPhone,
          verification_token: proof.token,
        });
        setComplete(true);
        setProof(null);
        setChallenge(null);
        setPhone('');
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
            ? '계정 정보와 전화번호를 확인하면 가입이 완료됩니다.'
            : '아이디와 비밀번호를 입력해 주세요.'}
        </p>
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
            {signup && easy && (
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
                  {busy === 'request'
                    ? '인증번호를 보내는 중입니다…'
                    : busy === 'verify'
                      ? '인증번호를 확인하는 중입니다…'
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
                hidden={signup && easy && step !== 0}
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
                  <section
                    className="auth-section"
                    hidden={easy && step !== 2}
                    aria-labelledby="auth-step-2"
                  >
                    {sectionHeading(2, '휴대전화로 받은 인증번호를 입력해 주세요.')}
                    <label className="field-label" htmlFor="auth-phone">
                      전화번호
                    </label>
                    <input
                      id="auth-phone"
                      type="tel"
                      name="phone"
                      autoComplete="tel-national"
                      required
                      maxLength={20}
                      placeholder="010-1234-5678"
                      value={phone}
                      aria-invalid={invalidField === 'phone' || undefined}
                      aria-describedby={invalidField === 'phone' ? 'auth-error' : undefined}
                      onChange={(event) => {
                        setPhone(event.target.value);
                        setChallenge(null);
                        setProof(null);
                        setCode('');
                        setMessage('');
                        setError('');
                        setInvalidField('');
                      }}
                    />
                    <div className="auth-phone-actions">
                      <button
                        className="button secondary full"
                        type="button"
                        onClick={requestCode}
                        disabled={retrySeconds > 0 || verified}
                      >
                        {verified
                          ? '전화번호 인증 완료'
                          : retrySeconds > 0
                            ? retrySeconds + '초 후 다시 받기'
                            : challenge
                              ? '인증번호 다시 받기'
                              : '인증번호 받기'}
                      </button>
                    </div>
                    {challenge && !verified && (
                      <div className="auth-verification">
                        {challenge.development_code && (
                          <p className="notice-box">
                            개발용 인증번호: <strong>{challenge.development_code}</strong>
                            <br />
                            실제 문자는 발송되지 않습니다.
                          </p>
                        )}
                        <label className="field-label" htmlFor="auth-code">
                          문자 인증번호
                        </label>
                        <input
                          ref={codeRef}
                          id="auth-code"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          value={code}
                          onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                          placeholder="6자리 인증번호"
                          aria-invalid={invalidField === 'code' || undefined}
                          aria-describedby={invalidField === 'code' ? 'auth-error' : undefined}
                        />
                        <button
                          className="button secondary full"
                          type="button"
                          onClick={verifyCode}
                          disabled={!codeActive || code.length !== 6}
                        >
                          인증번호 확인
                        </button>
                      </div>
                    )}
                    {verified && (
                      <p className="auth-verified">
                        <Icon name="check" size={20} /> 전화번호를 확인했습니다.
                      </p>
                    )}
                    {challenge && (
                      <p className="auth-timer">
                        {secondsLeft > 0
                          ? (verified ? '가입 완료까지 ' : '인증번호 입력까지 ') +
                            Math.floor(secondsLeft / 60) +
                            '분 ' +
                            (secondsLeft % 60) +
                            '초 남았습니다.'
                          : '인증 시간이 지났습니다. 인증번호를 다시 받아 주세요.'}
                      </p>
                    )}
                    {!verified && (
                      <small className="auth-field-hint">
                        전화번호 인증을 마치면 회원가입 버튼을 누를 수 있습니다.
                      </small>
                    )}
                  </section>
                </>
              )}
              <div className="auth-step-actions">
                {signup && easy && step > 0 && (
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
                  disabled={signup && (!easy || step === 2) && !verified}
                >
                  {busy === 'submit'
                    ? '처리 중…'
                    : signup && easy && step < 2
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
