import Icon from '../../shared/ui/Icon.jsx';
export default function AuthPage({ type }) {
  const signup = type === 'signup';
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
        <form onSubmit={(event) => event.preventDefault()} aria-describedby="auth-status">
          <label className="field-label">
            이메일
            <input
              type="email"
              name="email"
              autoComplete="email"
              placeholder="이메일 주소를 입력해 주세요"
            />
          </label>
          <label className="field-label">
            비밀번호
            <input
              type="password"
              name="password"
              autoComplete={signup ? 'new-password' : 'current-password'}
              placeholder="비밀번호를 입력해 주세요"
            />
          </label>
          {signup && (
            <label className="field-label">
              비밀번호 확인
              <input
                type="password"
                name="confirmPassword"
                autoComplete="new-password"
                placeholder="비밀번호를 한 번 더 입력해 주세요"
              />
            </label>
          )}
          <button className="button primary full" type="submit" disabled>
            {signup ? '회원가입' : '로그인'}
          </button>
          <p id="auth-status" className="notice-box">
            인증 기능은 준비 중이에요. 입력한 정보는 저장하거나 전송하지 않습니다.
          </p>
        </form>
        <p className="auth-switch">
          {signup ? '이미 계정이 있으신가요?' : '처음 오셨나요?'}{' '}
          <a href={signup ? '#login' : '#signup'}>{signup ? '로그인' : '회원가입'}</a>
        </p>
      </div>
    </section>
  );
}
