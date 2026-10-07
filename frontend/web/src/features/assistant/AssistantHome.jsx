import { useEffect, useRef, useState } from 'react';
import Icon from '../../shared/ui/Icon.jsx';
import PolicyCard from '../policies/PolicyCard.jsx';
import HomeBanner from './HomeBanner.jsx';
import { recommendationGuidance } from './recommendationModel.js';

export default function AssistantHome({
  profile,
  result,
  state,
  error,
  onRetry,
  onProfile,
  onLogin,
  onExplore,
  onCalendar,
  easy,
  saved,
  onSave,
  onOpen,
  onTag,
  mode,
}) {
  const [index, setIndex] = useState(0);
  const cards = useRef(null);
  const focusNextCard = useRef(false);
  useEffect(() => {
    setIndex(0);
    focusNextCard.current = false;
  }, [result, easy]);
  useEffect(() => {
    if (focusNextCard.current) {
      cards.current?.querySelector('.card-title')?.focus();
      focusNextCard.current = false;
    }
  }, [index]);
  const turnPage = (next) => {
    focusNextCard.current = true;
    setIndex(next);
  };
  const personalized =
    state === 'ready' && result.mode === 'personalized' && result.profileSufficient;
  const items = easy ? result.items.slice(index, index + 3) : result.items;
  const guidance = recommendationGuidance(result);
  const sectionTitle =
    result.mode === 'popular'
      ? '많이 살펴본 일반 공고'
      : result.mode === 'general'
        ? '먼저 살펴볼 일반 공고'
        : result.mode === 'profile_required'
          ? '맞춤 추천을 위한 정보'
          : '추천 공고';
  return (
    <>
      {easy ? (
        <div className="page-heading">
          <h1>{personalized ? '나에게 맞는 복지 공고' : '먼저 살펴볼 복지 공고'}</h1>
          <p>
            {personalized
              ? '추천 공고의 지원 내용과 신청 조건을 확인하세요.'
              : '맞춤 추천을 위해 거주 지역과 연령대 등 내 정보를 알려주세요.'}
          </p>
          <div className="home-primary-action">
            <button className={personalized ? 'text-button' : 'button primary'} onClick={onProfile}>
              {personalized
                ? '추천에 쓰는 내 정보 수정'
                : profile
                  ? '추천 정보 더 입력하기'
                  : '맞춤 공고 찾기'}
              {!personalized && <Icon name="arrow" size={20} />}
            </button>
          </div>
        </div>
      ) : (
        <HomeBanner easy={false} onCalendar={onCalendar}>
          <section className="assistant-hero">
            <div className="hero-copy">
              <span className="eyebrow">
                <Icon name="sparkles" size={18} />
                나만의 AI 복지 비서
              </span>
              <h1>
                {personalized ? '내 정보에 맞는 복지 공고를' : '관심 있는 복지 공고를'}
                <br />
                <em>{personalized ? '추천해 드려요.' : '먼저 살펴보세요.'}</em>
              </h1>
              <p>
                {personalized ? (
                  <>
                    확인된 내 정보로 공고의 조건을 비교했어요.
                    <br className="desktop-break" />
                    추천 이유와 신청 조건을 함께 확인하세요.
                  </>
                ) : (
                  <>
                    맞춤 추천을 위해 거주 지역과 연령대 등
                    <br className="desktop-break" />내 정보를 알려주세요.
                  </>
                )}
              </p>
              <button className="button primary" onClick={onProfile}>
                {personalized
                  ? '내 정보 수정하기'
                  : profile
                    ? '추천 정보 더 입력하기'
                    : '내 정보 입력하기'}
                <Icon name="arrow" />
              </button>
            </div>
            <div className="assistant-intro">
              <span className="assistant-avatar">
                <img
                  className="hero-brand-image"
                  src="/brand-logo.png"
                  alt="사람과 하트를 감싸는 복지나침반 로고"
                />
              </span>
              <p className="assistant-greeting">나만의 AI 복지 비서</p>
              <p>
                {personalized ? '입력한 정보를 바탕으로' : '내 정보를 알려주시면'}
                <br />
                <strong>
                  {personalized ? '공고를 추천해 드려요.' : '맞춤 공고를 찾아드려요.'}
                </strong>
              </p>
              <span className="assistant-caption">
                <Icon name="shield" size={15} />
                신청 조건도 함께 확인하세요
              </span>
            </div>
          </section>
        </HomeBanner>
      )}
      {!easy && (
        <div className="journey-strip">
          <span>
            <b>1</b>내 정보 입력
          </span>
          <Icon name="right" size={17} />
          <span>
            <b>2</b>공고의 조건 비교
          </span>
          <Icon name="right" size={17} />
          <span>
            <b>3</b>추천 이유와 신청 조건 확인
          </span>
        </div>
      )}
      <section className="assistant-results" aria-label="추천 공고">
        <div className="section-heading">
          <div>
            {!easy && (
              <span className="eyebrow">
                {personalized ? '확인된 내 정보에 맞춰' : '정보가 적어도 살펴볼 수 있어요'}
              </span>
            )}
            <h2 id="recommendations-heading">{sectionTitle}</h2>
          </div>
          {state === 'ready' && (
            <button className="text-button" onClick={onRetry}>
              다시 추천받기
            </button>
          )}
        </div>
        {profile && (
          <div className="profile-summary">
            <Icon name="user" size={18} />
            <span>
              {[
                profile.region,
                profile.ageBand === '선택하지 않음' ? null : profile.ageBand,
                ...profile.interests,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        )}
        {state === 'loading' ? (
          <div className="empty-state" role="status">
            <Icon name="sparkles" size={30} />
            <h3>추천 공고를 불러오고 있어요</h3>
            <p>조금만 기다려 주세요.</p>
          </div>
        ) : state === 'error' ? (
          <div className="empty-state" role="alert">
            <Icon name="info" size={30} />
            <h3>{error.title}</h3>
            <p>{error.message}</p>
            <button
              className="button primary"
              onClick={
                error.action === 'login'
                  ? onLogin
                  : error.action === 'profile'
                    ? onProfile
                    : onRetry
              }
            >
              {error.action === 'login'
                ? '로그인하기'
                : error.action === 'profile'
                  ? '내 정보 수정하기'
                  : '다시 시도하기'}
            </button>
          </div>
        ) : state === 'ready' ? (
          <>
            {items.length ? (
              <>
                <p className="recommendation-summary" role="status">
                  {result.summary}
                </p>
                <div
                  className={'policy-grid recommendation-grid' + (easy ? ' easy-policy-list' : '')}
                  ref={cards}
                >
                  {items.map((item) => (
                    <PolicyCard
                      key={item.policy.id}
                      policy={item.policy}
                      reason={item.reason}
                      saved={saved.some((value) => value.id === item.policy.id)}
                      onSave={onSave}
                      onOpen={onOpen}
                      onTag={onTag}
                      easy={easy}
                    />
                  ))}
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
                      {index + 1}–{Math.min(index + 3, result.items.length)} / {result.items.length}
                      개
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
              </>
            ) : (
              <div className="empty-state recommendation-empty" role="status">
                <Icon name={result.mode === 'profile_required' ? 'user' : 'search'} size={30} />
                <h3>
                  {result.mode === 'profile_required'
                    ? '맞춤 추천에 필요한 정보를 알려주세요'
                    : personalized
                      ? '현재 내 정보에 맞는 추천 공고가 없어요'
                      : '현재 안내할 일반 공고가 없어요'}
                </h3>
                <p>
                  {result.mode === 'profile_required'
                    ? '현재 정보로 추천할 공고를 찾지 못했어요. 내 정보를 추가하면 신청 조건을 더 정확히 비교할 수 있어요.'
                    : '새 공고가 등록되면 다시 확인해 주세요. 전체 공고에서 다른 지원도 찾아볼 수 있어요.'}
                </p>
                <div className="recommendation-empty-actions">
                  <button
                    className="button secondary"
                    disabled
                    aria-describedby="recommendation-email-status"
                  >
                    새 공고 메일로 받기 · 준비 중
                  </button>
                  <button className="button primary" onClick={onExplore}>
                    전체 공고 보기
                  </button>
                </div>
                <p id="recommendation-email-status" className="fine-print">
                  메일 알림은 준비 중이에요. 아직 알림 신청은 할 수 없어요.
                </p>
              </div>
            )}
            {guidance && (
              <div className="recommendation-guidance">
                <p>
                  <Icon name="info" size={18} /> <span>{guidance}</span>
                </p>
                {!personalized && (
                  <button className="text-button" onClick={onProfile}>
                    내 정보 추가하고 맞춤 추천받기 <Icon name="arrow" size={17} />
                  </button>
                )}
              </div>
            )}
            {mode === 'api' && items.length > 0 && (
              <p className="fine-print">
                추천받은 공고라도 신청 조건을 충족하지 않을 수 있어요. 신청 전에 공식 공고를
                확인하세요.
              </p>
            )}
          </>
        ) : null}
      </section>
      <div className="explore-invitation">
        <div>
          {!easy && <h2>다른 공고도 찾아보세요</h2>}
          {!easy && <p>분야와 지역을 선택하거나 검색어를 입력해 보세요.</p>}
        </div>
        <button className="button secondary" onClick={onExplore}>
          전체 공고 보기
          <Icon name="arrow" size={18} />
        </button>
      </div>
    </>
  );
}
