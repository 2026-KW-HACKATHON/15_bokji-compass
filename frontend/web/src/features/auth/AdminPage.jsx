import { useEffect, useState } from 'react';
import { authRequest } from './authApi.js';
import PolicyPublication from './PolicyPublication.jsx';

const request = (body, signal) => authRequest('accounts', body, { scope: 'admin', signal });

export default function AdminPage({ user }) {
  const [items, setItems] = useState([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const permitted = user?.admin_role === 'superadmin';
  useEffect(() => {
    const controller = new AbortController();
    setReady(false);
    setItems([]);
    if (permitted)
      request(undefined, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) {
            setItems(data.items);
            setReady(true);
          }
        })
        .catch((err) => {
          if (!controller.signal.aborted) setError(err.message);
        });
    return () => controller.abort();
  }, [permitted, user?.id, revision]);
  async function create(event) {
    event.preventDefault();
    if (busy || !ready) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const data = await request(Object.fromEntries(values));
      form.reset();
      setMessage(`${data.username} QR 관리자를 만들었습니다.`);
      setRevision((value) => value + 1);
    } catch (err) {
      setError(err.message);
      form.elements.password.value = '';
      form.elements.confirm_password.value = '';
      if ([401, 403].includes(err.status)) {
        setReady(false);
        setItems([]);
      }
    } finally {
      setBusy(false);
    }
  }
  if (!permitted)
    return (
      <section className="profile-page">
        <h1>관리자 관리</h1>
        <p>최고 관리자 계정으로 로그인해 주세요.</p>
        <a className="text-button" href="#login">
          로그인 화면
        </a>
      </section>
    );
  return (
    <section className="profile-page">
      <div className="page-heading">
        <span className="eyebrow">최고 관리자 전용</span>
        <h1>관리자 관리</h1>
        <p>
          하위 관리자는 전시 QR 페이지를 이용할 수 있습니다. 관리자 생성과 데이터베이스 관리 권한은
          없습니다.
        </p>
        <a className="text-button" href="/admin/exhibition/">
          전시 QR 관리 열기
        </a>
      </div>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <PolicyPublication />
      <form className="auth-form" onSubmit={create}>
        <h2>QR 관리자 만들기</h2>
        <fieldset
          disabled={!ready || busy}
          style={{ border: 0, padding: 0, display: 'grid', gap: '16px', minWidth: 0 }}
        >
          <label className="field-label" htmlFor="admin-username">
            로그인 아이디
            <input
              id="admin-username"
              name="username"
              autoComplete="off"
              pattern="[a-z0-9_]{4,20}"
              minLength={4}
              maxLength={20}
              required
            />
          </label>
          <small>영문 소문자, 숫자, 밑줄로 4~20자</small>
          <label className="field-label" htmlFor="admin-password">
            비밀번호
            <input
              id="admin-password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
          </label>
          <small>영문과 숫자를 포함해 12~128자</small>
          <label className="field-label" htmlFor="admin-confirm">
            비밀번호 확인
            <input
              id="admin-confirm"
              name="confirm_password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
          </label>
          <button className="button primary" type="submit">
            {busy ? '생성 중…' : 'QR 관리자 생성'}
          </button>
        </fieldset>
      </form>
      {ready && (
        <section style={{ marginTop: '32px' }}>
          <h2>관리자 목록</h2>
          <ul>
            {items.map((item) => (
              <li key={item.username}>
                {item.username} · {item.role === 'superadmin' ? '최고 관리자' : 'QR 관리자'}
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
