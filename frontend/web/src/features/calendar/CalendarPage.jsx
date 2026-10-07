import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import './calendar.css';
import Icon from '../../shared/ui/Icon.jsx';
import { categories, regions } from '../policies/policyModel.js';
import usePolicyRefresh from '../policies/usePolicyRefresh.js';
import {
  SearchScopeControl,
  SearchInterpretation,
  PolicySearchMatch,
  searchScopeLabels,
} from '../policies/PolicySearchFeedback.jsx';
import {
  calendarCells,
  calendarEvents,
  policiesOnDay,
  seoulToday,
  shiftMonth,
} from './calendarModel.js';

const initialFilters = {
  query: '',
  searchScope: 'all',
  searchMode: 'smart',
  searchRelation: '',
  category: '전체',
  region: '전국',
  audience: '전체',
};
const empty = { items: [], total: 0, undatedItems: [], undatedTotal: 0, truncated: false };
const dateText = (date) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일`;

export default function CalendarPage({ repository, easy, onOpen, saved, onSave }) {
  const today = seoulToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [filters, setFilters] = useState(initialFilters);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [result, setResult] = useState(empty);
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const refreshRevision = usePolicyRefresh();
  const dayHeading = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    setResult(empty);
    repository
      .calendar(month, filters, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          setResult(value);
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
  }, [repository, month, filters, retry, refreshRevision]);
  const events = useMemo(
    () => calendarEvents(result.items, month, type),
    [result.items, month, type],
  );
  const eventsByDay = useMemo(() => {
    const dates = new Map();
    for (const event of events) dates.set(event.date, [...(dates.get(event.date) || []), event]);
    return dates;
  }, [events]);
  const dayPolicies = policiesOnDay(result.items, selected, type);
  const startCount = events.filter((event) => event.type === 'start').length;
  const endCount = events.filter((event) => event.type === 'end').length;
  function changeMonth(next, day = next + '-01') {
    if (next < '2000-01' || next > '2099-12') return;
    setMonth(next);
    setSelected(day);
  }
  function chooseDay(day) {
    setSelected(day);
    requestAnimationFrame(() => {
      dayHeading.current?.focus({ preventScroll: true });
      if (window.innerWidth < 900) dayHeading.current?.scrollIntoView({ block: 'nearest' });
    });
  }
  function reset() {
    setFilters(initialFilters);
    setQuery('');
    setType('all');
  }
  function row(policy, undated = false) {
    const summary = policy.summary.trim() || policy.benefit?.trim() || '지원 내용 확인 필요';
    const labels = undated
      ? [policy.scheduleStatus === 'ongoing' ? '상시 접수' : '일정 확인 필요']
      : [
          policy.applicationStart === selected ? '신청 시작' : '',
          policy.applicationEnd === selected ? '신청 마감' : '',
        ].filter(Boolean);
    return (
      <article className="calendar-policy-row" key={policy.id}>
        <div className="calendar-policy-copy">
          <div className="calendar-row-labels">
            {(labels.length ? labels : ['접수 기간 중']).map((label) => (
              <span
                key={label}
                className={label === '신청 마감' ? 'calendar-chip end' : 'calendar-chip'}
              >
                {label}
              </span>
            ))}
            <span className="calendar-row-category">
              {policy.category} · {policy.region}
            </span>
          </div>
          <h3>
            <button className="calendar-policy-title" onClick={() => onOpen(policy)}>
              {policy.title}
            </button>
          </h3>
          <p
            className={undated ? 'calendar-policy-summary' : undefined}
            title={undated ? summary : undefined}
          >
            {undated
              ? summary
              : `신청 시작 ${policy.applicationStart || '확인 필요'} · 마감 ${policy.applicationEnd || '확인 필요'}`}
          </p>
          <small>{policy.organization}</small>
          {filters.query.trim() && <PolicySearchMatch match={policy.searchMatch} />}
        </div>
        <button
          className="calendar-save"
          aria-label={
            policy.title +
            (saved.some((item) => item.id === policy.id) ? ' 저장 해제' : ' 저장하기')
          }
          aria-pressed={saved.some((item) => item.id === policy.id)}
          onClick={() => onSave(policy)}
        >
          <Icon name="bookmark" />
        </button>
      </article>
    );
  }
  return (
    <section className="calendar-page">
      <div className="page-heading">
        <span className="eyebrow">
          <CalendarDays size={18} aria-hidden="true" /> 놓치지 않는 신청 일정
        </span>
        <h1>공고 캘린더</h1>
        <p>신청 시작일과 마감일을 확인하고, 날짜를 눌러 공고를 살펴보세요.</p>
      </div>
      <form
        className="search-controls"
        onSubmit={(event) => {
          event.preventDefault();
          setFilters((current) => ({ ...current, query, searchMode: 'smart', searchRelation: '' }));
        }}
      >
        <label className="search-field">
          <Icon name="search" />
          <input
            aria-label="캘린더 공고 검색"
            placeholder="예: 광운대 학생 장학금 찾아줘"
            maxLength={200}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button className="button primary" type="submit">
          검색
        </button>
      </form>
      <SearchScopeControl
        value={filters.searchScope}
        id="calendar-search-help"
        onChange={(searchScope) =>
          setFilters((current) => ({
            ...current,
            searchScope,
            searchMode: 'smart',
            searchRelation: '',
          }))
        }
      />
      {state === 'ready' && (
        <SearchInterpretation
          search={result.search}
          relation={filters.searchRelation}
          onRefine={(searchRelation) =>
            setFilters((current) => ({
              ...current,
              searchScope: 'all',
              searchMode: 'smart',
              searchRelation: current.searchRelation === searchRelation ? '' : searchRelation,
            }))
          }
          onLiteral={() =>
            setFilters((current) => ({
              ...current,
              searchScope: 'all',
              searchMode: 'literal',
              searchRelation: '',
            }))
          }
        />
      )}
      <details className="filter-panel calendar-filters" open={easy ? undefined : true}>
        <summary>
          <Icon name="filter" />
          <span>캘린더 검색 조건</span>
          <span className="filter-summary-value">
            {[
              filters.category,
              filters.region,
              filters.audience,
              searchScopeLabels[filters.searchScope],
            ].join(' · ')}
          </span>
        </summary>
        <div className="filter-row">
          {[
            ['category', '분야', categories],
            ['region', '지역', regions],
            ['audience', '대상', ['전체', '청년', '가족', '어르신']],
          ].map(([key, label, options]) => (
            <label key={key}>
              {label}
              <select
                aria-label={label}
                value={filters[key]}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, [key]: event.target.value }))
                }
              >
                {options.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
          ))}
          <label>
            일정 구분
            <select value={type} onChange={(event) => setType(event.target.value)}>
              <option value="all">신청 시작·마감 모두</option>
              <option value="start">신청 시작만</option>
              <option value="end">신청 마감만</option>
            </select>
          </label>
          <button className="text-button" type="button" onClick={reset}>
            검색 조건 지우기
          </button>
        </div>
      </details>
      <div className="calendar-month-bar">
        <div className="calendar-month-navigation">
          <button
            aria-label="이전 달"
            disabled={month === '2000-01'}
            onClick={() => changeMonth(shiftMonth(month, -1))}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <h2 aria-live="polite">
            {Number(month.slice(0, 4))}년 {Number(month.slice(5))}월
          </h2>
          <button
            aria-label="다음 달"
            disabled={month === '2099-12'}
            onClick={() => changeMonth(shiftMonth(month, 1))}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
        <button
          className="button secondary calendar-today"
          onClick={() => changeMonth(today.slice(0, 7), today)}
        >
          오늘
        </button>
      </div>
      <div className="calendar-summary">
        <p role="status">
          {state === 'loading'
            ? '공고 일정을 불러오는 중이에요.'
            : state === 'ready'
              ? `이달 관련 공고 ${result.total}개 · 신청 시작 ${startCount}건 · 마감 ${endCount}건`
              : '공고 일정을 불러오지 못했어요.'}
        </p>
        <div className="calendar-legend">
          <span>
            <i className="start" />
            신청 시작
          </span>
          <span>
            <i className="end" />
            신청 마감
          </span>
        </div>
      </div>
      {state === 'error' ? (
        <div className="empty-state" role="alert">
          <h2>일정을 불러오지 못했어요</h2>
          <p>{error}</p>
          <button className="button primary" onClick={() => setRetry((value) => value + 1)}>
            다시 시도하기
          </button>
        </div>
      ) : (
        <>
          {result.truncated && (
            <p className="notice-box">
              이달 관련 공고 중 500개를 표시하고 있어요. 검색 조건을 좁혀 나머지 일정도 확인해
              주세요.
            </p>
          )}
          <div className="calendar-layout" aria-busy={state === 'loading'}>
            <div className="calendar-board">
              <table className="month-grid" aria-label={`${month} 공고 일정`}>
                <thead>
                  <tr>
                    {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
                      <th key={day} scope="col">
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 6 }, (_, week) => (
                    <tr key={week}>
                      {calendarCells(month)
                        .slice(week * 7, week * 7 + 7)
                        .map((cell) => {
                          const daily = eventsByDay.get(cell.date) || [],
                            starts = daily.filter((event) => event.type === 'start').length,
                            ends = daily.filter((event) => event.type === 'end').length;
                          return (
                            <td key={cell.date} className={!cell.current ? 'outside-month' : ''}>
                              {cell.current ? (
                                <button
                                  className={
                                    'calendar-day' + (selected === cell.date ? ' selected' : '')
                                  }
                                  onClick={() => chooseDay(cell.date)}
                                  aria-pressed={selected === cell.date}
                                  aria-current={cell.date === today ? 'date' : undefined}
                                  aria-label={`${dateText(cell.date)}${cell.date === today ? ' 오늘' : ''}, 신청 시작 ${starts}건, 마감 ${ends}건`}
                                >
                                  <span className="calendar-day-number">{cell.day}</span>
                                  <span className="calendar-day-events">
                                    {daily.slice(0, 2).map((event) => (
                                      <span
                                        key={event.type + event.policy.id}
                                        className={'calendar-event ' + event.type}
                                      >
                                        <span className="calendar-event-kind">
                                          {event.type === 'start' ? '시작' : '마감'}
                                        </span>
                                        <span className="calendar-event-title">
                                          {event.policy.title}
                                        </span>
                                      </span>
                                    ))}
                                    {daily.length > 2 && (
                                      <span className="calendar-more">+{daily.length - 2}건</span>
                                    )}
                                  </span>
                                </button>
                              ) : (
                                <span className="calendar-outside-day" aria-hidden="true">
                                  {cell.day}
                                </span>
                              )}
                            </td>
                          );
                        })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <section className="calendar-day-panel" aria-labelledby="calendar-day-heading">
              <h2 id="calendar-day-heading" ref={dayHeading} tabIndex={-1}>
                {dateText(selected)} 공고
              </h2>
              <p className="calendar-day-caption">
                {type === 'all'
                  ? '선택한 날짜에 접수가 시작·마감되거나 신청 기간이 이어지는 공고예요.'
                  : type === 'start'
                    ? '이날 신청이 시작되는 공고예요.'
                    : '이날 신청이 마감되는 공고예요.'}
              </p>
              {state === 'loading' ? (
                <p className="calendar-panel-empty">일정을 확인하고 있어요.</p>
              ) : dayPolicies.length ? (
                dayPolicies.map((policy) => row(policy))
              ) : (
                <div className="calendar-panel-empty">
                  <CalendarDays size={30} aria-hidden="true" />
                  <p>이 날짜에 해당하는 공고가 없어요.</p>
                  <span>다른 날짜나 검색 조건을 선택해 보세요.</span>
                </div>
              )}
            </section>
          </div>
          {state === 'ready' && type === 'all' && result.undatedTotal > 0 && (
            <section className="calendar-undated">
              <div className="section-heading">
                <div>
                  <h2>상시 접수·일정 확인이 필요한 공고</h2>
                  <p>
                    날짜가 명확하지 않은 공고는 달력에 배치하지 않았어요. 공식 공고를 확인해 주세요.
                  </p>
                </div>
                <span>{result.undatedTotal}개</span>
              </div>
              {result.undatedItems.map((policy) => row(policy, true))}
              {result.undatedTotal > result.undatedItems.length && (
                <p className="fine-print">
                  {result.undatedTotal}개 중 {result.undatedItems.length}개를 표시합니다. 검색
                  조건을 좁히거나 <a href="#explore">전체 공고</a>에서 확인해 주세요.
                </p>
              )}
            </section>
          )}
          {state === 'ready' && result.total === 0 && (
            <p className="calendar-empty-month">
              이달에는 날짜가 확인된 공고가 없어요. 다른 달이나 검색 조건을 살펴보세요.
            </p>
          )}
        </>
      )}
      <p className="fine-print calendar-footnote">
        날짜는 한국 시간 기준입니다. 일정이 바뀔 수 있으니 신청 전에 공식 공고의 기간과 접수 시간을
        확인해 주세요.
      </p>
    </section>
  );
}
