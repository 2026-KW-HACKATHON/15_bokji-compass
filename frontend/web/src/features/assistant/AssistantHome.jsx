import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import ContentLanguageNotice from '../../shared/i18n/ContentLanguageNotice.jsx';
import {
  PolicyTranslationStatus,
  useTranslatedPolicy,
} from '../../shared/i18n/PolicyTranslation.jsx';
import { useEffect, useRef, useState } from 'react';
import Icon from '../../shared/ui/Icon.jsx';
import PolicyCard from '../policies/PolicyCard.jsx';
import PolicyDeadline from '../policies/PolicyDeadline.jsx';
import PolicyIndicators from '../policies/PolicyIndicators.jsx';
import { regions } from '../policies/policyModel.js';
import { recommendationGuidance } from './recommendationModel.js';

const topics = ['주거', '일자리', '생활·금융', '교육', '건강·돌봄'];
const discovery = [
  {
    category: '주거',
    icon: 'house',
    title: '더 편안한 보금자리를 위해',
    description: '주거비부터 주택 지원까지, 주거 관련 공고를 살펴보세요.',
  },
  {
    category: '일자리',
    icon: 'briefcase',
    title: '새로운 시작을 준비한다면',
    description: '취업과 직업 교육 등 내일을 위한 지원을 찾아보세요.',
  },
  {
    category: '생활·금융',
    icon: 'wallet',
    title: '일상에 필요한 도움을 가까이',
    description: '생활비와 금융 지원 등 다양한 생활 공고를 확인하세요.',
  },
];

function RecommendedPolicyRow({ policy: original, reason, saved, onOpen, onSave }) {
  const { t } = useI18n();
  const translation = useTranslatedPolicy(original);
  const { policy } = translation;
  return (
    <article className="home-policy-row">
      <span className="home-row-icon">
        <Icon name={original.icon} size={24} />
      </span>
      <div className="home-row-heading">
        <span>
          {t(original.category)} · {t(original.region)}
        </span>
        <h3>
          <button className="card-title" onClick={() => onOpen(original)}>
            {policy.title}
          </button>
        </h3>
        <PolicyDeadline policy={original} />
      </div>
      <div className="home-row-description">
        <PolicyTranslationStatus translation={translation} />
        {reason && <span className="home-reason-label">{t('추천 이유')}</span>}
        <p>{reason || policy.summary}</p>
        {policy.applicationPeriod && (
          <small>
            {t('신청 기간 ·')} {policy.applicationPeriod}
          </small>
        )}
        <PolicyIndicators policy={policy} />
      </div>
      <button
        className="home-detail-link"
        onClick={() => onOpen(original)}
        aria-label={policy.title + t(' 자세히 보기')}
      >
        {t('자세히 보기')} <Icon name="arrow" size={18} />
      </button>
      <button
        className="home-save"
        aria-label={policy.title + t(saved ? ' 저장 취소' : ' 저장')}
        aria-pressed={saved}
        onClick={() => onSave(original)}
      >
        <Icon name="bookmark" size={22} fill={saved ? 'currentColor' : 'none'} />
      </button>
    </article>
  );
}

export default function AssistantHome({
  profile,
  result,
  state,
  error,
  onRetry,
  onProfile,
  onLogin,
  onExplore,
  onSearch,
  onLocal,
  onGuide,
  onCalendar,
  onAssistant,
  easy,
  saved,
  onSave,
  onOpen,
  onTag,
}) {
  const { t, intlLocale } = useI18n();

  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('전국');
  const [index, setIndex] = useState(0);
  const cards = useRef(null);
  const focusNext = useRef(false);
  useEffect(() => {
    setIndex(0);
    focusNext.current = false;
  }, [result, easy]);
  useEffect(() => {
    if (focusNext.current) {
      cards.current?.querySelector('.card-title')?.focus();
      focusNext.current = false;
    }
  }, [index]);
  const personalized =
    state === 'ready' && result.mode === 'personalized' && result.profileSufficient;
  const items = easy ? result.items.slice(index, index + 3) : result.items;
  const guidance = recommendationGuidance(result);
  const turnPage = (next) => {
    focusNext.current = true;
    setIndex(next);
  };
  const retryAction =
    error?.action === 'login' ? onLogin : error?.action === 'profile' ? onProfile : onRetry;

  return (
    <div className="search-home">
      <section className="search-hero" aria-labelledby="home-title">
        <span className="home-eyebrow">{t('나를 위한 복지 길잡이')}</span>
        <h1 id="home-title">{t('어떤 도움이 필요하세요?')}</h1>
        <p>{t('지역과 관심 분야로 필요한 복지 공고를 찾아보세요.')}</p>
        <form
          className="home-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch({ query, region });
          }}
        >
          <label className="home-region">
            <span className={easy ? 'easy-search-label' : 'sr-only'}>{t('공고를 찾을 지역')}</span>
            <select value={region} onChange={(event) => setRegion(event.target.value)}>
              {regions.map((value) => (
                <option key={value} value={value}>
                  {value === '전국' ? t('전체 지역') : t(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="home-search-input">
            <Icon name="search" size={22} />
            <span className={easy ? 'easy-search-label' : 'sr-only'}>{t('찾고 싶은 복지')}</span>
            <input
              type="search"
              maxLength={200}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                easy ? t('예: 주거, 취업, 돌봄') : t('찾고 싶은 복지나 지원 내용을 입력하세요')
              }
            />
          </label>
          <button className="home-search-submit" type="submit" aria-label={t('복지 공고 검색')}>
            <Icon name="search" size={27} />
            <span>{t('검색')}</span>
          </button>
        </form>
        {easy && <p className="easy-topics-label">{t('관심 분야로 공고 찾기')}</p>}
        <div className="home-topics" aria-label={t('관심 분야로 공고 찾기')}>
          {topics.map((category) => (
            <button key={t(category)} onClick={() => onSearch({ category, region })}>
              {t(category)}
            </button>
          ))}
        </div>
        <button className="home-personal-link" onClick={onProfile}>
          {personalized ? t('맞춤 추천에 사용하는 내 정보 수정') : t('내 정보로 맞춤 공고 찾기')}{' '}
          <Icon name="arrow" size={18} />
        </button>
      </section>

      <section className="home-local-entry" aria-labelledby="home-local-title">
        <span className="home-row-icon">
          <Icon name="pin" size={24} />
        </span>
        <div>
          <h2 id="home-local-title">{t('동네에서 이용할 수 있는 도움을 찾아보세요.')}</h2>
          <p>{t('무료버스·건강관리·동네 시설을 생활지역별로 살펴보세요.')}</p>
        </div>
        <button className="text-button" onClick={onLocal}>
          {t('동네 복지 둘러보기')} <Icon name="arrow" size={18} />
        </button>
      </section>

      <section className="home-results" aria-label={t('추천 공고')}>
        <div className="section-heading">
          <div>
            <h2 id="recommendations-heading">
              {items.length
                ? personalized
                  ? t('내 정보에 맞춘 추천 공고')
                  : t('먼저 살펴볼 복지 공고')
                : t('필요한 지원을 찾아보세요')}
            </h2>
            {items.length > 0 && (
              <p className="home-section-description">
                {t('지원 내용과 신청 조건을 함께 확인하세요.')}
              </p>
            )}
          </div>
          {items.length > 0 ? (
            <button className="text-button" onClick={onRetry}>
              {' '}
              {t('다시 추천받기')} <Icon name="arrow" size={16} />
            </button>
          ) : (
            <span className="home-section-description">
              {' '}
              {t('관심 있는 분야부터 가볍게 시작해 보세요.')}{' '}
            </span>
          )}
        </div>
        {profile && personalized && (
          <div className="home-profile-summary">
            <Icon name="user" size={17} />
            {[
              profile.region,
              profile.ageBand === '선택하지 않음' ? null : profile.ageBand,
              ...profile.interests,
            ]
              .filter(Boolean)
              .map((value) => t(value))
              .join(' · ')}
          </div>
        )}
        {state === 'loading' && (
          <p className="home-feedback" role="status">
            {' '}
            {t('공고를 불러오고 있어요. 잠시만 기다려 주세요.')}{' '}
          </p>
        )}
        {state === 'error' && (
          <div className="home-feedback is-error" role="alert">
            <Icon name="info" />
            <div>
              <strong>{t(error.title)}</strong>
              <p>{t(error.message)}</p>
            </div>
            <button className="text-button" onClick={retryAction}>
              {error.action === 'login'
                ? t('로그인하기')
                : error.action === 'profile'
                  ? t('내 정보 수정하기')
                  : t('다시 시도하기')}
            </button>
          </div>
        )}
        {state === 'ready' && items.length > 0 && (
          <>
            <ContentLanguageNotice />
            {result.summary && (
              <p className="home-result-summary" role="status">
                {result.summary}
              </p>
            )}
            <div className={easy ? 'easy-policy-list' : 'home-policy-list'} ref={cards}>
              {items.map(({ policy, reason }) =>
                easy ? (
                  <PolicyCard
                    key={policy.id}
                    policy={policy}
                    reason={reason}
                    saved={saved.some((value) => value.id === policy.id)}
                    onSave={onSave}
                    onOpen={onOpen}
                    onTag={onTag}
                    easy
                  />
                ) : (
                  <RecommendedPolicyRow
                    key={policy.id}
                    policy={policy}
                    reason={reason}
                    saved={saved.some((value) => value.id === policy.id)}
                    onSave={onSave}
                    onOpen={onOpen}
                  />
                ),
              )}
            </div>
            {easy && result.items.length > 3 && (
              <nav className="pagination" aria-label={t('추천 공고 넘기기')}>
                <button
                  className="button secondary"
                  disabled={index === 0}
                  onClick={() => turnPage(Math.max(0, index - 3))}
                >
                  {' '}
                  {t('이전 목록')}{' '}
                </button>
                <span>
                  {index + 1}–{Math.min(index + 3, result.items.length)} / {result.items.length}
                  {t('개')}{' '}
                </span>
                <button
                  className="button secondary"
                  disabled={index + 3 >= result.items.length}
                  onClick={() => turnPage(index + 3)}
                >
                  {' '}
                  {t('다음 목록')}{' '}
                </button>
              </nav>
            )}
            {guidance && (
              <p className="home-criteria-note">
                <Icon name="info" size={17} />
                {t(guidance)}
              </p>
            )}
          </>
        )}
        {!items.length && (
          <div className="home-discovery-list">
            {discovery.map((item) => (
              <button
                key={t(item.category)}
                className="home-discovery-row"
                onClick={() => onSearch({ category: item.category, region })}
              >
                <span className="home-row-icon">
                  <Icon name={item.icon} size={24} />
                </span>
                <span className="home-row-heading">
                  <span>{t(item.category)}</span>
                  <strong>{t(item.title)}</strong>
                </span>
                <span className="home-discovery-description">{t(item.description)}</span>
                <span className="home-row-action">
                  {' '}
                  {t('공고 보기')} <Icon name="arrow" size={18} />
                </span>
              </button>
            ))}
          </div>
        )}
        {state === 'ready' && !items.length && (
          <p className="home-criteria-note">
            <Icon name="info" size={17} />
            <span>
              {result.mode === 'profile_required'
                ? t('맞춤 추천을 받으려면 거주 지역과 연령대 등 내 정보를 입력해 주세요.')
                : t('현재 추천 공고가 없어요. 전체 공고에서 다른 지원도 살펴보세요.')}
              {result.guidance && <> {result.guidance}</>}
            </span>
          </p>
        )}
      </section>

      <div className="home-shortcuts">
        <button onClick={onCalendar}>
          <span className="home-row-icon">
            <Icon name="calendar" size={24} />
          </span>
          <span>
            <small>{t('신청 일정을 확인하고 싶다면')}</small>
            <strong>
              {' '}
              {t('공고 캘린더')} <Icon name="arrow" size={19} />
            </strong>
          </span>
        </button>
        <button onClick={onProfile}>
          <span className="home-row-icon">
            <Icon name="user" size={24} />
          </span>
          <span>
            <small>{t('나에게 맞는 공고가 궁금하다면')}</small>
            <strong>
              {' '}
              {t('맞춤 공고 찾기')} <Icon name="arrow" size={19} />
            </strong>
          </span>
        </button>
      </div>
      <div className="home-guide-link">
        <span>{t('복지나침반이 처음이신가요?')}</span>
        <button onClick={onGuide}>
          {' '}
          {t('이용 방법 알아보기')} <Icon name="arrow" size={17} />
        </button>
      </div>
      <section className="home-assistant-entry" aria-label={t('AI 복지비서 안내')}>
        <span className="home-row-icon">
          <Icon name="compass" size={24} />
        </span>
        <div>
          <h2>{t('내 상황에 맞는 지원을 계속 살펴보세요')}</h2>
          <p>{t('AI 복지비서에서 새 안내와 신청 준비 상황을 한곳에서 확인하세요.')}</p>
        </div>
        <button className="button primary" onClick={onAssistant}>
          {t('AI 복지비서 열기')} <Icon name="arrow" size={18} />
        </button>
      </section>
      <div className="home-all-link">
        <button className="text-button" onClick={onExplore}>
          {' '}
          {t('전체 공고 보기')} <Icon name="arrow" size={17} />
        </button>
      </div>
    </div>
  );
}
