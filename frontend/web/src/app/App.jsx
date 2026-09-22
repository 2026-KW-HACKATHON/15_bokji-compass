import { useEffect, useState } from 'react';
import { categories, regions } from '../features/policies/demoPolicies.js';
import { filterPolicies, listPolicies } from '../features/policies/policyRepository.js';
import PolicyCard from '../features/policies/PolicyCard.jsx';
import ProfileForm from '../features/profile/ProfileForm.jsx';
import { defaultProfile, isProfile } from '../features/profile/profileModel.js';
import { readStoredValue, writeStoredValue } from '../shared/storage.js';
import { checkHealth } from '../shared/api/client.js';
import Icon from '../shared/ui/Icon.jsx';
import Modal from '../shared/ui/Modal.jsx';

const navigation = [
  { id: 'home', label: '홈', icon: 'house' },
  { id: 'explore', label: '혜택 둘러보기', icon: 'grid' },
  { id: 'saved', label: '관심 혜택', icon: 'bookmark' },
  { id: 'profile', label: '내 프로필', icon: 'user' },
];
const categoryIcons = ['grid', 'wallet', 'house', 'briefcase', 'book', 'heart', 'ticket'];
const savedKey = 'bokji.saved.v1';
const profileKey = 'bokji.profile.v1';
const pageFromHash = () =>
  navigation.some((item) => item.id === window.location.hash.slice(1))
    ? window.location.hash.slice(1)
    : 'home';

export default function App() {
  const [page, setPage] = useState(pageFromHash);
  const [policies, setPolicies] = useState([]);
  const [loadState, setLoadState] = useState('loading');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('전체');
  const [region, setRegion] = useState('전국');
  const [audience, setAudience] = useState('전체');
  const [sort, setSort] = useState('recent');
  const [saved, setSaved] = useState(() =>
    readStoredValue(
      savedKey,
      [],
      (value) => Array.isArray(value) && value.every((id) => typeof id === 'string'),
    ),
  );
  const [profile, setProfile] = useState(() =>
    readStoredValue(profileKey, defaultProfile, isProfile),
  );
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [health, setHealth] = useState('');

  const load = async () => {
    setLoadState('loading');
    try {
      const result = await listPolicies();
      setPolicies(result.items);
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  };
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    const update = () => {
      setPage(pageFromHash());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(''), 3500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const resetFilters = () => {
    setQuery('');
    setCategory('전체');
    setRegion('전국');
    setAudience('전체');
    setSort('recent');
  };
  const navigate = (next) => {
    resetFilters();
    setPage(next);
    window.location.hash = next;
    window.scrollTo({ top: 0 });
  };
  const savePolicy = (id) => {
    const exists = saved.includes(id);
    const next = exists ? saved.filter((value) => value !== id) : [...saved, id];
    setSaved(next);
    setToast(
      writeStoredValue(savedKey, next)
        ? exists
          ? '관심 혜택에서 해제했어요.'
          : '관심 혜택에 저장했어요.'
        : '브라우저 저장 공간을 사용할 수 없어 이번 화면에서만 유지돼요.',
    );
  };
  const saveProfile = (next) => {
    setProfile(next);
    setModal(null);
    setToast(
      writeStoredValue(profileKey, next)
        ? '내 탐색 설정을 저장했어요.'
        : '브라우저 저장 공간을 사용할 수 없어 이번 화면에서만 유지돼요.',
    );
  };
  const useProfile = () => {
    navigate('explore');
    setRegion(profile.region);
    setCategory(profile.interests[0] || '전체');
  };
  const visiblePolicies = filterPolicies(policies, {
    query,
    category,
    region,
    audience,
    sort,
    savedIds: page === 'saved' ? saved : null,
  });
  const activeFilters = query || category !== '전체' || region !== '전국' || audience !== '전체';
  const savedCount = policies.filter((policy) => saved.includes(policy.id)).length;

  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content').focus();
        }}
      >
        본문으로 바로가기
      </a>
      <aside className="sidebar">
        <a className="brand" href="#home" onClick={() => navigate('home')}>
          <span className="brand-mark">
            <img className="brand-image" src="/brand-logo.png" alt="" />
          </span>
          <span>
            복지나침반<small>나를 위한 혜택의 방향</small>
          </span>
        </a>
        <div className="nav-caption">MY COMPASS</div>
        <nav aria-label="주 탐색">
          {navigation.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              aria-current={page === item.id ? 'page' : undefined}
              onClick={() => navigate(item.id)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.id === 'saved' && savedCount > 0 && (
                <span className="nav-count">{savedCount}</span>
              )}
              {page === item.id && <span className="nav-dot" />}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="little-spark">
              <Icon name="sparkles" size={20} />
            </span>
            <strong>
              몰랐던 혜택을,
              <br />내 일상 가까이.
            </strong>
            <p>
              복잡한 복지 정보 속에서
              <br />
              나에게 필요한 길을 찾아요.
            </p>
          </div>
          <button className="help-button" onClick={() => setModal('guide')}>
            <Icon name="help" size={19} />
            복지나침반 이용 가이드
            <Icon name="external" size={16} />
          </button>
          <span className="sidebar-version">BOKJI COMPASS · PREVIEW</span>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <span className="desktop-caption">나를 위한 복지 안내</span>
            <span className="mobile-brand">
              <img className="mobile-brand-image" src="/brand-logo.png" alt="" />
              복지나침반
            </span>{' '}
            <span className="breadcrumb-divider">/</span>{' '}
            <strong>{navigation.find((item) => item.id === page)?.label}</strong>
          </div>
          <div className="header-actions">
            <span className="preview-badge">
              <span />
              체험 버전
            </span>
            <button
              className="avatar"
              aria-label="내 프로필 열기"
              onClick={() => navigate('profile')}
            >
              <Icon name="user" size={20} />
            </button>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          {page === 'home' && (
            <section className="hero">
              <div className="hero-copy">
                <span className="eyebrow">
                  <span />
                  당신의 일상에, 든든한 방향
                </span>
                <h1>
                  나에게 필요한 혜택,
                  <br />
                  <em>여기서부터 찾아보세요.</em>
                </h1>
                <p>
                  복잡하고 흩어져 있던 복지 정보.
                  <br />
                  복지나침반과 함께 한 걸음씩 알아가요.
                </p>
                <button className="button primary" onClick={() => setModal('profile')}>
                  내 관심사 설정하기
                  <Icon name="arrow" size={18} />
                </button>
                <span className="hero-footnote">관심 지역과 분야로 가볍게 시작하세요</span>
              </div>
              <img className="hero-brand-image" src="/brand-logo.png" alt="사람과 하트를 감싸는 복지나침반 로고" />
              <span className="hero-coordinate">YOUR EVERYDAY COMPASS ↗</span>
            </section>
          )}

          {page === 'profile' ? (
            <>
              <div className="page-heading">
                <span className="eyebrow">MY PROFILE</span>
                <h1>내게 맞는 탐색의 시작</h1>
                <p>관심 지역과 분야를 설정하고, 필요한 정보를 찾아보세요.</p>
              </div>
              <div className="profile-page">
                <section className="surface">
                  <div className="section-heading">
                    <h2>내 탐색 설정</h2>
                    <span className="soft-badge">이 기기에 저장</span>
                  </div>
                  <ProfileForm
                    key={JSON.stringify(profile)}
                    profile={profile}
                    onSave={saveProfile}
                  />
                </section>
                <section className="profile-explainer">
                  <span className="round-icon">
                    <Icon name="shield" size={26} />
                  </span>
                  <h2>필요한 정보만, 가볍게.</h2>
                  <p>
                    이 시작 버전에서는 이름, 주민등록번호, 소득 등의 개인정보를 수집하지 않아요.
                  </p>
                  <p>
                    설정한 관심사는 탐색 필터에만 사용해요. 실제 지원 대상 여부는 각 사업의 공식
                    안내를 확인해야 합니다.
                  </p>
                  <button className="text-button" onClick={useProfile}>
                    내 설정으로 둘러보기
                    <Icon name="arrow" size={17} />
                  </button>
                </section>
              </div>
            </>
          ) : (
            <>
              {page !== 'home' && (
                <div className="page-heading">
                  <span className="eyebrow">
                    {page === 'saved' ? 'MY COLLECTION' : 'EXPLORE BENEFITS'}
                  </span>
                  <h1>
                    {page === 'saved'
                      ? '관심 가는 혜택을 한곳에'
                      : '오늘, 필요한 혜택을 발견하세요'}
                  </h1>
                  <p>
                    {page === 'saved'
                      ? '저장한 혜택을 다시 살펴보세요. 이 브라우저에서만 보관됩니다.'
                      : '지역과 관심 분야를 선택해 나에게 필요한 정보를 찾아보세요.'}
                  </p>
                </div>
              )}
              <section className="explore-section" aria-labelledby="explore-title">
                <div className="section-heading">
                  <div>
                    <h2 id="explore-title">
                      {page === 'saved' ? '저장한 혜택' : '어떤 도움이 필요하세요?'}
                      {page !== 'saved' && <span className="heading-dot" />}
                    </h2>
                    <p>
                      {page === 'saved'
                        ? '다시 보고 싶은 정보를 차곡차곡 모아보세요.'
                        : '관심 있는 분야부터 천천히 둘러보세요.'}
                    </p>
                  </div>
                  <span className="section-note">일상에 필요한 작은 발견</span>
                </div>
                <div className="category-list" aria-label="혜택 분야">
                  {categories.map((item, index) => (
                    <button
                      key={item}
                      className={`category-button ${category === item ? 'selected' : ''}`}
                      aria-pressed={category === item}
                      onClick={() => setCategory(item)}
                    >
                      <span>
                        <Icon name={categoryIcons[index]} size={23} />
                      </span>
                      {item}
                    </button>
                  ))}
                </div>
                <div className="search-controls">
                  <label className="search-field">
                    <Icon name="search" size={21} />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="어떤 혜택을 찾으세요? 키워드로 검색해 보세요"
                      aria-label="혜택 검색"
                    />
                    {query && (
                      <button
                        className="icon-button"
                        aria-label="검색어 지우기"
                        onClick={() => setQuery('')}
                      >
                        <Icon name="x" size={17} />
                      </button>
                    )}
                  </label>
                  <label className="select-field">
                    <Icon name="pin" size={18} />
                    <select
                      aria-label="지역"
                      value={region}
                      onChange={(event) => setRegion(event.target.value)}
                    >
                      {regions.map((item) => (
                        <option key={item} value={item}>
                          {item === '전국' ? '전국 · 모든 지역' : item}
                        </option>
                      ))}
                    </select>
                    <Icon name="down" size={16} />
                  </label>
                  <label className="select-field">
                    <Icon name="users" size={18} />
                    <select
                      aria-label="대상"
                      value={audience}
                      onChange={(event) => setAudience(event.target.value)}
                    >
                      {['전체', '청년', '가족', '어르신'].map((item) => (
                        <option key={item} value={item}>
                          {item === '전체' ? '모든 대상' : item}
                        </option>
                      ))}
                    </select>
                    <Icon name="down" size={16} />
                  </label>
                </div>
              </section>

              <div className="content-layout">
                <section className="results-section" aria-label="혜택 목록">
                  <div className="results-heading">
                    <h2>
                      {page === 'saved' ? '관심 혜택' : '둘러볼 만한 혜택'}{' '}
                      <span aria-live="polite">{visiblePolicies.length}</span>
                    </h2>
                    <div className="results-tools">
                      {activeFilters && (
                        <button className="reset-button" onClick={resetFilters}>
                          초기화
                        </button>
                      )}
                      <select
                        aria-label="정렬"
                        value={sort}
                        onChange={(event) => setSort(event.target.value)}
                      >
                        <option value="recent">최근 등록순</option>
                        <option value="name">이름순</option>
                      </select>
                    </div>
                  </div>
                  <div className="demo-note">
                    <Icon name="info" size={15} />
                    <span>화면 체험을 위한 예시 혜택입니다. 실제 정책·모집 정보가 아닙니다.</span>
                  </div>
                  {loadState === 'loading' ? (
                    <div className="empty-state" role="status">
                      혜택을 불러오고 있어요…
                    </div>
                  ) : loadState === 'error' ? (
                    <div className="empty-state" role="alert">
                      <h3>혜택을 불러오지 못했어요</h3>
                      <button className="button primary" onClick={load}>
                        다시 시도하기
                      </button>
                    </div>
                  ) : visiblePolicies.length ? (
                    <div className="policy-grid">
                      {visiblePolicies.map((policy) => (
                        <PolicyCard
                          key={policy.id}
                          policy={policy}
                          saved={saved.includes(policy.id)}
                          onSave={savePolicy}
                          onOpen={setModal}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">
                      <span className="round-icon">
                        <Icon name={page === 'saved' ? 'bookmark' : 'search'} size={28} />
                      </span>
                      <h3>
                        {page === 'saved' && savedCount === 0
                          ? '아직 저장한 혜택이 없어요'
                          : '검색 조건에 맞는 혜택이 없어요'}
                      </h3>
                      <p>
                        {page === 'saved' && savedCount === 0
                          ? '마음에 드는 혜택의 북마크를 눌러 모아보세요.'
                          : '다른 검색어를 입력하거나 필터를 변경해 보세요.'}
                      </p>
                      <button
                        className="button secondary"
                        onClick={() =>
                          page === 'saved' && savedCount === 0
                            ? navigate('explore')
                            : resetFilters()
                        }
                      >
                        {page === 'saved' && savedCount === 0
                          ? '혜택 둘러보기'
                          : '검색 조건 초기화'}
                        <Icon name="arrow" size={17} />
                      </button>
                    </div>
                  )}
                </section>
                <aside className="right-rail">
                  <section className="profile-card">
                    <span className="rail-eyebrow">나만의 나침반</span>
                    <div className="profile-card-icon">
                      <Icon name="user" size={27} />
                      <span>
                        <Icon name="settings" size={13} />
                      </span>
                    </div>
                    <h2>
                      {profile.interests.length ? '내 관심사를 따라' : '나를 조금 알려주면,'}
                      <br />
                      {profile.interests.length ? '혜택을 찾아볼까요?' : '탐색이 더 쉬워져요.'}
                    </h2>
                    <p>
                      {profile.interests.length
                        ? `${profile.region} · ${profile.interests.join(', ')}`
                        : '관심 지역과 분야를 설정하고\n내게 필요한 혜택을 찾아보세요.'}
                    </p>
                    <button className="button primary full" onClick={() => setModal('profile')}>
                      {profile.interests.length ? '내 설정 수정하기' : '30초 만에 설정하기'}
                      <Icon name="arrow" size={17} />
                    </button>
                    {profile.interests.length > 0 && (
                      <button className="text-button" onClick={useProfile}>
                        관심 분야로 둘러보기
                        <Icon name="right" size={16} />
                      </button>
                    )}
                    <span className="rail-footnote">
                      <Icon name="shield" size={13} />
                      설정은 이 브라우저에만 저장돼요
                    </span>
                  </section>
                  <section className="guide-card">
                    <span className="guide-label">
                      <Icon name="book" size={17} />
                      처음이라면 읽어보세요
                    </span>
                    <h3>
                      복지 혜택,
                      <br />
                      어디서부터 찾을까요?
                    </h3>
                    <p>
                      발견부터 확인까지,
                      <br />한 걸음씩 안내해 드려요.
                    </p>
                    <button className="text-button" onClick={() => setModal('guide')}>
                      이용 가이드 보기
                      <Icon name="arrow" size={17} />
                    </button>
                  </section>
                  <div className="trust-note">
                    <Icon name="shield" size={18} />
                    <p>
                      실제 신청 전에는 반드시
                      <br />
                      공식 기관의 안내를 확인하세요.
                    </p>
                  </div>
                </aside>
              </div>
            </>
          )}
          <footer>
            <div className="footer-brand">
              <img className="footer-brand-image" src="/brand-logo.png" alt="" />
              복지나침반<span>당신의 더 나은 일상을 향해</span>
            </div>
            <button onClick={() => setModal('about')}>
              서비스 안내
              <Icon name="external" size={13} />
            </button>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="모바일 탐색">
        {navigation.map((item) => (
          <a
            href={`#${item.id}`}
            key={item.id}
            aria-current={page === item.id ? 'page' : undefined}
            className={page === item.id ? 'active' : ''}
            onClick={() => navigate(item.id)}
          >
            <Icon name={item.icon} size={21} />
            <span>{item.id === 'explore' ? '혜택 탐색' : item.label}</span>
          </a>
        ))}
      </nav>
      {toast && (
        <div className="toast" role="status">
          <Icon name="check" size={18} />
          {toast}
        </div>
      )}
      {modal === 'profile' && (
        <Modal title="내 탐색 설정" onClose={() => setModal(null)}>
          <ProfileForm profile={profile} onSave={saveProfile} />
        </Modal>
      )}
      {modal === 'guide' && (
        <Modal title="혜택을 발견하는 세 걸음" onClose={() => setModal(null)}>
          <div className="guide-steps">
            {[
              [
                '01',
                '내 관심사부터 시작해요',
                '관심 지역과 분야를 설정하거나, 검색창에 찾고 싶은 키워드를 입력하세요.',
              ],
              [
                '02',
                '관심 가는 혜택을 모아요',
                '북마크를 누르면 관심 혜택에 저장돼요. 같은 브라우저에서 다시 볼 수 있어요.',
              ],
              [
                '03',
                '공식 안내를 확인해요',
                '실제 서비스 연동 후에는 대상 조건과 신청 기간을 공식 원문에서 확인하세요. 현재 화면은 예시 데이터로 체험할 수 있어요.',
              ],
            ].map(([number, title, description]) => (
              <div key={number}>
                <span>{number}</span>
                <section>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </section>
              </div>
            ))}
          </div>
          <button
            className="button primary full"
            onClick={() => {
              setModal(null);
              navigate('explore');
            }}
          >
            혜택 둘러보기
            <Icon name="arrow" size={17} />
          </button>
        </Modal>
      )}
      {modal === 'about' && (
        <Modal title="복지나침반 서비스 안내" onClose={() => setModal(null)}>
          <p className="modal-description">
            흩어진 복지·지원 정보를 찾고 관심 혜택을 모아볼 수 있는 프론트엔드 체험 버전입니다.
          </p>
          <div className="notice-box">
            현재 모든 혜택은 합성 예시입니다. 실제 정책 조회, 자격 판정, 신청, 로그인 및 알림 발송은
            제공하지 않습니다.
          </div>
          <p className="modal-description">
            관심 혜택과 탐색 설정은 현재 브라우저에만 저장되며 기기 간 동기화되지 않습니다.
          </p>
          <div className="health-panel">
            <h3>개발 서버 연결 확인</h3>
            <p>서버 응답 여부만 확인합니다. 정책 서비스 준비 여부와는 별개입니다.</p>
            <button
              className="button secondary"
              disabled={health === 'checking'}
              onClick={async () => {
                setHealth('checking');
                try {
                  await checkHealth();
                  setHealth('ok');
                } catch {
                  setHealth('error');
                }
              }}
            >
              {health === 'checking' ? '확인 중…' : '서버 연결 확인'}
            </button>
            <p role="status">
              {health === 'ok'
                ? '서버 응답을 확인했어요. 정책 API는 아직 연동되지 않았어요.'
                : health === 'error'
                  ? '서버에 연결하지 못했어요. 예시 화면은 계속 이용할 수 있어요.'
                  : ''}
            </p>
          </div>
        </Modal>
      )}
      {modal && typeof modal === 'object' && (
        <Modal title={modal.title} onClose={() => setModal(null)}>
          <div className="detail-badges">
            <span className="soft-badge">{modal.category}</span>
            <span className="soft-badge">{modal.region}</span>
            <span className="example-badge">예시 혜택</span>
          </div>
          <p className="modal-description">{modal.summary}</p>
          <dl className="policy-detail">
            <div>
              <dt>지원 내용</dt>
              <dd>{modal.benefit}</dd>
            </div>
            <div>
              <dt>관심 대상</dt>
              <dd>{modal.audience} · 탐색용 분류이며 자격 조건이 아닙니다.</dd>
            </div>
            <div>
              <dt>담당 기관</dt>
              <dd>{modal.organization}</dd>
            </div>
            <div>
              <dt>신청 기간</dt>
              <dd>실제 공고 연동 후 제공 예정</dd>
            </div>
          </dl>
          <div className="notice-box">
            <Icon name="info" size={18} />
            <p>
              체험을 위해 만든 예시로, 실제 신청할 수 있는 사업이 아닙니다. 공식 원문과 상세 지원
              조건은 실제 정책 연동 후 제공됩니다.
            </p>
          </div>
          <button
            className={`button ${saved.includes(modal.id) ? 'secondary' : 'primary'} full`}
            onClick={() => savePolicy(modal.id)}
          >
            <Icon name="bookmark" size={18} />
            {saved.includes(modal.id) ? '관심 혜택에서 해제하기' : '관심 혜택에 저장하기'}
          </button>
        </Modal>
      )}
    </div>
  );
}
