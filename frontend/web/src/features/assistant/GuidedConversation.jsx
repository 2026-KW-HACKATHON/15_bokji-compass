import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { request } from '../../shared/api/client.js';
import { safeSourceUrl } from '../policies/policyModel.js';
import { todayInSeoul } from '../monitoring/monitoringModel.js';
import { createDialogueApi } from './dialogueApi.js';
import { confirmedFacts, dialogueError, restoreDialogueSession } from './dialogueModel.js';
import './guided-conversation.css';

const api = createDialogueApi(request);
const examples = [
  '리모델링 지원금을 받을 수 있어?',
  '집에 누수가 생겼어. 어떻게 해야 해?',
  '취업 준비에 도움이 되는 지원이 있을까?',
];

export default function GuidedConversation(props) {
  return (
    <GuidedSession
      key={`${props.user?.id || 'guest'}:${props.policy?.revisionId || 'general'}`}
      {...props}
    />
  );
}

function GuidedSession({
  user,
  policy,
  onProfile,
  session,
  onSessionChange,
  onOpenAssistant,
  onSaved,
}) {
  const id = useId();
  const owner = user?.id || null;
  const revisionId = policy?.revisionId || null;
  const [initial] = useState(() => restoreDialogueSession(session, owner, revisionId));
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const active = useRef(null);
  const answerPanel = useRef(null);
  const followPanel = useRef(null);
  const questionInput = useRef(null);
  const [question, setQuestion] = useState(initial.question);
  const [dialogue, setDialogue] = useState(initial.dialogue);
  const [exchanges, setExchanges] = useState(initial.exchanges);
  const [input, setInput] = useState(initial.input);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(false);
  const [saved, setSaved] = useState(initial.saved);
  const [candidateLimit, setCandidateLimit] = useState(initial.candidateLimit);
  const snapshot = useMemo(
    () => ({ owner, revisionId, question, dialogue, exchanges, input, saved, candidateLimit }),
    [owner, revisionId, question, dialogue, exchanges, input, saved, candidateLimit],
  );
  const sessionChange = useRef(onSessionChange);
  sessionChange.current = onSessionChange;

  useEffect(() => {
    sessionChange.current?.(snapshot);
  }, [snapshot]);
  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
    },
    [],
  );
  useEffect(() => {
    if (dialogue) {
      answerPanel.current?.focus({ preventScroll: true });
      answerPanel.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }, [dialogue]);

  const cancel = () => {
    active.current?.abort();
    active.current = null;
    setBusy('');
  };
  const reset = () => {
    cancel();
    setDialogue(null);
    setExchanges([]);
    setInput('');
    setQuestion('');
    setConsent(false);
    setSaved('');
    setError('');
    questionInput.current?.focus();
  };
  async function run(action, label) {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy('dialogue');
    setError('');
    try {
      const value = await action(controller.signal);
      if (controller.signal.aborted || currentOwner.current !== owner) return;
      setDialogue(value);
      setExchanges((items) => [...items, { question: label, answer: value.answer }]);
      if (value.answer_accepted !== false) setInput('');
      setConsent(false);
      setSaved('');
      setCandidateLimit(3);
    } catch (failure) {
      if (!controller.signal.aborted && currentOwner.current === owner)
        setError(dialogueError(failure));
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy('');
      }
    }
  }
  const start = (event) => {
    event.preventDefault();
    if (!question.trim()) return;
    run(
      (signal) => api.start(question, { signal, revisionId: policy?.revisionId }),
      question.trim(),
    );
  };
  const respond = (value, label) =>
    run(
      (signal) => api.answer(dialogue.continuation, dialogue.follow_up.slot, value, { signal }),
      `${dialogue.follow_up.question} → ${label}`,
    );
  const submitFollow = (event) => {
    event.preventDefault();
    if (!input.trim()) return;
    respond(input.trim(), input.trim());
  };
  async function save() {
    if (active.current || !consent) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy('save');
    setError('');
    try {
      const snapshot = await api.save(dialogue.continuation, {
        consent,
        confirmed: true,
        signal: controller.signal,
      });
      if (controller.signal.aborted || currentOwner.current !== owner) return;
      setSaved(
        snapshot.scan_status === 'unavailable'
          ? '확인한 정보를 저장했어요. 공고 확인은 잠시 후 지속 복지 안내에서 다시 시도해 주세요.'
          : snapshot.enabled
            ? '확인한 정보를 저장하고 지속 복지 안내에 반영했어요.'
            : '확인한 정보를 저장했어요. 내 정보에서 지속 복지 안내를 켜면 이후 공고도 살펴볼 수 있어요.',
      );
      setConsent(false);
      onSaved?.(snapshot);
    } catch (failure) {
      if (!controller.signal.aborted && currentOwner.current === owner)
        setError(dialogueError(failure));
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy('');
      }
    }
  }
  const follow = dialogue?.follow_up;
  return (
    <section className="guided-conversation" aria-label="생활 상황 상담">
      {!user ? (
        <p>
          <a href="#login">로그인</a>하면 생활 상황을 알려주고 필요한 지원을 함께 찾아볼 수 있어요.
        </p>
      ) : (
        <>
          {onOpenAssistant && (
            <button
              className="button secondary"
              disabled={!!busy}
              onClick={() => onOpenAssistant({ policy, session: snapshot })}
            >
              AI 복지비서에서 이어보기
            </button>
          )}
          {policy && (
            <div className="guided-policy-context">
              <span>함께 확인할 공고</span>
              <strong>{policy.title}</strong>
            </div>
          )}
          {!dialogue && (
            <>
              <p>지금 겪는 일을 알려 주세요. 부족한 정보는 한 가지씩 여쭤볼게요.</p>
              <div className="guided-examples" role="group" aria-label="생활 상담 질문 예시">
                {examples.map((example) => (
                  <button
                    key={example}
                    className="button secondary"
                    disabled={!!busy}
                    onClick={() => {
                      setQuestion(example);
                      questionInput.current?.focus();
                    }}
                  >
                    {example}
                  </button>
                ))}
              </div>
              <form onSubmit={start}>
                <label htmlFor={`${id}-question`}>어떤 도움이 필요하세요?</label>
                <textarea
                  id={`${id}-question`}
                  ref={questionInput}
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  rows={3}
                  maxLength={2000}
                  disabled={!!busy}
                  required
                  placeholder="예: 집수리 비용을 지원받을 수 있을까요?"
                />
                <p className="guided-note">
                  이름·전화번호·정확한 주소는 적지 마세요. 답한 정보는 상담에 사용하고, 계정 저장은
                  나중에 선택할 수 있어요.
                </p>
                <button
                  type="submit"
                  className="button primary"
                  disabled={!!busy || !question.trim()}
                >
                  상담 시작하기
                </button>
              </form>
            </>
          )}
          {dialogue && (
            <>
              {exchanges.length > 1 && (
                <details className="guided-history">
                  <summary>이번 상담에서 확인한 대화 ({exchanges.length - 1})</summary>
                  {exchanges.slice(0, -1).map((entry, index) => (
                    <div key={index}>
                      <strong>{entry.question}</strong>
                      <p>{entry.answer}</p>
                    </div>
                  ))}
                </details>
              )}
              <div
                ref={answerPanel}
                tabIndex={-1}
                role="region"
                aria-label="생활 상담 안내"
                className="guided-answer"
              >
                <p className="guided-user-reply">{exchanges.at(-1)?.question}</p>
                {dialogue.practical_steps.length > 0 && (
                  <div className="guided-practical">
                    <h4>먼저 이렇게 대처해 주세요</h4>
                    <ol>
                      {dialogue.practical_steps.map((step, index) => (
                        <li key={index}>{step}</li>
                      ))}
                    </ol>
                  </div>
                )}
                <p className="guided-answer-text">{dialogue.answer}</p>
                {dialogue.catalog_status === 'unavailable' && (
                  <p className="guided-unavailable" role="status">
                    현재 공고 정보를 확인하지 못했어요. 아래 생활 대응과 추가 질문을 먼저 확인해
                    주세요.
                  </p>
                )}
                {dialogue.missing_fields.length > 0 && (
                  <div className="guided-missing">
                    <h4>추가로 확인할 정보</h4>
                    <ul>
                      {dialogue.missing_fields.map((field) => (
                        <li key={field.slot}>{field.label}</li>
                      ))}
                    </ul>
                    {follow && (
                      <button
                        className="button secondary"
                        onClick={() => {
                          followPanel.current?.querySelector('input, select, button')?.focus();
                          followPanel.current?.scrollIntoView({
                            block: 'center',
                            behavior: 'instant',
                          });
                        }}
                      >
                        정보 추가하기
                      </button>
                    )}
                  </div>
                )}
                {dialogue.selected_policy && (
                  <div className="guided-selected">
                    <h4>선택한 공고의 조건 비교</h4>
                    <p>
                      {dialogue.selected_policy.comparison.status === 'not_matched'
                        ? '현재 알려준 정보와 맞지 않는 공고 조건이 있어요.'
                        : '현재 확인한 정보로 비교했어요. 남은 조건과 원문을 함께 확인해 주세요.'}
                    </p>
                    <ul>
                      {dialogue.selected_policy.comparison.notes.map((note, index) => (
                        <li key={index}>{note}</li>
                      ))}
                    </ul>
                    <details>
                      <summary>공고 조건과 비교 근거 보기</summary>
                      {dialogue.selected_policy.comparison.checks.map((check, index) => (
                        <div className="guided-condition" key={index}>
                          <strong>
                            {check.label} ·{' '}
                            {
                              { match: '조건 일치', mismatch: '조건 불일치', unknown: '추가 확인' }[
                                check.state
                              ]
                            }
                          </strong>
                          <p>{check.note}</p>
                          {check.quote && <blockquote>{check.quote}</blockquote>}
                        </div>
                      ))}
                    </details>
                  </div>
                )}
                {dialogue.candidates.length > 0 && (
                  <div className="guided-candidates">
                    <h4>함께 확인할 지원 공고</h4>
                    {dialogue.candidates.slice(0, candidateLimit).map((candidate) => (
                      <article key={`${candidate.need_id}:${candidate.policy_id}`}>
                        <span className="guided-candidate-status">
                          {candidate.schedule_status === 'upcoming'
                            ? '접수 시작 전 · 조건 확인 필요'
                            : '지원 후보 · 조건 확인 필요'}
                        </span>
                        <h5>{candidate.policy.title}</h5>
                        <p>{candidate.reason}</p>
                        {candidate.questions.length > 0 && (
                          <ul>
                            {candidate.questions.map((item, index) => (
                              <li key={index}>{item}</li>
                            ))}
                          </ul>
                        )}
                        {safeSourceUrl(candidate.policy.sourceUrl) && (
                          <a
                            className="button secondary"
                            href={safeSourceUrl(candidate.policy.sourceUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            공식 공고 확인<span className="sr-only"> 새 창</span>
                          </a>
                        )}
                      </article>
                    ))}
                    {dialogue.candidates.length > candidateLimit && (
                      <button
                        className="button secondary"
                        onClick={() => setCandidateLimit((value) => value + 3)}
                      >
                        지원 후보 더 보기
                      </button>
                    )}
                  </div>
                )}
                {dialogue.source_links.length > 0 && (
                  <div className="guided-sources">
                    <h4>공식 안내</h4>
                    {dialogue.source_links.map((link, index) => (
                      <a
                        key={index}
                        href={safeSourceUrl(link.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {link.label}
                        <span className="sr-only"> 새 창</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
              {follow && (
                <div ref={followPanel} className="guided-followup" key={follow.slot}>
                  <h4>{follow.question}</h4>
                  {follow.input_type === 'select' ? (
                    <div role="group" aria-label={follow.question} className="guided-options">
                      {follow.options.map((option, index) => (
                        <button
                          key={index}
                          className="button secondary"
                          disabled={!!busy}
                          onClick={() => respond(option.value, option.label)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <form onSubmit={submitFollow}>
                      <label htmlFor={`${id}-follow`}>{follow.question}</label>
                      <input
                        id={`${id}-follow`}
                        type={follow.input_type === 'date' ? 'date' : 'text'}
                        inputMode={follow.input_type === 'number' ? 'numeric' : undefined}
                        max={follow.input_type === 'date' ? todayInSeoul() : undefined}
                        maxLength={200}
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        disabled={!!busy}
                        placeholder={
                          follow.slot === 'building_year' ? '예: 1920년 건축' : undefined
                        }
                        required
                      />
                      <button
                        type="submit"
                        className="button primary"
                        disabled={!!busy || !input.trim()}
                      >
                        답변하고 다시 확인하기
                      </button>
                    </form>
                  )}
                  <button
                    className="guided-unknown"
                    disabled={!!busy}
                    onClick={() => respond(null, '모르겠어요 / 건너뛰기')}
                  >
                    모르겠어요 / 건너뛰기
                  </button>
                </div>
              )}
              {dialogue.can_save_profile && (
                <div className="guided-save">
                  <h4>확인한 정보를 다음 안내에도 사용할까요?</h4>
                  <p>
                    아래 정보를 계정에 저장하면 지속 복지 안내에서 사용할 수 있어요. 저장하지 않고
                    상담을 이어가도 돼요.
                  </p>
                  <dl>
                    {confirmedFacts(dialogue).map((fact) => (
                      <div key={fact.field}>
                        <dt>{fact.label}</dt>
                        <dd>{fact.value}</dd>
                      </div>
                    ))}
                  </dl>
                  {saved ? (
                    <>
                      <p role="status">{saved}</p>
                      <button className="button secondary" onClick={onProfile}>
                        내 정보에서 확인하기
                      </button>
                    </>
                  ) : (
                    <>
                      <label className="guided-consent">
                        <input
                          type="checkbox"
                          checked={consent}
                          disabled={!!busy}
                          onChange={(event) => setConsent(event.target.checked)}
                        />
                        <span>
                          표시된 정보가 본인 정보임을 확인했고, 계정 저장과 지속 복지 안내 활용에
                          동의해요.
                        </span>
                      </label>
                      <button
                        className="button primary"
                        disabled={!!busy || !consent}
                        onClick={save}
                      >
                        확인한 정보 저장하기
                      </button>
                    </>
                  )}
                </div>
              )}
              <div className="guided-restart">
                <button className="button secondary guided-reset" onClick={reset}>
                  새 상담 시작하기
                </button>
                <p className="guided-note">
                  건너뛴 답변이나 이번 상담에서 입력한 내용을 바꾸려면 새 상담을 시작해 주세요.
                </p>
              </div>
            </>
          )}
          {busy && (
            <div className="guided-busy" role="status">
              <span>
                {busy === 'save'
                  ? '확인한 정보를 저장하고 있어요.'
                  : '입력한 상황과 공고를 확인하고 있어요.'}
              </span>
              <button className="button secondary" onClick={cancel}>
                요청 취소하기
              </button>
            </div>
          )}
          {error && <p role="alert">{error}</p>}
          <div className="guided-profile-action">
            <p className="guided-note">
              본인 상담은 저장한 생활정보도 참고해요. 상황이 바뀌었다면 내 정보에서 수정할 수
              있어요.
            </p>
            <button className="button secondary" onClick={onProfile}>
              저장한 생활정보 수정하기
            </button>
          </div>
          <p className="guided-note">
            {onOpenAssistant && 'AI 복지비서로 이동하면 입력한 내용을 이어볼 수 있어요. '}
            새로고침하거나 로그아웃하면 화면의 대화는 초기화돼요. 입력한 상담 정보는 서버에서 최대
            30분간 임시로 사용하고, 저장을 선택한 생활정보만 계정에 남아요.
          </p>
        </>
      )}
    </section>
  );
}
