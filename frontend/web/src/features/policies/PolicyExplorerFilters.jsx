import { useEffect, useState } from 'react';
import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import { categories, regions } from './policyModel.js';
import { SearchScopeControl } from './PolicySearchFeedback.jsx';
import Icon from '../../shared/ui/Icon.jsx';
import './explorer-filters.css';

const statuses = {
  '': '전체 상태',
  upcoming: '신청 대기',
  open: '신청 중',
  closed: '마감',
  selecting: '선정 중',
  selected: '선정 완료',
  paying: '지급 대기',
  paid: '지급 완료',
};
const providerLabels = {
  kwangwoon: '광운대',
  gov24: '정부24',
  bokjiro: '복지로',
  notice: '기타 공고',
};
const ageBands = {
  '0-18': '0~18세',
  '19-24': '19~24세',
  '25-30': '25~30세',
  '31-39': '31~39세',
  '40-64': '40~64세',
  '65-120': '65세 이상',
};

export default function PolicyExplorerFilters({
  repository,
  filters,
  change,
  setAgeRange,
  reset,
  easy,
  summary,
  user,
}) {
  const { t } = useI18n();
  const [providers, setProviders] = useState([]);
  const [optionsState, setOptionsState] = useState('loading');
  const [retry, setRetry] = useState(0);
  const [minimum, setMinimum] = useState(filters.ageMin);
  const [maximum, setMaximum] = useState(filters.ageMax);
  useEffect(() => {
    setMinimum(filters.ageMin);
    setMaximum(filters.ageMax);
  }, [filters.ageMin, filters.ageMax]);
  useEffect(() => {
    const controller = new AbortController();
    setOptionsState('loading');
    repository
      .options({ signal: controller.signal })
      .then((items) => {
        if (!controller.signal.aborted) {
          setProviders(items);
          setOptionsState('ready');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setOptionsState('error');
      });
    return () => controller.abort();
  }, [repository, retry]);
  const sourceValue = JSON.stringify([filters.provider, filters.organization]);
  const groups = providers
    .flatMap(({ id, organizations }) => {
      const school =
        id === 'notice' ? organizations.find((name) => /^광운대(?:학교)?$/.test(name)) : null;
      return [
        ...(school
          ? [{ id, label: '광운대', organizations: [school], allOrganization: school }]
          : []),
        {
          id,
          label: providerLabels[id] || id,
          organizations: organizations.filter((name) => name !== school),
          allOrganization: '',
          showAll: !school,
        },
      ];
    })
    .filter((group) => group.organizations.length)
    .sort(
      (a, b) =>
        (['광운대', '정부24', '복지로'].indexOf(a.label) + 1 || 4) -
        (['광운대', '정부24', '복지로'].indexOf(b.label) + 1 || 4),
    );
  return (
    <div className="explorer-search-settings">
      <div className="explorer-quick-filters">
        <label className="explorer-quick-field">
          <span>
            <Icon name="calendar" size={18} />
            {t('공고 상태')}
          </span>
          <select
            aria-label={t('공고 상태')}
            value={filters.status}
            onChange={(event) => change('status', event.target.value)}
          >
            {Object.entries(statuses).map(([value, label]) => (
              <option key={value} value={value}>
                {t(label)}
              </option>
            ))}
          </select>
        </label>
        <label className="explorer-quick-field">
          <span>
            <Icon name="book" size={18} />
            {t('검색 범위')}
          </span>
          <select
            aria-label={t('공고 제공 기관')}
            value={sourceValue}
            disabled={optionsState !== 'ready'}
            onChange={(event) => change('source', JSON.parse(event.target.value))}
          >
            <option value={JSON.stringify(['', ''])}>{t('전체 기관')}</option>
            {groups.map(({ id, label, organizations, allOrganization, showAll = true }) => (
              <optgroup key={id + label} label={t(label)}>
                {showAll && (
                  <option value={JSON.stringify([id, allOrganization])}>
                    {t(label)} · {t('전체')}
                  </option>
                )}
                {organizations
                  .filter((name) => name !== allOrganization)
                  .map((name) => (
                    <option key={name} value={JSON.stringify([id, name])}>
                      {name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      {optionsState === 'error' && (
        <p className="explorer-options-error" role="status">
          {t('기관 목록을 불러오지 못했어요.')}{' '}
          <button className="text-button" onClick={() => setRetry((value) => value + 1)}>
            {t('다시 시도하기')}
          </button>
        </p>
      )}
      <details className="filter-panel explorer-advanced">
        <summary>
          <span className="filter-summary-label">
            <Icon name="filter" size={19} />
            {t('고급검색')}
          </span>
          <span className="filter-summary-value">
            {easy ? summary : t('신청 가능 여부 · 지역 · 나이 · 정렬')}
          </span>
          <Icon name="down" size={18} />
        </summary>
        <div className="explorer-advanced-body">
          <div className="explorer-eligibility">
            <label>
              <input
                type="checkbox"
                checked={filters.eligibleOnly}
                disabled={!user}
                onChange={(event) => change('eligibleOnly', event.target.checked)}
              />
              <span>{t('현재 신청 가능한 공고만')}</span>
            </label>
            <p>
              {user
                ? t('내 정보로 자격요건을 비교할 수 있는 신청 중 공고를 찾아요.')
                : t('로그인하면 내 정보에 맞는 신청 중 공고를 찾을 수 있어요.')}
            </p>
          </div>
          <div className="filter-row explorer-filter-fields">
            <label>
              {t('지역')}
              <select
                value={filters.region}
                onChange={(event) => change('region', event.target.value)}
              >
                {regions.map((item) => (
                  <option key={item} value={item}>
                    {t(item)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('분야')}
              <select
                value={filters.category}
                onChange={(event) => change('category', event.target.value)}
              >
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {t(item)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('대상')}
              <select
                value={filters.audience}
                onChange={(event) => change('audience', event.target.value)}
              >
                {['전체', '청년', '가족', '어르신'].map((item) => (
                  <option key={item} value={item}>
                    {t(item)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('정렬')}
              <select value={filters.sort} onChange={(event) => change('sort', event.target.value)}>
                <option value="auto">{t('자동 (검색할 때 관련도순)')}</option>
                <option value="relevance">{t('관련도순')}</option>
                <option value="popular">{t('인기순 (조회수)')}</option>
                <option value="recent">{t('최근 등록순')}</option>
                <option value="name">{t('이름순')}</option>
              </select>
            </label>
          </div>
          <fieldset className="explorer-age-bands">
            <legend>
              {t('나이')} <span>{t('여러 구간 선택 가능')}</span>
            </legend>
            <div>
              {Object.entries(ageBands).map(([value, label]) => (
                <label key={value}>
                  <input
                    type="checkbox"
                    checked={filters.ageBands.includes(value)}
                    onChange={(event) =>
                      change(
                        'ageBands',
                        event.target.checked
                          ? [...filters.ageBands, value]
                          : filters.ageBands.filter((band) => band !== value),
                      )
                    }
                  />
                  {t(label)}
                </label>
              ))}
            </div>
          </fieldset>
          <form
            className="explorer-age-range"
            onSubmit={(event) => {
              event.preventDefault();
              if (minimum !== '' && maximum !== '' && Number(minimum) > Number(maximum)) {
                event.currentTarget.elements.ageMax.setCustomValidity(
                  t('최대 나이는 최소 나이 이상으로 입력해 주세요.'),
                );
                event.currentTarget.elements.ageMax.reportValidity();
                return;
              }
              setAgeRange(minimum, maximum);
            }}
          >
            <span>{t('나이 직접 입력')}</span>
            <label>
              <span className="sr-only">{t('최소 나이')}</span>
              <input
                type="number"
                min="0"
                max="120"
                step="1"
                value={minimum}
                onChange={(event) => {
                  setMinimum(event.target.value);
                  event.currentTarget.form.elements.ageMax.setCustomValidity('');
                }}
                placeholder="0"
              />
              {t('세')}
            </label>
            <span>~</span>
            <label>
              <span className="sr-only">{t('최대 나이')}</span>
              <input
                name="ageMax"
                type="number"
                min="0"
                max="120"
                step="1"
                value={maximum}
                onChange={(event) => {
                  event.target.setCustomValidity('');
                  setMaximum(event.target.value);
                }}
                placeholder="120"
              />
              {t('세')}
            </label>
            <button type="submit" className="button secondary">
              {t('나이 적용')}
            </button>
          </form>
          <p className="explorer-filter-note">
            {t(
              '선택한 나이와 공고의 연령 조건이 겹치는 공고를 찾아요. 연령 제한이 없는 공고도 포함해요.',
            )}
          </p>
          <SearchScopeControl
            value={filters.searchScope}
            onChange={(value) => change('searchScope', value)}
            id="policy-search-help"
          />
          <div className="explorer-filter-footer">
            <p>{t('선정·지급 상태는 원문에서 확인된 공고만 표시해요.')}</p>
            <button className="text-button" onClick={reset}>
              <Icon name="x" size={16} />
              {t('검색 조건 지우기')}
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}
