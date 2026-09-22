import { useEffect, useRef, useState } from 'react';
import AssistantHome from '../features/assistant/AssistantHome.jsx';
import AuthPage from '../features/auth/AuthPage.jsx';
import PolicyExplorer from '../features/policies/PolicyExplorer.jsx';
import PolicyCard from '../features/policies/PolicyCard.jsx';
import PolicyDetail from '../features/policies/PolicyDetail.jsx';
import { parsePolicy } from '../features/policies/policyModel.js';
import ProfileForm from '../features/profile/ProfileForm.jsx';
import { defaultProfile, isProfile } from '../features/profile/profileModel.js';
import { readStoredValue, writeStoredValue, removeStoredValue } from '../shared/storage.js';
import { appConfig } from '../shared/config.js';
import Icon from '../shared/ui/Icon.jsx';
import { policyRepository, recommendationRepository } from './services.js';

const navigation = [
  { id: 'home', label: '내 비서', icon: 'house' },
  { id: 'explore', label: '전체 공고', icon: 'search' },
  { id: 'saved', label: '저장한 공고', icon: 'bookmark' },
  { id: 'profile', label: '내 정보', icon: 'user' },
];
const profileKey = 'bokji.profile.v2';
const savedKey = 'bokji.saved.v2.' + appConfig.dataMode;
const easyKey = 'bokji.easy.v1';
const emptyResult = { items: [], summary: '' };
function readRoute() {
  const [name, query = ''] = window.location.hash.slice(1).split('?');
  const page = [...navigation.map((item) => item.id), 'login', 'signup'].includes(name)
    ? name
    : 'home';
  return { page, tag: new URLSearchParams(query).get('tag') || '' };
}
function validSaved(value) {
  try {
    return (
      Array.isArray(value) &&
      value.length <= 500 &&
      value.every((item) => Boolean(parsePolicy(item)))
    );
  } catch {
    return false;
  }
}
export default function App() {
  const [route, setRoute] = useState(readRoute);
  const [easy, setEasy] = useState(() =>
    readStoredValue(easyKey, false, (value) => typeof value === 'boolean'),
  );
  const [profile, setProfile] = useState(() => readStoredValue(profileKey, null, isProfile));
  const [remembered, setRemembered] = useState(() =>
    Boolean(readStoredValue(profileKey, null, isProfile)),
  );
  const [saved, setSaved] = useState(() => readStoredValue(savedKey, [], validSaved));
  const [savedIndex, setSavedIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState(emptyResult);
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const main = useRef(null);
  useEffect(() => {
    const onHash = () => {
      setRoute(readRoute());
      setSelected(null);
      setNotice('');
      requestAnimationFrame(() => {
        main.current?.focus();
        window.scrollTo(0, 0);
      });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.easy = String(easy);
  }, [easy]);
  useEffect(() => {
    const controller = new AbortController();
    setResult(emptyResult);
    if (!profile) {
      setState('idle');
      return () => controller.abort();
    }
    setState('loading');
    recommendationRepository
      .recommend(profile, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          setResult(value);
          setState('ready');
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(
            err.status === 404
              ? '추천 서비스를 준비하고 있어요. 연결이 끝나면 추천 공고를 확인할 수 있어요.'
              : err.message,
          );
          setState('error');
        }
      });
    return () => controller.abort();
  }, [profile, retry]);
  const navigate = (page, tag = '') => {
    window.location.hash = page + (tag ? '?tag=' + encodeURIComponent(tag) : '');
  };
  const onTag = (tag) => navigate('explore', tag);
  const toggleEasy = () => {
    setEasy(!easy);
    if (!writeStoredValue(easyKey, !easy))
      setNotice('화면 설정을 이 브라우저에 기억하지 못했어요.');
  };
  const saveProfile = (value, remember) => {
    if (!isProfile(value)) return;
    const stored = remember ? writeStoredValue(profileKey, value) : removeStoredValue(profileKey);
    setRemembered(remember && stored);
    setProfile({ ...value });
    navigate('home');
    if (!stored)
      requestAnimationFrame(() =>
        setNotice(
          '브라우저 저장 설정을 변경하지 못했어요. 브라우저의 사이트 데이터를 확인해 주세요.',
        ),
      );
  };
  const clearProfile = () => {
    const removed = removeStoredValue(profileKey);
    setProfile(null);
    setRemembered(false);
    setNotice(
      removed
        ? '입력한 내 정보를 지웠어요.'
        : '화면의 정보를 지웠지만 브라우저 저장 정보는 지우지 못했어요. 사이트 데이터를 직접 삭제해 주세요.',
    );
  };
  const toggleSaved = (policy) => {
    const exists = saved.some((item) => item.id === policy.id);
    const next = exists ? saved.filter((item) => item.id !== policy.id) : [...saved, policy];
    if (next.length > 500) {
      setNotice('저장 공간이 가득 찼어요. 기존 공고를 정리해 주세요.');
      return;
    }
    setSaved(next);
    setSavedIndex((index) => Math.min(index, Math.max(0, next.length - 1)));
    const stored = writeStoredValue(savedKey, next);
    setNotice(
      stored
        ? exists
          ? '저장을 취소했어요.'
          : '공고를 저장했어요.'
        : '이 화면에만 저장했어요. 브라우저 저장 공간을 사용할 수 없어요.',
    );
  };
  const shared = { easy, saved, onSave: toggleSaved, onOpen: setSelected, onTag };
  const pageLabel =
    navigation.find((item) => item.id === route.page)?.label ||
    (route.page === 'login' ? '로그인' : '회원가입');
  const visibleSaved = easy ? saved.slice(savedIndex, savedIndex + 1) : saved;
  return (
    <div className={'app-shell' + (easy ? ' easy-mode' : '')}>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          main.current?.focus();
        }}
      >
        본문으로 바로가기
      </a>
      <aside className="sidebar">
        <a className="brand" href="#home">
          <span className="brand-symbol">
            <Icon name="compass" size={29} />
          </span>
          <span>
            복지나침반<small>나를 위한 복지 비서</small>
          </span>
        </a>
        <nav className="side-nav" aria-label="주 메뉴">
          {navigation.map((item) => (
            <a
              key={item.id}
              href={'#' + item.id}
              aria-current={route.page === item.id ? 'page' : undefined}
            >
              <Icon name={item.icon} size={22} />
              {item.label}
              {item.id === 'saved' && saved.length > 0 && (
                <span className="nav-count">{saved.length}</span>
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-note">
          <Icon name="shield" size={22} />
          <p>
            내게 필요한 도움을
            <br />
            조금 더 쉽게 만나세요.
          </p>
        </div>
        <span className="sidebar-footer">복지나침반 · BOKJI COMPASS</span>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <a className="mobile-brand" href="#home">
            <Icon name="compass" size={26} />
            복지나침반
          </a>
          <span className="breadcrumb">
            복지나침반 <Icon name="right" size={15} />
            {pageLabel}
          </span>
          <div className="header-actions">
            <button className="mode-switch" role="switch" aria-checked={easy} onClick={toggleEasy}>
              <span className="switch-track" aria-hidden="true">
                <span />
              </span>
              쉬운 화면<span className="mode-state">{easy ? '켜짐' : '꺼짐'}</span>
            </button>
            <a className="login-link" href="#login">
              로그인
            </a>
            {!easy && (
              <a className="signup-link" href="#signup">
                회원가입
              </a>
            )}
          </div>
        </header>
        {appConfig.dataMode === 'demo' && (
          <div className="demo-banner">
            <Icon name="info" size={18} />
            <span>
              <strong>체험 화면</strong> · 예시 공고와 추천을 보여드려요. 실제 LLM 추천은 서버 연결
              후 제공돼요.
            </span>
          </div>
        )}
        <main id="main-content" ref={main} tabIndex={-1} className="main-content">
          {route.page === 'home' && (
            <AssistantHome
              {...shared}
              profile={profile}
              result={result}
              state={state}
              error={error}
              onRetry={() => setRetry((value) => value + 1)}
              onProfile={() => navigate('profile')}
              onExplore={() => navigate('explore')}
              mode={appConfig.dataMode}
            />
          )}
          {route.page === 'explore' && (
            <PolicyExplorer
              key={route.tag + ':' + easy}
              {...shared}
              repository={policyRepository}
              tag={route.tag}
              onClearTag={() => navigate('explore')}
            />
          )}
          {route.page === 'profile' && (
            <section className="profile-page">
              <div className="page-heading">
                <span className="eyebrow">개인비서에게 알려주세요</span>
                <h1>내 정보</h1>
                <p>나에게 맞는 공고를 추천하는 데 사용해요.</p>
              </div>
              <ProfileForm
                key={JSON.stringify(profile) + easy}
                profile={profile || defaultProfile}
                onSave={saveProfile}
                easy={easy}
                remembered={remembered}
                mode={appConfig.dataMode}
              />
              {profile && (
                <button className="text-button clear-profile" onClick={clearProfile}>
                  내 정보 지우기
                </button>
              )}
            </section>
          )}
          {route.page === 'saved' && (
            <section>
              <div className="page-heading">
                <span className="eyebrow">다시 보고 싶은 정보</span>
                <h1>저장한 공고</h1>
                <p>이 브라우저에 저장한 공고예요. 최신 내용은 공식 공고를 확인하세요.</p>
              </div>
              {saved.length ? (
                <>
                  <div className="policy-grid">
                    {visibleSaved.map((policy) => (
                      <PolicyCard key={policy.id} {...shared} policy={policy} saved />
                    ))}
                  </div>
                  {easy && (
                    <nav className="pagination" aria-label="저장 공고 넘기기">
                      <button
                        className="button secondary"
                        disabled={savedIndex === 0}
                        onClick={() => setSavedIndex(savedIndex - 1)}
                      >
                        이전 공고
                      </button>
                      <span>
                        {savedIndex + 1} / {saved.length}
                      </span>
                      <button
                        className="button secondary"
                        disabled={savedIndex + 1 >= saved.length}
                        onClick={() => setSavedIndex(savedIndex + 1)}
                      >
                        다음 공고
                      </button>
                    </nav>
                  )}
                </>
              ) : (
                <div className="empty-state">
                  <Icon name="bookmark" size={34} />
                  <h2>아직 저장한 공고가 없어요</h2>
                  <p>마음에 드는 공고의 저장 버튼을 눌러주세요.</p>
                  <button className="button primary" onClick={() => navigate('explore')}>
                    공고 찾아보기
                  </button>
                </div>
              )}
            </section>
          )}
          {['login', 'signup'].includes(route.page) && (
            <AuthPage key={route.page} type={route.page} />
          )}
          <footer className="page-footer">
            복지나침반{!easy && <span>추천을 참고하고, 신청 조건은 공식 공고에서 확인하세요.</span>}
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="모바일 주 메뉴">
        {navigation.map((item) => (
          <a
            key={item.id}
            href={'#' + item.id}
            aria-current={route.page === item.id ? 'page' : undefined}
          >
            <Icon name={item.icon} size={23} />
            <span>{item.label}</span>
          </a>
        ))}
      </nav>
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button aria-label="안내 닫기" onClick={() => setNotice('')}>
            <Icon name="x" size={18} />
          </button>
        </div>
      )}
      {selected && (
        <PolicyDetail
          policy={selected}
          saved={saved.some((item) => item.id === selected.id)}
          onSave={toggleSaved}
          onClose={() => setSelected(null)}
          onTag={onTag}
          mode={appConfig.dataMode}
          easy={easy}
        />
      )}
    </div>
  );
}
