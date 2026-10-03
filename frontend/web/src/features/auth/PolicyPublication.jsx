import { useEffect, useRef, useState } from 'react';
import { authRequest } from './authApi.js';
import { safeSourceUrl } from '../policies/policyModel.js';
import Modal from '../../shared/ui/Modal.jsx';
import './PolicyPublication.css';

const request = (path, body, signal) =>
  authRequest(`policies${path}`, body, { scope: 'admin', signal });
const statuses = { draft: '검토 대기', reviewed: '비공개', published: '공개 중', rejected: '반려' };
const formatTime = (value) =>
  new Date(value + 'Z').toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
function describeWarning(value) {
  const [condition, code] = value.split(': ');
  const reasons = {
    UNREGISTERED_FIELD: '원문에서 조건의 의미를 직접 검토해야 합니다.',
    FIELD_TYPE_OR_UNIT_UNRESOLVED: '조건의 값과 단위를 확인해야 합니다.',
    NOT_STATED: '원문에 조건 정보가 없습니다.',
  };
  if (reasons[code]) return `조건 ${condition}: ${reasons[code]}`;
  return value === 'LLM 그룹 간 논리는 검토 후 명시적으로 연결 필요'
    ? '여러 지원 조건을 함께 적용하는 방식은 직접 확인해야 합니다.'
    : value;
}
const fieldNames = {
  purpose_summary: '사업 목적',
  benefits: '지원 내용',
  eligibility: '지원 대상',
  selection: '선정 기준',
  application_period: '신청 기간',
  application_method: '신청 방법',
  required_documents: '제출 서류',
  text: '공고 원문',
};

function Review({ revisionId, onClose, onChanged, onDenied }) {
  const [review, setReview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const [note, setNote] = useState('');
  const [retry, setRetry] = useState(0);
  const operation = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    setReview(null);
    setChecked(false);
    setError('');
    request(`/${revisionId}`, undefined, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setReview(value);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err.message);
          if ([401, 403].includes(err.status)) onDenied();
        }
      });
    return () => {
      controller.abort();
      operation.current?.abort();
    };
  }, [revisionId, retry, onDenied]);
  async function change(action) {
    if (busy || !review || (action === 'publish' && !checked)) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError('');
    try {
      await request(
        `/${revisionId}/publication`,
        {
          action,
          expected_status: review.reviewStatus,
          note:
            note.trim() ||
            (action === 'publish'
              ? '원문과 확인 필요 항목 검토 후 공개'
              : '관리자 검토 후 비공개 전환'),
        },
        controller.signal,
      );
      if (!controller.signal.aborted)
        onChanged(action === 'publish' ? '공고를 공개했습니다.' : '공고를 비공개로 전환했습니다.');
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err.message);
        if ([401, 403].includes(err.status)) onDenied();
        if (err.status === 409) setReview(null);
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const preview = review?.preview;
  const sourceUrl = safeSourceUrl(preview?.sourceUrl);
  return (
    <Modal title="공고 검토" onClose={onClose} dismissible={!busy}>
      {error && <p role="alert">{error}</p>}
      {!review ? (
        <div>
          {!error && <p role="status">공고를 불러오고 있어요.</p>}
          {error && (
            <button className="button secondary" onClick={() => setRetry((value) => value + 1)}>
              다시 불러오기
            </button>
          )}
        </div>
      ) : (
        <div className="publication-review">
          <h3>{review.title}</h3>
          <p>
            {statuses[review.reviewStatus]} · {preview.organization} · {review.category}
          </p>
          <p>등록: {formatTime(review.createdAt)}</p>
          {sourceUrl && (
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
              공식 원문 열기
            </a>
          )}
          <section>
            <h3>확인 필요한 내용</h3>
            {review.warnings.length ? (
              <ul>
                {review.warnings.map((warning) => (
                  <li key={warning}>{describeWarning(warning)}</li>
                ))}
              </ul>
            ) : (
              <p>저장된 분석에 미해결 항목이 없습니다.</p>
            )}
          </section>
          <section>
            <h3>화면에 표시되는 내용</h3>
            <dl className="publication-fields">
              <dt>지원 내용</dt>
              <dd>{preview.benefit}</dd>
              <dt>지역</dt>
              <dd>{preview.region}</dd>
              <dt>대상</dt>
              <dd>{preview.audience}</dd>
              <dt>신청 기간</dt>
              <dd>{preview.applicationPeriod}</dd>
            </dl>
          </section>
          <details>
            <summary>수집 원문 확인</summary>
            <dl className="publication-fields">
              {Object.entries(review.sourceFields)
                .filter(([, value]) => value)
                .map(([key, value]) => (
                  <div key={key}>
                    <dt>{fieldNames[key] || key}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
            </dl>
          </details>
          <p>
            공개하면 전체공고에 표시됩니다. 공개는 지원 자격 확정이나 자동 맞춤 판정을 의미하지
            않습니다.
          </p>
          <label className="field-label">
            검토 메모 (선택)
            <textarea
              maxLength={1000}
              value={note}
              disabled={busy}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          {review.reviewStatus !== 'published' && (
            <label className="publication-check">
              <input
                type="checkbox"
                checked={checked}
                disabled={busy || !review.canPublish}
                onChange={(event) => setChecked(event.target.checked)}
              />
              원문과 확인 필요한 내용을 검토했습니다.
            </label>
          )}
          <div className="publication-actions">
            {review.reviewStatus === 'published' ? (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => change('unpublish')}
              >
                {busy ? '변경 중…' : '비공개로 전환'}
              </button>
            ) : (
              <button
                className="button primary"
                disabled={busy || !checked || !review.canPublish}
                onClick={() => change('publish')}
              >
                {busy ? '변경 중…' : '검토한 공고 공개'}
              </button>
            )}
            <button className="button secondary" disabled={busy} onClick={onClose}>
              취소
            </button>
          </div>
          <details>
            <summary>최근 공개 변경 이력</summary>
            {review.history.length ? (
              <ul>
                {review.history.map((event, index) => (
                  <li key={index}>
                    {statuses[event.previous_status]} → {statuses[event.review_status]} ·{' '}
                    {event.note} · {formatTime(event.created_at)}
                  </li>
                ))}
              </ul>
            ) : (
              <p>공개 변경 이력이 없습니다.</p>
            )}
          </details>
        </div>
      )}
    </Modal>
  );
}

export default function PolicyPublication() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [cursors, setCursors] = useState([null]);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState(null);
  const [denied, setDenied] = useState(false);
  const deny = useRef(() => {
    setDenied(true);
    setSelected(null);
    setResult(null);
  }).current;
  const cursor = cursors.at(-1);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError('');
    if (!denied)
      request(`?limit=10${cursor ? `&cursor=${cursor}` : ''}`, undefined, controller.signal)
        .then((value) => {
          if (!controller.signal.aborted) setResult(value);
        })
        .catch((err) => {
          if (!controller.signal.aborted) {
            setError(err.message);
            if ([401, 403].includes(err.status)) deny();
          }
        });
    return () => controller.abort();
  }, [cursor, revision, denied, deny]);
  return (
    <section className="publication-section" aria-label="공고 공개 관리">
      <h2>공고 공개 관리</h2>
      {result?.autoPublish && (
        <p>기본 승인 방식: 자동 승인. 검증을 통과한 새 공고는 저장 후 바로 공개됩니다.</p>
      )}
      <p>
        공고 내용을 확인하고 필요에 따라 공개하거나 비공개로 전환하세요. 같은 공고의 다른 개정을
        공개하면 이전 개정은 비공개로 바뀝니다.
      </p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {denied ? (
        <p>최고 관리자 계정으로 다시 로그인해 주세요.</p>
      ) : !result ? (
        error ? (
          <button className="button secondary" onClick={() => setRevision((value) => value + 1)}>
            공고 다시 불러오기
          </button>
        ) : (
          <p>저장된 공고를 불러오는 중입니다.</p>
        )
      ) : (
        <>
          <p>공고 개정 {result.total}건</p>
          {result.items.length === 0 && <p>아직 저장된 공고가 없습니다.</p>}
          <ul className="publication-list">
            {result.items.map((item) => (
              <li key={item.revisionId}>
                <div>
                  <h3>{item.title}</h3>
                  <p>
                    {statuses[item.reviewStatus]} · {item.category} · 확인 항목{' '}
                    {item.warnings.length}개
                  </p>
                  <p>등록: {formatTime(item.createdAt)}</p>
                </div>
                <button
                  className="button secondary"
                  aria-label={`${item.title} 공고 검토 ${item.revisionId}`}
                  onClick={() => {
                    setMessage('');
                    setSelected(item.revisionId);
                  }}
                >
                  공고 검토
                </button>
              </li>
            ))}
          </ul>
          <nav className="publication-actions" aria-label="공고 검토 페이지">
            <button
              className="button secondary"
              disabled={cursors.length === 1}
              onClick={() => setCursors((value) => value.slice(0, -1))}
            >
              이전
            </button>
            <span>{cursors.length}페이지</span>
            <button
              className="button secondary"
              disabled={!result.nextCursor}
              onClick={() => setCursors((value) => [...value, result.nextCursor])}
            >
              다음
            </button>
          </nav>
        </>
      )}
      {selected && (
        <Review
          revisionId={selected}
          onClose={() => setSelected(null)}
          onDenied={deny}
          onChanged={(value) => {
            setSelected(null);
            setMessage(value);
            setRevision((current) => current + 1);
          }}
        />
      )}
    </section>
  );
}
