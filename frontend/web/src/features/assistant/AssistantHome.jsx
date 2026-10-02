import { useEffect, useRef, useState } from 'react';
import Icon from '../../shared/ui/Icon.jsx';
import PolicyCard from '../policies/PolicyCard.jsx';
import HomeBanner from './HomeBanner.jsx';
export default function AssistantHome({
  profile,
  result,
  state,
  error,
  onRetry,
  onProfile,
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
  const compact = easy && Boolean(profile);
  const items = easy ? result.items.slice(index, index + 3) : result.items;
  return (
    <>
      <HomeBanner easy={easy} onCalendar={onCalendar}>
        {easy ? (
          <section className={'comfortable-home' + (profile ? ' has-profile' : '')}>
            <div className="comfortable-home-copy">
              <span className="home-kicker">나를 위한 복지나침반</span>
              <h1>{profile ? '나에게 맞는 복지 공고' : '내 상황에 맞는 복지를 찾아보세요'}</h1>
              <p>
                {profile
                  ? '입력한 정보를 바탕으로 추천한 공고입니다. 지원 내용과 신청 조건을 함께 비교해 보세요.'
                  : '거주 지역과 관심 분야를 선택하면 관련 공고와 추천 이유를 한곳에서 확인할 수 있습니다.'}
              </p>
              <div className="home-primary-action">
                <button className={profile ? 'text-button' : 'button primary'} onClick={onProfile}>
                  {profile ? '추천에 쓰는 내 정보 수정' : '맞춤 공고 찾기'}
                  {!profile && <Icon name="arrow" size={20} />}
                </button>
                {!profile && <span>회원가입 없이 이용할 수 있습니다.</span>}
              </div>
            </div>
            {!profile && <img className="comfortable-home-logo" src="/brand-logo.png" alt="" />}
          </section>
        ) : (
          <section className={'assistant-hero' + (compact ? ' assistant-hero-compact' : '')}>
            <div className="hero-copy">
              {!easy && (
                <span className="eyebrow">
                  <Icon name="sparkles" size={18} />
                  나만의 AI 복지 비서
                </span>
              )}
              <h1>
                {easy ? (
                  compact ? (
                    '나의 복지 비서'
                  ) : (
                    '나에게 맞는 공고 찾기'
                  )
                ) : (
                  <>
                    내게 맞는 복지 공고를
                    <br />
                    <em>AI 비서에게 추천받으세요.</em>
                  </>
                )}
              </h1>
              {!compact && (
                <p>
                  {easy ? (
                    '사는 지역과 관심 분야를 알려주세요.'
                  ) : (
                    <>
                      거주 지역과 관심 분야를 입력하면 <br className="desktop-break" />
                      공고와 추천 이유를 알려드려요.
                    </>
                  )}
                </p>
              )}
              <button
                className={'button ' + (compact ? 'secondary' : 'primary')}
                onClick={onProfile}
              >
                {profile ? '내 정보 수정하기' : '내 정보 입력하기'}
                <Icon name="arrow" />
              </button>
            </div>
            {!easy && (
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
                  입력한 정보를 바탕으로
                  <br />
                  <strong>공고를 추천해 드려요.</strong>
                </p>
                <span className="assistant-caption">
                  <Icon name="shield" size={15} />
                  신청 조건도 함께 확인하세요
                </span>
              </div>
            )}
          </section>
        )}
      </HomeBanner>
      {!easy && (
        <div className="journey-strip">
          <span>
            <b>1</b>내 정보 입력
          </span>
          <Icon name="right" size={17} />
          <span>
            <b>2</b>AI 비서의 공고 추천
          </span>
          <Icon name="right" size={17} />
          <span>
            <b>3</b>추천 이유와 신청 조건 확인
          </span>
        </div>
      )}
      {(!easy || profile) && (
        <section className="assistant-results" aria-labelledby="recommendations-heading">
          <div className="section-heading">
            <div>
              {!easy && <span className="eyebrow">내 정보에 맞춰</span>}
              <h2 id="recommendations-heading">{profile ? '추천 공고' : '추천에 필요한 정보'}</h2>
            </div>
            {profile && state === 'ready' && (
              <button className="text-button" disabled={state === 'loading'} onClick={onRetry}>
                다시 추천받기
              </button>
            )}
          </div>
          {!profile ? (
            <div className="assistant-welcome">
              <span className="round-icon">
                <Icon name="user" size={29} />
              </span>
              <div>
                <h3>거주 지역과 관심 분야</h3>
                <p>
                  {easy
                    ? '선택 항목은 건너뛰어도 돼요.'
                    : '내 정보를 입력하면 이곳에서 추천 공고를 확인할 수 있어요.'}
                </p>
              </div>
            </div>
          ) : (
            <>
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
              {state === 'loading' ? (
                <div className="empty-state" role="status">
                  <Icon name="sparkles" size={30} />
                  <h3>추천 공고를 불러오고 있어요</h3>
                  <p>조금만 기다려 주세요.</p>
                </div>
              ) : state === 'error' ? (
                <div className="empty-state" role="alert">
                  <h3>추천 공고를 불러오지 못했어요</h3>
                  <p>{error}</p>
                  <button className="button primary" onClick={onRetry}>
                    다시 시도하기
                  </button>
                </div>
              ) : (
                <>
                  <p className="recommendation-summary" role="status">
                    {result.summary}
                  </p>
                  {items.length ? (
                    <>
                      <div
                        className={
                          'policy-grid recommendation-grid' + (easy ? ' easy-policy-list' : '')
                        }
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
                            {index + 1}–{Math.min(index + 3, result.items.length)} /{' '}
                            {result.items.length}개
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
                    <div className="empty-state">
                      <h3>지금은 추천할 공고가 없어요</h3>
                      <p>관심 분야를 바꾸거나 전체 공고를 확인해 보세요.</p>
                    </div>
                  )}
                  {mode === 'api' && (
                    <p className="fine-print">
                      추천받은 공고라도 신청 조건을 충족하지 않을 수 있어요. 신청 전에 공식 공고를
                      확인하세요.
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </section>
      )}
      {easy && !profile && (
        <section className="comfortable-guide" aria-labelledby="home-guide-title">
          <h2 id="home-guide-title">필요한 정보는 분명하게</h2>
          <dl>
            <div>
              <dt>나에게 맞는 공고</dt>
              <dd>지역과 관심 분야를 기준으로 살펴봅니다. 선택 정보는 나중에 바꿀 수 있습니다.</dd>
            </div>
            <div>
              <dt>지원 내용과 신청 조건</dt>
              <dd>받을 수 있는 지원, 대상, 신청 기간을 비교하고 공식 공고에서 확인합니다.</dd>
            </div>
          </dl>
          <a className="comfortable-browse" href="#explore">
            정보 입력 없이 전체 공고 보기 <Icon name="arrow" size={18} />
          </a>
        </section>
      )}
      {(!easy || profile) && (
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
      )}
    </>
  );
}
