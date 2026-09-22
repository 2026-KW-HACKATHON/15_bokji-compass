import { useEffect, useState } from 'react';
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
  useEffect(() => setIndex(0), [result]);
  const items = easy ? result.items.slice(index, index + 1) : result.items;
  return (
    <>
      <section className="assistant-hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <Icon name="sparkles" size={18} />
            나만의 복지 비서
          </span>
          <h1>
            {easy ? (
              '나를 위한 복지 비서'
            ) : (
              <>
                찾는 수고는 줄이고,
                <br />
                <em>나에게 맞는 공고를 만나세요.</em>
              </>
            )}
          </h1>
          <p>
            {easy ? (
              '내 정보를 바탕으로 필요한 공고를 추천해 드려요.'
            ) : (
              <>
                내 정보를 알려주면 개인비서가 공고를 살펴보고,
                <br className="desktop-break" />
                나에게 필요한 이유와 함께 추천해 드려요.
              </>
            )}
          </p>
          <button className="button primary" onClick={onProfile}>
            {profile ? '내 정보 수정하기' : '내 정보 알려주기'}
            <Icon name="arrow" />
          </button>
        </div>
        {!easy && (
          <div className="assistant-intro">
            <span className="assistant-avatar">
              <img className="hero-brand-image" src="/brand-logo.png" alt="사람과 하트를 감싸는 복지나침반 로고" />
            </span>
            <p className="assistant-greeting">안녕하세요, 복지 비서예요.</p>
            <p>
              여러 공고 중에서
              <br />
              <strong>나에게 필요한 정보만</strong>
              <br />
              차근차근 살펴볼게요.
            </p>
            <span className="assistant-caption">
              <Icon name="shield" size={15} />
              추천 이유도 함께 확인해요
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
            <b>2</b>개인비서가 공고 검토
          </span>
          <Icon name="right" size={17} />
          <span>
            <b>3</b>추천 이유와 함께 확인
          </span>
        </div>
      )}
      <section className="assistant-results" aria-labelledby="recommendations-heading">
        <div className="section-heading">
          <div>
            <span className="eyebrow">나를 위한 추천</span>
            <h2 id="recommendations-heading">개인비서의 추천 공고</h2>
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
              <h3>어떤 도움이 필요하신가요?</h3>
              <p>
                거주 지역과 관심 분야부터 알려주세요.
                <br />내 정보를 바탕으로 추천을 시작할게요.
              </p>
            </div>
            <button className="button secondary" onClick={onProfile}>
              정보 입력하고 시작하기
              <Icon name="arrow" size={18} />
            </button>
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
                <h3>개인비서가 공고를 살펴보고 있어요</h3>
                <p>조금만 기다려 주세요.</p>
              </div>
            ) : state === 'error' ? (
              <div className="empty-state" role="alert">
                <h3>아직 추천을 가져오지 못했어요</h3>
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
                    <div className="policy-grid recommendation-grid">
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
                          onClick={() => setIndex(index - 1)}
                        >
                          이전 추천
                        </button>
                        <span>
                          {index + 1} / {result.items.length}
                        </span>
                        <button
                          className="button secondary"
                          disabled={index + 1 >= result.items.length}
                          onClick={() => setIndex(index + 1)}
                        >
                          다음 추천
                        </button>
                      </nav>
                    )}
                  </>
                ) : (
                  <div className="empty-state">
                    <h3>지금은 추천할 공고가 없어요</h3>
                    <p>관심 정보를 바꾸거나 전체 공고를 살펴보세요.</p>
                  </div>
                )}
                {mode === 'api' && (
                  <p className="fine-print">
                    추천은 신청 자격 확정이 아니에요. 신청 전 공식 공고를 확인하세요.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </section>
      <div className="explore-invitation">
        <div>
          <h2>직접 찾아보고 싶으신가요?</h2>
          {!easy && <p>전체 공고에서 검색하거나 관심 태그를 눌러보세요.</p>}
        </div>
        <button className="button secondary" onClick={onExplore}>
          전체 공고 보기
          <Icon name="arrow" size={18} />
        </button>
      </div>
    </>
  );
}
