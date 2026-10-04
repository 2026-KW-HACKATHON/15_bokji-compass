import { useEffect, useRef, useState } from 'react';
import { regions } from '../policies/policyModel.js';
import { authRequest } from './authApi.js';
import { genders, memberFieldError } from './authFields.js';

const regionOptions = regions.filter((region) => region !== '전국');
const draftOf = (user) => ({
  name: user.name || '',
  age: user.age == null ? '' : String(user.age),
  gender: user.gender || 'undisclosed',
  region: user.region || '',
});

export default function MemberProfileForm({ user, onSaved, setup = false }) {
  const [draft, setDraft] = useState(() => draftOf(user));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [invalidField, setInvalidField] = useState('');
  const [message, setMessage] = useState('');
  const errorRef = useRef(null);
  const pending = useRef(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  function props(name) {
    return {
      id: 'member-' + name,
      name,
      value: draft[name],
      'aria-invalid': invalidField === name || undefined,
      'aria-describedby': invalidField === name ? 'member-error' : undefined,
      onChange: (event) => {
        setDraft((current) => ({ ...current, [name]: event.target.value }));
        setError('');
        setInvalidField('');
        setMessage('');
      },
    };
  }
  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    setMessage('');
    setError('');
    for (const field of setup ? ['age', 'region'] : ['name', 'age', 'gender', 'region']) {
      if (draft[field].trim() === '') continue;
      const issue =
        field === 'region'
          ? !regionOptions.includes(draft.region)
            ? '거주 지역을 선택해 주세요.'
            : ''
          : memberFieldError(field, draft[field]);
      if (issue) {
        setError(issue);
        setInvalidField(field);
        return;
      }
    }
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    try {
      const result = await authRequest(
        'profile',
        {
          ...(!setup ? { name: draft.name.trim() || null, gender: draft.gender } : {}),
          age: draft.age.trim() === '' ? null : Number(draft.age),
          region: draft.region || null,
        },
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) {
        setDraft(draftOf(result.user));
        onSaved(result.user);
        setMessage('회원 정보를 저장했어요.');
      }
    } catch (err) {
      if (!controller.signal.aborted) setError(err.message);
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <form
      className="profile-form member-profile-form"
      aria-label={setup ? '맞춤 정보 설정' : '회원 정보 수정'}
      onSubmit={submit}
      noValidate
    >
      <div className="form-intro">
        <h2>{setup ? '맞춤 복지 정보를 설정할까요?' : '회원 정보 수정'}</h2>
        <p>
          {setup
            ? '나이와 지역을 알려주시면 관련 공고 추천과 질문 답변에 참고해요. 모두 선택 사항이에요.'
            : '모두 선택 사항이에요. 나이와 지역은 복지 안내에 참고하고, 비워 두면 기본 안내를 제공해요.'}
        </p>
      </div>
      {error && (
        <p role="alert" ref={errorRef} tabIndex={-1} id="member-error" className="auth-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="notice-box">
          {message}
        </p>
      )}
      <fieldset className="auth-fields" disabled={busy}>
        <div className="auth-grid">
          {!setup && (
            <div>
              <label className="field-label" htmlFor="member-username">
                아이디
              </label>
              <input id="member-username" value={user.username || '카카오 계정'} readOnly />
              <small>
                {user.username
                  ? '가입한 아이디는 변경할 수 없어요.'
                  : '카카오로 가입한 계정이에요.'}
              </small>
            </div>
          )}
          {!setup && (
            <div>
              <label className="field-label" htmlFor="member-name">
                이름
              </label>
              <input {...props('name')} autoComplete="name" maxLength={50} />
              <small>화면에 표시할 이름이에요. 실명을 입력하지 않아도 돼요.</small>
            </div>
          )}
          <div>
            <label className="field-label" htmlFor="member-region">
              {setup ? '거주 지역' : '회원 거주 지역'}
            </label>
            <select {...props('region')}>
              <option value="">선택하지 않음</option>
              {regionOptions.map((region) => (
                <option key={region}>{region}</option>
              ))}
            </select>
            <small>지역별 공고를 찾고 질문에 답할 때 참고해요.</small>
          </div>
          <div>
            <label className="field-label" htmlFor="member-age">
              나이 (만 나이)
            </label>
            <input {...props('age')} type="number" inputMode="numeric" min={0} max={120} step={1} />
            <small>연령 조건이 있는 복지 정보를 안내할 때 참고해요.</small>
          </div>
          {!setup && (
            <div>
              <label className="field-label" htmlFor="member-gender">
                성별
              </label>
              <select {...props('gender')}>
                {genders.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <small>원하지 않으면 ‘응답하지 않음’을 선택할 수 있어요.</small>
            </div>
          )}
        </div>
        <button type="submit" className="button primary">
          {busy ? '저장 중…' : setup ? '저장하고 시작하기' : '회원 정보 저장'}
        </button>
        {setup && (
          <a className="text-button" href="#home">
            나중에 하기
          </a>
        )}
      </fieldset>
    </form>
  );
}
