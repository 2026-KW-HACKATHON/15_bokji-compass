import { useEffect, useRef, useState } from 'react';
import Icon from '../../shared/ui/Icon.jsx';
import PolicyCard from '../policies/PolicyCard.jsx';
export default function AssistantHome({
  profile,
  result,
  state,
  error,
  onRetry,
  onProfile,
  onExplore,
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
  const items = easy ? result.items.slice(index, index + 1) : result.items;
  return (
    <>
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
          <button className={'button ' + (compact ? 'secondary' : 'primary')} onClick={onProfile}>
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
      <section className="assistant-results" aria-labelledby="recommendations-heading">
        <div className="section-heading">
          <div>
            {!easy && <span className="eyebrow">내 정보에 맞춰</span>}
            <h2 id="recommendations-heading">{profile ? '추천 공고' : '추천에 필요한 정보'}</h2>
          </div>
          {profile && (
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
                    <div className="policy-grid recommendation-grid" ref={cards}>
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
                    {easy && (
                      <nav className="pagination" aria-label="추천 공고 넘기기">
                        <button
                          className="button secondary"
                          disabled={index === 0}
                          onClick={() => turnPage(index - 1)}
                        >
                          이전 추천
                        </button>
                        <span>
                          {result.items.length}개 중 {index + 1}번째
                        </span>
                        <button
                          className="button secondary"
                          disabled={index + 1 >= result.items.length}
                          onClick={() => turnPage(index + 1)}
                        >
                          다음 추천
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
