import { useEffect, useRef, useState } from 'react';
import { regions } from '../policies/policyModel.js';
import { authRequest } from './authApi.js';
import { genders, memberFieldError } from './authFields.js';

const regionOptions = regions.filter((region) => region !== '전국');
const draftOf = (user) => ({
  name: user.name || '',
  age: String(user.age),
  gender: user.gender,
  region: user.region,
});

export default function MemberProfileForm({ user, onSaved }) {
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
      required: true,
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
    for (const field of ['name', 'age', 'gender', 'region']) {
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
        { ...draft, age: Number(draft.age) },
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
      aria-label="회원 정보 수정"
      onSubmit={submit}
      noValidate
    >
      <div className="form-intro">
        <h2>회원 정보 수정</h2>
        <p>가입한 회원 정보를 한 화면에서 수정하고 저장해요.</p>
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
          <div>
            <label className="field-label" htmlFor="member-username">
              아이디
            </label>
            <input id="member-username" value={user.username || '카카오 계정'} readOnly />
            <small>
              {user.username ? '가입한 아이디는 변경할 수 없어요.' : '카카오로 가입한 계정이에요.'}
            </small>
          </div>
          <div>
            <label className="field-label" htmlFor="member-name">
              이름
            </label>
            <input {...props('name')} autoComplete="name" maxLength={50} />
          </div>
          <div>
            <label className="field-label" htmlFor="member-age">
              나이 (만 나이)
            </label>
            <input {...props('age')} type="number" inputMode="numeric" min={0} max={120} step={1} />
          </div>
          <div>
            <label className="field-label" htmlFor="member-gender">
              성별
            </label>
            <select {...props('gender')}>
              <option value="">선택해 주세요</option>
              {genders.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="member-region">
              회원 거주 지역
            </label>
            <select {...props('region')}>
              <option value="">선택해 주세요</option>
              {regionOptions.map((region) => (
                <option key={region}>{region}</option>
              ))}
            </select>
          </div>
        </div>
        <button type="submit" className="button primary">
          {busy ? '저장 중…' : '회원 정보 저장'}
        </button>
      </fieldset>
    </form>
  );
}
