import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import {
  PolicyTranslationStatus,
  useTranslatedPolicy,
  useVisibleTranslatedPolicy,
} from '../../shared/i18n/PolicyTranslation.jsx';
import { useEffect, useId, useRef, useState } from 'react';
import Icon from '../../shared/ui/Icon.jsx';
import { safeSourceUrl } from '../policies/policyModel.js';
import PolicyQuestion from './PolicyQuestion.jsx';
import GuidedConversation from './GuidedConversation.jsx';
import { assistantGuides, assistantMenus } from './assistantContent.js';
import './FloatingAssistant.css';

function AgentAvatar({ small = false }) {
  return (
    <span className={'chat-agent-avatar' + (small ? ' small' : '')}>
      <img src="/icons/face-agent.svg" alt="" />
    </span>
  );
}

function HistoryEntry({ entry, onChange }) {
  const { t, intlLocale } = useI18n();
  const translation = useVisibleTranslatedPolicy(entry.policy);
  return (
    <div ref={translation.ref} className="chat-policy-entry">
      <button
        onClick={() => onChange({ topic: 'policy', policy: entry.policy, historyId: entry.id })}
      >
        <span>
          <strong>
            {entry.answer?.response_type === 'prepared' ? t(entry.question) : entry.question}
          </strong>
          <small>{translation.policy.title}</small>
          <time dateTime={entry.createdAt}>
            {new Date(entry.createdAt).toLocaleString(intlLocale, {
              timeZone: 'Asia/Seoul',
              month: 'numeric',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>
        </span>
        <Icon name="right" size={18} />
      </button>
      <PolicyTranslationStatus translation={translation} />
    </div>
  );
}

function PolicyChoice({ policy: original, onChoose }) {
  const { t } = useI18n();
  const translation = useVisibleTranslatedPolicy(original);
  const { policy } = translation;
  return (
    <div ref={translation.ref} className="chat-policy-entry">
      <button onClick={() => onChoose(original)}>
        <span>
          <strong>{policy.title}</strong>
          <small>
            {t(policy.region)} · {t(policy.category)}
          </small>
        </span>
        <Icon name="right" size={18} />
      </button>
      <PolicyTranslationStatus translation={translation} />
    </div>
  );
}

export default function FloatingAssistant({
  session,
  onChange,
  easy,
  user,
  repository,
  blocked,
  hideLauncher = false,
  onNavigate,
  onToggleEasy,
  guidedSession,
  onGuidedSessionChange,
  onOpenAssistant,
  onSaved,
}) {
  const { t, intlLocale } = useI18n();

  const launcher = useRef(null);
  const [dismissed, setDismissed] = useState(false);
  const owner = user?.id || null;
  const [conversation, setConversation] = useState({ owner, entries: [] });
  if (conversation.owner !== owner) setConversation({ owner, entries: [] });
  const history = conversation.owner === owner ? conversation.entries : [];
  const recordQuestion = (policy, entry) => {
    setConversation((current) => ({
      owner,
      entries: [
        ...(current.owner === owner ? current.entries : []),
        { ...entry, policy, id: crypto.randomUUID(), createdAt: new Date().toISOString() },
      ],
    }));
  };
  if (blocked) return null;
  return (
    <>
      {!dismissed && !hideLauncher && (
        <div className="chat-launcher">
          <button
            ref={launcher}
            className="chat-launcher-open"
            aria-label={t('AI 챗봇 열기')}
            aria-haspopup="dialog"
            aria-expanded={Boolean(session)}
            onClick={() => onChange({ topic: 'home' })}
          >
            {easy && <span className="chat-launcher-caption">{t('챗봇에 물어보기')}</span>}
            <span className="chat-launcher-circle">
              <AgentAvatar />
              <span className="chat-launcher-label">{t('챗봇')}</span>
            </span>
          </button>
          <button
            className="chat-launcher-dismiss"
            aria-label={t('챗봇 아이콘 숨기기')}
            title={t('챗봇 아이콘 숨기기')}
            onClick={() => {
              setDismissed(true);
              document.getElementById('main-content')?.focus({ preventScroll: true });
            }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      )}
      {session && (
        <AssistantDialog
          session={session}
          onChange={onChange}
          easy={easy}
          user={user}
          repository={repository}
          launcher={launcher}
          onNavigate={onNavigate}
          onToggleEasy={onToggleEasy}
          history={history}
          onRecord={recordQuestion}
          guidedSession={guidedSession}
          onGuidedSessionChange={onGuidedSessionChange}
          onOpenAssistant={onOpenAssistant}
          onSaved={onSaved}
        />
      )}
    </>
  );
}

function AssistantDialog({
  session,
  onChange,
  easy,
  user,
  repository,
  launcher,
  onNavigate,
  onToggleEasy,
  history,
  onRecord,
  guidedSession,
  onGuidedSessionChange,
  onOpenAssistant,
  onSaved,
}) {
  const { t, intlLocale } = useI18n();

  const id = useId();
  const dialog = useRef(null);
  const content = useRef(null);
  const title = useRef(null);
  const { topic, policy, guideId } = session;
  const translation = useTranslatedPolicy(policy, {
    priority: 10,
    enabled: Boolean(policy && ['policy', 'schedule'].includes(topic)),
  });
  const historyEntry = history.find((entry) => entry.id === session.historyId);
  const guide = assistantGuides.find((item) => item.id === guideId);
  const close = () => onChange(null);
  const go = (page) => {
    close();
    onNavigate(page);
  };
  const openAssistant = (context = {}) => {
    close();
    if (onOpenAssistant) onOpenAssistant(context);
    else onNavigate('assistant');
  };
  const home = () => onChange({ topic: 'home' });
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected && previous !== document.body) previous.focus();
      else launcher.current?.focus();
    };
  }, []);
  useEffect(() => {
    if (session.historyId) return;
    content.current?.scrollTo(0, 0);
    title.current?.focus({ preventScroll: true });
  }, [topic, policy?.revisionId, guideId, session.historyId]);
  const source = safeSourceUrl(policy?.sourceUrl);
  const pick = (item) =>
    onChange({
      topic: 'policy',
      policy: item,
      initialFaqId: topic === 'schedule' ? 'period' : undefined,
    });
  return (
    <dialog
      ref={dialog}
      className={'chat-dialog' + (easy ? ' chat-dialog-easy' : '')}
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <header className="chat-header">
        <AgentAvatar small />
        <div>
          <h2 id={`${id}-title`}>{t('복지나침반 AI 챗봇')}</h2>
          <p>{t('생활 상황과 공고를 함께 살펴봐요')}</p>
        </div>
        <button className="chat-close" aria-label={t('상담창 닫기')} onClick={close} autoFocus>
          <Icon name="x" />
          {easy && <span>{t('닫기')}</span>}
        </button>
      </header>
      <div className="chat-toolbar">
        <button onClick={home}>
          <Icon name="house" size={17} /> {t('처음으로')}{' '}
        </button>
        {user && topic !== 'history' && (
          <button onClick={() => onChange({ topic: 'history' })}>{t('질문 내역')}</button>
        )}
        {topic === 'history' && <span>{t('질문 내역')}</span>}
        {!user && topic !== 'home' && (
          <span>
            {topic === 'guidance'
              ? t('생활 상황 상담')
              : topic === 'guides'
                ? t('이용 방법')
                : topic === 'schedule'
                  ? t('신청 일정')
                  : t('공고 질문')}
          </span>
        )}
      </div>
      <div className="chat-content" ref={content}>
        <h3 className="chat-view-title" ref={title} tabIndex={-1}>
          {topic === 'home'
            ? t('어떤 내용이 궁금하세요?')
            : topic === 'guidance'
              ? t('어떤 도움이 필요하세요?')
              : topic === 'history'
                ? t('이전에 한 질문')
                : topic === 'guides'
                  ? t(guide?.question || '이용 방법을 골라 주세요')
                  : policy
                    ? t('선택한 공고에 질문해 주세요')
                    : topic === 'schedule'
                      ? t('신청 일정을 확인해 보세요')
                      : t('어떤 공고가 궁금하세요?')}
        </h3>
        {topic === 'history' && (
          <>
            {history.length ? (
              <div className="chat-history-list">
                {[...history].reverse().map((entry) => (
                  <HistoryEntry key={entry.id} entry={entry} onChange={onChange} />
                ))}
              </div>
            ) : (
              <p className="chat-empty">
                {t('아직 질문 내역이 없어요. 공고를 골라 질문해 보세요.')}
              </p>
            )}
            <p className="chat-footnote">
              {t('질문 내역은 새로고침하거나 로그아웃하면 초기화돼요.')}
            </p>
          </>
        )}
        {topic === 'home' && (
          <>
            <p className="chat-intro">{t('안녕하세요. 궁금한 내용을 골라 주세요.')}</p>
            <div className="chat-menu">
              {assistantMenus.map((item) => (
                <button
                  key={item.id}
                  className="chat-menu-item"
                  onClick={() =>
                    item.id === 'assistant' ? openAssistant() : onChange({ topic: item.id })
                  }
                >
                  <span className="chat-menu-icon">
                    <Icon name={item.icon} size={23} />
                  </span>
                  <span>
                    <strong>{t(item.label)}</strong>
                    <small>{t(item.description)}</small>
                  </span>
                  <Icon name="right" size={18} />
                </button>
              ))}
            </div>
            <p className="chat-footnote">
              {t('생활 상담과 공고 질문은 로그인 후 이용할 수 있어요.')}
            </p>
          </>
        )}
        {topic === 'guidance' && (
          <GuidedConversation
            key={`${user?.id || 'guest'}:${policy?.revisionId || 'general'}`}
            user={user}
            policy={policy}
            onProfile={() => go('profile')}
            session={guidedSession}
            onSessionChange={onGuidedSessionChange}
            onOpenAssistant={openAssistant}
            onSaved={onSaved}
          />
        )}
        {topic === 'guides' &&
          (guide ? (
            <>
              <article className="chat-guide-answer">
                <span className="chat-answer-tag">{t('이용 안내')}</span>
                {guide.answer.map((paragraph) => (
                  <p key={paragraph}>{t(paragraph)}</p>
                ))}
                {guide.action.toggleEasy ? (
                  <button className="button primary" onClick={onToggleEasy}>
                    {easy ? t('일반 화면으로 보기') : t('쉬운 화면으로 보기')}
                  </button>
                ) : guide.id === 'login' && user ? (
                  <p>{t('현재 로그인되어 있어요. 공고를 골라 질문해 보세요.')}</p>
                ) : (
                  <button className="button primary" onClick={() => go(guide.action.page)}>
                    {t(guide.action.label)}
                    <Icon name="arrow" size={18} />
                  </button>
                )}
              </article>
              <button
                className="button secondary chat-back"
                onClick={() => onChange({ topic: 'guides' })}
              >
                {' '}
                {t('다른 이용 방법 보기')}{' '}
              </button>
            </>
          ) : (
            <div className="chat-guide-list">
              {assistantGuides.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onChange({ topic: 'guides', guideId: item.id })}
                >
                  <span>{t(item.question)}</span>
                  <Icon name="right" size={18} />
                </button>
              ))}
            </div>
          ))}
        {topic === 'schedule' && (
          <article className="chat-guide-answer">
            <span className="chat-answer-tag">{t('신청 일정 안내')}</span>
            <p>{t('공고 캘린더에서 신청 시작일과 마감일을 살펴볼 수 있어요.')}</p>
            <p>
              {' '}
              {t(
                '날짜가 확인되지 않은 공고는 별도 목록에서 확인하세요. 현재 접수 여부는 공식 공고에서 다시 확인해 주세요.',
              )}{' '}
            </p>
            <button className="button primary" onClick={() => go('calendar')}>
              <Icon name="calendar" /> {t('공고 캘린더 열기')}{' '}
            </button>
            <p className="chat-schedule-prompt">{t('특정 공고의 신청 기간이 궁금하신가요?')}</p>
          </article>
        )}
        {['policy', 'schedule'].includes(topic) &&
          (!policy ? (
            <PolicyChooser repository={repository} onChoose={pick} />
          ) : (
            <>
              <div className="chat-selected-policy">
                <span>{t('상담 중인 공고')}</span>
                <h4>{translation.policy.title}</h4>
                <p>{translation.policy.organization}</p>
                <PolicyTranslationStatus translation={translation} />
                <button onClick={() => onChange({ topic: 'policy' })}>
                  {' '}
                  {t('공고 바꾸기')} <Icon name="sort" size={16} />
                </button>
              </div>
              <PolicyQuestion
                key={`${user?.id || 'guest'}:${policy.revisionId || policy.id}:${session.historyId || ''}`}
                revisionId={policy.revisionId}
                user={user}
                variant="chat"
                initialFaqId={session.initialFaqId}
                historyEntry={historyEntry}
                onRecord={(entry) => onRecord(policy, entry)}
              />
              <div className="chat-policy-actions">
                <button className="button secondary" onClick={() => openAssistant({ policy })}>
                  AI 복지비서에서 확인하기
                </button>
                <button
                  className="button secondary"
                  onClick={() => onChange({ topic: 'guidance', policy })}
                >
                  {' '}
                  {t('내 상황을 더해서 확인하기')}{' '}
                </button>
                {source && (
                  <a
                    className="button secondary"
                    href={source}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {' '}
                    {t('공식 공고 보기')} <Icon name="external" size={17} />
                    <span className="sr-only">{t('새 창')}</span>
                  </a>
                )}
                <button className="button secondary" onClick={() => go('calendar')}>
                  {' '}
                  {t('공고 캘린더 보기')}{' '}
                </button>
              </div>
              <p className="chat-footnote">
                {' '}
                {t('담당 기관:')} {policy.organization || t('공식 공고에서 확인해 주세요.')}
              </p>
            </>
          ))}
      </div>
      <footer className="chat-footer">
        {easy
          ? t('질문을 고르면 안내를 볼 수 있어요.')
          : t('신청 자격과 접수 여부는 담당 기관에서 최종 확인해 주세요.')}
      </footer>
    </dialog>
  );
}

function PolicyChooser({ repository, onChoose }) {
  const { t, intlLocale } = useI18n();

  const [query, setQuery] = useState('');
  const [term, setTerm] = useState('');
  const [cursors, setCursors] = useState([null]);
  const [page, setPage] = useState(null);
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const inputId = useId();
  const cursor = cursors.at(-1);
  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    setPage(null);
    setError('');
    repository
      .list({ query: term }, { cursor, limit: 3, signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          setPage(value);
          setState('ready');
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err.message);
          setState('error');
        }
      });
    return () => controller.abort();
  }, [repository, term, cursor, retry]);
  function search(event) {
    event.preventDefault();
    setTerm(query.trim());
    setCursors([null]);
    setRetry((value) => value + 1);
  }
  return (
    <section className="chat-policy-chooser" aria-label={t('상담할 공고 선택')}>
      <form onSubmit={search}>
        <label htmlFor={inputId}>{t('공고 이름이나 관심 분야')}</label>
        <div className="chat-search">
          <input
            id={inputId}
            type="search"
            value={query}
            maxLength={200}
            placeholder={t('예: 주거, 교육')}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="submit" className="button primary">
            {' '}
            {t('검색')}{' '}
          </button>
        </div>
      </form>
      <h4 className="chat-policy-list-heading">
        {term ? t('검색 결과') : t('현재 진행중인 공고')}
      </h4>
      {state === 'loading' && <p role="status">{t('공고를 불러오고 있어요.')}</p>}
      {state === 'error' && (
        <div className="chat-empty">
          <p role="alert">{t(error)}</p>
          <button className="button secondary" onClick={() => setRetry((value) => value + 1)}>
            {' '}
            {t('공고 다시 불러오기')}{' '}
          </button>
        </div>
      )}
      {state === 'ready' && (
        <>
          {!page.items.length && (
            <div className="chat-empty">
              <Icon name="search" size={27} />
              <p>
                {term
                  ? t('해당 공고를 찾지 못했어요. 다른 검색어로 찾아보세요.')
                  : t('상담할 수 있는 공개 공고가 아직 없어요.')}
              </p>
            </div>
          )}
          <div className="chat-policy-list">
            {page.items.map((item) => (
              <PolicyChoice key={item.id} policy={item} onChoose={onChoose} />
            ))}
          </div>
          <div className="chat-paging">
            {cursors.length > 1 && (
              <button
                className="button secondary"
                onClick={() => setCursors((values) => values.slice(0, -1))}
              >
                {' '}
                {t('이전 공고')}{' '}
              </button>
            )}
            {page.nextCursor && (
              <button
                className="button secondary"
                onClick={() => setCursors((values) => [...values, page.nextCursor])}
              >
                {' '}
                {t('다음 공고')}{' '}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
