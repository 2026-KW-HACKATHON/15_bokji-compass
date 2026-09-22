import { useEffect, useRef, useState } from 'react';
import { categories, regions } from './policyModel.js';
import PolicyCard from './PolicyCard.jsx';
import Icon from '../../shared/ui/Icon.jsx';
const initialFilters = {
  query: '',
  category: '전체',
  region: '전국',
  audience: '전체',
  sort: 'recent',
};
export default function PolicyExplorer({
  repository,
  tag,
  onClearTag,
  easy,
  saved,
  onSave,
  onOpen,
  onTag,
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [query, setQuery] = useState('');
  const [cursors, setCursors] = useState([null]);
  const [result, setResult] = useState({ items: [], total: 0, nextCursor: null });
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const heading = useRef(null);
  const cursor = cursors.at(-1);
  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    repository
      .list({ ...filters, tag }, { cursor, limit: easy ? 1 : 6, signal: controller.signal })
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
              ? '공고 서비스를 연결하고 있어요. 준비가 끝나면 여기에서 확인할 수 있어요.'
              : err.message,
          );
          setState('error');
        }
      });
    return () => controller.abort();
  }, [repository, filters, tag, cursor, easy, retry]);
  const change = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setCursors([null]);
  };
  const reset = () => {
    setFilters(initialFilters);
    setQuery('');
    setCursors([null]);
    onClearTag();
  };
  const turnPage = (next) => {
    setCursors(next);
    heading.current?.focus();
  };
  return (
    <section className="explorer">
      <div className="page-heading">
        <span className="eyebrow">공고 찾기</span>
        <h1>필요한 공고를 찾아보세요</h1>
        <p>
          {easy
            ? '검색하거나, 관심 있는 분야를 골라보세요.'
            : '직접 둘러보고 싶은 공고도 지역과 태그로 쉽게 찾을 수 있어요.'}
        </p>
      </div>
      <form
        className="search-controls"
        onSubmit={(event) => {
          event.preventDefault();
          change('query', query);
        }}
      >
        <label className="search-field">
          <Icon name="search" />
          <input
            aria-label="공고 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="예: 주거, 취업, 돌봄"
          />
        </label>
        <button className="button primary" type="submit">
          검색
        </button>
      </form>
      {tag && (
        <div className="active-tag" role="status">
          <span>
            선택한 태그 <strong>#{tag}</strong>
          </span>
          <button onClick={onClearTag} aria-label="태그 필터 해제">
            <Icon name="x" size={18} />
            해제
          </button>
        </div>
      )}
      <details className="filter-panel" open={easy ? undefined : true}>
        <summary>
          <Icon name="filter" size={19} />
          분야·지역 선택
        </summary>
        <div className="category-list" aria-label="공고 분야">
          {categories.map((item) => (
            <button
              key={item}
              aria-pressed={filters.category === item}
              className={filters.category === item ? 'selected' : ''}
              onClick={() => change('category', item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="filter-row">
          <label>
            지역
            <select
              value={filters.region}
              onChange={(event) => change('region', event.target.value)}
            >
              {regions.map((region) => (
                <option key={region}>{region}</option>
              ))}
            </select>
          </label>
          <label>
            대상
            <select
              value={filters.audience}
              onChange={(event) => change('audience', event.target.value)}
            >
              {['전체', '청년', '가족', '어르신'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          {!easy && (
            <label>
              정렬
              <select value={filters.sort} onChange={(event) => change('sort', event.target.value)}>
                <option value="recent">최근 등록순</option>
                <option value="name">이름순</option>
              </select>
            </label>
          )}
          <button className="text-button" onClick={reset}>
            검색 조건 초기화
          </button>
        </div>
      </details>
      <div className="results-heading">
        <h2 ref={heading} tabIndex={-1}>
          공고 목록
        </h2>
        <span role="status">
          {state === 'ready'
            ? '총 ' + result.total + '개'
            : state === 'loading'
              ? '불러오는 중'
              : ''}
        </span>
      </div>
      {state === 'loading' ? (
        <div className="empty-state" role="status">
          공고를 가져오고 있어요.
        </div>
      ) : state === 'error' ? (
        <div className="empty-state" role="alert">
          <Icon name="info" size={30} />
          <h3>공고를 불러오지 못했어요</h3>
          <p>{error}</p>
          <button className="button primary" onClick={() => setRetry((value) => value + 1)}>
            다시 시도하기
          </button>
        </div>
      ) : result.items.length === 0 ? (
        <div className="empty-state">
          <Icon name="search" size={30} />
          <h3>조건에 맞는 공고가 없어요</h3>
          <p>다른 검색어나 분야를 선택해 보세요.</p>
          <button className="button secondary" onClick={reset}>
            검색 조건 초기화
          </button>
        </div>
      ) : (
        <>
          <div className="policy-grid">
            {result.items.map((policy) => (
              <PolicyCard
                key={policy.id}
                policy={policy}
                saved={saved.some((item) => item.id === policy.id)}
                onSave={onSave}
                onOpen={onOpen}
                onTag={onTag}
                easy={easy}
              />
            ))}
          </div>
          <nav className="pagination" aria-label="공고 페이지">
            <button
              className="button secondary"
              disabled={cursors.length === 1}
              onClick={() => turnPage(cursors.slice(0, -1))}
            >
              이전 공고
            </button>
            <span>
              {cursors.length}번째 {easy ? '공고' : '페이지'}
            </span>
            <button
              className="button secondary"
              disabled={!result.nextCursor || cursors.includes(result.nextCursor)}
              onClick={() => turnPage([...cursors, result.nextCursor])}
            >
              다음 공고
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
