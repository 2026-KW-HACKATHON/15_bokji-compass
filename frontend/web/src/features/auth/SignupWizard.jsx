import { useEffect, useRef, useState } from 'react';
import Icon from '../../shared/ui/Icon.jsx';
import { regions } from '../policies/policyModel.js';
import { authRequest } from './authApi.js';
import { emailError, genders, memberFieldError, normalizeEmail } from './authFields.js';
import PasswordInput from './PasswordInput.jsx';
import KakaoLogin, { kakaoOutcomeError } from './KakaoLogin.jsx';
import AuthLayout from './AuthLayout.jsx';
import PrivacyConsent from './PrivacyConsent.jsx';

const initialFields = {
  username: '',
  password: '',
  confirm_password: '',
  email: '',
  name: '',
  age: '',
  gender: '',
  region: '',
};
const stages = [
  'method',
  'username',
  'password',
  'confirm_password',
  'email',
  'name',
  'age',
  'gender',
  'region',
  'review',
];
const titles = {
  method: '가입 방법을 선택해 주세요',
  username: '사용할 아이디를 정해 주세요',
  password: '비밀번호를 만들어 주세요',
  confirm_password: '비밀번호를 한 번 더 입력해 주세요',
  email: '이메일을 인증해 주세요',
  name: '이름을 알려주세요',
  age: '만 나이를 알려주세요',
  gender: '성별을 선택해 주세요',
  region: '거주 지역을 선택해 주세요',
  review: '가입 정보를 확인해 주세요',
};
const regularGroups = ['아이디', '비밀번호', '이메일 인증', '기본 정보', '가입 확인'];
const regionOptions = regions.filter((region) => region !== '전국');

export default function SignupWizard({ outcome, easy }) {
  const [step, setStep] = useState('consent');
  const [consent, setConsent] = useState(null);
  const [fields, setFields] = useState(initialFields);
  const [checkedUsername, setCheckedUsername] = useState('');
  const [sentEmail, setSentEmail] = useState('');
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [code, setCode] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [expiresAt, setExpiresAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState('');
  const [kakaoBusy, setKakaoBusy] = useState(false);
  const [error, setError] = useState(() => kakaoOutcomeError(outcome));
  const [invalidField, setInvalidField] = useState('');
  const [message, setMessage] = useState('');
  const [complete, setComplete] = useState(false);
  const headingRef = useRef(null);
  const errorRef = useRef(null);
  const completeRef = useRef(null);
  const pending = useRef(null);
  const usernameChecked = checkedUsername === fields.username && Boolean(checkedUsername);
  const emailVerified =
    Boolean(verifiedEmail) && verifiedEmail === normalizeEmail(fields.email) && now < expiresAt;
  const resendSeconds = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const activeStages = consent?.profile
    ? stages
    : stages.filter((stage) => !['name', 'age', 'gender', 'region'].includes(stage));
  const groups = consent?.profile
    ? regularGroups
    : regularGroups.filter((label) => label !== '기본 정보');
  const group =
    step === 'review'
      ? groups.length - 1
      : ['name', 'age', 'gender', 'region'].includes(step)
        ? 3
        : step === 'email'
          ? 2
          : ['password', 'confirm_password'].includes(step)
            ? 1
            : 0;

  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    if (complete) completeRef.current?.focus();
  }, [complete]);

  function moveStep(next) {
    setError('');
    setInvalidField('');
    setMessage('');
    setStep(next);
  }
  function showError(text, field = '') {
    setError(text);
    setInvalidField(field);
    setMessage('');
    requestAnimationFrame(() => errorRef.current?.focus());
  }
  function inputProps(name) {
    return {
      id: 'signup-' + name,
      name,
      value: fields[name],
      required: !['name', 'age', 'gender', 'region'].includes(name),
      'aria-invalid': invalidField === name || undefined,
      'aria-describedby': invalidField === name ? 'signup-error' : undefined,
      onChange: (event) => {
        setFields((current) => ({ ...current, [name]: event.target.value }));
        if (name === 'username') setCheckedUsername('');
        if (name === 'email') {
          setVerifiedEmail('');
          setSentEmail('');
          setCode('');
        }
        setError('');
        setInvalidField('');
        setMessage('');
      },
    };
  }
  function validate(name) {
    if (['name', 'age', 'gender', 'region'].includes(name) && fields[name] === '') return '';
    if (name === 'email')
      return emailError(fields.email) || (!emailVerified ? '이메일 인증을 완료해 주세요.' : '');
    if (name === 'username' && !/^[a-zA-Z0-9_]{4,20}$/.test(fields.username))
      return '아이디는 영문, 숫자, 밑줄(_)을 사용해 4~20자로 입력해 주세요.';
    if (
      name === 'password' &&
      (fields.password.length < 8 ||
        fields.password.length > 128 ||
        !/[a-zA-Z]/.test(fields.password) ||
        !/[0-9]/.test(fields.password))
    )
      return '비밀번호는 영문과 숫자를 포함해 8~128자로 입력해 주세요.';
    if (name === 'confirm_password' && fields.password !== fields.confirm_password)
      return '비밀번호가 일치하지 않습니다. 다시 입력해 주세요.';
    if (['name', 'age', 'gender'].includes(name)) return memberFieldError(name, fields[name]);
    if (name === 'region' && !regionOptions.includes(fields.region))
      return '거주 지역을 선택해 주세요.';
    return '';
  }
  async function run(action, callback) {
    if (pending.current || kakaoBusy) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(action);
    setError('');
    setInvalidField('');
    setMessage('');
    const request = async (path, body) => {
      const result = await authRequest(path, body, { signal: controller.signal });
      if (controller.signal.aborted) throw new Error('요청이 취소됐습니다.');
      return result;
    };
    try {
      await callback(request);
    } catch (err) {
      if (!controller.signal.aborted) showError(err.message);
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy('');
    }
  }
  function checkUsername() {
    const issue = validate('username');
    if (issue) {
      showError(issue, 'username');
      return;
    }
    run('username', async (request) => {
      setCheckedUsername('');
      const result = await request('username/check', { username: fields.username });
      if (!result.available) {
        showError('이미 사용 중인 아이디예요. 다른 아이디를 입력해 주세요.', 'username');
        return;
      }
      setCheckedUsername(fields.username);
      setMessage('사용할 수 있는 아이디예요. 다음으로 진행해 주세요.');
    });
  }
  function sendEmailCode() {
    const issue = emailError(fields.email);
    if (issue) return showError(issue, 'email');
    run('email-send', async (request) => {
      const email = normalizeEmail(fields.email);
      const result = await request('email/request', { email });
      setVerifiedEmail('');
      setCode('');
      setSentEmail(email);
      setResendAt(Date.now() + result.resend_after * 1000);
      setExpiresAt(Date.now() + result.expires_in * 1000);
      setNow(Date.now());
      setMessage(result.message);
    });
  }
  function verifyEmailCode() {
    if (!/^[0-9]{6}$/.test(code)) return showError('6자리 인증번호를 입력해 주세요.', 'code');
    run('email-verify', async (request) => {
      const email = normalizeEmail(fields.email);
      const result = await request('email/verify', { email, code });
      setVerifiedEmail(email);
      setExpiresAt(Date.now() + result.expires_in * 1000);
      setNow(Date.now());
      setCode('');
      setMessage(result.message);
    });
  }
  function previous() {
    moveStep(activeStages[activeStages.indexOf(step) - 1]);
  }
  function submit(event) {
    event.preventDefault();
    if (busy || kakaoBusy) return;
    if (step === 'username' && !usernameChecked) {
      checkUsername();
      return;
    }
    if (step !== 'review') {
      const issue = validate(step);
      if (issue) showError(issue, step);
      else moveStep(activeStages[activeStages.indexOf(step) + 1]);
      return;
    }
    for (const name of activeStages.filter((stage) => !['method', 'review'].includes(stage))) {
      const issue = validate(name);
      if (issue || (name === 'username' && !usernameChecked)) {
        moveStep(name);
        showError(issue || '아이디 중복확인을 해주세요.', name);
        return;
      }
    }
    run('signup', async (request) => {
      try {
        const result = await request('signup', {
          ...fields,
          email: normalizeEmail(fields.email),
          name: consent.profile ? fields.name.trim() || null : null,
          age: consent.profile && fields.age !== '' ? Number(fields.age) : null,
          gender: consent.profile ? fields.gender || 'undisclosed' : 'undisclosed',
          region: consent.profile ? fields.region || null : null,
          consent,
        });
        setFields(initialFields);
        setMessage(result.message);
        setComplete(true);
      } catch (err) {
        if (err.status === 409) {
          setCheckedUsername('');
          moveStep('username');
        }
        if (err.status === 401) {
          setVerifiedEmail('');
          moveStep('email');
        }
        throw err;
      }
    });
  }
  const buttonText = step === 'review' ? '회원가입' : '다음';
  const submitDisabled =
    Boolean(busy) ||
    kakaoBusy ||
    (step === 'username' && !usernameChecked) ||
    (step === 'email' && !emailVerified);
  const kakaoMethod = step === 'method' && (
    <KakaoLogin
      busy={Boolean(busy) || kakaoBusy}
      onBusy={setKakaoBusy}
      onError={showError}
      label="카카오톡으로 로그인/회원가입하기"
    />
  );
  return (
    <AuthLayout
      type="signup"
      title="회원가입"
      description="개인정보 안내를 확인한 뒤 가입을 시작해요."
    >
      <div className="signup-page">
        {complete ? (
          <div ref={completeRef} tabIndex={-1}>
            <p role="status" className="notice-box">
              {message}
            </p>
            <a className="button primary full" href="#login">
              로그인하러 가기
            </a>
          </div>
        ) : step === 'consent' ? (
          <PrivacyConsent
            onAccept={(accepted) => {
              setConsent(accepted);
              moveStep('method');
            }}
          />
        ) : (
          <form onSubmit={submit} noValidate aria-label="회원가입 정보">
            {step !== 'method' && (
              <div className="signup-progress" aria-label="회원가입 단계">
                <p>
                  <span>
                    {group + 1} / {groups.length}단계
                  </span>
                  <strong>{groups[group]}</strong>
                </p>
                <progress aria-label="회원가입 진행" value={group + 1} max={groups.length} />
              </div>
            )}
            <h2 className="signup-step-title" ref={headingRef} tabIndex={-1}>
              {titles[step]}
            </h2>
            {error && (
              <p id="signup-error" role="alert" tabIndex={-1} ref={errorRef} className="auth-error">
                {error}
              </p>
            )}
            {message && (
              <p role="status" className="notice-box">
                {message}
              </p>
            )}
            {busy && (
              <p role="status">
                {
                  {
                    username: '아이디를 확인하는 중입니다…',
                    'email-send': '인증번호를 보내는 중입니다…',
                    'email-verify': '인증번호를 확인하는 중입니다…',
                    signup: '가입하는 중입니다…',
                  }[busy]
                }
              </p>
            )}
            {!easy && kakaoMethod}
            <fieldset className="auth-fields" disabled={Boolean(busy) || kakaoBusy}>
              {step === 'method' && (
                <div className="signup-methods">
                  <button
                    type="button"
                    className="signup-method"
                    onClick={() => moveStep('username')}
                  >
                    <Icon name="user" size={24} />
                    <span>
                      <strong>아이디로 회원가입</strong>
                      <small>아이디와 기본 정보를 입력해요</small>
                    </span>
                    <Icon name="right" />
                  </button>
                </div>
              )}
              {step === 'username' && (
                <>
                  <label className="field-label" htmlFor="signup-username">
                    아이디
                  </label>
                  <input
                    {...inputProps('username')}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={20}
                    aria-describedby={
                      invalidField === 'username' ? 'username-hint signup-error' : 'username-hint'
                    }
                  />
                  <small id="username-hint">
                    영문, 숫자, 밑줄(_) 4~20자. 대소문자는 구분하지 않습니다.
                  </small>
                  <button
                    className="button secondary full"
                    type="button"
                    onClick={checkUsername}
                    disabled={usernameChecked}
                  >
                    {usernameChecked ? '중복확인 완료' : '중복확인'}
                  </button>
                </>
              )}
              {['password', 'confirm_password'].includes(step) && (
                <PasswordInput
                  key={step}
                  {...inputProps(step)}
                  autoComplete="new-password"
                  label={step === 'password' ? '비밀번호' : '비밀번호 확인'}
                  hint={
                    step === 'password'
                      ? '영문과 숫자를 포함해 8~128자로 입력해 주세요.'
                      : '앞에서 입력한 비밀번호와 똑같이 입력해 주세요.'
                  }
                  aria-describedby={[
                    'signup-' + step + '-hint',
                    invalidField === step ? 'signup-error' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                />
              )}
              {step === 'name' && (
                <>
                  <label className="field-label" htmlFor="signup-name">
                    이름
                  </label>
                  <input {...inputProps('name')} autoComplete="name" maxLength={50} />
                  <small>실명을 입력하지 않아도 돼요. 표시할 이름만 알려주세요.</small>
                </>
              )}
              {step === 'email' && (
                <>
                  <label className="field-label" htmlFor="signup-email">
                    이메일
                  </label>
                  <input
                    {...inputProps('email')}
                    type="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={254}
                  />
                  <button
                    type="button"
                    className="button secondary full"
                    onClick={sendEmailCode}
                    disabled={resendSeconds > 0 || emailVerified}
                  >
                    {emailVerified
                      ? '이메일 인증 완료'
                      : resendSeconds > 0
                        ? `재발송까지 ${resendSeconds}초`
                        : sentEmail
                          ? '인증번호 다시 발송'
                          : '인증번호 발송'}
                  </button>
                  {sentEmail === normalizeEmail(fields.email) && !emailVerified && (
                    <>
                      <label className="field-label" htmlFor="signup-code">
                        이메일 인증번호
                      </label>
                      <input
                        id="signup-code"
                        name="code"
                        value={code}
                        onChange={(event) => {
                          setCode(event.target.value.replace(/[^0-9]/g, ''));
                          setError('');
                          setInvalidField('');
                        }}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        aria-invalid={invalidField === 'code' || undefined}
                        aria-describedby="email-code-hint"
                      />
                      <small id="email-code-hint">
                        메일로 받은 6자리 번호를 10분 안에 입력해 주세요. 메일이 보이지 않으면
                        스팸함도 확인해 주세요.
                      </small>
                      <button
                        type="button"
                        className="button secondary full"
                        onClick={verifyEmailCode}
                        disabled={now >= expiresAt}
                      >
                        인증번호 확인
                      </button>
                      {now >= expiresAt && (
                        <p role="status">인증 시간이 만료됐어요. 인증번호를 다시 발송해 주세요.</p>
                      )}
                    </>
                  )}
                  {emailVerified && (
                    <small>이메일 인증이 완료됐어요. 다음 단계로 진행해 주세요.</small>
                  )}
                </>
              )}
              {step === 'age' && (
                <>
                  <label className="field-label" htmlFor="signup-age">
                    나이 (만 나이)
                  </label>
                  <input
                    {...inputProps('age')}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={120}
                    step={1}
                  />
                  <small>만 나이를 0~120 사이의 숫자로 입력해 주세요.</small>
                </>
              )}
              {step === 'gender' && (
                <>
                  <label className="field-label" htmlFor="signup-gender">
                    성별
                  </label>
                  <select {...inputProps('gender')}>
                    <option value="">선택해 주세요</option>
                    {genders.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <small>원하지 않으면 ‘응답하지 않음’을 선택할 수 있어요.</small>
                </>
              )}
              {step === 'region' && (
                <>
                  <label className="field-label" htmlFor="signup-region">
                    거주 지역
                  </label>
                  <select {...inputProps('region')}>
                    <option value="">선택해 주세요</option>
                    {regionOptions.map((region) => (
                      <option key={region}>{region}</option>
                    ))}
                  </select>
                </>
              )}
              {step === 'review' && (
                <>
                  <dl className="signup-review">
                    {[
                      ['아이디', fields.username.toLowerCase()],
                      ['이메일', normalizeEmail(fields.email)],
                      ...(consent.profile
                        ? [
                            ['이름', fields.name.trim() || '입력하지 않음'],
                            ['만 나이', fields.age === '' ? '입력하지 않음' : `${fields.age}세`],
                            [
                              '성별',
                              genders.find(([value]) => value === fields.gender)?.[1] ||
                                '응답하지 않음',
                            ],
                            ['거주 지역', fields.region || '선택하지 않음'],
                          ]
                        : []),
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="auth-field-hint">수정할 내용이 있으면 이전 단계로 돌아가 주세요.</p>
                  <p className="auth-field-hint">
                    개인정보 수집·이용 동의를 확인했어요. 맞춤 정보:{' '}
                    {consent.profile ? '동의' : '동의하지 않음'} · 외부 AI 처리:{' '}
                    {consent.ai ? '동의' : '동의하지 않음'}
                  </p>
                  <button type="button" className="text-button" onClick={() => moveStep('consent')}>
                    개인정보 안내와 동의 다시 확인
                  </button>
                </>
              )}
              {step !== 'method' && (
                <div className="auth-step-actions">
                  {activeStages.indexOf(step) > 0 && (
                    <button type="button" className="button secondary" onClick={previous}>
                      이전
                    </button>
                  )}
                  {['name', 'age', 'gender', 'region'].includes(step) && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setFields((current) => ({
                          ...current,
                          [step]: step === 'gender' ? 'undisclosed' : '',
                        }));
                        moveStep(activeStages[activeStages.indexOf(step) + 1]);
                      }}
                    >
                      건너뛰기
                    </button>
                  )}
                  <button type="submit" className="button primary full" disabled={submitDisabled}>
                    {busy ? '처리 중…' : buttonText}
                  </button>
                </div>
              )}
            </fieldset>
            {easy && kakaoMethod}
          </form>
        )}
        {!complete && (
          <p className="auth-switch">
            이미 가입하셨나요? <a href="#login">로그인</a>
          </p>
        )}
      </div>
    </AuthLayout>
  );
}
