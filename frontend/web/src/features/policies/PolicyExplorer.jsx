import { useEffect, useRef, useState } from 'react';
import { categories, regions } from './policyModel.js';
import PolicyCard from './PolicyCard.jsx';
import Icon from '../../shared/ui/Icon.jsx';
import usePolicyRefresh from './usePolicyRefresh.js';
import {
  SearchScopeControl,
  SearchInterpretation,
  searchScopeLabels,
} from './PolicySearchFeedback.jsx';
import { effectivePolicySort } from './searchMetadata.js';
const initialFilters = {
  query: '',
  searchScope: 'all',
  searchMode: 'smart',
  searchRelation: '',
  category: '전체',
  region: '전국',
  audience: '전체',
  sort: 'auto',
};
const sortLabels = {
  relevance: '관련도순',
  popular: '인기순 (조회수)',
  recent: '최근 등록순',
  name: '이름순',
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
  initialQuery = '',
  initialRegion = '전국',
  initialCategory = '전체',
}) {
  const [filters, setFilters] = useState(() => ({
    ...initialFilters,
    query: initialQuery,
    region: regions.includes(initialRegion) ? initialRegion : '전국',
    category: categories.includes(initialCategory) ? initialCategory : '전체',
  }));
  const [query, setQuery] = useState(initialQuery);
  const [pagination, setPagination] = useState({ easy, cursors: [null] });
  // A cursor belongs to its page size. Reset before requesting the new mode's page.
  if (pagination.easy !== easy) setPagination({ easy, cursors: [null] });
  const cursors = pagination.easy === easy ? pagination.cursors : [null];
  const setCursors = (next) => setPagination({ easy, cursors: next });
  const [result, setResult] = useState({ items: [], total: 0, nextCursor: null });
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const refreshRevision = usePolicyRefresh();
  const loadedRequest = useRef(null);
  const heading = useRef(null);
  const cursor = cursors.at(-1);
  const pageSize = easy ? 3 : 6;
  const firstResult = (cursors.length - 1) * pageSize + 1;
  const filterSummary = [
    filters.category === '전체' ? '모든 분야' : filters.category,
    filters.region,
    filters.audience === '전체' ? '모든 대상' : filters.audience,
    sortLabels[effectivePolicySort(filters)],
    searchScopeLabels[filters.searchScope],
  ].join(' · ');
  useEffect(() => {
    const controller = new AbortController();
    const previous = loadedRequest.current;
    // Refresh the same results silently; new searches and pages still show loading.
    const backgroundRefresh =
      previous?.repository === repository &&
      previous.filters === filters &&
      previous.tag === tag &&
      previous.cursor === cursor &&
      previous.pageSize === pageSize;
    if (!backgroundRefresh) {
      loadedRequest.current = null;
      setState('loading');
      setError('');
    }
    repository
      .list({ ...filters, tag }, { cursor, limit: pageSize, signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          loadedRequest.current = { repository, filters, tag, cursor, pageSize };
          setResult(value);
          setState('ready');
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted && !backgroundRefresh) {
          setError(
            err.status === 404
              ? '공고 서비스를 연결하고 있어요. 준비가 끝나면 여기에서 확인할 수 있어요.'
              : err.message,
          );
          setState('error');
        }
      });
    return () => controller.abort();
  }, [repository, filters, tag, cursor, pageSize, retry, refreshRevision]);
  const change = (key, value) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(['query', 'searchScope'].includes(key)
        ? { searchMode: 'smart', searchRelation: '' }
        : {}),
    }));
    setCursors([null]);
  };
  const refine = (searchRelation) => {
    setFilters((current) => ({
      ...current,
      searchMode: 'smart',
      searchScope: 'all',
      searchRelation: current.searchRelation === searchRelation ? '' : searchRelation,
    }));
    setCursors([null]);
  };
  const searchOriginal = () => {
    setFilters((current) => ({
      ...current,
      searchMode: 'literal',
      searchScope: 'all',
      searchRelation: '',
    }));
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
        {!easy && <span className="eyebrow">직접 찾아보기</span>}
        <h1>전체 공고</h1>
        <p>
          {easy
            ? '필요한 지원을 편하게 말해 주세요.'
            : '필요한 지원을 문장으로 입력해 보세요. 말의 뜻에 맞는 공고를 찾아요.'}
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
            placeholder={easy ? '예: 광운대 장학금 찾아줘' : '예: 광운대에서 올린 장학금 찾아줘'}
            maxLength={200}
          />
        </label>
        <button className="button primary" type="submit">
          검색
        </button>
      </form>
      <SearchScopeControl
        value={filters.searchScope}
        onChange={(value) => change('searchScope', value)}
        id="policy-search-help"
      />
      {state === 'ready' && (
        <SearchInterpretation
          search={result.search}
          relation={filters.searchRelation}
          onRefine={refine}
          onLiteral={searchOriginal}
        />
      )}
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
          <span className="filter-summary-label">{easy ? '검색 조건' : '분야·지역 선택'}</span>
          {easy && <span className="filter-summary-value">{filterSummary}</span>}
        </summary>
        {!easy && (
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
        )}
        <div className="filter-row">
          {easy && (
            <label>
              분야
              <select
                value={filters.category}
                onChange={(event) => change('category', event.target.value)}
              >
                {categories.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          )}
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
          <label>
            정렬
            <select value={filters.sort} onChange={(event) => change('sort', event.target.value)}>
              <option value="auto">자동 (검색할 때 관련도순)</option>
              <option value="relevance">관련도순</option>
              <option value="popular">인기순 (조회수)</option>
              <option value="recent">최근 등록순</option>
              <option value="name">이름순</option>
            </select>
          </label>
          <button className="text-button" onClick={reset}>
            검색 조건 지우기
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
            검색 조건 지우기
          </button>
        </div>
      ) : (
        <>
          <div className={'policy-grid' + (easy ? ' easy-policy-list' : '')}>
            {result.items.map((policy) => (
              <PolicyCard
                key={policy.id}
                policy={policy}
                saved={saved.some((item) => item.id === policy.id)}
                onSave={onSave}
                onOpen={onOpen}
                onTag={onTag}
                easy={easy}
                showSearchMatch={Boolean(filters.query.trim())}
              />
            ))}
          </div>
          {(!easy || cursors.length > 1 || result.nextCursor) && (
            <nav className="pagination" aria-label="공고 페이지">
              <button
                className="button secondary"
                disabled={cursors.length === 1}
                onClick={() => turnPage(cursors.slice(0, -1))}
              >
                이전 페이지
              </button>
              {easy ? (
                <span
                  aria-label={`전체 ${result.total}개 중 ${firstResult}번째부터 ${firstResult + result.items.length - 1}번째 공고`}
                >
                  {firstResult}–{firstResult + result.items.length - 1} / {result.total}개
                </span>
              ) : (
                <span>{cursors.length}번째 페이지</span>
              )}
              <button
                className="button secondary"
                disabled={!result.nextCursor || cursors.includes(result.nextCursor)}
                onClick={() => turnPage([...cursors, result.nextCursor])}
              >
                다음 페이지
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
