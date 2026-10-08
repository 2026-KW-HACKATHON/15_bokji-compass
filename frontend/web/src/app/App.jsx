import { useI18n } from '../shared/i18n/I18nProvider.jsx';
import LanguageSelector from '../shared/i18n/LanguageSelector.jsx';
import ContentLanguageNotice from '../shared/i18n/ContentLanguageNotice.jsx';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import AssistantHome from '../features/assistant/AssistantHome.jsx';
import FloatingAssistant from '../features/assistant/FloatingAssistant.jsx';
import GuidedConversation from '../features/assistant/GuidedConversation.jsx';
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
import MonitoringPanel from '../features/monitoring/MonitoringPanel.jsx';
const GuidePage = lazy(() => import('../features/guide/GuidePage.jsx'));
const AssistantPage = lazy(() => import('../features/assistant/AssistantPage.jsx'));

const navigation = [
  { id: 'home', label: '홈', icon: 'house' },
  { id: 'assistant', label: 'AI 복지비서', mobileLabel: 'AI 비서', icon: 'compass' },
  { id: 'explore', label: '전체 공고', mobileLabel: '공고', icon: 'search' },
  { id: 'calendar', label: '공고 캘린더', mobileLabel: '캘린더', icon: 'calendar' },
  { id: 'saved', label: '저장한 공고', mobileLabel: '저장', icon: 'bookmark' },
  { id: 'calculator', label: '계산기', icon: 'calculator' },
  { id: 'profile', label: '내 정보', icon: 'user' },
  { id: 'guide', label: '서비스 소개', icon: 'book' },
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
  return {
    page,
    tag: params.get('tag') || '',
    query: params.get('q') || '',
    region: params.get('region') || '전국',
    category: params.get('category') || '전체',
    setup: params.get('setup') === '1',
  };
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
  const { t } = useI18n();
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
  // This account-bound context exists only in this tab's memory, never the URL or storage.
  const [guidance, setGuidance] = useState(null);
  const guidanceSequence = useRef(0);
  const [monitoringRefresh, setMonitoringRefresh] = useState(0);
  const rememberGuidance = useCallback(
    (session) => {
      if (session.owner !== financeOwner.current) return;
      setGuidance((current) =>
        current?.key === guidance?.key && current.owner === session.owner
          ? { ...current, session }
          : current,
      );
    },
    [guidance?.key],
  );
  useEffect(() => {
    setGuidance(null);
    setMonitoringRefresh(0);
  }, [user?.id]);
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState(emptyResult);
  const [state, setState] = useState('idle');
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(0);
  const main = useRef(null);
  const header = useRef(null);
  useEffect(() => {
    const nav = header.current?.querySelector('.portal-nav');
    if (!nav) return;
    const revealActiveLink = () => {
      const activeLink = nav.querySelector('[aria-current="page"]');
      if (!activeLink || nav.scrollWidth <= nav.clientWidth) return;
      const container = nav.getBoundingClientRect();
      const link = activeLink.getBoundingClientRect();
      const offset =
        link.right > container.right
          ? link.right - container.right
          : Math.min(0, link.left - container.left);
      nav.scrollBy({ left: offset, behavior: 'instant' });
    };
    const observer = new ResizeObserver(revealActiveLink);
    observer.observe(nav);
    revealActiveLink();
    return () => observer.disconnect();
  }, [route.page, easy]);
  useEffect(() => {
    if (!header.current) return;
    const updateHeight = () =>
      document.documentElement.style.setProperty(
        '--guide-sticky-top',
        `${header.current.getBoundingClientRect().height}px`,
      );
    const observer = new ResizeObserver(updateHeight);
    observer.observe(header.current);
    updateHeight();
    return () => observer.disconnect();
  }, []);
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
  const openAssistantPage = ({ policy, session } = {}) => {
    const owner = user?.id || null;
    if (policy || (session && session.owner === owner)) {
      setGuidance({
        owner,
        key: ++guidanceSequence.current,
        policy: policy || null,
        session: session?.owner === owner ? session : null,
      });
    }
    setAssistant(null);
    navigate('assistant');
  };
  const startGuidance = (question) => {
    const owner = user?.id || null;
    if (typeof question === 'string' || !guidance || guidance.owner !== owner) {
      setGuidance({
        owner,
        key: ++guidanceSequence.current,
        policy: null,
        session: {
          owner,
          revisionId: null,
          question: typeof question === 'string' ? question : '',
        },
      });
    }
    requestAnimationFrame(() => {
      const region = document.querySelector('.assistant-page-conversation');
      region?.scrollIntoView({ block: 'start', behavior: 'instant' });
      region?.querySelector('textarea, input, button')?.focus({ preventScroll: true });
    });
  };
  const refreshAssistant = () => setMonitoringRefresh((value) => value + 1);
  const discardGuidance = () => {
    setGuidance(null);
    setAssistant((current) => (current?.topic === 'guidance' ? null : current));
    refreshAssistant();
  };
  const onTag = (tag) => navigate('explore', tag);
  const searchPolicies = ({ query = '', region = '전국', category = '전체' } = {}) => {
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (region !== '전국') params.set('region', region);
    if (category !== '전체') params.set('category', category);
    window.location.hash = 'explore' + (params.size ? '?' + params.toString() : '');
  };
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
  const visibleSaved = easy ? saved.slice(savedIndex, savedIndex + 3) : saved;
  return (
    <div className={'app-shell portal-shell route-' + route.page + (easy ? ' easy-mode' : '')}>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          main.current?.focus();
        }}
      >
        {' '}
        {t('본문으로 바로가기')}{' '}
      </a>
      <div className="main-shell">
        <header className="topbar portal-header" ref={header}>
          <a className="brand" href="#home" aria-label={t('복지나침반 홈')}>
            <img className="brand-image" src="/brand-logo.png" alt="" />
            <span>
              {' '}
              {t('복지나침반')}
              <small>{t('나를 위한 복지 비서')}</small>
            </span>
          </a>
          <nav className="portal-nav" aria-label={t('주 메뉴')}>
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
                {t(item.label)}
                {item.id === 'saved' && saved.length > 0 && (
                  <span className="nav-count">{saved.length}</span>
                )}
              </a>
            ))}
          </nav>
          <div className="header-actions">
            <LanguageSelector />
            <button className="mode-switch" role="switch" aria-checked={easy} onClick={toggleEasy}>
              <span className="switch-track" aria-hidden="true">
                <span />
              </span>{' '}
              {t('쉬운 화면')}
              <span className="mode-state">{easy ? t('켜짐') : t('꺼짐')}</span>
            </button>
            {user ? (
              <div className="account-actions">
                {user.admin_role === 'superadmin' && (
                  <a className="text-button" href="#admin">
                    {' '}
                    {t('관리자 관리')}{' '}
                  </a>
                )}
                {user.is_admin === true && (
                  <a className="text-button" href="/admin/exhibition/">
                    {' '}
                    {t('전시 QR 관리')}{' '}
                  </a>
                )}
                <span
                  className="auth-username"
                  title={t('{name}님', { name: user.name || t('회원') })}
                >
                  {t('{name}님', { name: user.name || t('회원') })}
                </span>
                <button className="text-button" onClick={logout} disabled={loggingOut}>
                  {loggingOut ? t('로그아웃 중…') : t('로그아웃')}
                </button>
              </div>
            ) : (
              <div className="account-actions">
                <a className="login-link" href="#login">
                  {' '}
                  {t('로그인')}{' '}
                </a>
                {!easy && (
                  <a className="signup-link" href="#signup">
                    {' '}
                    {t('회원가입')}{' '}
                  </a>
                )}
              </div>
            )}
          </div>
        </header>
        <main
          id="main-content"
          ref={main}
          tabIndex={-1}
          className={'main-content' + (route.page === 'guide' ? ' guide-layout' : '')}
        >
          {['home', 'explore', 'calendar', 'saved'].includes(route.page) && (
            <ContentLanguageNotice />
          )}
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
              onSearch={searchPolicies}
              onGuide={() => navigate('guide')}
              onCalendar={() => navigate('calendar')}
              onAssistant={() => openAssistantPage()}
              mode={appConfig.dataMode}
            />
          )}
          {route.page === 'assistant' && (
            <Suspense fallback={<p role="status">{t('AI 복지비서를 불러오고 있어요.')}</p>}>
              <AssistantPage
                key={user?.id || 'guest'}
                user={user}
                profile={profile}
                mode={appConfig.dataMode}
                onOpen={setSelected}
                onProfile={() => navigate('profile')}
                onStartConversation={startGuidance}
                refreshKey={monitoringRefresh}
                onProfileDeleted={discardGuidance}
                onProfileChanged={discardGuidance}
                conversation={
                  guidance?.owner === (user?.id || null) ? (
                    <GuidedConversation
                      key={guidance.key}
                      user={user}
                      policy={guidance.policy}
                      session={guidance.session}
                      onSessionChange={rememberGuidance}
                      onProfile={() => navigate('profile')}
                      onSaved={refreshAssistant}
                    />
                  ) : null
                }
              />
            </Suspense>
          )}
          {route.page === 'guide' && (
            <Suspense
              fallback={
                <p className="guide-loading" role="status">
                  {' '}
                  {t('서비스 소개를 불러오고 있어요.')}{' '}
                </p>
              }
            >
              <GuidePage
                onExplore={() => navigate('explore')}
                onProfile={() => navigate('profile')}
                onAssistant={() => openAssistantPage()}
                onChatbot={() => setAssistant({ topic: 'home' })}
                onCalendar={() => navigate('calendar')}
                onCalculator={() => navigate('calculator')}
                onEasyMode={() => {
                  setEasy(true);
                  if (!writeStoredValue(easyKey, true))
                    setNotice('화면 설정을 이 브라우저에 기억하지 못했어요.');
                  navigate('home');
                }}
              />
            </Suspense>
          )}
          {route.page === 'calendar' && <CalendarPage {...shared} repository={policyRepository} />}
          {route.page === 'explore' && (
            <PolicyExplorer
              key={[route.tag, route.query, route.region, route.category].join('|')}
              initialQuery={route.query}
              initialRegion={route.region}
              initialCategory={route.category}
              {...shared}
              repository={policyRepository}
              tag={route.tag}
              onClearTag={() => navigate('explore')}
            />
          )}
          {route.page === 'profile' && !route.setup && (
            <>
              <ProfilePage
                key={user?.id || 'guest'}
                user={user}
                profile={profile}
                remembered={remembered}
                easy={easy}
                onSave={(value, remember) => saveProfile(value, remember, 'session', false)}
                onMemberSaved={(current) => {
                  discardGuidance();
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
              {user && (
                <MonitoringPanel
                  key={`monitoring:${user.id}`}
                  user={user}
                  profile={profile}
                  mode={appConfig.dataMode}
                  onOpen={setSelected}
                  onProfileDeleted={discardGuidance}
                  onProfileChanged={discardGuidance}
                />
              )}
            </>
          )}
          {route.page === 'profile' && route.setup && (
            <section className="profile-page">
              <div className="page-heading">
                {!easy && (
                  <span className="eyebrow">
                    {user ? t('회원·추천 정보') : t('맞춤 추천 설정')}
                  </span>
                )}
                <h1>{route.setup ? t('가입이 완료됐어요') : t('내 정보')}</h1>
                <p>
                  {route.setup
                    ? t('맞춤 정보는 지금 설정하거나 나중에 내 정보에서 입력할 수 있어요.')
                    : user
                      ? t('회원 정보와 공고 추천에 사용할 정보를 관리해요.')
                      : easy
                        ? t('공고 추천에 사용할 정보를 관리합니다.')
                        : t('나에게 맞는 공고를 추천하는 데 사용해요.')}
                </p>
                {!route.setup && (
                  <a className="text-button calculator-entry" href="#calculator">
                    <Icon name="calculator" /> {t('중위소득 빠르게 확인하기')}{' '}
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
                  {' '}
                  {t('맞춤 정보를 저장하려면')} <a href="#login">{t('로그인')}</a>
                  {t('해 주세요.')} <a href="#home">{t('나중에 하기')}</a>
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
                    {' '}
                    {t('회원의 소득·재산 정보를 불러오고 있어요…')}{' '}
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
                {!easy && <span className="eyebrow">{t('다시 보고 싶은 공고')}</span>}
                <h1>{t('저장한 공고')}</h1>
                <p>{t('이 브라우저에 저장한 공고예요. 최신 내용은 공식 공고를 확인하세요.')}</p>
              </div>
              {saved.length ? (
                <>
                  <div className={'policy-grid' + (easy ? ' easy-policy-list' : '')}>
                    {visibleSaved.map((policy) => (
                      <PolicyCard key={policy.id} {...shared} policy={policy} saved />
                    ))}
                  </div>
                  {easy && saved.length > 3 && (
                    <nav className="pagination" aria-label={t('저장 공고 넘기기')}>
                      <button
                        className="button secondary"
                        disabled={savedIndex === 0}
                        onClick={() => setSavedIndex(Math.max(0, savedIndex - 3))}
                      >
                        {' '}
                        {t('이전 목록')}{' '}
                      </button>
                      <span>
                        {t('{start}–{end} / {total}개', {
                          start: savedIndex + 1,
                          end: Math.min(savedIndex + 3, saved.length),
                          total: saved.length,
                        })}
                      </span>
                      <button
                        className="button secondary"
                        disabled={savedIndex + 3 >= saved.length}
                        onClick={() => setSavedIndex(savedIndex + 3)}
                      >
                        {' '}
                        {t('다음 목록')}{' '}
                      </button>
                    </nav>
                  )}
                </>
              ) : (
                <div className="empty-state">
                  <Icon name="bookmark" size={34} />
                  <h2>{t('아직 저장한 공고가 없어요')}</h2>
                  <p>{t('마음에 드는 공고의 저장 버튼을 눌러주세요.')}</p>
                  <button className="button primary" onClick={() => navigate('explore')}>
                    {' '}
                    {t('공고 찾아보기')}{' '}
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
      <FloatingAssistant
        key={user?.id || 'guest'}
        session={assistant}
        onChange={setAssistant}
        easy={easy}
        user={user}
        repository={policyRepository}
        hideLauncher={route.page === 'guide'}
        blocked={
          Boolean(selected) ||
          ['login', 'signup', 'admin'].includes(route.page) ||
          (route.page === 'profile' && route.setup)
        }
        onNavigate={navigate}
        onOpenAssistant={openAssistantPage}
        onSaved={refreshAssistant}
        onToggleEasy={toggleEasy}
      />
      {notice && (
        <div className="toast" role="status">
          <span>{t(notice)}</span>
          <button aria-label={t('안내 닫기')} onClick={() => setNotice('')}>
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
