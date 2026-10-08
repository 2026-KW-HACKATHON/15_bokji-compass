import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import {
  PolicyTranslationStatus,
  useVisibleTranslatedPolicy,
} from '../../shared/i18n/PolicyTranslation.jsx';
import { useEffect, useId, useRef, useState } from 'react';
import { request } from '../../shared/api/client.js';
import Icon from '../../shared/ui/Icon.jsx';
import { assistantOverview, questionForNeed } from '../assistant/assistantPageModel.js';
import { categories, safeSourceUrl } from '../policies/policyModel.js';
import { households } from '../profile/profileModel.js';
import EconomicActivityFields from '../profile/EconomicActivityFields.jsx';
import { householdLabel } from '../profile/economicActivityModel.js';
import { createMonitoringApi } from './monitoringApi.js';
import { subscribeMonitoringChanges } from './monitoringEvents.js';
import AssistantProfileForm, { AssistantMemberSummary } from './AssistantProfileForm.jsx';
import RecommendationFeedbackForm from './RecommendationFeedbackForm.jsx';
import ApplicationGuide from '../policies/ApplicationGuide.jsx';
import {
  candidateStates,
  recommendationFeedbackReasons,
  disasterTypes,
  housingTenures,
  housingTypes,
  initialMonitoringProfile,
  todayInSeoul,
} from './monitoringModel.js';
import './monitoring.css';

const api = createMonitoringApi(request);
const errorMessage = (error) =>
  error.status === 401
    ? '로그인 상태를 다시 확인해 주세요. 생활정보를 불러오지 못했어요.'
    : error.status === 409
      ? '지속 안내를 켠 뒤 공고를 다시 확인해 주세요.'
      : error.status === 422
        ? '입력한 생활정보와 날짜를 확인해 주세요.'
        : error.message || '지속 안내를 확인하지 못했어요. 다시 시도해 주세요.';

export default function MonitoringPanel({
  user,
  profile,
  mode,
  onOpen,
  onOpenAlert,
  openingAlertId,
  onProfile,
  onStartConversation,
  onProfileDeleted,
  onProfileChanged,
  variant = 'default',
  refreshKey = 0,
  profileEntryRequest = 0,
}) {
  const { t, intlLocale } = useI18n();

  const monitoringDate = (value) =>
    value
      ? new Intl.DateTimeFormat(intlLocale, {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: 'Asia/Seoul',
        }).format(new Date(value))
      : t('미확인');
  const prefix = useId();
  const owner = user?.id || null;
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const initial = useRef(initialMonitoringProfile(profile));
  const requests = useRef(new Set());
  const mounted = useRef(false);
  const [snapshot, setSnapshot] = useState(null);
  const snapshotVersion = useRef(0);
  const feedbackRequest = useRef(null);
  const candidateList = useRef(null);
  const [pendingFeedback, setPendingFeedback] = useState(null);
  const [feedbackError, setFeedbackError] = useState(null);
  const [draft, setDraft] = useState(initial.current);
  const [enabled, setEnabled] = useState(false);
  const [consent, setConsent] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState('load');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);
  const [inboxRevision, setInboxRevision] = useState(0);
  const [candidateLimit, setCandidateLimit] = useState(3);
  const [view, setView] = useState('candidates');
  const assistant = variant === 'assistant';
  const notices = variant === 'notices';
  const standalone = notices || variant === 'guidance';
  const loginHref = `#login?return=${notices ? 'new-notices' : assistant ? 'assistant' : 'assistant-monitoring'}`;
  const refreshToken = `${refreshKey}:${inboxRevision}`;
  const refreshVersion = useRef(refreshToken);
  const handledProfileEntry = useRef(0);
  const detail = useRef(null);
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const available = !!owner && mode === 'api';
  const overview = snapshot ? assistantOverview(snapshot, user) : null;
  const activeCandidates =
    snapshot?.candidates.filter(
      (candidate) => candidate.active && !candidate.recommendation_feedback,
    ) || [];
  const previousCandidates =
    snapshot?.candidates.filter(
      (candidate) =>
        !candidate.active &&
        !candidate.recommendation_feedback &&
        !activeCandidates.some((current) => current.policy_id === candidate.policy_id),
    ) || [];
  const id = (name) => `${prefix}-${name}`;
  const displayedCandidates =
    view === 'progress' && assistant ? overview?.progress || [] : activeCandidates;
  const visibleCandidates = displayedCandidates.filter(
    (candidate) => candidate.policy_id !== pendingFeedback,
  );
  // Keep the pending card mounted so a failed save restores the selected reason.
  const renderedCandidates = displayedCandidates.filter(
    (candidate) =>
      candidate.policy_id === pendingFeedback ||
      visibleCandidates.slice(0, candidateLimit).includes(candidate),
  );
  const show = (section) =>
    notices
      ? section === 'alerts'
      : assistant
        ? !!snapshot?.profile && !editing && view === section
        : section !== 'alerts';

  function selectView(next) {
    setView(next);
    setCandidateLimit(3);
    window.requestAnimationFrame(() => {
      detail.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      detail.current?.focus({ preventScroll: true });
    });
  }

  function editProfile() {
    if (!editing) {
      setDraft(snapshot?.profile || initial.current);
      setEnabled(snapshot?.enabled || false);
      setConsent(false);
    }
    setError('');
    setMessage('');
    setEditing(true);
    selectView('settings');
  }

  useEffect(() => {
    if (
      !assistant ||
      !snapshot ||
      busy === 'load' ||
      profileEntryRequest <= handledProfileEntry.current
    )
      return;
    handledProfileEntry.current = profileEntryRequest;
    if (!snapshot.profile) editProfile();
  }, [profileEntryRequest, snapshot, busy, assistant]);

  function cancelAssistantEdit() {
    setEditing(false);
    setDraft(snapshot?.profile || initial.current);
    setEnabled(snapshot?.enabled || false);
    setConsent(false);
    setError('');
    setView('candidates');
    window.requestAnimationFrame(() => document.getElementById(id('profile-action'))?.focus());
  }

  useEffect(() => {
    mounted.current = true;
    snapshotVersion.current += 1;
    const version = snapshotVersion.current;
    feedbackRequest.current = null;
    setPendingFeedback(null);
    setFeedbackError(null);
    setSnapshot(null);
    setDraft(initial.current);
    setConsent(false);
    setEnabled(false);
    setError('');
    setMessage('');
    setView('candidates');
    if (!available) {
      setBusy('');
      return () => {
        mounted.current = false;
      };
    }
    const controller = new AbortController();
    requests.current.add(controller);
    setBusy('load');
    api
      .read({ signal: controller.signal })
      .then((value) => {
        if (
          controller.signal.aborted ||
          currentOwner.current !== owner ||
          version !== snapshotVersion.current
        )
          return;
        setSnapshot(value);
        setDraft(value.profile || initial.current);
        setEnabled(value.enabled);
        setEditing(!assistant && !notices && !value.profile);
        setBusy('');
      })
      .catch((failure) => {
        if (controller.signal.aborted || currentOwner.current !== owner) return;
        setError(errorMessage(failure));
        setBusy('');
      })
      .finally(() => requests.current.delete(controller));
    return () => {
      mounted.current = false;
      for (const pending of requests.current) pending.abort();
      requests.current.clear();
    };
  }, [owner, available, reload]);

  useEffect(() => subscribeMonitoringChanges(() => setInboxRevision((value) => value + 1)), []);

  useEffect(() => {
    if (refreshVersion.current === refreshToken) return;
    refreshVersion.current = refreshToken;
    if (!available) return;
    const controller = new AbortController();
    requests.current.add(controller);
    const version = snapshotVersion.current;
    api
      .read({ signal: controller.signal })
      .then((value) => {
        if (
          controller.signal.aborted ||
          !mounted.current ||
          currentOwner.current !== owner ||
          version !== snapshotVersion.current
        )
          return;
        setSnapshot(value);
        if (!editingRef.current) {
          setDraft(value.profile || initial.current);
          setEnabled(value.enabled);
        }
      })
      .catch((failure) => {
        if (
          !controller.signal.aborted &&
          mounted.current &&
          currentOwner.current === owner &&
          version === snapshotVersion.current
        )
          setError(errorMessage(failure));
      })
      .finally(() => requests.current.delete(controller));
    return () => controller.abort();
  }, [refreshToken, available, owner]);

  useEffect(() => {
    if (!available || !snapshot?.enabled || busy) return;
    let active = true;
    let pending = false;
    const controllers = new Set();
    async function checkAlerts() {
      if (pending || document.visibilityState === 'hidden') return;
      pending = true;
      const controller = new AbortController();
      const version = snapshotVersion.current;
      controllers.add(controller);
      requests.current.add(controller);
      try {
        const value = await api.read({ signal: controller.signal });
        if (
          active &&
          !controller.signal.aborted &&
          currentOwner.current === owner &&
          version === snapshotVersion.current
        )
          setSnapshot(value);
      } catch {
        // The last successful snapshot remains visible; actions expose retryable errors.
      } finally {
        pending = false;
        controllers.delete(controller);
        requests.current.delete(controller);
      }
    }
    const timer = window.setInterval(checkAlerts, 60000);
    window.addEventListener('focus', checkAlerts);
    document.addEventListener('visibilitychange', checkAlerts);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', checkAlerts);
      document.removeEventListener('visibilitychange', checkAlerts);
      for (const controller of controllers) controller.abort();
    };
  }, [owner, available, snapshot?.enabled, busy]);

  async function change(action, operation, success, apply) {
    if (busy || !available) return false;
    snapshotVersion.current += 1;
    const controller = new AbortController();
    requests.current.add(controller);
    setBusy(action);
    setError('');
    setMessage('');
    try {
      const value = await operation({ signal: controller.signal });
      if (controller.signal.aborted || !mounted.current || currentOwner.current !== owner) return;
      if (value?.updated === true) {
        const latest = await api.read({ signal: controller.signal });
        if (controller.signal.aborted || !mounted.current || currentOwner.current !== owner) return;
        snapshotVersion.current += 1;
        setSnapshot(latest);
      } else {
        snapshotVersion.current += 1;
        setSnapshot(value);
        apply?.(value);
      }
      setMessage(
        action === 'refresh' && value?.scan_status === 'unavailable'
          ? '지원 공고를 확인하지 못했어요. 기존 안내를 유지했어요.'
          : success,
      );
      return true;
    } catch (failure) {
      if (!controller.signal.aborted && mounted.current && currentOwner.current === owner)
        setError(
          action === 'preparation'
            ? failure.status === 409
              ? '공고가 변경되어 서류 준비 항목을 다시 확인해야 해요. 공고 다시 확인을 눌러 주세요.'
              : '서류 준비 상태를 저장하지 못했어요. 다시 시도해 주세요.'
            : errorMessage(failure),
        );
      return false;
    } finally {
      requests.current.delete(controller);
      if (!controller.signal.aborted && mounted.current && currentOwner.current === owner)
        setBusy('');
    }
  }

  async function excludeCandidate(candidate, reason) {
    if (busy || !available || feedbackRequest.current) return;
    const attempt = { owner, policyId: candidate.policy_id };
    feedbackRequest.current = attempt;
    setFeedbackError(null);
    setPendingFeedback(candidate.policy_id);
    window.requestAnimationFrame(() => {
      const next = candidateList.current?.querySelector(
        '.monitoring-candidate:not([hidden]) h4 button',
      );
      (next || detail.current)?.focus({ preventScroll: true });
    });
    const saved = await change(
      'feedback',
      (options) => api.feedback(candidate, reason, options),
      '추천에서 제외했어요. 선택한 이유를 다음 추천에 반영할게요.',
    );
    if (!mounted.current || currentOwner.current !== owner || feedbackRequest.current !== attempt)
      return;
    feedbackRequest.current = null;
    setPendingFeedback(null);
    if (!saved) setFeedbackError(candidate.policy_id);
  }

  function submit(event) {
    event.preventDefault();
    if (!consent) {
      setError('생활정보를 계정에 저장하고 지속 안내에 사용하는 데 동의해 주세요.');
      return;
    }
    void change(
      'save',
      (options) => api.save(draft, { ...options, consent, enabled }),
      '생활정보와 지속 안내 설정을 계정에 저장했어요.',
      (value) => {
        setDraft(value.profile);
        setEnabled(value.enabled);
        setConsent(false);
        setEditing(false);
        if (assistant) setView('candidates');
        onProfileChanged?.();
      },
    );
  }

  function optionField(name, label, options) {
    return (
      <label className="field-label" htmlFor={id(name)} key={name}>
        {t(label)}
        <select
          id={id(name)}
          value={draft[name] ?? ''}
          disabled={!!busy}
          onChange={(event) =>
            setDraft((value) => ({ ...value, [name]: event.target.value || null }))
          }
        >
          <option value="">{t('미확인·입력하지 않음')}</option>
          {options.map(([value, text]) => (
            <option key={value} value={value}>
              {t(text)}
            </option>
          ))}
        </select>
      </label>
    );
  }
  function booleanField(name, label, yes = '예', no = '아니요') {
    return (
      <label className="field-label" htmlFor={id(name)} key={name}>
        {t(label)}
        <select
          id={id(name)}
          value={draft[name] === null ? '' : String(draft[name])}
          disabled={!!busy}
          onChange={(event) =>
            setDraft((value) => ({
              ...value,
              [name]: event.target.value === '' ? null : event.target.value === 'true',
            }))
          }
        >
          <option value="">{t('미확인·입력하지 않음')}</option>
          <option value="true">{t(yes)}</option>
          <option value="false">{t(no)}</option>
        </select>
      </label>
    );
  }

  return (
    <section
      className={'monitoring-panel' + (assistant ? ' monitoring-assistant' : '')}
      aria-labelledby={id('heading')}
      aria-busy={!!busy}
    >
      {assistant || standalone ? (
        <h2 id={id('heading')} className="sr-only">
          {t(notices ? '새 안내' : assistant ? '나를 위한 지원 현황' : '지속 복지 안내')}
        </h2>
      ) : (
        <>
          <div className="monitoring-heading">
            <div>
              {!assistant && (
                <span className="eyebrow">
                  <Icon name="compass" size={18} /> {t('내 상황에 맞춰 이어가는 안내')}{' '}
                </span>
              )}
              <h2 id={id('heading')}>
                {assistant ? t('나를 위한 지원 현황') : t('지속 복지 안내')}
              </h2>
              <p>
                {assistant
                  ? t('저장한 생활정보와 등록된 공고를 기준으로 정리했어요.')
                  : t('거주 지역과 생활정보를 기준으로 새 공고와 필요한 지원을 계속 살펴봐요.')}
              </p>
            </div>
            {snapshot && (
              <span className={'monitoring-status' + (snapshot.enabled ? ' is-on' : '')}>
                {snapshot.enabled ? t('지속 안내 켜짐') : t('지속 안내 꺼짐')}
              </span>
            )}
          </div>
          <p className="monitoring-service-note">
            {' '}
            {t('등록된 재난 지원 공고를 찾으면 실제 피해 여부부터 확인해요.')}{' '}
          </p>
        </>
      )}
      {!owner ? (
        <p className="notice-box">
          <a href={loginHref}>{t('로그인')}</a>
          {t('하면 내 계정에 정보를 저장하고 안내를 이어갈 수 있어요.')}{' '}
        </p>
      ) : mode !== 'api' ? (
        <p className="notice-box">{t('지속 안내를 사용할 수 있도록 서버 연결을 확인해 주세요.')}</p>
      ) : (
        <>
          {busy === 'load' && (
            <p className="notice-box" role="status">
              {' '}
              {t('계정에 저장된 지속 안내를 불러오고 있어요.')}{' '}
            </p>
          )}
          {error && !(assistant && editing) && (
            <div className="notice-box monitoring-error" role="alert">
              <p>{t(error)}</p>
              {(!snapshot || error.includes('로그인 상태')) && (
                <button
                  className="text-button"
                  disabled={!!busy}
                  onClick={() => setReload((value) => value + 1)}
                >
                  {' '}
                  {t('다시 불러오기')}{' '}
                </button>
              )}
              {error.includes('로그인 상태') && (
                <a className="text-button" href={loginHref}>
                  {' '}
                  {t('로그인하기')}{' '}
                </a>
              )}
            </div>
          )}
          {message && (
            <p className="monitoring-message" role="status">
              <Icon name="check" size={18} /> {t(message)}
            </p>
          )}
          {!notices && snapshot?.scan_status === 'unavailable' && (
            <p className="notice-box" role="status">
              {' '}
              {t(
                '생활정보는 저장됐지만 지원 공고를 확인하지 못했어요. 잠시 후 공고 다시 확인을 눌러 주세요.',
              )}{' '}
            </p>
          )}
          {snapshot && (
            <>
              {standalone && (
                <div className="monitoring-page-status">
                  <span className={'monitoring-status' + (snapshot.enabled ? ' is-on' : '')}>
                    {snapshot.enabled ? t('지속 안내 켜짐') : t('지속 안내 꺼짐')}
                  </span>
                  {notices && (
                    <span>
                      {t('최근 공고 확인')} · {monitoringDate(snapshot.last_checked_at)}
                    </span>
                  )}
                </div>
              )}
              {variant === 'guidance' && (
                <p className="monitoring-service-note">
                  {t('등록된 재난 지원 공고를 찾으면 실제 피해 여부부터 확인해요.')}
                </p>
              )}
              {notices && !snapshot.enabled && (
                <p className="monitoring-service-note">
                  {t('새 공고 알림이 꺼져 있어요.')}{' '}
                  <a className="text-button" href="#assistant-monitoring">
                    {t('지속 복지 안내 설정')}
                  </a>
                </p>
              )}
              {assistant && editing && (
                <AssistantProfileForm
                  user={user}
                  draft={draft}
                  setDraft={setDraft}
                  enabled={enabled}
                  setEnabled={setEnabled}
                  consent={consent}
                  setConsent={setConsent}
                  busy={busy}
                  error={error}
                  onSubmit={submit}
                  onCancel={cancelAssistantEdit}
                  onProfile={onProfile}
                />
              )}
              {assistant && !editing && !snapshot.profile && (
                <div className="assistant-onboarding">
                  <h3>{t('내 정보부터 간단히 알려주세요')}</h3>
                  <p>
                    {t('생활정보와 관심 분야를 알려주시면 나에게 맞는 지원을 찾는 데 도움이 돼요.')}
                  </p>
                  <button
                    id={id('profile-action')}
                    className="button primary"
                    disabled={!!busy}
                    onClick={editProfile}
                  >
                    {t('내 정보 입력하기')} <Icon name="arrow" size={18} />
                  </button>
                  <p className="assistant-onboarding-note">
                    {t('모든 정보는 선택 사항이에요. 아는 내용만 입력해 주세요.')}
                  </p>
                  <AssistantMemberSummary user={user} onProfile={onProfile} />
                </div>
              )}
              {assistant && !editing && snapshot.profile && (
                <>
                  <DashboardOverview
                    snapshot={snapshot}
                    overview={overview}
                    disabled={!!busy}
                    onEdit={editProfile}
                    onView={selectView}
                    actionId={id('profile-action')}
                  />
                  <div className="monitoring-dashboard-tools">
                    <p>
                      {t('최근 공고 확인 ·')} {monitoringDate(snapshot.last_checked_at)}
                    </p>
                    <button
                      className="text-button"
                      disabled={!!busy || !snapshot.enabled}
                      onClick={() =>
                        void change('refresh', api.refresh, '등록된 공고를 다시 확인했어요.')
                      }
                    >
                      {busy === 'refresh' ? t('공고 확인 중…') : t('공고 다시 확인')}
                    </button>
                  </div>
                  <nav className="monitoring-dashboard-nav" aria-label={t('AI 복지비서 상세 항목')}>
                    {[
                      ['candidates', '맞춤 지원'],
                      ['progress', '신청 현황'],
                      ['alerts', '새 안내'],
                      ['settings', '내 정보'],
                    ].map(([key, label]) => (
                      <button key={key} aria-pressed={view === key} onClick={() => selectView(key)}>
                        {t(label)}
                      </button>
                    ))}
                  </nav>
                  <div ref={detail} tabIndex={-1} className="monitoring-dashboard-detail" />
                </>
              )}
              {show('settings') && (
                <>
                  {assistant ? (
                    <>
                      <AssistantMemberSummary user={user} onProfile={onProfile} />
                      <p className="assistant-settings-state">
                        {snapshot.enabled
                          ? t('새 공고를 계속 확인하고 있어요.')
                          : t('새 공고 알림이 꺼져 있어요.')}
                      </p>
                    </>
                  ) : (
                    <div className="monitoring-overview">
                      <p>
                        <strong>{t('최근 공고 확인')}</strong>{' '}
                        {monitoringDate(snapshot.last_checked_at)}
                      </p>
                      <p>
                        <strong>{t('회원 거주 지역')}</strong> {t(user.region || '미입력')}
                        {user.address ? ` · ${user.address}` : ''}{' '}
                        <a
                          className="text-button"
                          href="#profile"
                          onClick={
                            onProfile
                              ? (event) => {
                                  event.preventDefault();
                                  onProfile();
                                }
                              : undefined
                          }
                        >
                          {' '}
                          {t('회원 정보에서 수정')}{' '}
                        </a>
                      </p>
                    </div>
                  )}
                  {snapshot.profile && (
                    <div className="monitoring-actions">
                      <button
                        className="button secondary"
                        disabled={!!busy}
                        onClick={() => {
                          if (assistant) {
                            editProfile();
                            return;
                          }
                          setDraft(snapshot.profile);
                          setEnabled(snapshot.enabled);
                          setConsent(false);
                          setEditing(!editing);
                          setError('');
                        }}
                      >
                        {editing ? t('생활정보 수정 닫기') : t('생활정보 수정')}
                      </button>
                      <button
                        className="button secondary"
                        disabled={!!busy || !snapshot.enabled}
                        onClick={() =>
                          void change('refresh', api.refresh, '등록된 공고를 다시 확인했어요.')
                        }
                      >
                        {busy === 'refresh' ? t('공고 확인 중…') : t('공고 다시 확인')}
                      </button>
                      <button
                        className="text-button"
                        disabled={!!busy}
                        onClick={() =>
                          void change(
                            'preferences',
                            (options) => api.preferences(!snapshot.enabled, options),
                            snapshot.enabled ? '지속 안내를 중지했어요.' : '지속 안내를 켰어요.',
                            (value) => setEnabled(value.enabled),
                          )
                        }
                      >
                        {snapshot.enabled ? t('지속 안내 중지') : t('지속 안내 다시 켜기')}
                      </button>
                    </div>
                  )}
                  {!snapshot.profile && (
                    <p className="monitoring-intro">
                      {' '}
                      {t(
                        '모든 항목은 선택이에요. 모르는 정보는 미확인으로 두세요. 저장한 정보와 회원 거주 지역을 지원 탐색에 함께 사용해요.',
                      )}{' '}
                    </p>
                  )}
                  {!snapshot.profile && !editing && (
                    <button className="button secondary" onClick={editProfile}>
                      {' '}
                      {t('생활정보 추가하기')}{' '}
                    </button>
                  )}
                  {editing && (
                    <form className="monitoring-form" onSubmit={submit}>
                      <fieldset disabled={!!busy}>
                        <legend>{t('일과 가구')}</legend>
                        <div className="monitoring-form-grid">
                          <EconomicActivityFields
                            value={draft.occupation}
                            onChange={(occupation) =>
                              setDraft((value) => ({ ...value, occupation }))
                            }
                          />
                          {optionField(
                            'household',
                            '가구 구성',
                            households.slice(1).map((value) => [value, householdLabel(value)]),
                          )}
                          {booleanField('job_seeking', '구직 상태', '구직 중', '구직 활동 없음')}
                        </div>
                      </fieldset>
                      <fieldset disabled={!!busy}>
                        <legend>{t('주거 상황')}</legend>
                        <div className="monitoring-form-grid">
                          {optionField(
                            'housing_tenure',
                            '현재 주택의 소유·거주 형태',
                            housingTenures,
                          )}
                          {optionField('housing_type', '주택 종류', housingTypes)}
                          <label className="field-label" htmlFor={id('building_year')}>
                            {' '}
                            {t('주택 준공연도')}{' '}
                            <input
                              id={id('building_year')}
                              type="number"
                              inputMode="numeric"
                              min="1800"
                              max={todayInSeoul().slice(0, 4)}
                              step="1"
                              placeholder={t('예: 1995')}
                              value={draft.building_year ?? ''}
                              onChange={(event) =>
                                setDraft((value) => ({
                                  ...value,
                                  building_year:
                                    event.target.value === '' ? null : Number(event.target.value),
                                }))
                              }
                            />
                            <small>
                              {t('모르면 비워 두세요. 건축물대장 등에서 확인할 수 있어요.')}
                            </small>
                          </label>
                          {booleanField(
                            'repair_needed',
                            '주택 수리가 필요한가요?',
                            '수리가 필요함',
                            '필요하지 않음',
                          )}
                        </div>
                      </fieldset>
                      <fieldset disabled={!!busy}>
                        <legend>{t('직접 확인한 재난 피해')}</legend>
                        <p className="monitoring-field-help">
                          {' '}
                          {t(
                            '같은 지역에 재난이 발생했어도 내 피해 여부와 지원 조건은 따로 확인해요.',
                          )}{' '}
                        </p>
                        <div className="monitoring-form-grid">
                          {optionField('disaster_type', '재난 종류', disasterTypes)}
                          {booleanField(
                            'disaster_damage',
                            '내 재난 피해 여부',
                            '피해 있음',
                            '피해 없음',
                          )}
                          <label className="field-label" htmlFor={id('disaster_occurred_on')}>
                            {' '}
                            {t('피해 발생일')}{' '}
                            <input
                              id={id('disaster_occurred_on')}
                              type="date"
                              max={todayInSeoul()}
                              value={draft.disaster_occurred_on || ''}
                              onChange={(event) =>
                                setDraft((value) => ({
                                  ...value,
                                  disaster_occurred_on: event.target.value || null,
                                }))
                              }
                            />
                          </label>
                        </div>
                      </fieldset>
                      <fieldset disabled={!!busy}>
                        <legend>{t('관심 분야')}</legend>
                        <div className="monitoring-interests">
                          {categories.slice(1).map((category) => (
                            <label key={category}>
                              <input
                                type="checkbox"
                                checked={draft.interests.includes(category)}
                                onChange={(event) =>
                                  setDraft((value) => ({
                                    ...value,
                                    interests: event.target.checked
                                      ? [...value.interests, category]
                                      : value.interests.filter((item) => item !== category),
                                  }))
                                }
                              />
                              {t(category)}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <div className="monitoring-consent">
                        <label>
                          <input
                            type="checkbox"
                            checked={enabled}
                            disabled={!!busy}
                            onChange={(event) => setEnabled(event.target.checked)}
                          />{' '}
                          {t('지속 안내 켜기')}{' '}
                        </label>
                        <p>
                          {' '}
                          {t(
                            '켜면 저장한 상황으로 등록된 지원 공고를 계속 비교하고 새 안내를 이 화면에 모아요. 끄면 새 안내를 만들지 않아요.',
                          )}{' '}
                        </p>
                        <label>
                          <input
                            type="checkbox"
                            checked={consent}
                            disabled={!!busy}
                            onChange={(event) => setConsent(event.target.checked)}
                          />{' '}
                          {t(
                            '생활정보를 내 계정에 저장하고 지속 복지 안내에 사용하는 데 동의해요.',
                          )}{' '}
                        </label>
                        <p>
                          {' '}
                          {t(
                            '언제든 지속 안내를 중지하거나 저장한 생활정보와 안내 기록을 삭제할 수 있어요.',
                          )}{' '}
                        </p>
                      </div>
                      <div className="monitoring-actions">
                        <button
                          type="submit"
                          className="button primary"
                          disabled={!!busy || !consent}
                        >
                          {busy === 'save' ? t('저장 중…') : t('생활정보와 안내 설정 저장')}
                        </button>
                        {snapshot.profile && (
                          <button
                            type="button"
                            className="button secondary"
                            disabled={!!busy}
                            onClick={() => {
                              setEditing(false);
                              setDraft(snapshot.profile);
                              setConsent(false);
                              setEnabled(snapshot.enabled);
                              setError('');
                            }}
                          >
                            {' '}
                            {t('수정 취소')}{' '}
                          </button>
                        )}
                      </div>
                    </form>
                  )}
                </>
              )}
              {(snapshot.profile || assistant || notices) && (
                <>
                  {show('questions') && (
                    <>
                      <div className="monitoring-section-heading">
                        <h3>{assistant ? t('추가로 확인할 정보') : t('살펴볼 지원 분야')}</h3>
                      </div>
                      {snapshot.needs.length ? (
                        <div className="monitoring-needs">
                          {snapshot.needs.map((need) => (
                            <article className="monitoring-need" key={need.id}>
                              <h4>{need.title}</h4>
                              <p>{need.reason}</p>
                              <Questions
                                questions={need.questions}
                                label="내 정보에서 더 확인할 내용"
                              />
                              {assistant && need.questions.length > 0 && (
                                <button
                                  className="text-button"
                                  onClick={() => onStartConversation?.(questionForNeed(need.id))}
                                >
                                  {' '}
                                  {t('AI에게 물어보기')} <Icon name="arrow" size={16} />
                                </button>
                              )}
                            </article>
                          ))}
                        </div>
                      ) : (
                        <p className="monitoring-empty">
                          {' '}
                          {t(
                            '현재 정보에서 추가로 살펴볼 지원 분야를 찾지 못했어요. 상황이 바뀌면 생활정보를 수정해 주세요.',
                          )}{' '}
                        </p>
                      )}
                      {assistant && overview.questions.filter((item) => item.policy).length > 0 && (
                        <div className="monitoring-questions-list">
                          {overview.questions
                            .filter((item) => item.policy)
                            .map((item) => (
                              <article key={item.question}>
                                <strong>{item.title}</strong>
                                <p>{item.question}</p>
                                <button className="text-button" onClick={() => onOpen(item.policy)}>
                                  {' '}
                                  {t('공고에서 조건 확인하기')} <Icon name="arrow" size={16} />
                                </button>
                              </article>
                            ))}
                        </div>
                      )}
                    </>
                  )}
                  {(show('candidates') || show('progress')) && (
                    <>
                      <div className="monitoring-section-heading">
                        <h3>
                          {assistant && view === 'progress'
                            ? t('신청 진행 상태')
                            : t('관련 지원 후보')}{' '}
                          <span>
                            {visibleCandidates.length}
                            {t('개')}
                          </span>
                        </h3>
                      </div>
                      {pendingFeedback && (
                        <p className="recommendation-feedback-status" role="status">
                          {t('추천에서 제외하는 중이에요.')}
                        </p>
                      )}
                      {displayedCandidates.length ? (
                        <div className="monitoring-candidates" ref={candidateList}>
                          {renderedCandidates.map((candidate) => (
                            <Candidate
                              key={`${candidate.need_id}:${candidate.policy_id}`}
                              candidate={candidate}
                              hidden={candidate.policy_id === pendingFeedback}
                              feedbackError={candidate.policy_id === feedbackError}
                              disabled={!!busy}
                              onOpen={onOpen}
                              manageProgress={assistant && view === 'progress'}
                              onPrepared={
                                candidate.active && !candidate.recommendation_feedback
                                  ? (documentId, prepared) =>
                                      void change(
                                        'preparation',
                                        (options) =>
                                          api.preparation(candidate, documentId, prepared, options),
                                        '서류 준비 상태를 저장했어요.',
                                      )
                                  : undefined
                              }
                              onFeedback={(reason) => void excludeCandidate(candidate, reason)}
                              onState={(state) =>
                                void change(
                                  'state',
                                  (options) => api.state(candidate, state, options),
                                  '지원 진행 상태를 저장했어요.',
                                )
                              }
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="monitoring-empty">
                          {assistant && view === 'progress'
                            ? t('아직 저장된 신청 기록이 없어요.')
                            : assistant && !snapshot.enabled && !snapshot.last_checked_at
                              ? t(
                                  '내 정보가 저장됐어요. 새 공고 안내를 켜면 관련 지원을 찾아드려요.',
                                )
                              : snapshot.recommendation_feedback.length
                                ? t('추천에서 제외한 공고 외에 현재 안내할 지원 후보가 없어요.')
                                : !snapshot.profile
                                  ? t(
                                      '아직 저장한 생활정보가 없어요. 내 상황을 추가하고 지속 안내를 켜면 관련 지원 후보를 찾아드려요.',
                                    )
                                  : t(
                                      '현재 등록된 공고에서 관련 지원 후보를 찾지 못했어요. 받을 수 있는 지원이 없다는 뜻은 아니에요. 새 공고가 확인되면 여기서 안내해요.',
                                    )}
                        </p>
                      )}
                      {assistant &&
                        view === 'candidates' &&
                        !snapshot.enabled &&
                        !displayedCandidates.length && (
                          <button
                            className="button secondary"
                            disabled={!!busy}
                            onClick={() =>
                              void change(
                                'preferences',
                                (options) => api.preferences(true, options),
                                '지속 안내를 켰어요.',
                                (value) => setEnabled(value.enabled),
                              )
                            }
                          >
                            {t('새 공고 안내 켜기')}
                          </button>
                        )}
                      {visibleCandidates.length > 3 && (
                        <div className="monitoring-actions">
                          {candidateLimit < visibleCandidates.length && (
                            <button
                              className="button secondary"
                              onClick={() => setCandidateLimit((value) => value + 3)}
                            >
                              {' '}
                              {t('지원 후보 3개 더 보기')}{' '}
                            </button>
                          )}
                          {candidateLimit > 3 && (
                            <button className="text-button" onClick={() => setCandidateLimit(3)}>
                              {' '}
                              {t('처음 3개만 보기')}{' '}
                            </button>
                          )}
                          <span className="fine-print">
                            {Math.min(candidateLimit, visibleCandidates.length)} /{' '}
                            {visibleCandidates.length}
                            {t('개 표시')}{' '}
                          </span>
                        </div>
                      )}
                      {previousCandidates.length > 0 && view !== 'progress' && (
                        <>
                          <div className="monitoring-section-heading">
                            <h3>
                              {' '}
                              {t('이전 지원 기록')}{' '}
                              <span>
                                {previousCandidates.length}
                                {t('개')}
                              </span>
                            </h3>
                          </div>
                          <details className="monitoring-history">
                            <summary>{t('이전 지원 기록 펼치기')}</summary>
                            <p className="monitoring-history-note">
                              {' '}
                              {t(
                                '현재 탐색 결과에 없는 공고의 진행 기록이에요. 최신 조건과 일정은 공식 공고에서 다시 확인해 주세요.',
                              )}{' '}
                            </p>
                            <div className="monitoring-candidates">
                              {previousCandidates.map((candidate) => (
                                <Candidate
                                  key={`${candidate.need_id}:${candidate.policy_id}`}
                                  candidate={candidate}
                                  disabled={!!busy}
                                  onOpen={onOpen}
                                  manageProgress
                                  onState={(state) =>
                                    void change(
                                      'state',
                                      (options) => api.state(candidate, state, options),
                                      '지원 진행 상태를 저장했어요.',
                                    )
                                  }
                                />
                              ))}
                            </div>
                          </details>
                        </>
                      )}
                    </>
                  )}
                  {show('candidates') && snapshot.recommendation_feedback.length > 0 && (
                    <details className="monitoring-history recommendation-excluded">
                      <summary>
                        {t('추천에서 제외한 공고')} ({snapshot.recommendation_feedback.length})
                      </summary>
                      <ul>
                        {snapshot.recommendation_feedback.map((item) => (
                          <li key={item.policy_id}>
                            <div>
                              <strong>{item.title}</strong>
                              <p>
                                {t(
                                  recommendationFeedbackReasons.find(
                                    ([value]) => value === item.reason,
                                  )?.[1],
                                )}
                              </p>
                            </div>
                            <button
                              className="text-button"
                              disabled={!!busy}
                              onClick={() =>
                                void change(
                                  'feedback',
                                  (options) => api.feedback(item, null, options),
                                  '이 공고를 다시 추천받도록 변경했어요.',
                                )
                              }
                            >
                              {t('다시 추천받기')}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {show('alerts') && (
                    <>
                      <div className="monitoring-section-heading">
                        <h3>
                          {' '}
                          {t('새 안내')}{' '}
                          <span>
                            {t('안 읽음')} {snapshot.unread_count}
                            {t('개')}
                          </span>
                        </h3>
                        {snapshot.alerts.some((alert) => !alert.read) && (
                          <button
                            className="text-button"
                            disabled={!!busy}
                            onClick={() =>
                              void change(
                                'read',
                                (options) =>
                                  api.readAlerts(
                                    snapshot.alerts
                                      .filter((alert) => !alert.read)
                                      .map((alert) => alert.id),
                                    options,
                                  ),
                                '화면에 있는 새 안내를 읽음으로 표시했어요.',
                              )
                            }
                          >
                            {' '}
                            {t('표시된 안내 읽음')}{' '}
                          </button>
                        )}
                      </div>
                      {snapshot.alerts.length ? (
                        <ul className="monitoring-alerts">
                          {snapshot.alerts.map((alert) => (
                            <li key={alert.id} className={alert.read ? 'is-read' : ''}>
                              <button
                                type="button"
                                className="monitoring-alert-open"
                                disabled={!!busy || !!openingAlertId || !onOpenAlert}
                                onClick={() => void onOpenAlert(alert)}
                                aria-label={t('{title} 관련 공고 보기', { title: alert.title })}
                              >
                                <span className="monitoring-alert-label">
                                  {alert.read ? t('읽음') : t('새 안내')}
                                </span>
                                <strong>{alert.title}</strong>
                                <span className="monitoring-alert-body">{alert.body}</span>
                                <small>{monitoringDate(alert.created_at)}</small>
                                <span className="monitoring-alert-link">
                                  {t(
                                    openingAlertId === alert.id
                                      ? '관련 공고를 여는 중이에요.'
                                      : '관련 공고 보기',
                                  )}
                                  <Icon name="right" size={16} />
                                </span>
                              </button>
                              {!alert.read && (
                                <button
                                  className="text-button"
                                  disabled={!!busy}
                                  aria-label={t('{title} 읽음 표시', { title: alert.title })}
                                  onClick={() =>
                                    void change(
                                      'read',
                                      (options) => api.readAlerts([alert.id], options),
                                      '안내를 읽음으로 표시했어요.',
                                    )
                                  }
                                >
                                  {' '}
                                  {t('읽음 표시')}{' '}
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="monitoring-empty">{t('아직 새 안내가 없어요.')}</p>
                      )}
                    </>
                  )}
                  {snapshot.profile && show('settings') && (
                    <div className="monitoring-delete">
                      {deleting ? (
                        <div className="notice-box">
                          <p>
                            {' '}
                            {t(
                              '저장한 생활정보, 지원 후보의 진행 상태와 새 안내를 삭제하고 지속 안내를 중지해요.',
                            )}{' '}
                          </p>
                          <div className="monitoring-actions">
                            <button
                              className="button secondary"
                              disabled={!!busy}
                              onClick={() =>
                                void change(
                                  'delete',
                                  api.remove,
                                  '생활정보와 지속 안내 기록을 삭제했어요.',
                                  () => {
                                    setDraft(initialMonitoringProfile(null));
                                    setEnabled(false);
                                    setConsent(false);
                                    setDeleting(false);
                                    setEditing(!assistant);
                                    onProfileDeleted?.();
                                  },
                                )
                              }
                            >
                              {busy === 'delete' ? t('삭제 중…') : t('생활정보와 안내 기록 삭제')}
                            </button>
                            <button
                              className="text-button"
                              disabled={!!busy}
                              onClick={() => setDeleting(false)}
                            >
                              {' '}
                              {t('삭제 취소')}{' '}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="text-button"
                          disabled={!!busy}
                          onClick={() => setDeleting(true)}
                        >
                          {' '}
                          {t('저장한 생활정보와 안내 삭제')}{' '}
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

function DashboardOverview({ snapshot, overview, disabled, onEdit, onView, actionId }) {
  const { t } = useI18n();
  return (
    <div className="assistant-summary">
      <div className="assistant-summary-profile">
        <div>
          <h3>
            <Icon name="user" size={20} />
            {t('내 정보')}
          </h3>
          {overview.facts.length > 0 ? (
            <ul className="monitoring-fact-chips">
              {overview.facts.map((fact) => {
                const year = /^(\d+)년 준공$/.exec(fact)?.[1];
                return <li key={fact}>{year ? t('{year}년 준공', { year }) : t(fact)}</li>;
              })}
            </ul>
          ) : (
            <p>{t('생활정보를 더 입력하면 지원을 찾는 데 도움이 돼요.')}</p>
          )}
        </div>
        <button id={actionId} className="text-button" disabled={disabled} onClick={onEdit}>
          {t('내 정보 수정')}
          <Icon name="right" size={16} />
        </button>
      </div>
      <div className="assistant-summary-counts">
        <button
          onClick={() => onView('alerts')}
          aria-label={t('새 안내 {count}개 보기', { count: snapshot.unread_count })}
        >
          <Icon name="sparkles" size={18} />
          {t('새 안내')} <strong>{snapshot.unread_count}</strong>
        </button>
        <button
          onClick={() => onView('progress')}
          aria-label={t('신청 현황 {count}개 보기', { count: overview.progress.length })}
        >
          <Icon name="bookmark" size={18} />
          {t('신청 현황')} <strong>{overview.progress.length}</strong>
        </button>
        <span>{snapshot.enabled ? t('새 공고 안내 켜짐') : t('새 공고 안내 꺼짐')}</span>
      </div>
      {overview.questions.length > 0 && (
        <button className="assistant-next-information" onClick={() => onView('questions')}>
          <span>
            <Icon name="info" size={19} />
            {t('더 정확한 안내를 위해 확인할 정보가 있어요.')}
          </span>
          <strong>
            {t('{count}개 확인하기', { count: overview.questions.length })}
            <Icon name="right" size={16} />
          </strong>
        </button>
      )}
    </div>
  );
}

function Questions({ questions, label = '신청 전 확인사항' }) {
  const { t } = useI18n();
  if (!questions.length) return null;
  return (
    <div className="monitoring-questions">
      <strong>{t(label)}</strong>
      <ul>
        {questions.map((question, index) => (
          <li key={`${index}:${question}`}>{question}</li>
        ))}
      </ul>
    </div>
  );
}
function Candidate({
  candidate,
  hidden = false,
  feedbackError = false,
  disabled,
  onOpen,
  onState,
  onFeedback,
  onPrepared,
  manageProgress = false,
}) {
  const { t, intlLocale } = useI18n();

  const fieldId = useId();
  const { policy: original, status, reason, questions, state, active, schedule_status } = candidate;
  const translation = useVisibleTranslatedPolicy(original);
  const { policy } = translation;
  const source = safeSourceUrl(policy.sourceUrl);
  return (
    <article ref={translation.ref} className="monitoring-candidate" hidden={hidden}>
      <div className="monitoring-candidate-top">
        <span className="soft-badge">
          {!active
            ? t('이전 지원 기록')
            : status === 'needs_review'
              ? t('추가 조건 확인 필요')
              : t('관련 지원 후보')}
        </span>
        {active && schedule_status === 'upcoming' && (
          <span className="soft-badge">{t('접수 예정')}</span>
        )}
        <span>
          {t(policy.region)} · {t(policy.category)}
        </span>
      </div>
      <h4>
        <button className="text-button" onClick={() => onOpen(original)}>
          {policy.title}
        </button>
      </h4>
      <PolicyTranslationStatus translation={translation} />
      {!active && (
        <p className="monitoring-history-note">
          {' '}
          {t('현재 탐색 결과에 없어요. 공식 공고에서 최신 조건과 일정을 다시 확인해 주세요.')}{' '}
        </p>
      )}
      {active && schedule_status === 'upcoming' && (
        <p className="monitoring-field-help">
          {' '}
          {t('접수 시작 전 공고예요. 신청 시작일과 준비할 내용을 확인해 주세요.')}{' '}
        </p>
      )}
      <p className="monitoring-candidate-reason">
        <strong>{t('살펴보는 이유')}</strong> {reason}
      </p>
      <dl className="monitoring-policy-facts">
        <div>
          <dt>{t('지원 내용')}</dt>
          <dd>{policy.benefit}</dd>
        </div>
        <div>
          <dt>{t('신청 기간')}</dt>
          <dd>{policy.applicationPeriod || t('공식 공고에서 확인')}</dd>
        </div>
      </dl>
      <Questions questions={questions} />
      <p className="fine-print">
        {' '}
        {t('지원 후보는 신청 자격 확정이 아니에요. 담당 기관과 공식 공고에서 확인해 주세요.')}{' '}
      </p>
      <div className="monitoring-candidate-actions">
        {manageProgress && (
          <label className="field-label" htmlFor={fieldId}>
            {' '}
            {t('지원 진행 상태')}{' '}
            <select
              id={fieldId}
              aria-label={t('{value1} 지원 진행 상태', { value1: policy.title })}
              value={state}
              disabled={disabled}
              onChange={(event) => onState(event.target.value)}
            >
              {candidateStates.map(([value, text]) => (
                <option key={value} value={value}>
                  {t(text)}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="monitoring-actions">
          <button className="button secondary" onClick={() => onOpen(original)}>
            {' '}
            {t('공고 상세 보기')}{' '}
          </button>
          {source && (
            <a className="button secondary" href={source} target="_blank" rel="noopener noreferrer">
              {' '}
              {t('공식 공고')} <Icon name="external" size={17} />
              <span className="sr-only">{t('새 창')}</span>
            </a>
          )}
        </div>
      </div>
      <ApplicationGuide
        policy={original}
        preparation={candidate.application_preparation}
        onPrepared={onPrepared}
        disabled={disabled}
        applicationUnavailable={!active}
      />
      {active && !manageProgress && onFeedback && (
        <RecommendationFeedbackForm disabled={disabled} onSave={onFeedback} error={feedbackError} />
      )}
    </article>
  );
}
