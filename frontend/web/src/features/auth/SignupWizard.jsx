import { useEffect, useRef, useState } from 'react';
import Icon from '../../shared/ui/Icon.jsx';
import { regions } from '../policies/policyModel.js';
import { authRequest } from './authApi.js';
import { genders, memberFieldError } from './authFields.js';
import PasswordInput from './PasswordInput.jsx';
import KakaoLogin, { kakaoOutcomeError } from './KakaoLogin.jsx';

const initialFields = {
  username: '',
  password: '',
  confirm_password: '',
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
  name: '이름을 알려주세요',
  age: '만 나이를 알려주세요',
  gender: '성별을 선택해 주세요',
  region: '거주 지역을 선택해 주세요',
  review: '가입 정보를 확인해 주세요',
};
const regularGroups = ['아이디', '비밀번호', '기본 정보', '가입 확인'];
const regionOptions = regions.filter((region) => region !== '전국');

export default function SignupWizard({ kakaoComplete = false, onLogin, outcome }) {
  const [step, setStep] = useState(kakaoComplete ? 'name' : 'method');
  const [fields, setFields] = useState(initialFields);
  const [checkedUsername, setCheckedUsername] = useState('');
  const [busy, setBusy] = useState('');
  const [kakaoBusy, setKakaoBusy] = useState(false);
  const [pendingReady, setPendingReady] = useState(!kakaoComplete);
  const [error, setError] = useState(() => kakaoOutcomeError(outcome));
  const [invalidField, setInvalidField] = useState('');
  const [message, setMessage] = useState('');
  const [complete, setComplete] = useState(false);
  const headingRef = useRef(null);
  const errorRef = useRef(null);
  const completeRef = useRef(null);
  const pending = useRef(null);
  const usernameChecked = checkedUsername === fields.username && Boolean(checkedUsername);
  const activeStages = kakaoComplete ? stages.slice(stages.indexOf('name')) : stages;
  const groups = kakaoComplete ? ['기본 정보', '가입 확인'] : regularGroups;
  const group = kakaoComplete
    ? step === 'review'
      ? 1
      : 0
    : step === 'review'
      ? 3
      : ['name', 'age', 'gender', 'region'].includes(step)
        ? 2
        : ['password', 'confirm_password'].includes(step)
          ? 1
          : 0;

  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (!kakaoComplete) return;
    const controller = new AbortController();
    authRequest('kakao/pending', undefined, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setFields((current) => ({ ...current, name: result.name || '' }));
          setPendingReady(true);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      });
    return () => controller.abort();
  }, [kakaoComplete]);
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
      required: true,
      'aria-invalid': invalidField === name || undefined,
      'aria-describedby': invalidField === name ? 'signup-error' : undefined,
      onChange: (event) => {
        setFields((current) => ({ ...current, [name]: event.target.value }));
        if (name === 'username') setCheckedUsername('');
        setError('');
        setInvalidField('');
        setMessage('');
      },
    };
  }
  function validate(name) {
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
  function previous() {
    moveStep(activeStages[activeStages.indexOf(step) - 1]);
  }
  function submit(event) {
    event.preventDefault();
    if (busy || kakaoBusy || !pendingReady) return;
    if (step === 'username' && !usernameChecked) {
      checkUsername();
      return;
    }
    if (step !== 'review') {
      const issue = validate(step);
      if (issue) showError(issue, step);
      else moveStep(stages[stages.indexOf(step) + 1]);
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
        if (kakaoComplete) {
          const result = await request('kakao/complete', {
            name: fields.name,
            age: Number(fields.age),
            gender: fields.gender,
            region: fields.region,
          });
          onLogin(result.user);
          return;
        }
        const result = await request('signup', { ...fields, age: Number(fields.age) });
        setFields(initialFields);
        setMessage(result.message);
        setComplete(true);
      } catch (err) {
        if (!kakaoComplete && err.status === 409) {
          setCheckedUsername('');
          moveStep('username');
        }
        if (kakaoComplete && err.status === 401) setPendingReady(false);
        throw err;
      }
    });
  }
  const buttonText = step === 'review' ? '회원가입' : '다음';
  const submitDisabled =
    Boolean(busy) || kakaoBusy || !pendingReady || (step === 'username' && !usernameChecked);
  return (
    <section className="auth-page signup-page">
      <a className="back-link" href="#home">
        ← 홈으로 돌아가기
      </a>
      <div className="auth-card auth-card-signup">
        <span className="round-icon">
          <Icon name="user" size={28} />
        </span>
        <h1>회원가입</h1>
        <p>
          {kakaoComplete
            ? '카카오 인증이 완료됐어요. 기본 정보를 한 단계씩 입력해 주세요.'
            : '한 단계씩 입력하면 가입이 완료돼요.'}
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
                {busy === 'username' ? '아이디를 확인하는 중입니다…' : '가입하는 중입니다…'}
              </p>
            )}
            {(step === 'method' || kakaoComplete) && (
              <KakaoLogin
                busy={Boolean(busy) || kakaoBusy}
                onBusy={setKakaoBusy}
                onError={showError}
                label={
                  kakaoComplete ? '다른 카카오 계정으로 로그인' : '카카오톡으로 로그인/회원가입하기'
                }
              />
            )}
            <fieldset
              className="auth-fields"
              disabled={Boolean(busy) || kakaoBusy || !pendingReady}
            >
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
                      ...(!kakaoComplete ? [['아이디', fields.username.toLowerCase()]] : []),
                      ['이름', fields.name.trim()],
                      ['만 나이', `${fields.age}세`],
                      ['성별', genders.find(([value]) => value === fields.gender)?.[1]],
                      ['거주 지역', fields.region],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="auth-field-hint">수정할 내용이 있으면 이전 단계로 돌아가 주세요.</p>
                </>
              )}
              {step !== 'method' && (
                <div className="auth-step-actions">
                  {activeStages.indexOf(step) > 0 && (
                    <button type="button" className="button secondary" onClick={previous}>
                      이전
                    </button>
                  )}
                  <button type="submit" className="button primary full" disabled={submitDisabled}>
                    {busy ? '처리 중…' : buttonText}
                  </button>
                </div>
              )}
            </fieldset>
          </form>
        )}
        {!complete && (
          <p className="auth-switch">
            이미 가입하셨나요? <a href="#login">로그인</a>
          </p>
        )}
      </div>
    </section>
  );
}
