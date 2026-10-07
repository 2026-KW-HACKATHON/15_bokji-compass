import { useEffect, useRef, useState } from 'react';
import Icon from '../../shared/ui/Icon.jsx';
import PolicyCard from '../policies/PolicyCard.jsx';
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
  onGuide,
  onCalendar,
  easy,
  saved,
  onSave,
  onOpen,
  onTag,
  monitoringPanel,
}) {
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
        <span className="home-eyebrow">나를 위한 복지 길잡이</span>
        <h1 id="home-title">어떤 도움이 필요하세요?</h1>
        <p>지역과 관심 분야로 필요한 복지 공고를 찾아보세요.</p>
        <form
          className="home-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch({ query, region });
          }}
        >
          <label className="home-region">
            <span className="sr-only">공고를 찾을 지역</span>
            <select value={region} onChange={(event) => setRegion(event.target.value)}>
              {regions.map((value) => (
                <option key={value} value={value}>
                  {value === '전국' ? '전체 지역' : value}
                </option>
              ))}
            </select>
          </label>
          <label className="home-search-input">
            <Icon name="search" size={22} />
            <span className="sr-only">찾고 싶은 복지</span>
            <input
              type="search"
              maxLength={200}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                easy ? '예: 주거, 취업, 돌봄' : '찾고 싶은 복지나 지원 내용을 입력하세요'
              }
            />
          </label>
          <button className="home-search-submit" type="submit" aria-label="복지 공고 검색">
            <Icon name="search" size={27} />
            <span>검색</span>
          </button>
        </form>
        <div className="home-topics" aria-label="관심 분야로 공고 찾기">
          {topics.map((category) => (
            <button key={category} onClick={() => onSearch({ category, region })}>
              {category}
            </button>
          ))}
        </div>
        <button className="home-personal-link" onClick={onProfile}>
          {personalized ? '맞춤 추천에 사용하는 내 정보 수정' : '내 정보로 맞춤 공고 찾기'}{' '}
          <Icon name="arrow" size={18} />
        </button>
      </section>

      <section className="home-results" aria-label="추천 공고">
        <div className="section-heading">
          <div>
            <h2 id="recommendations-heading">
              {items.length
                ? personalized
                  ? '내 정보에 맞춘 추천 공고'
                  : '먼저 살펴볼 복지 공고'
                : '필요한 지원을 찾아보세요'}
            </h2>
            {items.length > 0 && (
              <p className="home-section-description">지원 내용과 신청 조건을 함께 확인하세요.</p>
            )}
          </div>
          {items.length > 0 ? (
            <button className="text-button" onClick={onRetry}>
              다시 추천받기 <Icon name="arrow" size={16} />
            </button>
          ) : (
            <span className="home-section-description">
              관심 있는 분야부터 가볍게 시작해 보세요.
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
              .join(' · ')}
          </div>
        )}
        {state === 'loading' && (
          <p className="home-feedback" role="status">
            공고를 불러오고 있어요. 잠시만 기다려 주세요.
          </p>
        )}
        {state === 'error' && (
          <div className="home-feedback is-error" role="alert">
            <Icon name="info" />
            <div>
              <strong>{error.title}</strong>
              <p>{error.message}</p>
            </div>
            <button className="text-button" onClick={retryAction}>
              {error.action === 'login'
                ? '로그인하기'
                : error.action === 'profile'
                  ? '내 정보 수정하기'
                  : '다시 시도하기'}
            </button>
          </div>
        )}
        {state === 'ready' && items.length > 0 && (
          <>
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
                  <article className="home-policy-row" key={policy.id}>
                    <span className="home-row-icon">
                      <Icon name={policy.icon} size={24} />
                    </span>
                    <div className="home-row-heading">
                      <span>
                        {policy.category} · {policy.region}
                      </span>
                      <h3>
                        <button className="card-title" onClick={() => onOpen(policy)}>
                          {policy.title}
                        </button>
                      </h3>
                    </div>
                    <div className="home-row-description">
                      {reason && <span className="home-reason-label">추천 이유</span>}
                      <p>{reason || policy.summary}</p>
                      {policy.applicationPeriod && (
                        <small>신청 기간 · {policy.applicationPeriod}</small>
                      )}
                      <PolicyIndicators policy={policy} />
                    </div>
                    <button
                      className="home-detail-link"
                      onClick={() => onOpen(policy)}
                      aria-label={policy.title + ' 자세히 보기'}
                    >
                      자세히 보기 <Icon name="arrow" size={18} />
                    </button>
                    <button
                      className="home-save"
                      aria-label={
                        policy.title +
                        (saved.some((value) => value.id === policy.id) ? ' 저장 취소' : ' 저장')
                      }
                      aria-pressed={saved.some((value) => value.id === policy.id)}
                      onClick={() => onSave(policy)}
                    >
                      <Icon
                        name="bookmark"
                        size={22}
                        fill={
                          saved.some((value) => value.id === policy.id) ? 'currentColor' : 'none'
                        }
                      />
                    </button>
                  </article>
                ),
              )}
            </div>
            {easy && result.items.length > 3 && (
              <nav className="pagination" aria-label="추천 공고 넘기기">
                <button
                  className="button secondary"
                  disabled={index === 0}
                  onClick={() => turnPage(Math.max(0, index - 3))}
                >
                  이전 목록
                </button>
                <span>
                  {index + 1}–{Math.min(index + 3, result.items.length)} / {result.items.length}개
                </span>
                <button
                  className="button secondary"
                  disabled={index + 3 >= result.items.length}
                  onClick={() => turnPage(index + 3)}
                >
                  다음 목록
                </button>
              </nav>
            )}
            {guidance && (
              <p className="home-criteria-note">
                <Icon name="info" size={17} />
                {guidance}
              </p>
            )}
          </>
        )}
        {!items.length && (
          <div className="home-discovery-list">
            {discovery.map((item) => (
              <button
                key={item.category}
                className="home-discovery-row"
                onClick={() => onSearch({ category: item.category, region })}
              >
                <span className="home-row-icon">
                  <Icon name={item.icon} size={24} />
                </span>
                <span className="home-row-heading">
                  <span>{item.category}</span>
                  <strong>{item.title}</strong>
                </span>
                <span className="home-discovery-description">{item.description}</span>
                <span className="home-row-action">
                  공고 보기 <Icon name="arrow" size={18} />
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
                ? '맞춤 추천을 받으려면 거주 지역과 연령대 등 내 정보를 입력해 주세요.'
                : '현재 추천 공고가 없어요. 전체 공고에서 다른 지원도 살펴보세요.'}
              {result.guidance && <> {result.guidance}</>}
            </span>
          </p>
        )}
      </section>

      <div className="home-shortcuts">
        <button onClick={onCalendar}>
          <span className="home-row-icon">
            <Icon name="calendar" size={27} />
          </span>
          <span>
            <small>신청 일정을 확인하고 싶다면</small>
            <strong>
              공고 캘린더 <Icon name="arrow" size={19} />
            </strong>
          </span>
        </button>
        <button onClick={onProfile}>
          <span className="home-row-icon">
            <Icon name="user" size={27} />
          </span>
          <span>
            <small>나에게 맞는 공고가 궁금하다면</small>
            <strong>
              맞춤 공고 찾기 <Icon name="arrow" size={19} />
            </strong>
          </span>
        </button>
      </div>
      <div className="home-guide-link">
        <span>복지나침반이 처음이신가요?</span>
        <button onClick={onGuide}>
          이용 방법 알아보기 <Icon name="arrow" size={17} />
        </button>
      </div>
      {monitoringPanel}
      <div className="home-all-link">
        <button className="text-button" onClick={onExplore}>
          전체 공고 보기 <Icon name="arrow" size={17} />
        </button>
      </div>
    </div>
  );
}
