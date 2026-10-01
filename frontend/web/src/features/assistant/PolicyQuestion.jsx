import { useEffect, useId, useRef, useState } from 'react';
import { appConfig } from '../../shared/config.js';
import { createQuestionApi } from './questionApi.js';

const ask = createQuestionApi({ baseUrl: appConfig.apiBaseUrl });

export default function PolicyQuestion({ revisionId, user }) {
  const id = useId();
  const active = useRef(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => () => active.current?.abort(), []);

  async function submit(event) {
    event.preventDefault();
    if (active.current || !question.trim()) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    setAnswer(null);
    try {
      const result = await ask(revisionId, question, { signal: controller.signal });
      if (!controller.signal.aborted) setAnswer(result);
    } catch (err) {
      if (!controller.signal.aborted) setError(err.message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      if (active.current === controller) active.current = null;
    }
  }

  return (
    <section className="policy-question" aria-labelledby={`${id}-heading`}>
      <h3 id={`${id}-heading`}>이 공고에 질문하기</h3>
      {!user ? (
        <p>
          <a href="#login">로그인</a>하면 공고 내용을 물어볼 수 있어요.
        </p>
      ) : !revisionId ? (
        <p>전체 공고에서 최신 공고를 다시 열면 질문할 수 있어요.</p>
      ) : (
        <>
          <p>질문과 가입한 지역·연령대로 안내해요. 이름과 전화번호는 질문에 적지 마세요.</p>
          <form onSubmit={submit}>
            <label htmlFor={`${id}-input`}>궁금한 내용</label>
            <textarea
              id={`${id}-input`}
              value={question}
              maxLength={2000}
              rows={3}
              onChange={(event) => setQuestion(event.target.value)}
              required
              disabled={busy}
              placeholder="어떤 지원을 받을 수 있나요?"
            />
            <button className="button primary" type="submit" disabled={busy || !question.trim()}>
              {busy ? '원문을 확인하고 있어요…' : '질문 보내기'}
            </button>
          </form>
          <div role="status" aria-live="polite">
            {busy && '답변을 준비하고 있어요.'}
          </div>
          {error && <p role="alert">{error}</p>}
          {answer && (
            <div className="policy-answer" aria-live="polite">
              <h4>공고에 따른 안내</h4>
              <p>{answer.answer}</p>
              {answer.citations.length > 0 && (
                <>
                  <h4>원문 근거</h4>
                  {answer.citations.map((item, index) => (
                    <blockquote key={index}>{item.quote}</blockquote>
                  ))}
                </>
              )}
              {answer.follow_up_questions.length > 0 && (
                <>
                  <h4>추가로 확인할 내용</h4>
                  <ul>
                    {answer.follow_up_questions.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </>
              )}
              <p>신청 자격과 현재 접수 여부는 담당 기관에서 확인해 주세요.</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
