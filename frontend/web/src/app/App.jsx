import { useCallback, useEffect, useRef, useState } from 'react';
import AssistantHome from '../features/assistant/AssistantHome.jsx';
import FloatingAssistant from '../features/assistant/FloatingAssistant.jsx';
import AuthPage from '../features/auth/AuthPage.jsx';
import AdminPage from '../features/auth/AdminPage.jsx';
import MemberProfileForm from '../features/auth/MemberProfileForm.jsx';
import { authRequest } from '../features/auth/authApi.js';
import CalculatorPage from '../features/finance/CalculatorPage.jsx';
import DetailedCalculatorPage from '../features/finance/DetailedCalculatorPage.jsx';
import useFinancePrefill from '../features/finance/useFinancePrefill.js';
import {
  applyQuickDefaults,
  quickDefaultsFromFinance,
  financialIncomeSignature,
  financialDraftDefaults,
  knownHouseholdSize,
} from '../features/finance/financePrefill.js';
import CalendarPage from '../features/calendar/CalendarPage.jsx';
import PolicyExplorer from '../features/policies/PolicyExplorer.jsx';
import PolicyCard from '../features/policies/PolicyCard.jsx';
import PolicyDetail from '../features/policies/PolicyDetail.jsx';
import { parsePolicy } from '../features/policies/policyModel.js';
import ProfilePage from '../features/profile/ProfilePage.jsx';
import {
  defaultProfile,
  isProfile,
  memberRecommendationProfile,
  normalizeProfile,
} from '../features/profile/profileModel.js';
import { readStoredValue, writeStoredValue, removeStoredValue } from '../shared/storage.js';
import { appConfig } from '../shared/config.js';
import Icon from '../shared/ui/Icon.jsx';
import { policyRepository, recommendationRepository } from './services.js';
import { recommendationFailure } from '../features/assistant/recommendationFeedback.js';
import SourceFooter from './SourceFooter.jsx';
import usePolicyRefresh from '../features/policies/usePolicyRefresh.js';

const navigation = [
  { id: 'home', label: '내 비서', icon: 'house' },
  { id: 'explore', label: '전체 공고', mobileLabel: '공고', icon: 'search' },
  { id: 'calendar', label: '공고 캘린더', mobileLabel: '캘린더', icon: 'calendar' },
  { id: 'saved', label: '저장한 공고', mobileLabel: '저장', icon: 'bookmark' },
  { id: 'calculator', label: '계산기', icon: 'calculator' },
  { id: 'profile', label: '내 정보', icon: 'user' },
];
const profileKey = 'bokji.profile.v2';
const savedKey = 'bokji.saved.v2.' + appConfig.dataMode;
const easyKey = 'bokji.easy.v1';
const emptyResult = { items: [], summary: '' };
const emptyRecommendation = { value: null, source: null, owner: null };
const emptyQuickDraft = () => ({ householdSize: '1', monthlyIncome: '', largeHousehold: false });
function recommendationForAccount(previous, current) {
  const owner = current?.id || null;
  // Browser storage is an explicit shared-device choice. All other member
  // defaults and edits belong to one account (or the current guest session).
  if (previous.source === 'browser') return previous;
  if (previous.value && previous.owner === owner) return previous;
  if (previous.source === 'session' && previous.owner === null) return { ...previous, owner };
  return current && (current.region || current.age != null)
    ? { value: memberRecommendationProfile(current), source: 'member', owner }
    : emptyRecommendation;
}
function readRoute() {
  const [name, query = ''] = window.location.hash.slice(1).split('?');
  const page = [
    ...navigation.map((item) => item.id),
    'calculator-details',
    'login',
    'signup',
    'admin',
  ].includes(name)
    ? name
    : 'home';
  const params = new URLSearchParams(query);
  return { page, tag: params.get('tag') || '', setup: params.get('setup') === '1' };
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
  const [user, setUser] = useState(null);
  const financeOwner = useRef(null);
  financeOwner.current = user?.id ?? null;
  const financeEditRevision = useRef(0);
  const financeMutationRevision = useRef(0);
  const [financeReset, setFinanceReset] = useState({ version: 0, message: '' });
  const [financeWriting, setFinanceWriting] = useState(null);
  const financeWritingRef = useRef(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [financial, setFinancial] = useState({ owner: null, profile: null });
  const [quickDraft, setQuickDraft] = useState(emptyQuickDraft);
  const quickEdited = useRef(new Set());
  const calculatorSession = useRef({ owner: null, value: null });
  const rememberCalculator = useCallback(
    (value) => {
      const previous = calculatorSession.current.value;
      if (previous?.draft && JSON.stringify(previous.draft) !== JSON.stringify(value.draft))
        financeEditRevision.current += 1;
      calculatorSession.current = { owner: user?.id || null, value };
      setFinanceReset((previous) => (previous.message ? { ...previous, message: '' } : previous));
      if (value.dirty && previous?.draft) {
        const defaults = quickDefaultsFromFinance(value.draft);
        if (
          value.draft.household_size !== previous.draft.household_size &&
          defaults.householdSize
        ) {
          quickEdited.current.add('householdSize');
          setQuickDraft((draft) => ({
            ...draft,
            householdSize: defaults.householdSize,
            largeHousehold: Number(defaults.householdSize) >= 7,
          }));
        }
        if (financialIncomeSignature(value.draft) !== financialIncomeSignature(previous.draft)) {
          quickEdited.current.add('monthlyIncome');
          setQuickDraft((draft) => ({ ...draft, monthlyIncome: defaults.monthlyIncome ?? '' }));
        }
      }
    },
    [user?.id],
  );
  const [useFinancial, setUseFinancial] = useState(false);
  const financialProfile = financial.owner === (user?.id || null) ? financial.profile : null;
  const financePrefill = useFinancePrefill(
    user,
    ['calculator', 'calculator-details'].includes(route.page) ||
      (route.page === 'profile' && !route.setup),
  );
  useEffect(() => {
    const value = financialProfile ?? financePrefill.record?.profile;
    if (value)
      setQuickDraft((draft) =>
        applyQuickDefaults(draft, quickDefaultsFromFinance(value), quickEdited.current),
      );
  }, [financialProfile, financePrefill.record]);
  const beginFinanceMutation = (kind) => {
    const owner = user?.id ?? null;
    if (financeWritingRef.current?.owner === owner) return null;
    const inputRevision = financeEditRevision.current;
    const mutationRevision = ++financeMutationRevision.current;
    financeWritingRef.current = { owner, mutationRevision };
    setFinanceWriting(financeWritingRef.current);
    return (record) => {
      if (financeWritingRef.current?.mutationRevision === mutationRevision)
        financeWritingRef.current = null;
      setFinanceWriting((previous) =>
        previous?.mutationRevision === mutationRevision ? null : previous,
      );
      if (financeOwner.current !== owner || mutationRevision !== financeMutationRevision.current)
        return;
      if (record === undefined) {
        financePrefill.retry();
        return;
      }
      if (kind === 'delete') financePrefill.clear();
      else financePrefill.update(record);
      if (inputRevision !== financeEditRevision.current) return;
      setFinancial({ owner, profile: kind === 'delete' ? null : record.profile });
      setUseFinancial(false);
      if (kind === 'delete') {
        calculatorSession.current = { owner, value: null };
        quickEdited.current.clear();
        setQuickDraft(emptyQuickDraft());
        setFinanceReset((previous) => ({
          version: previous.version + 1,
          message: '계정에 저장한 소득·재산 정보를 삭제했습니다.',
        }));
      } else if (calculatorSession.current.value) {
        calculatorSession.current.value = { ...calculatorSession.current.value, dirty: false };
      }
    };
  };
  const changeQuickDraft = (next) => {
    if (
      next.householdSize !== quickDraft.householdSize ||
      next.monthlyIncome !== quickDraft.monthlyIncome
    )
      financeEditRevision.current += 1;
    if (next.householdSize !== quickDraft.householdSize) {
      quickEdited.current.add('householdSize');
      const session = calculatorSession.current.value;
      const count = knownHouseholdSize(next.householdSize);
      if (session?.draft && count !== null) {
        const memberCache = [...(session.memberCache ?? [])];
        session.draft.members.forEach((member, index) => {
          memberCache[index] = member;
        });
        const draft = financialDraftDefaults({
          saved: session.draft,
          quick: next,
          useQuickHousehold: true,
        });
        draft.members = Array.from(
          { length: count },
          (_, index) => session.draft.members[index] ?? memberCache[index] ?? draft.members[index],
        );
        calculatorSession.current = {
          ...calculatorSession.current,
          value: {
            ...session,
            draft,
            memberCache,
            calculation: null,
            edited: true,
            dirty: true,
            mode: ['result', 'review'].includes(session.mode) ? 'edit' : session.mode,
          },
        };
        setFinancial({ owner: user?.id || null, profile: null });
        setUseFinancial(false);
      }
    }
    if (next.monthlyIncome !== quickDraft.monthlyIncome) quickEdited.current.add('monthlyIncome');
    setQuickDraft(next);
  };
  const [easy, setEasy] = useState(() =>
    readStoredValue(easyKey, false, (value) => typeof value === 'boolean'),
  );
  const [recommendation, setRecommendation] = useState(() => {
    const value = readStoredValue(profileKey, null, isProfile);
    return value
      ? { value: normalizeProfile(value), source: 'browser', owner: null }
      : emptyRecommendation;
  });
  const remembered = recommendation.source === 'browser';
  const profile =
    remembered || recommendation.owner === (user?.id || null) ? recommendation.value : null;
  const [saved, setSaved] = useState(() => {
    removeStoredValue('bokji.saved.v2.demo');
    const records = readStoredValue(savedKey, [], validSaved);
    const real = records.filter((item) => !item.id.startsWith('demo-'));
    if (real.length !== records.length) writeStoredValue(savedKey, real);
    return real;
  });
  const [savedIndex, setSavedIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const policyRefresh = usePolicyRefresh();
  const selectedId = selected?.id;
  useEffect(() => {
    if (!selectedId || appConfig.dataMode !== 'api') return;
    const controller = new AbortController();
    policyRepository
      .get(selectedId, { signal: controller.signal })
      .then((policy) => {
        if (!controller.signal.aborted)
          setSelected((current) => (current?.id === selectedId ? policy : current));
      })
      .catch((error) => {
        if (!controller.signal.aborted && error.status === 404) {
          setSelected((current) => (current?.id === selectedId ? null : current));
          setNotice('이 공고는 비공개로 변경됐습니다. 최신 목록을 확인해 주세요.');
        }
      });
    return () => controller.abort();
  }, [selectedId, policyRefresh]);
  const [assistant, setAssistant] = useState(null);
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState(emptyResult);
  const [state, setState] = useState('idle');
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(0);
  const main = useRef(null);
  const authRevision = useRef(0);
  const routeNotice = useRef('');
  useEffect(() => {
    let active = true;
    const revision = authRevision.current;
    authRequest('me')
      .then(({ user: current }) => {
        if (active && revision === authRevision.current) {
          setUser(current);
          setRecommendation((previous) => recommendationForAccount(previous, current));
          setFinancial({ owner: current?.id || null, profile: null });
          if (calculatorSession.current.owner !== (current?.id || null)) {
            const previous = calculatorSession.current;
            calculatorSession.current = {
              owner: current?.id || null,
              value: previous.owner === null && previous.value?.edited ? previous.value : null,
            };
            if (!quickEdited.current.size) setQuickDraft(emptyQuickDraft());
          }
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const onLogin = (current, destination = 'home') => {
    authRevision.current += 1;
    if (user && user.id !== current.id) {
      setQuickDraft(emptyQuickDraft());
      quickEdited.current.clear();
    }
    calculatorSession.current = {
      owner: current.id,
      value: calculatorSession.current.owner === null ? calculatorSession.current.value : null,
    };
    setUser(current);
    setRecommendation((previous) => recommendationForAccount(previous, current));
    setFinancial((previous) => ({
      owner: current.id,
      profile: previous.owner === null ? previous.profile : null,
    }));
    setUseFinancial(false);
    window.location.hash = destination;
  };
  const logout = async () => {
    authRevision.current += 1;
    setLoggingOut(true);
    try {
      await authRequest('logout', {});
      setUser(null);
      setRecommendation((previous) =>
        previous.source === 'browser' ? previous : emptyRecommendation,
      );
      setFinancial({ owner: null, profile: null });
      calculatorSession.current = { owner: null, value: null };
      setQuickDraft(emptyQuickDraft());
      quickEdited.current.clear();
      setUseFinancial(false);
      window.location.hash = 'home';
    } catch (err) {
      setNotice(err.message);
    } finally {
      setLoggingOut(false);
    }
  };
  useEffect(() => {
    const onHash = () => {
      setRoute(readRoute());
      setSelected(null);
      setNotice(routeNotice.current);
      routeNotice.current = '';
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
    setAssistant(null);
  }, [user?.id, route.page]);
  useEffect(() => {
    const controller = new AbortController();
    setResult(emptyResult);
    setError(null);
    setState('loading');
    recommendationRepository
      .recommend(profile, {
        signal: controller.signal,
        financialProfile: useFinancial ? financialProfile : null,
      })
      .then((value) => {
        if (!controller.signal.aborted) {
          setResult(value);
          setState('ready');
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(recommendationFailure(err));
          setState('error');
        }
      });
    return () => controller.abort();
  }, [profile, retry, useFinancial, financialProfile, user?.id]);
  const navigate = (page, tag = '') => {
    window.location.hash = page + (tag ? '?tag=' + encodeURIComponent(tag) : '');
  };
  const onTag = (tag) => navigate('explore', tag);
  const toggleEasy = () => {
    setEasy(!easy);
    if (!writeStoredValue(easyKey, !easy))
      setNotice('화면 설정을 이 브라우저에 기억하지 못했어요.');
  };
  const saveProfile = (value, remember, source = 'session', redirect = true) => {
    if (!isProfile(value)) return;
    const stored = remember ? writeStoredValue(profileKey, value) : removeStoredValue(profileKey);
    setRecommendation({
      value: { ...value },
      source: remember && stored ? 'browser' : source,
      owner: user?.id || null,
    });
    if (redirect) navigate('home');
    if (!stored)
      requestAnimationFrame(() =>
        setNotice(
          '브라우저 저장 설정을 변경하지 못했어요. 브라우저의 사이트 데이터를 확인해 주세요.',
        ),
      );
    return stored;
  };
  const clearProfile = () => {
    const removed = removeStoredValue(profileKey);
    setRecommendation(emptyRecommendation);
    setNotice(
      removed
        ? '맞춤 추천 설정을 지웠어요.'
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
    setSavedIndex((index) => Math.min(index, Math.max(0, Math.floor((next.length - 1) / 3) * 3)));
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
    (route.page === 'calculator-details'
      ? '소득·재산 상세 계산'
      : route.page === 'admin'
        ? '관리자 관리'
        : route.page === 'login'
          ? '로그인'
          : '회원가입');
  const visibleSaved = easy ? saved.slice(savedIndex, savedIndex + 3) : saved;
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
            <img className="brand-image" src="/brand-logo.png" alt="" />
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
              aria-current={
                route.page === item.id ||
                (item.id === 'calculator' && route.page === 'calculator-details')
                  ? 'page'
                  : undefined
              }
            >
              <Icon name={item.icon} size={22} />
              {item.label}
              {item.id === 'saved' && saved.length > 0 && (
                <span className="nav-count">{saved.length}</span>
              )}
            </a>
          ))}
        </nav>
        <span className="sidebar-footer">복지나침반 · BOKJI COMPASS</span>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <a className="mobile-brand" href="#home">
            <img className="mobile-brand-image" src="/brand-logo.png" alt="" />
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
            {user ? (
              <div className="account-actions">
                {user.admin_role === 'superadmin' && (
                  <a className="text-button" href="#admin">
                    관리자 관리
                  </a>
                )}
                {user.is_admin === true && (
                  <a className="text-button" href="/admin/exhibition/">
                    전시 QR 관리
                  </a>
                )}
                <span className="auth-username" title={(user.name || '회원') + '님'}>
                  {user.name || '회원'}님
                </span>
                <button className="text-button" onClick={logout} disabled={loggingOut}>
                  {loggingOut ? '로그아웃 중…' : '로그아웃'}
                </button>
              </div>
            ) : (
              <div className="account-actions">
                <a className="login-link" href="#login">
                  로그인
                </a>
                {!easy && (
                  <a className="signup-link" href="#signup">
                    회원가입
                  </a>
                )}
              </div>
            )}
          </div>
        </header>
        <main id="main-content" ref={main} tabIndex={-1} className="main-content">
          {route.page === 'admin' && <AdminPage key={user?.id || 'guest'} user={user} />}
          {route.page === 'home' && (
            <AssistantHome
              {...shared}
              profile={profile}
              result={result}
              state={state}
              error={error}
              onRetry={() => setRetry((value) => value + 1)}
              onProfile={() => navigate('profile')}
              onLogin={() => navigate('login')}
              onExplore={() => navigate('explore')}
              onCalendar={() => navigate('calendar')}
              mode={appConfig.dataMode}
            />
          )}
          {route.page === 'calendar' && <CalendarPage {...shared} repository={policyRepository} />}
          {route.page === 'explore' && (
            <PolicyExplorer
              key={route.tag}
              {...shared}
              repository={policyRepository}
              tag={route.tag}
              onClearTag={() => navigate('explore')}
            />
          )}
          {route.page === 'profile' && !route.setup && (
            <ProfilePage
              key={user?.id || 'guest'}
              user={user}
              profile={profile}
              remembered={remembered}
              easy={easy}
              onSave={(value, remember) => saveProfile(value, remember, 'session', false)}
              onMemberSaved={(current) => {
                setUser((previous) => (previous?.id === current.id ? current : previous));
                const previousBasics = memberRecommendationProfile(user);
                const currentBasics = memberRecommendationProfile(current);
                const value = { ...(profile || defaultProfile) };
                if (!profile || value.region === previousBasics.region)
                  value.region = currentBasics.region;
                if (!profile || value.ageBand === previousBasics.ageBand)
                  value.ageBand = currentBasics.ageBand;
                saveProfile(value, remembered, recommendation.source || 'member', false);
              }}
              onClear={clearProfile}
              financialProfile={financialProfile}
              savedFinance={financePrefill}
              financialSession={
                calculatorSession.current.owner === (user?.id || null)
                  ? calculatorSession.current.value
                  : null
              }
              onFinancialLoaded={(value) =>
                setFinancial({ owner: user?.id || null, profile: value })
              }
            />
          )}
          {route.page === 'profile' && route.setup && (
            <section className="profile-page">
              <div className="page-heading">
                {!easy && (
                  <span className="eyebrow">{user ? '회원·추천 정보' : '맞춤 추천 설정'}</span>
                )}
                <h1>{route.setup ? '가입이 완료됐어요' : '내 정보'}</h1>
                <p>
                  {route.setup
                    ? '맞춤 정보는 지금 설정하거나 나중에 내 정보에서 입력할 수 있어요.'
                    : user
                      ? '회원 정보와 공고 추천에 사용할 정보를 관리해요.'
                      : easy
                        ? '공고 추천에 사용할 정보를 관리합니다.'
                        : '나에게 맞는 공고를 추천하는 데 사용해요.'}
                </p>
                {!route.setup && (
                  <a className="text-button calculator-entry" href="#calculator">
                    <Icon name="calculator" /> 중위소득 빠르게 확인하기
                  </a>
                )}
              </div>
              {user && (
                <MemberProfileForm
                  key={user.id + (route.setup ? '-setup' : '')}
                  user={user}
                  setup={route.setup}
                  onSaved={(current) => {
                    setUser((previous) => (previous?.id === current.id ? current : previous));
                    if (route.setup) {
                      if (current.region || current.age != null) {
                        saveProfile(
                          memberRecommendationProfile(current, profile || defaultProfile),
                          remembered,
                          'member',
                        );
                      } else navigate('home');
                    }
                  }}
                />
              )}
              {route.setup && !user && (
                <p className="notice-box">
                  맞춤 정보를 저장하려면 <a href="#login">로그인</a>해 주세요.{' '}
                  <a href="#home">나중에 하기</a>
                </p>
              )}
            </section>
          )}
          {route.page === 'calculator' && (
            <CalculatorPage
              draft={quickDraft}
              onChange={changeQuickDraft}
              prefill={financePrefill}
              hasSavedProfile={Boolean(financialProfile || financePrefill.record?.profile)}
            />
          )}
          {route.page === 'calculator-details' && (
            <>
              {user &&
              ['idle', 'loading'].includes(financePrefill.status) &&
              !calculatorSession.current.value ? (
                <section className="calculator-page">
                  <p className="finance-intro" role="status">
                    회원의 소득·재산 정보를 불러오고 있어요…
                  </p>
                </section>
              ) : (
                <DetailedCalculatorPage
                  key={`${user?.id || 'guest'}-${financeReset.version}`}
                  initialMessage={financeReset.message}
                  accountWriting={Boolean(financeWriting && financeWriting.owner === user?.id)}
                  easy={easy}
                  user={user}
                  profile={financialProfile ?? financePrefill.record?.profile}
                  recommendation={profile}
                  quickDraft={quickDraft}
                  useQuickHousehold={quickEdited.current.has('householdSize')}
                  prefill={financePrefill}
                  session={
                    calculatorSession.current.owner === (user?.id || null)
                      ? calculatorSession.current.value
                      : null
                  }
                  onSessionChange={rememberCalculator}
                  onProfileChange={(value) => {
                    setFinancial({ owner: user?.id || null, profile: value });
                    setUseFinancial(false);
                  }}
                  onAccountMutation={beginFinanceMutation}
                  onSavedRecord={financePrefill.update}
                  onRecommend={() => {
                    setUseFinancial(true);
                    if (!profile)
                      setRecommendation({
                        value: { ...defaultProfile },
                        source: 'session',
                        owner: user?.id || null,
                      });
                    routeNotice.current = '';
                    navigate('home');
                  }}
                />
              )}
            </>
          )}
          {route.page === 'saved' && (
            <section>
              <div className="page-heading">
                {!easy && <span className="eyebrow">다시 보고 싶은 공고</span>}
                <h1>저장한 공고</h1>
                <p>이 브라우저에 저장한 공고예요. 최신 내용은 공식 공고를 확인하세요.</p>
              </div>
              {saved.length ? (
                <>
                  <div className={'policy-grid' + (easy ? ' easy-policy-list' : '')}>
                    {visibleSaved.map((policy) => (
                      <PolicyCard key={policy.id} {...shared} policy={policy} saved />
                    ))}
                  </div>
                  {easy && saved.length > 3 && (
                    <nav className="pagination" aria-label="저장 공고 넘기기">
                      <button
                        className="button secondary"
                        disabled={savedIndex === 0}
                        onClick={() => setSavedIndex(Math.max(0, savedIndex - 3))}
                      >
                        이전 목록
                      </button>
                      <span>
                        {savedIndex + 1}–{Math.min(savedIndex + 3, saved.length)} / {saved.length}개
                      </span>
                      <button
                        className="button secondary"
                        disabled={savedIndex + 3 >= saved.length}
                        onClick={() => setSavedIndex(savedIndex + 3)}
                      >
                        다음 목록
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
            <AuthPage key={route.page} type={route.page} onLogin={onLogin} easy={easy} />
          )}
          <SourceFooter easy={easy} showSources={route.page === 'home'} />
        </main>
      </div>
      <nav className="mobile-nav" aria-label="모바일 주 메뉴">
        {navigation.map((item) => (
          <a
            key={item.id}
            href={'#' + item.id}
            aria-label={item.label}
            aria-current={
              route.page === item.id ||
              (item.id === 'calculator' && route.page === 'calculator-details')
                ? 'page'
                : undefined
            }
          >
            <Icon name={item.icon} size={23} />
            <span>{item.mobileLabel || item.label}</span>
          </a>
        ))}
      </nav>
      <FloatingAssistant
        key={user?.id || 'guest'}
        session={assistant}
        onChange={setAssistant}
        easy={easy}
        user={user}
        repository={policyRepository}
        blocked={
          Boolean(selected) ||
          ['login', 'signup', 'admin'].includes(route.page) ||
          (route.page === 'profile' && route.setup)
        }
        onNavigate={navigate}
        onToggleEasy={toggleEasy}
      />
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
          user={user}
          policy={selected}
          saved={saved.some((item) => item.id === selected.id)}
          onSave={toggleSaved}
          onClose={() => setSelected(null)}
          onAsk={() => {
            setAssistant({ topic: 'policy', policy: selected });
            setSelected(null);
          }}
          onTag={onTag}
          mode={appConfig.dataMode}
          easy={easy}
        />
      )}
    </div>
  );
}
