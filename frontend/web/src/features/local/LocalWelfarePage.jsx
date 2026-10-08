import { useEffect, useRef, useState } from 'react';
import { Bus, HeartPulse, LibraryBig, MapPin, UsersRound } from 'lucide-react';
import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import Icon from '../../shared/ui/Icon.jsx';
import {
  initialLocalArea,
  localPolicySearch,
  parseLocalArea,
  priorityLocalArea,
  startingLocalArea,
} from './localModel.js';
import './local-welfare.css';

const categories = [
  { id: 'all', label: '전체', Icon: MapPin },
  { id: 'transport', label: '이동·교통', Icon: Bus },
  { id: 'health', label: '건강', Icon: HeartPulse },
  { id: 'care', label: '돌봄·생활', Icon: UsersRound },
  { id: 'culture', label: '문화·시설', Icon: LibraryBig },
];
const areaText = (area) =>
  [area?.region, area?.district, area?.neighborhood].filter(Boolean).join(' ');

function ServiceCard({ service, area }) {
  const { t } = useI18n();
  const category = categories.find((item) => item.id === service.category) || categories[0];
  return (
    <article className="local-service-card">
      <div className="local-card-top">
        <span className={'local-service-icon local-icon-' + category.id}>
          <category.Icon size={24} aria-hidden="true" />
        </span>
        <span>{t(category.label)}</span>
      </div>
      <h3>{service.title}</h3>
      {area.neighborhood &&
        (service.focusAreas.some(
          (place) =>
            place.region === area.region &&
            place.district === area.district &&
            place.neighborhood === area.neighborhood,
        ) ||
          service.coverage.some(
            (place) =>
              place.region === area.region &&
              place.district === area.district &&
              place.neighborhoods.includes(area.neighborhood),
          )) && (
          <span className="local-neighborhood-badge">
            {t('{neighborhood} 관련 안내', { neighborhood: area.neighborhood })}
          </span>
        )}
      <p className="local-service-summary">{service.summary}</p>
      <dl>
        {[
          ['이용 지역', service.area],
          ['이용 대상', service.audience],
          ['이용 요금', service.cost],
          ['이용 방법', service.usage],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{t(label)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="local-source">
        <span>
          {service.sourceName} · {t('안내 확인 {date}', { date: service.checkedAt })}
        </span>
        <a
          href={service.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('{title} 공식 안내 (새 창)', { title: service.title })}
        >
          {t('공식 안내 보기')} <Icon name="external" size={18} />
        </a>
      </div>
    </article>
  );
}

export default function LocalWelfarePage({
  user,
  profile,
  repository,
  onSearch,
  initialSelection,
  onSelectionChange,
}) {
  const { t, locale } = useI18n();
  const [area, setArea] = useState(
    () => initialSelection?.area || startingLocalArea(user, profile),
  );
  const [input, setInput] = useState(() =>
    areaText(initialSelection?.area || startingLocalArea(user, profile)),
  );
  const [category, setCategory] = useState(initialSelection?.category || 'all');
  const [scope, setScope] = useState(initialSelection?.scope || 'all');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState({ key: '', status: 'loading', value: null });
  const [coverage, setCoverage] = useState(null);
  const inputRef = useRef(null);
  const savedArea = initialLocalArea(user, profile);
  const hasArea = Boolean(area?.region);
  const requestKey = JSON.stringify([
    area.region,
    area.district,
    area.neighborhood,
    category,
    scope,
    retry,
  ]);
  const status = result.key === requestKey ? result.status : 'loading';
  const services = status === 'ready' ? result.value.items : [];
  const search = localPolicySearch(area);

  useEffect(() => {
    if (!hasArea) return;
    const controller = new AbortController();
    setResult({ key: requestKey, status: 'loading', value: null });
    repository
      .list({ ...area, category, scope }, { signal: controller.signal })
      .then((value) => {
        if (controller.signal.aborted) return;
        setResult({ key: requestKey, status: 'ready', value });
        setCoverage(value.coverage);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setResult({ key: requestKey, status: 'error', value: null });
      });
    return () => controller.abort();
  }, [repository, requestKey, hasArea]);

  function applyArea(next) {
    setArea(next);
    setInput(areaText(next));
    setCategory('all');
    setScope('all');
    onSelectionChange?.({ area: next, category: 'all', scope: 'all' });
    setError('');
  }
  function selectCategory(next) {
    setCategory(next);
    onSelectionChange?.({ area, category: next, scope });
  }
  function selectScope(next) {
    setScope(next);
    onSelectionChange?.({ area, category, scope: next });
  }
  function submit(event) {
    event.preventDefault();
    const next = parseLocalArea(input);
    if (!next) {
      setError('시·도와 시·군·구를 함께 입력해 주세요. 예: 서울 노원구');
      inputRef.current?.focus();
      return;
    }
    applyArea(next);
  }

  return (
    <div className="local-welfare-page">
      <header className="local-hero">
        <span className="local-eyebrow">
          <MapPin size={17} aria-hidden="true" /> {t('내 생활반경에서 찾는 도움')}
        </span>
        <h1>{t('우리 동네 복지')}</h1>
        <p>{t('무료버스부터 건강·돌봄·문화시설까지, 자주 머무는 지역의 도움을 찾아보세요.')}</p>
        <form className="local-area-form" onSubmit={submit}>
          <label htmlFor="local-area">{t('어느 지역을 살펴볼까요?')}</label>
          <div className="local-area-input">
            <MapPin size={22} aria-hidden="true" />
            <input
              id="local-area"
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              maxLength={200}
              placeholder={t('예: 서울 노원구 월계1동')}
              autoComplete="off"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'local-area-error local-area-help' : 'local-area-help'}
            />
            <button type="submit" className="button primary">
              {t('이 지역 보기')} <Icon name="arrow" size={19} />
            </button>
          </div>
          {error && (
            <p id="local-area-error" className="local-input-error" role="alert">
              {t(error)}
            </p>
          )}
          <p id="local-area-help" className="local-area-help">
            {t('집·직장·학교가 있는 지역을 입력하세요. 상세 주소는 필요 없어요.')}
          </p>
        </form>
        <div className="local-area-shortcuts">
          {(savedArea.district || savedArea.region === '세종') && (
            <button type="button" onClick={() => applyArea(savedArea)}>
              <Icon name="house" size={16} />
              {t('내 주소 지역 사용')}
            </button>
          )}
          <button type="button" onClick={() => applyArea({ ...priorityLocalArea })}>
            {t('중점 지역 · 노원구 월계1동')} <Icon name="right" size={16} />
          </button>
        </div>
        {coverage && (
          <div className="local-collected-areas">
            <label htmlFor="local-collected-area">{t('자료가 등록된 다른 지역')}</label>
            <select
              id="local-collected-area"
              value=""
              onChange={(event) => {
                const next = coverage.regions.find(
                  (place) => `${place.region}|${place.district}` === event.target.value,
                );
                if (next)
                  applyArea({ region: next.region, district: next.district, neighborhood: '' });
              }}
            >
              <option value="">{t('지역 선택')}</option>
              {coverage.regions.map((place) => (
                <option
                  key={`${place.region}|${place.district}`}
                  value={`${place.region}|${place.district}`}
                >
                  {[t(place.region), place.district || t('광역 전체')].join(' ')} ·{' '}
                  {t('등록된 서비스 {count}개', { count: place.count })}
                </option>
              ))}
            </select>
            <p>
              {t('전체 {count}개 서비스 · 공식 자료를 확인한 지역부터 넓혀가요.', {
                count: coverage.totalServices,
              })}
            </p>
          </div>
        )}
      </header>

      <section className="local-results" aria-labelledby="local-results-title">
        <div className="local-results-heading">
          <div>
            <span className="local-section-kicker">{t('가까운 곳에서 누리는 생활서비스')}</span>
            <h2 id="local-results-title">
              {hasArea
                ? t('{area}의 생활복지', {
                    area: areaText(area),
                  })
                : t('내 지역부터 선택해 주세요')}
            </h2>
          </div>
          {hasArea && status === 'ready' && (
            <span className="local-result-count" role="status">
              {t('등록된 서비스 {count}개', { count: services.length })}
            </span>
          )}
        </div>
        {hasArea && (
          <p className="local-scope-note">
            {t('선택한 시·군·구의 서비스를 모았어요. 실제 이용 장소와 대상은 서비스마다 달라요.')}
          </p>
        )}
        {area.neighborhood && (
          <div className="local-scope-filter" role="group" aria-label={t('생활지역 범위')}>
            <button type="button" aria-pressed={scope === 'all'} onClick={() => selectScope('all')}>
              {t('구·광역 서비스 함께')}
            </button>
            <button
              type="button"
              aria-pressed={scope === 'neighborhood'}
              onClick={() => selectScope('neighborhood')}
            >
              {t('{neighborhood} 중심', { neighborhood: area.neighborhood })}
            </button>
            <p>{t('동 중심 보기에는 공식 자료에서 해당 동과의 관계를 확인한 안내만 표시해요.')}</p>
          </div>
        )}
        {hasArea && (
          <div className="local-categories" role="group" aria-label={t('생활서비스 분야')}>
            {categories.map(({ id, label, Icon: CategoryIcon }) => (
              <button
                type="button"
                key={id}
                aria-pressed={category === id}
                onClick={() => selectCategory(id)}
              >
                <CategoryIcon size={18} aria-hidden="true" />
                {t(label)}
              </button>
            ))}
          </div>
        )}
        {locale !== 'ko' && services.length > 0 && (
          <p className="local-scope-note">
            {t('지역 서비스의 상세 안내는 한국어 원문으로 제공돼요.')}
          </p>
        )}
        {status === 'loading' ? (
          <p className="local-request-message" role="status">
            {t('생활서비스를 불러오고 있어요.')}
          </p>
        ) : status === 'error' ? (
          <div className="local-request-message" role="alert">
            <p>{t('생활서비스를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')}</p>
            <button
              type="button"
              className="text-button"
              onClick={() => setRetry((value) => value + 1)}
            >
              {t('다시 시도하기')}
            </button>
          </div>
        ) : services.length > 0 ? (
          <div className="local-service-grid">
            {services.map((service) => (
              <ServiceCard key={service.id} service={service} area={area} />
            ))}
          </div>
        ) : (
          <div className="local-empty">
            <MapPin size={32} aria-hidden="true" />
            <h3>
              {!hasArea
                ? t('어디에서 생활하고 계세요?')
                : category !== 'all' || scope === 'neighborhood'
                  ? t('이 분야에 등록된 서비스가 아직 없어요')
                  : t('이 지역의 생활서비스를 아직 모으고 있어요')}
            </h3>
            <p>
              {!hasArea
                ? t('시·도와 시·군·구를 입력하면 해당 지역의 안내를 볼 수 있어요.')
                : category !== 'all' || scope === 'neighborhood'
                  ? t('다른 분야를 선택해 동네 서비스를 살펴보세요.')
                  : t('등록된 정보가 없다는 뜻이며, 이용할 수 있는 복지가 없다는 뜻은 아니에요.')}
            </p>
            {(category !== 'all' || scope === 'neighborhood') && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setCategory('all');
                  setScope('all');
                  onSelectionChange?.({ area, category: 'all', scope: 'all' });
                }}
              >
                {t('전체 서비스 보기')} <Icon name="arrow" size={17} />
              </button>
            )}
          </div>
        )}
        <p className="local-coverage">
          <Icon name="info" size={17} />{' '}
          {t(
            '노원구·월계1동을 중심으로 다른 지역의 공식 안내도 함께 수집해요. 운영 일정과 이용 조건은 공식 안내에서 확인해 주세요.',
          )}
        </p>
      </section>

      {search && (
        <aside className="local-policy-entry">
          <div>
            <h2>{t('신청할 수 있는 지원사업도 궁금하세요?')}</h2>
            <p>
              {t('이 지역명이 언급된 공고를 찾아보세요. 공고별 거주 요건은 따로 확인할 수 있어요.')}
            </p>
          </div>
          <button type="button" className="secondary" onClick={() => onSearch(search)}>
            {t('지역 관련 공고 찾기')} <Icon name="arrow" size={18} />
          </button>
        </aside>
      )}
    </div>
  );
}
