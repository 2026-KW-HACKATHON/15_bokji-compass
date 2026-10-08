import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import ContentLanguageNotice from '../../shared/i18n/ContentLanguageNotice.jsx';
import {
  PolicyTranslationStatus,
  useVisibleTranslatedPolicy,
} from '../../shared/i18n/PolicyTranslation.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import './calendar.css';
import Icon from '../../shared/ui/Icon.jsx';
import { categories, regions } from '../policies/policyModel.js';
import usePolicyRefresh from '../policies/usePolicyRefresh.js';
import PolicyDeadline from '../policies/PolicyDeadline.jsx';
import useSeoulToday from '../policies/useSeoulToday.js';
import {
  SearchScopeControl,
  SearchInterpretation,
  PolicySearchMatch,
  searchScopeLabels,
} from '../policies/PolicySearchFeedback.jsx';
import {
  calendarCells,
  calendarEvents,
  applicationWindowOnDay,
  policyApplicationWindows,
  policiesOnDay,
  reconcileCalendarResult,
  isCalendarDate,
  shiftCalendarDay,
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

function CalendarPolicyRow({
  policy: original,
  undated = false,
  today,
  selected,
  type,
  searching,
  saved,
  onOpen,
  onSave,
  easy,
}) {
  const { t } = useI18n();
  const translation = useVisibleTranslatedPolicy(original);
  const { policy } = translation;
  const summary = policy.summary.trim() || policy.benefit?.trim() || t('지원 내용 확인 필요');
  const activeWindow = undated ? null : applicationWindowOnDay(original, selected, type);
  const selectedPolicy = activeWindow ? { ...original, ...activeWindow } : original;
  const windows = policyApplicationWindows(policy);
  const labels = undated
    ? [policy.scheduleStatus === 'ongoing' ? '상시 접수' : '일정 확인 필요']
    : [
        windows.some((window) => window.applicationStart === selected) ? '신청 시작' : '',
        windows.some((window) => window.applicationEnd === selected) ? '신청 마감' : '',
      ].filter(Boolean);
  if (selectedPolicy.applicationEnd && selectedPolicy.applicationEnd < today)
    labels.push('접수 마감');
  return (
    <article ref={translation.ref} className="calendar-policy-row">
      <div className="calendar-policy-copy">
        <div className="calendar-row-labels">
          <PolicyDeadline policy={selectedPolicy} />
          {(labels.length ? labels : ['접수 기간']).map((label) => (
            <span
              key={label}
              className={
                ['신청 마감', '접수 마감'].includes(label) ? 'calendar-chip end' : 'calendar-chip'
              }
            >
              {t(label)}
            </span>
          ))}
          <span className="calendar-row-category">
            {t(policy.category)} · {t(policy.region)}
          </span>
        </div>
        <h3>
          <button className="calendar-policy-title" onClick={() => onOpen(selectedPolicy)}>
            {policy.title}
          </button>
        </h3>
        <PolicyTranslationStatus translation={translation} />
        <p
          className={undated ? 'calendar-policy-summary' : undefined}
          title={undated ? summary : undefined}
        >
          {undated
            ? summary
            : t('신청 시작 {value1} · 마감 {value2}', {
                value1: selectedPolicy.applicationStart || t('확인 필요'),
                value2: selectedPolicy.applicationEnd || t('확인 필요'),
              })}
        </p>
        <small>{policy.organization}</small>
        {searching && <PolicySearchMatch match={policy.searchMatch} />}
      </div>
      <button
        className="calendar-save"
        aria-label={policy.title + (saved ? t(' 저장 해제') : t(' 저장하기'))}
        aria-pressed={saved}
        onClick={() => onSave(original)}
      >
        <Icon name="bookmark" />
        {easy && <span>{saved ? t('저장됨') : t('저장')}</span>}
      </button>
    </article>
  );
}

function CalendarEventTitle({ policy: original }) {
  const translation = useVisibleTranslatedPolicy(original);
  const { t } = useI18n();
  const fallback =
    translation.state === 'ready' || translation.state === 'original'
      ? undefined
      : t('한국어 원문을 표시하고 있어요.');
  return (
    <span ref={translation.ref} className="calendar-event-title" title={fallback}>
      {translation.policy.title}
    </span>
  );
}

export default function CalendarPage({ repository, easy, onOpen, saved, onSave }) {
  const { t, intlLocale } = useI18n();

  const dateText = (date) =>
    new Intl.DateTimeFormat(intlLocale, {
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Seoul',
    }).format(new Date(`${date}T00:00:00+09:00`));
  const today = useSeoulToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [filters, setFilters] = useState(initialFilters);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [result, setResult] = useState(empty);
  const [displayedFilters, setDisplayedFilters] = useState(initialFilters);
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const refreshRevision = usePolicyRefresh();
  const dayHeading = useRef(null);
  const pendingDay = useRef(today);
  const displayedMonth = result.month || month;
  const hasResult = Boolean(result.month);
  const monthLabel = (value) =>
    new Intl.DateTimeFormat(intlLocale, {
      year: 'numeric',
      month: 'long',
      timeZone: 'Asia/Seoul',
    }).format(new Date(`${value}-01T00:00:00+09:00`));
  const monthText = monthLabel(displayedMonth);
  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    setError('');
    repository
      .calendar(month, filters, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          setResult((previous) => reconcileCalendarResult(previous, value));
          setDisplayedFilters(filters);
          setSelected(pendingDay.current);
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
    () => calendarEvents(result.items, displayedMonth, type),
    [result.items, displayedMonth, type],
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
    pendingDay.current = day;
    setMonth(next);
    if (next === displayedMonth) setSelected(day);
  }
  function chooseDay(day) {
    if (month !== displayedMonth) return;
    pendingDay.current = day;
    setSelected(day);
    requestAnimationFrame(() => {
      dayHeading.current?.focus({ preventScroll: true });
      if (window.innerWidth < 900) dayHeading.current?.scrollIntoView({ block: 'nearest' });
    });
  }
  function chooseEasyDay(day) {
    if (!isCalendarDate(day)) return;
    if (day.slice(0, 7) === displayedMonth && month === displayedMonth) chooseDay(day);
    else changeMonth(day.slice(0, 7), day);
  }
  function reset() {
    setFilters(initialFilters);
    setQuery('');
    setType('all');
  }
  function row(policy, undated = false) {
    return (
      <CalendarPolicyRow
        key={policy.id}
        policy={policy}
        undated={undated}
        today={today}
        selected={selected}
        type={type}
        searching={Boolean(displayedFilters.query.trim())}
        saved={saved.some((item) => item.id === policy.id)}
        onOpen={onOpen}
        onSave={onSave}
        easy={easy}
      />
    );
  }
  return (
    <section className="calendar-page">
      <div className="page-heading">
        <span className="eyebrow">
          <CalendarDays size={18} aria-hidden="true" /> {t('놓치지 않는 신청 일정')}{' '}
        </span>
        <h1>{t('공고 캘린더')}</h1>
        <p>{t('신청 시작일과 마감일을 확인하고, 날짜를 눌러 공고를 살펴보세요.')}</p>
      </div>
      <ContentLanguageNotice />
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
            aria-label={t('캘린더 공고 검색')}
            placeholder={t('예: 광운대 학생 장학금 찾아줘')}
            maxLength={200}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button className="button primary" type="submit">
          {' '}
          {t('검색')}{' '}
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
      {hasResult && (
        <SearchInterpretation
          search={result.search}
          relation={displayedFilters.searchRelation}
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
          <span>{t('캘린더 검색 조건')}</span>
          <span className="filter-summary-value">
            {[
              filters.category,
              filters.region,
              filters.audience,
              searchScopeLabels[filters.searchScope],
            ]
              .map((value) => t(value))
              .join(' · ')}
          </span>
        </summary>
        <div className="filter-row">
          {[
            ['category', '분야', categories],
            ['region', '지역', regions],
            ['audience', '대상', ['전체', '청년', '가족', '어르신']],
          ].map(([key, label, options]) => (
            <label key={key}>
              {t(label)}
              <select
                aria-label={t(label)}
                value={filters[key]}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, [key]: event.target.value }))
                }
              >
                {options.map((option) => (
                  <option key={option} value={option}>
                    {t(option)}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label>
            {' '}
            {t('일정 구분')}{' '}
            <select value={type} onChange={(event) => setType(event.target.value)}>
              <option value="all">{t('신청 시작·마감 모두')}</option>
              <option value="start">{t('신청 시작만')}</option>
              <option value="end">{t('신청 마감만')}</option>
            </select>
          </label>
          <button className="text-button" type="button" onClick={reset}>
            {' '}
            {t('검색 조건 지우기')}{' '}
          </button>
        </div>
      </details>
      <div className="calendar-month-bar">
        <div className="calendar-month-navigation">
          <button
            aria-label={t('이전 달')}
            disabled={month === '2000-01'}
            onClick={() => changeMonth(shiftMonth(month, -1))}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <h2 aria-live="polite">{monthText} </h2>
          <button
            aria-label={t('다음 달')}
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
          {' '}
          {t('오늘')}{' '}
        </button>
      </div>
      <div className="calendar-summary">
        <p role="status">
          {state === 'loading'
            ? t('{value1} 공고 일정을 불러오는 중이에요.', { value1: monthLabel(month) })
            : state === 'ready'
              ? t('이달 관련 공고 {value1}개 · 신청 시작 {value2}건 · 마감 {value3}건', {
                  value1: result.total,
                  value2: startCount,
                  value3: endCount,
                })
              : t('공고 일정을 불러오지 못했어요.')}
        </p>
        <div className="calendar-legend">
          <span>
            <i className="start" /> {t('신청 시작')}{' '}
          </span>
          <span>
            <i className="end" /> {t('신청 마감')}{' '}
          </span>
        </div>
      </div>
      {state === 'error' && (
        <div className="empty-state" role="alert">
          <h2>{t('일정을 불러오지 못했어요')}</h2>
          <p>{t(error)}</p>
          <button className="button primary" onClick={() => setRetry((value) => value + 1)}>
            {' '}
            {t('다시 시도하기')}{' '}
          </button>
        </div>
      )}
      <>
        {result.truncated && (
          <p className="notice-box">
            {' '}
            {t(
              '이달 관련 공고 중 500개를 표시하고 있어요. 검색 조건을 좁혀 나머지 일정도 확인해 주세요.',
            )}{' '}
          </p>
        )}
        <div className="calendar-layout" aria-busy={state === 'loading'}>
          {easy ? (
            <div className="calendar-easy-picker">
              <label htmlFor="calendar-easy-date">{t('날짜 선택')}</label>
              <p id="calendar-easy-date-help">
                {t('날짜를 고르면 아래에서 신청 가능한 공고를 확인할 수 있어요.')}
              </p>
              <input
                id="calendar-easy-date"
                type="date"
                min="2000-01-01"
                max="2099-12-31"
                value={month === displayedMonth ? selected : pendingDay.current}
                aria-describedby="calendar-easy-date-help"
                onChange={(event) => chooseEasyDay(event.target.value)}
              />
              <div className="calendar-easy-day-navigation">
                <button
                  className="button secondary"
                  disabled={state === 'loading' || !shiftCalendarDay(selected, -1)}
                  onClick={() => chooseEasyDay(shiftCalendarDay(selected, -1))}
                >
                  <ChevronLeft size={20} aria-hidden="true" /> {t('이전 날짜')}
                </button>
                <button
                  className="button secondary"
                  disabled={state === 'loading' || !shiftCalendarDay(selected, 1)}
                  onClick={() => chooseEasyDay(shiftCalendarDay(selected, 1))}
                >
                  {t('다음 날짜')} <ChevronRight size={20} aria-hidden="true" />
                </button>
              </div>
              <details className="calendar-easy-month">
                <summary>{t('이달 날짜 모두 보기')}</summary>
                <div className="calendar-easy-days">
                  {calendarCells(displayedMonth)
                    .filter((cell) => cell.current)
                    .map((cell) => {
                      const daily = eventsByDay.get(cell.date) || [];
                      const starts = daily.filter((event) => event.type === 'start').length;
                      const ends = daily.filter((event) => event.type === 'end').length;
                      return (
                        <button
                          key={cell.date}
                          type="button"
                          disabled={month !== displayedMonth}
                          aria-pressed={selected === cell.date}
                          aria-current={cell.date === today ? 'date' : undefined}
                          aria-label={t('{value1}{value2}, 신청 시작 {value3}건, 마감 {value4}건', {
                            value1: dateText(cell.date),
                            value2: cell.date === today ? ' ' + t('오늘') : '',
                            value3: starts,
                            value4: ends,
                          })}
                          onClick={() => chooseDay(cell.date)}
                        >
                          <strong>
                            {new Intl.DateTimeFormat(intlLocale, {
                              month: 'short',
                              day: 'numeric',
                              weekday: 'short',
                              timeZone: 'Asia/Seoul',
                            }).format(new Date(`${cell.date}T00:00:00+09:00`))}
                          </strong>
                          {cell.date === today && <span>{t('오늘')}</span>}
                          <span>
                            {t('시작')} {starts} · {t('마감')} {ends}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </details>
            </div>
          ) : (
            <div className="calendar-board">
              <table
                className="month-grid"
                aria-label={t('{value1} 공고 일정', { value1: displayedMonth })}
              >
                <thead>
                  <tr>
                    {Array.from({ length: 7 }, (_, index) =>
                      new Intl.DateTimeFormat(intlLocale, {
                        weekday: 'short',
                        timeZone: 'Asia/Seoul',
                      }).format(new Date(Date.UTC(2026, 0, 4 + index))),
                    ).map((day) => (
                      <th key={day} scope="col">
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 6 }, (_, week) => (
                    <tr key={week}>
                      {calendarCells(displayedMonth)
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
                                  aria-disabled={month !== displayedMonth || undefined}
                                  aria-pressed={selected === cell.date}
                                  aria-current={cell.date === today ? 'date' : undefined}
                                  aria-label={t(
                                    '{value1}{value2}, 신청 시작 {value3}건, 마감 {value4}건',
                                    {
                                      value1: dateText(cell.date),
                                      value2: cell.date === today ? ' ' + t('오늘') : '',
                                      value3: starts,
                                      value4: ends,
                                    },
                                  )}
                                >
                                  <span className="calendar-day-number">{cell.day}</span>
                                  <span className="calendar-day-events">
                                    {daily.slice(0, 2).map((event) => (
                                      <span
                                        key={event.type + event.policy.id}
                                        className={'calendar-event ' + event.type}
                                      >
                                        <span className="calendar-event-kind">
                                          {event.type === 'start' ? t('시작') : t('마감')}
                                        </span>
                                        <CalendarEventTitle policy={event.policy} />
                                      </span>
                                    ))}
                                    {daily.length > 2 && (
                                      <span className="calendar-more">
                                        +{daily.length - 2}
                                        {t('건')}
                                      </span>
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
          )}
          <section className="calendar-day-panel" aria-labelledby="calendar-day-heading">
            <h2 id="calendar-day-heading" ref={dayHeading} tabIndex={-1}>
              {dateText(selected)} {t('공고')}{' '}
            </h2>
            <p className="calendar-day-caption">
              {type === 'all'
                ? t('선택한 날짜에 접수가 시작·마감되거나 신청 기간이 이어지는 공고예요.')
                : type === 'start'
                  ? t('이날 신청이 시작되는 공고예요.')
                  : t('이날 신청이 마감되는 공고예요.')}
            </p>
            {!hasResult ? (
              <p className="calendar-panel-empty">
                {t(state === 'error' ? '일정을 불러오지 못했어요' : '일정을 확인하고 있어요.')}
              </p>
            ) : dayPolicies.length ? (
              dayPolicies.map((policy) => row(policy))
            ) : (
              <div className="calendar-panel-empty">
                <CalendarDays size={30} aria-hidden="true" />
                <p>{t('이 날짜에 해당하는 공고가 없어요.')}</p>
                <span>{t('다른 날짜나 검색 조건을 선택해 보세요.')}</span>
              </div>
            )}
          </section>
        </div>
        {hasResult && type === 'all' && result.undatedTotal > 0 && (
          <section className="calendar-undated">
            <div className="section-heading">
              <div>
                <h2>{t('상시 접수·일정 확인이 필요한 공고')}</h2>
                <p>
                  {' '}
                  {t(
                    '날짜가 명확하지 않은 공고는 달력에 배치하지 않았어요. 공식 공고를 확인해 주세요.',
                  )}{' '}
                </p>
              </div>
              <span>
                {result.undatedTotal}
                {t('개')}
              </span>
            </div>
            {result.undatedItems.map((policy) => row(policy, true))}
            {result.undatedTotal > result.undatedItems.length && (
              <p className="fine-print">
                {result.undatedTotal}
                {t('개 중')} {result.undatedItems.length}
                {t('개를 표시합니다. 검색 조건을 좁히거나')} <a href="#explore">{t('전체 공고')}</a>
                {t('에서 확인해 주세요.')}{' '}
              </p>
            )}
          </section>
        )}
        {hasResult && result.total === 0 && (
          <p className="calendar-empty-month">
            {' '}
            {t('이달에는 날짜가 확인된 공고가 없어요. 다른 달이나 검색 조건을 살펴보세요.')}{' '}
          </p>
        )}
      </>
      <p className="fine-print calendar-footnote">
        {' '}
        {t(
          '날짜는 한국 시간 기준입니다. 일정이 바뀔 수 있으니 신청 전에 공식 공고의 기간과 접수 시간을 확인해 주세요.',
        )}{' '}
      </p>
    </section>
  );
}
