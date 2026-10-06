import Icon from '../../shared/ui/Icon.jsx';

export default function AuthLayout({ type, title, description, children }) {
  return (
    <section className={'auth-page auth-experience auth-experience-' + type}>
      <a className="back-link" href="#home">
        <Icon name="arrow" size={17} /> 홈으로 돌아가기
      </a>
      <div className="auth-surface">
        <div className="auth-story" aria-hidden="true">
          <span className="auth-story-brand">복지나침반</span>
          <div className="auth-compass-art">
            <span className="auth-orbit auth-orbit-outer" />
            <span className="auth-orbit auth-orbit-inner" />
            <span className="auth-orbit-point" />
            <img src="/brand-logo.png" alt="" width="132" height="132" />
          </div>
          <p>
            나를 위한 복지,
            <br />
            조금 더 가까이.
          </p>
          <span className="auth-story-note">필요한 공고를 찾는 길에 함께할게요.</span>
        </div>
        <div className={'auth-card' + (type === 'signup' ? ' auth-card-signup' : '')}>
          <nav className="auth-route-nav" aria-label="계정 메뉴">
            <a href="#login" aria-current={type === 'login' ? 'page' : undefined}>
              로그인
            </a>
            <a href="#signup" aria-current={type === 'signup' ? 'page' : undefined}>
              회원가입
            </a>
          </nav>
          <header className="auth-heading">
            <h1>{title}</h1>
            <p>{description}</p>
          </header>
          {children}
        </div>
      </div>
    </section>
  );
}
