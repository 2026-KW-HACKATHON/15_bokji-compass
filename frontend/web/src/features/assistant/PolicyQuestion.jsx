import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import { useEffect, useId, useRef, useState } from 'react';
import ContentLanguageNotice from '../../shared/i18n/ContentLanguageNotice.jsx';
import { appConfig } from '../../shared/config.js';
import { createFaqApi, createQuestionApi } from './questionApi.js';
import { policyQuestionLabels } from './assistantContent.js';

const ask = createQuestionApi({ baseUrl: appConfig.apiBaseUrl });
const loadFaqs = createFaqApi({ baseUrl: appConfig.apiBaseUrl });

export default function PolicyQuestion({
  revisionId,
  user,
  variant,
  initialFaqId,
  historyEntry,
  onRecord,
}) {
  const { t, intlLocale } = useI18n();

  const id = useId();
  const active = useRef(null);
  const interacted = useRef(Boolean(historyEntry));
  const answerPanel = useRef(null);
  const choicesPanel = useRef(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(historyEntry?.answer || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [faqs, setFaqs] = useState([]);
  const [faqState, setFaqState] = useState('loading');
  const [faqRetry, setFaqRetry] = useState(0);
  const [selectedQuestion, setSelectedQuestion] = useState(historyEntry?.question || '');
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    if (answer) {
      answerPanel.current?.focus({ preventScroll: true });
      answerPanel.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }, [answer]);
  useEffect(() => {
    if (!user || !revisionId) return;
    const controller = new AbortController();
    setFaqState('loading');
    setFaqs([]);
    loadFaqs(revisionId, { signal: controller.signal })
      .then((items) => {
        if (!controller.signal.aborted) {
          const choices = items.map((item) => ({
            ...item,
            question: policyQuestionLabels[item.id] || item.question,
          }));
          setFaqs(choices);
          setFaqState('ready');
          const initial = choices.find((item) => item.id === initialFaqId);
          if (initial && !interacted.current) {
            setSelectedQuestion(initial.question);
            setAnswer(initial.response);
          }
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setFaqState('error');
      });
    return () => controller.abort();
  }, [revisionId, user?.id, faqRetry, initialFaqId]);

  function selectFaq(item) {
    interacted.current = true;
    // A late free-text reply must never replace a newly selected prepared answer.
    active.current?.abort();
    active.current = null;
    setBusy(false);
    setError('');
    setSelectedQuestion(item.question);
    setAnswer(item.response);
    onRecord?.({ question: item.question, answer: item.response });
  }

  async function submit(event) {
    event.preventDefault();
    if (active.current || !question.trim()) return;
    interacted.current = true;
    const controller = new AbortController();
    const submittedQuestion = question.trim();
    active.current = controller;
    setBusy(true);
    setError('');
    setAnswer(null);
    setSelectedQuestion(submittedQuestion);
    try {
      const result = await ask(revisionId, submittedQuestion, { signal: controller.signal });
      if (!controller.signal.aborted) {
        setAnswer(result);
        setQuestion('');
        onRecord?.({ question: submittedQuestion, answer: result });
      }
    } catch (err) {
      if (!controller.signal.aborted) setError(err.message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      if (active.current === controller) active.current = null;
    }
  }

  return (
    <section className="policy-question" aria-labelledby={`${id}-heading`}>
      <h3 id={`${id}-heading`}>{t('이 공고에 대해 질문하기')}</h3>
      {!user ? (
        <p>
          <a href="#login">{t('로그인')}</a>
          {t('하면 공고 내용을 물어볼 수 있어요.')}{' '}
        </p>
      ) : !revisionId ? (
        <p>{t('전체 공고에서 최신 공고를 다시 열면 질문할 수 있어요.')}</p>
      ) : (
        <>
          <p>{t('궁금한 내용을 선택하면 답변을 바로 확인할 수 있어요.')}</p>
          {faqState === 'loading' && <p role="status">{t('기본 질문을 준비하고 있어요.')}</p>}
          {faqState === 'error' && (
            <div className="faq-error">
              <p role="status">
                {' '}
                {t('기본 질문을 불러오지 못했어요. 다시 시도하거나 직접 질문해 주세요.')}{' '}
              </p>
              <button
                className="button secondary"
                onClick={() => setFaqRetry((value) => value + 1)}
              >
                {' '}
                {t('기본 질문 다시 불러오기')}{' '}
              </button>
            </div>
          )}
          {faqState === 'ready' && (
            <div
              ref={choicesPanel}
              className="faq-choices"
              role="group"
              aria-label={t('자주 묻는 질문')}
            >
              {faqs.map((item) => (
                <button
                  key={item.id}
                  className="button secondary"
                  aria-pressed={
                    answer?.response_type === 'prepared' && selectedQuestion === item.question
                  }
                  aria-controls={`${id}-answer`}
                  onClick={() => selectFaq(item)}
                >
                  {t(item.question)}
                </button>
              ))}
            </div>
          )}
          <div
            ref={answerPanel}
            id={`${id}-answer`}
            tabIndex={-1}
            role="region"
            aria-label={t('질문 답변')}
            aria-live="polite"
            aria-atomic="true"
          >
            {answer && (
              <div className="policy-answer">
                <ContentLanguageNotice />
                <p className="selected-question">
                  {answer.response_type === 'prepared' ? t(selectedQuestion) : selectedQuestion}
                </p>
                <h4>
                  {answer.response_type === 'prepared'
                    ? t('준비된 안내')
                    : variant === 'chat'
                      ? t('AI 답변')
                      : t('공고에 따른 안내')}
                </h4>
                {variant === 'chat' && answer.answer.length > 650 ? (
                  <details className="policy-answer-full">
                    <summary>{t('안내 내용 펼쳐 보기')}</summary>
                    <p className="policy-answer-text">{answer.answer}</p>
                  </details>
                ) : (
                  <p className="policy-answer-text">{answer.answer}</p>
                )}
                {answer.citations.length > 0 && (
                  <details>
                    <summary>{t('원문 근거 보기')}</summary>
                    {answer.citations.map((item, index) => (
                      <blockquote key={index}>{item.quote}</blockquote>
                    ))}
                  </details>
                )}
                {answer.follow_up_questions.length > 0 && (
                  <>
                    <h4>{t('추가로 확인할 내용')}</h4>
                    <ul>
                      {answer.follow_up_questions.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </>
                )}
                <p>{t('신청 자격과 현재 접수 여부는 담당 기관에서 확인해 주세요.')}</p>
                {faqs.length > 0 && (
                  <button
                    className="button secondary"
                    onClick={() => {
                      const choice =
                        choicesPanel.current?.querySelector('[aria-pressed="true"]') ||
                        choicesPanel.current?.querySelector('button');
                      choice?.focus({ preventScroll: true });
                      choicesPanel.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
                    }}
                  >
                    {' '}
                    {t('다른 질문 고르기')}{' '}
                  </button>
                )}
              </div>
            )}
          </div>
          <h4>{t('다른 내용이 궁금하신가요?')}</h4>
          <p>
            {' '}
            {t(
              '직접 질문하면 내 정보에 저장한 지역·연령대를 참고해요. 정보가 없으면 공고를 기준으로 안내해요. 이름과 전화번호는 적지 마세요.',
            )}{' '}
          </p>
          <form onSubmit={submit}>
            <label htmlFor={`${id}-input`}>{t('궁금한 내용')}</label>
            <textarea
              id={`${id}-input`}
              value={question}
              maxLength={2000}
              rows={3}
              onChange={(event) => setQuestion(event.target.value)}
              required
              disabled={busy}
              placeholder={t('어떤 지원을 받을 수 있나요?')}
            />
            <button className="button primary" type="submit" disabled={busy || !question.trim()}>
              {busy ? t('원문을 확인하고 있어요…') : t('질문 보내기')}
            </button>
          </form>
          <div role="status" aria-live="polite">
            {busy && t('답변을 준비하고 있어요.')}
          </div>
          {error && <p role="alert">{t(error)}</p>}
        </>
      )}
    </section>
  );
}
