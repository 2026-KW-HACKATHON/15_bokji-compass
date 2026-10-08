import { useEffect, useId, useRef, useState } from 'react';
import { request } from '../../shared/api/client.js';
import Icon from '../../shared/ui/Icon.jsx';
import { assistantOverview, questionForNeed } from '../assistant/assistantPageModel.js';
import { categories, safeSourceUrl } from '../policies/policyModel.js';
import { households } from '../profile/profileModel.js';
import { createMonitoringApi } from './monitoringApi.js';
import {
  candidateStates,
  disasterTypes,
  housingTenures,
  housingTypes,
  initialMonitoringProfile,
  monitoringDate,
  monitoringOccupations,
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
  onProfile,
  onStartConversation,
  onProfileDeleted,
  onProfileChanged,
  variant = 'default',
  refreshKey = 0,
}) {
  const prefix = useId();
  const owner = user?.id || null;
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const initial = useRef(initialMonitoringProfile(profile));
  const requests = useRef(new Set());
  const mounted = useRef(false);
  const [snapshot, setSnapshot] = useState(null);
  const [draft, setDraft] = useState(initial.current);
  const [enabled, setEnabled] = useState(false);
  const [consent, setConsent] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState('load');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);
  const [candidateLimit, setCandidateLimit] = useState(3);
  const [view, setView] = useState('candidates');
  const assistant = variant === 'assistant';
  const refreshVersion = useRef(refreshKey);
  const detail = useRef(null);
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const available = !!owner && mode === 'api';
  const overview = snapshot ? assistantOverview(snapshot, user) : null;
  const activeCandidates = snapshot?.candidates.filter((candidate) => candidate.active) || [];
  const previousCandidates =
    snapshot?.candidates.filter(
      (candidate) =>
        !candidate.active &&
        !activeCandidates.some((current) => current.policy_id === candidate.policy_id),
    ) || [];
  const id = (name) => `${prefix}-${name}`;
  const displayedCandidates =
    view === 'progress' && assistant ? overview?.progress || [] : activeCandidates;
  const show = (section) => !assistant || view === section;

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
    setEditing(true);
    selectView('settings');
  }

  useEffect(() => {
    mounted.current = true;
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
        if (controller.signal.aborted || currentOwner.current !== owner) return;
        setSnapshot(value);
        setDraft(value.profile || initial.current);
        setEnabled(value.enabled);
        setEditing(!assistant && !value.profile);
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

  useEffect(() => {
    if (refreshVersion.current === refreshKey) return;
    refreshVersion.current = refreshKey;
    if (!available) return;
    const controller = new AbortController();
    requests.current.add(controller);
    api
      .read({ signal: controller.signal })
      .then((value) => {
        if (controller.signal.aborted || !mounted.current || currentOwner.current !== owner) return;
        setSnapshot(value);
        if (!editingRef.current) {
          setDraft(value.profile || initial.current);
          setEnabled(value.enabled);
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted && mounted.current && currentOwner.current === owner)
          setError(errorMessage(failure));
      })
      .finally(() => requests.current.delete(controller));
    return () => controller.abort();
  }, [refreshKey, available, owner]);

  useEffect(() => {
    if (!available || !snapshot?.enabled || busy) return;
    let active = true;
    let pending = false;
    const controllers = new Set();
    async function checkAlerts() {
      if (pending || document.visibilityState === 'hidden') return;
      pending = true;
      const controller = new AbortController();
      controllers.add(controller);
      requests.current.add(controller);
      try {
        const value = await api.read({ signal: controller.signal });
        if (active && !controller.signal.aborted && currentOwner.current === owner)
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
    if (busy || !available) return;
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
        setSnapshot(latest);
      } else {
        setSnapshot(value);
        apply?.(value);
      }
      setMessage(
        action === 'refresh' && value?.scan_status === 'unavailable'
          ? '지원 공고를 확인하지 못했어요. 기존 안내를 유지했어요.'
          : success,
      );
    } catch (failure) {
      if (!controller.signal.aborted && mounted.current && currentOwner.current === owner)
        setError(errorMessage(failure));
    } finally {
      requests.current.delete(controller);
      if (!controller.signal.aborted && mounted.current && currentOwner.current === owner)
        setBusy('');
    }
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
        onProfileChanged?.();
      },
    );
  }

  function optionField(name, label, options) {
    return (
      <label className="field-label" htmlFor={id(name)} key={name}>
        {label}
        <select
          id={id(name)}
          value={draft[name] ?? ''}
          disabled={!!busy}
          onChange={(event) =>
            setDraft((value) => ({ ...value, [name]: event.target.value || null }))
          }
        >
          <option value="">미확인·입력하지 않음</option>
          {options.map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
      </label>
    );
  }
  function booleanField(name, label, yes = '예', no = '아니요') {
    return (
      <label className="field-label" htmlFor={id(name)} key={name}>
        {label}
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
          <option value="">미확인·입력하지 않음</option>
          <option value="true">{yes}</option>
          <option value="false">{no}</option>
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
      <div className="monitoring-heading">
        <div>
          {!assistant && (
            <span className="eyebrow">
              <Icon name="compass" size={18} /> 내 상황에 맞춰 이어가는 안내
            </span>
          )}
          <h2 id={id('heading')}>{assistant ? '나를 위한 지원 현황' : '지속 복지 안내'}</h2>
          <p>
            {assistant
              ? '저장한 생활정보와 등록된 공고를 기준으로 정리했어요.'
              : '거주 지역과 생활정보를 기준으로 새 공고와 필요한 지원을 계속 살펴봐요.'}
          </p>
        </div>
        {snapshot && (
          <span className={'monitoring-status' + (snapshot.enabled ? ' is-on' : '')}>
            {snapshot.enabled ? '지속 안내 켜짐' : '지속 안내 꺼짐'}
          </span>
        )}
      </div>
      <p className="monitoring-service-note">
        등록된 재난 지원 공고를 찾으면 실제 피해 여부부터 확인해요. 새 안내는 이 화면에서 확인할 수
        있어요.
      </p>
      {!owner ? (
        <p className="notice-box">
          <a href={assistant ? '#login?return=assistant' : '#login?return=profile'}>로그인</a>하면
          내 계정에 정보를 저장하고 안내를 이어갈 수 있어요.
        </p>
      ) : mode !== 'api' ? (
        <p className="notice-box">지속 안내를 사용할 수 있도록 서버 연결을 확인해 주세요.</p>
      ) : (
        <>
          {busy === 'load' && (
            <p className="notice-box" role="status">
              계정에 저장된 지속 안내를 불러오고 있어요.
            </p>
          )}
          {error && (
            <div className="notice-box monitoring-error" role="alert">
              <p>{error}</p>
              {(!snapshot || error.includes('로그인 상태')) && (
                <button
                  className="text-button"
                  disabled={!!busy}
                  onClick={() => setReload((value) => value + 1)}
                >
                  다시 불러오기
                </button>
              )}
              {error.includes('로그인 상태') && (
                <a
                  className="text-button"
                  href={assistant ? '#login?return=assistant' : '#login?return=profile'}
                >
                  로그인하기
                </a>
              )}
            </div>
          )}
          {message && (
            <p className="monitoring-message" role="status">
              <Icon name="check" size={18} /> {message}
            </p>
          )}
          {snapshot?.scan_status === 'unavailable' && (
            <p className="notice-box" role="status">
              생활정보는 저장됐지만 지원 공고를 확인하지 못했어요. 잠시 후 공고 다시 확인을 눌러
              주세요.
            </p>
          )}
          {snapshot && (
            <>
              {assistant && (
                <>
                  {!snapshot.enabled && (
                    <p className="monitoring-paused">
                      <Icon name="info" size={18} />
                      {snapshot.profile
                        ? '지속 안내가 꺼져 있어요. 저장된 기록은 확인할 수 있고, 안내 설정에서 다시 켤 수 있어요.'
                        : '생활정보를 추가하면 내 상황에 맞는 지원을 함께 살펴볼 수 있어요.'}
                    </p>
                  )}
                  <DashboardOverview
                    snapshot={snapshot}
                    overview={overview}
                    disabled={!!busy}
                    onEdit={editProfile}
                    onView={selectView}
                    onStartConversation={onStartConversation}
                  />
                  <div className="monitoring-dashboard-tools">
                    <p>최근 공고 확인 · {monitoringDate(snapshot.last_checked_at)}</p>
                    <button
                      className="text-button"
                      disabled={!!busy || !snapshot.enabled}
                      onClick={() =>
                        void change('refresh', api.refresh, '등록된 공고를 다시 확인했어요.')
                      }
                    >
                      {busy === 'refresh' ? '공고 확인 중…' : '공고 다시 확인'}
                    </button>
                  </div>
                  <nav className="monitoring-dashboard-nav" aria-label="AI 복지비서 상세 항목">
                    {[
                      ['candidates', '관련 지원 후보'],
                      ['questions', '추가 확인 정보'],
                      ['progress', '신청 진행 상태'],
                      ['alerts', '새 안내'],
                      ['settings', '안내 설정'],
                    ].map(([key, label]) => (
                      <button key={key} aria-pressed={view === key} onClick={() => selectView(key)}>
                        {label}
                      </button>
                    ))}
                  </nav>
                  <div ref={detail} tabIndex={-1} className="monitoring-dashboard-detail" />
                </>
              )}
              {show('settings') && (
                <>
                  <div className="monitoring-overview">
                    <p>
                      <strong>최근 공고 확인</strong> {monitoringDate(snapshot.last_checked_at)}
                    </p>
                    <p>
                      <strong>회원 거주 지역</strong> {user.region || '미입력'}
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
                        회원 정보에서 수정
                      </a>
                    </p>
                  </div>
                  {snapshot.profile && (
                    <div className="monitoring-actions">
                      <button
                        className="button secondary"
                        disabled={!!busy}
                        onClick={() => {
                          setDraft(snapshot.profile);
                          setEnabled(snapshot.enabled);
                          setConsent(false);
                          setEditing(!editing);
                          setError('');
                        }}
                      >
                        {editing ? '생활정보 수정 닫기' : '생활정보 수정'}
                      </button>
                      <button
                        className="button secondary"
                        disabled={!!busy || !snapshot.enabled}
                        onClick={() =>
                          void change('refresh', api.refresh, '등록된 공고를 다시 확인했어요.')
                        }
                      >
                        {busy === 'refresh' ? '공고 확인 중…' : '공고 다시 확인'}
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
                        {snapshot.enabled ? '지속 안내 중지' : '지속 안내 다시 켜기'}
                      </button>
                    </div>
                  )}
                  {!snapshot.profile && (
                    <p className="monitoring-intro">
                      모든 항목은 선택이에요. 모르는 정보는 미확인으로 두세요. 저장한 정보와 회원
                      거주 지역을 지원 탐색에 함께 사용해요.
                    </p>
                  )}
                  {!snapshot.profile && !editing && (
                    <button className="button secondary" onClick={editProfile}>
                      생활정보 추가하기
                    </button>
                  )}
                  {editing && (
                    <form className="monitoring-form" onSubmit={submit}>
                      <fieldset disabled={!!busy}>
                        <legend>일과 가구</legend>
                        <div className="monitoring-form-grid">
                          {optionField(
                            'occupation',
                            '일·학업 상태',
                            monitoringOccupations.map((value) => [value, value]),
                          )}
                          {optionField(
                            'household',
                            '함께 사는 사람',
                            households.slice(1).map((value) => [value, value]),
                          )}
                          {booleanField(
                            'job_seeking',
                            '현재 구직 중인가요?',
                            '구직 중',
                            '구직 중 아님',
                          )}
                        </div>
                      </fieldset>
                      <fieldset disabled={!!busy}>
                        <legend>주거 상황</legend>
                        <div className="monitoring-form-grid">
                          {optionField(
                            'housing_tenure',
                            '현재 주택의 소유·거주 형태',
                            housingTenures,
                          )}
                          {optionField('housing_type', '주택 종류', housingTypes)}
                          <label className="field-label" htmlFor={id('building_year')}>
                            주택 준공연도
                            <input
                              id={id('building_year')}
                              type="number"
                              inputMode="numeric"
                              min="1800"
                              max={todayInSeoul().slice(0, 4)}
                              step="1"
                              placeholder="예: 1995"
                              value={draft.building_year ?? ''}
                              onChange={(event) =>
                                setDraft((value) => ({
                                  ...value,
                                  building_year:
                                    event.target.value === '' ? null : Number(event.target.value),
                                }))
                              }
                            />
                            <small>모르면 비워 두세요. 건축물대장 등에서 확인할 수 있어요.</small>
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
                        <legend>직접 확인한 재난 피해</legend>
                        <p className="monitoring-field-help">
                          같은 지역에 재난이 발생했어도 내 피해 여부와 지원 조건은 따로 확인해요.
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
                            피해 발생일
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
                        <legend>관심 분야</legend>
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
                              {category}
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
                          />
                          지속 안내 켜기
                        </label>
                        <p>
                          켜면 저장한 상황으로 등록된 지원 공고를 계속 비교하고 새 안내를 이 화면에
                          모아요. 끄면 새 안내를 만들지 않아요.
                        </p>
                        <label>
                          <input
                            type="checkbox"
                            checked={consent}
                            disabled={!!busy}
                            onChange={(event) => setConsent(event.target.checked)}
                          />
                          생활정보를 내 계정에 저장하고 지속 복지 안내에 사용하는 데 동의해요.
                        </label>
                        <p>
                          언제든 지속 안내를 중지하거나 저장한 생활정보와 안내 기록을 삭제할 수
                          있어요.
                        </p>
                      </div>
                      <div className="monitoring-actions">
                        <button
                          type="submit"
                          className="button primary"
                          disabled={!!busy || !consent}
                        >
                          {busy === 'save' ? '저장 중…' : '생활정보와 안내 설정 저장'}
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
                            수정 취소
                          </button>
                        )}
                      </div>
                    </form>
                  )}
                </>
              )}
              {(snapshot.profile || assistant) && (
                <>
                  {show('questions') && (
                    <>
                      <div className="monitoring-section-heading">
                        <h3>{assistant ? '추가로 확인할 정보' : '살펴볼 지원 분야'}</h3>
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
                                  대화로 정보 추가하기 <Icon name="arrow" size={16} />
                                </button>
                              )}
                            </article>
                          ))}
                        </div>
                      ) : (
                        <p className="monitoring-empty">
                          현재 정보에서 추가로 살펴볼 지원 분야를 찾지 못했어요. 상황이 바뀌면
                          생활정보를 수정해 주세요.
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
                                  공고에서 조건 확인하기 <Icon name="arrow" size={16} />
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
                          {assistant && view === 'progress' ? '신청 진행 상태' : '관련 지원 후보'}{' '}
                          <span>{displayedCandidates.length}개</span>
                        </h3>
                      </div>
                      {displayedCandidates.length ? (
                        <div className="monitoring-candidates">
                          {displayedCandidates.slice(0, candidateLimit).map((candidate) => (
                            <Candidate
                              key={`${candidate.need_id}:${candidate.policy_id}`}
                              candidate={candidate}
                              disabled={!!busy}
                              onOpen={onOpen}
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
                            ? '아직 신청 진행 기록이 없어요. 관련 지원 후보에서 신청 준비 중 또는 신청 완료로 표시하면 여기에 모아볼 수 있어요.'
                            : !snapshot.profile
                              ? '아직 저장한 생활정보가 없어요. 내 상황을 추가하고 지속 안내를 켜면 관련 지원 후보를 찾아드려요.'
                              : '현재 등록된 공고에서 관련 지원 후보를 찾지 못했어요. 받을 수 있는 지원이 없다는 뜻은 아니에요. 새 공고가 확인되면 여기서 안내해요.'}
                        </p>
                      )}
                      {displayedCandidates.length > 3 && (
                        <div className="monitoring-actions">
                          {candidateLimit < displayedCandidates.length && (
                            <button
                              className="button secondary"
                              onClick={() => setCandidateLimit((value) => value + 3)}
                            >
                              지원 후보 3개 더 보기
                            </button>
                          )}
                          {candidateLimit > 3 && (
                            <button className="text-button" onClick={() => setCandidateLimit(3)}>
                              처음 3개만 보기
                            </button>
                          )}
                          <span className="fine-print">
                            {Math.min(candidateLimit, displayedCandidates.length)} /{' '}
                            {displayedCandidates.length}개 표시
                          </span>
                        </div>
                      )}
                      {previousCandidates.length > 0 && view !== 'progress' && (
                        <>
                          <div className="monitoring-section-heading">
                            <h3>
                              이전 지원 기록 <span>{previousCandidates.length}개</span>
                            </h3>
                          </div>
                          <details className="monitoring-history">
                            <summary>이전 지원 기록 펼치기</summary>
                            <p className="monitoring-history-note">
                              현재 탐색 결과에 없는 공고의 진행 기록이에요. 최신 조건과 일정은 공식
                              공고에서 다시 확인해 주세요.
                            </p>
                            <div className="monitoring-candidates">
                              {previousCandidates.map((candidate) => (
                                <Candidate
                                  key={`${candidate.need_id}:${candidate.policy_id}`}
                                  candidate={candidate}
                                  disabled={!!busy}
                                  onOpen={onOpen}
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
                  {show('alerts') && (
                    <>
                      <div className="monitoring-section-heading">
                        <h3>
                          새 안내 <span>안 읽음 {snapshot.unread_count}개</span>
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
                            표시된 안내 읽음
                          </button>
                        )}
                      </div>
                      {snapshot.alerts.length ? (
                        <ul className="monitoring-alerts">
                          {snapshot.alerts.map((alert) => (
                            <li key={alert.id} className={alert.read ? 'is-read' : ''}>
                              <div>
                                <span className="monitoring-alert-label">
                                  {alert.read ? '읽음' : '새 안내'}
                                </span>
                                <strong>{alert.title}</strong>
                                <p>{alert.body}</p>
                                <small>{monitoringDate(alert.created_at)}</small>
                              </div>
                              {!alert.read && (
                                <button
                                  className="text-button"
                                  disabled={!!busy}
                                  aria-label={`${alert.title} 읽음 표시`}
                                  onClick={() =>
                                    void change(
                                      'read',
                                      (options) => api.readAlerts([alert.id], options),
                                      '안내를 읽음으로 표시했어요.',
                                    )
                                  }
                                >
                                  읽음 표시
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="monitoring-empty">아직 새 안내가 없어요.</p>
                      )}
                    </>
                  )}
                  {snapshot.profile && show('settings') && (
                    <div className="monitoring-delete">
                      {deleting ? (
                        <div className="notice-box">
                          <p>
                            저장한 생활정보, 지원 후보의 진행 상태와 새 안내를 삭제하고 지속 안내를
                            중지해요.
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
                              {busy === 'delete' ? '삭제 중…' : '생활정보와 안내 기록 삭제'}
                            </button>
                            <button
                              className="text-button"
                              disabled={!!busy}
                              onClick={() => setDeleting(false)}
                            >
                              삭제 취소
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="text-button"
                          disabled={!!busy}
                          onClick={() => setDeleting(true)}
                        >
                          저장한 생활정보와 안내 삭제
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

function DashboardOverview({ snapshot, overview, disabled, onEdit, onView, onStartConversation }) {
  return (
    <div className="monitoring-dashboard-grid">
      <article className="monitoring-dashboard-card monitoring-dashboard-profile">
        <div className="monitoring-dashboard-card-title">
          <Icon name="user" size={22} />
          <h3>내 상황 요약</h3>
        </div>
        {overview.facts.length > 0 ? (
          <ul className="monitoring-fact-chips">
            {overview.facts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        ) : (
          <p className="monitoring-card-empty">아직 저장한 생활정보가 없어요.</p>
        )}
        <p className="monitoring-card-note">
          {snapshot.profile
            ? '직접 저장한 정보로 살펴봐요. 상황이 달라지면 알려주세요.'
            : '주거·일·재난 피해 등 필요한 정보만 추가해 주세요.'}
        </p>
        <button className="text-button" disabled={disabled} onClick={onEdit}>
          {snapshot.profile ? '생활정보 수정하기' : '생활정보 추가하기'}{' '}
          <Icon name="arrow" size={16} />
        </button>
      </article>
      <article className="monitoring-dashboard-card">
        <div className="monitoring-dashboard-card-title">
          <Icon name="sparkles" size={22} />
          <h3>새 안내</h3>
          <strong className="monitoring-count">
            {snapshot.unread_count}
            <small>개</small>
          </strong>
        </div>
        {overview.newAlerts.length ? (
          <ul className="monitoring-card-list">
            {overview.newAlerts.slice(0, 2).map((alert) => (
              <li key={alert.id}>{alert.title}</li>
            ))}
          </ul>
        ) : (
          <p className="monitoring-card-empty">
            {snapshot.enabled
              ? '새로 도착한 안내가 없어요.'
              : '지속 안내를 켜면 새 공고와 변경 내용을 모아드려요.'}
          </p>
        )}
        <button className="text-button" onClick={() => onView('alerts')}>
          안내함 확인하기 <Icon name="arrow" size={16} />
        </button>
      </article>
      <article className="monitoring-dashboard-card">
        <div className="monitoring-dashboard-card-title">
          <Icon name="help" size={22} />
          <h3>추가 확인 정보</h3>
          <strong className="monitoring-count">
            {overview.questions.length}
            <small>개</small>
          </strong>
        </div>
        {overview.questions.length ? (
          <ul className="monitoring-card-list">
            {overview.questions.slice(0, 2).map((item) => (
              <li key={item.question}>{item.question}</li>
            ))}
          </ul>
        ) : (
          <p className="monitoring-card-empty">
            {snapshot.profile
              ? '현재 안내에서 추가로 요청한 정보가 없어요. 신청 자격은 공고별로 확인해 주세요.'
              : '궁금한 상황을 이야기하면 필요한 정보를 하나씩 확인해요.'}
          </p>
        )}
        {overview.questions.length ? (
          <button className="text-button" onClick={() => onView('questions')}>
            확인할 정보 살펴보기 <Icon name="arrow" size={16} />
          </button>
        ) : (
          <button className="text-button" onClick={() => onStartConversation?.()}>
            대화로 상황 추가하기 <Icon name="arrow" size={16} />
          </button>
        )}
      </article>
      <article className="monitoring-dashboard-card">
        <div className="monitoring-dashboard-card-title">
          <Icon name="bookmark" size={22} />
          <h3>신청 진행 상태</h3>
        </div>
        <dl className="monitoring-progress-counts">
          <div>
            <dt>준비 중</dt>
            <dd>{overview.progressCounts.preparing}</dd>
          </div>
          <div>
            <dt>신청 완료</dt>
            <dd>{overview.progressCounts.applied}</dd>
          </div>
          <div>
            <dt>확인 완료</dt>
            <dd>{overview.progressCounts.completed}</dd>
          </div>
        </dl>
        <p className="monitoring-card-note">
          직접 표시한 진행 상태예요. 기관의 접수 결과와는 별도로 관리해요.
        </p>
        <button className="text-button" onClick={() => onView('progress')}>
          진행 중인 지원 보기 <Icon name="arrow" size={16} />
        </button>
      </article>
    </div>
  );
}

function Questions({ questions, label = '신청 전에 더 확인할 조건' }) {
  if (!questions.length) return null;
  return (
    <div className="monitoring-questions">
      <strong>{label}</strong>
      <ul>
        {questions.map((question, index) => (
          <li key={`${index}:${question}`}>{question}</li>
        ))}
      </ul>
    </div>
  );
}
function Candidate({ candidate, disabled, onOpen, onState }) {
  const fieldId = useId();
  const { policy, status, reason, questions, state, active, schedule_status } = candidate;
  const source = safeSourceUrl(policy.sourceUrl);
  return (
    <article className="monitoring-candidate">
      <div className="monitoring-candidate-top">
        <span className="soft-badge">
          {!active
            ? '이전 지원 기록'
            : status === 'needs_review'
              ? '추가 조건 확인 필요'
              : '관련 지원 후보'}
        </span>
        {active && schedule_status === 'upcoming' && <span className="soft-badge">접수 예정</span>}
        <span>
          {policy.region} · {policy.category}
        </span>
      </div>
      <h4>
        <button className="text-button" onClick={() => onOpen(policy)}>
          {policy.title}
        </button>
      </h4>
      {!active && (
        <p className="monitoring-history-note">
          현재 탐색 결과에 없어요. 공식 공고에서 최신 조건과 일정을 다시 확인해 주세요.
        </p>
      )}
      {active && schedule_status === 'upcoming' && (
        <p className="monitoring-field-help">
          접수 시작 전 공고예요. 신청 시작일과 준비할 내용을 확인해 주세요.
        </p>
      )}
      <p className="monitoring-candidate-reason">
        <strong>살펴보는 이유</strong> {reason}
      </p>
      <dl className="monitoring-policy-facts">
        <div>
          <dt>지원 내용</dt>
          <dd>{policy.benefit}</dd>
        </div>
        <div>
          <dt>신청 기간</dt>
          <dd>{policy.applicationPeriod || '공식 공고에서 확인'}</dd>
        </div>
      </dl>
      <Questions questions={questions} />
      <p className="fine-print">
        지원 후보는 신청 자격 확정이 아니에요. 담당 기관과 공식 공고에서 확인해 주세요.
      </p>
      <div className="monitoring-candidate-actions">
        <label className="field-label" htmlFor={fieldId}>
          지원 진행 상태
          <select
            id={fieldId}
            aria-label={`${policy.title} 지원 진행 상태`}
            value={state}
            disabled={disabled}
            onChange={(event) => onState(event.target.value)}
          >
            {candidateStates.map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </label>
        <div className="monitoring-actions">
          <button className="button secondary" onClick={() => onOpen(policy)}>
            공고 상세 보기
          </button>
          {source && (
            <a className="button secondary" href={source} target="_blank" rel="noopener noreferrer">
              공식 공고 <Icon name="external" size={17} />
              <span className="sr-only">새 창</span>
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
