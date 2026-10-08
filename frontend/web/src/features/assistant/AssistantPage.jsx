import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import Icon from '../../shared/ui/Icon.jsx';
import MonitoringPanel from '../monitoring/MonitoringPanel.jsx';
import { hasSeenAssistantIntro, markAssistantIntroSeen } from './assistantIntroModel.js';
import './assistant-page.css';

const introFeatures = [
  ['search', '맞춤 지원 탐색', '거주 지역과 생활정보를 바탕으로 관련 지원 공고를 확인합니다.'],
  [
    'help',
    '부족한 정보 확인',
    '확인되지 않은 조건은 질문으로 보완하고, 신청 전 준비 사항을 안내합니다.',
  ],
  [
    'bookmark',
    '새 공고와 진행 관리',
    '지속 안내를 켜면 새 공고를 모아보고, 신청 진행 상태를 직접 관리할 수 있습니다.',
  ],
];

export default function AssistantPage({
  user,
  profile,
  mode,
  onOpen,
  onProfile,
  onStartConversation,
  onProfileDeleted,
  onProfileChanged,
  conversation,
  refreshKey = 0,
  initialView = 'auto',
  initialProfileEntry = false,
  onContinue,
}) {
  const { t } = useI18n();
  const owner = user?.id || null;
  const [showIntro, setShowIntro] = useState(() => {
    if (initialView === 'introduction') return true;
    if (initialView === 'overview') return false;
    if (conversation) return false;
    try {
      return !hasSeenAssistantIntro(window.localStorage, owner);
    } catch {
      return true;
    }
  });
  const [profileEntryRequest, setProfileEntryRequest] = useState(initialProfileEntry ? 1 : 0);
  const workspaceHeading = useRef(null);
  const introHeading = useRef(null);
  const hasConversation = !!conversation;

  function markSeen() {
    try {
      markAssistantIntroSeen(window.localStorage, owner);
    } catch {
      /* Optional UI preference. */
    }
  }
  useEffect(() => {
    if (hasConversation) {
      setShowIntro(false);
      try {
        markAssistantIntroSeen(window.localStorage, owner);
      } catch {
        /* Optional UI preference. */
      }
    }
  }, [hasConversation, owner]);

  function startAssistant() {
    markSeen();
    if (onContinue) {
      onContinue();
      return;
    }
    setShowIntro(false);
    setProfileEntryRequest((value) => value + 1);
    window.requestAnimationFrame(() => {
      workspaceHeading.current?.focus({ preventScroll: true });
      workspaceHeading.current?.scrollIntoView({ block: 'start' });
    });
  }
  function openIntroduction() {
    setShowIntro(true);
    window.requestAnimationFrame(() => {
      introHeading.current?.focus({ preventScroll: true });
      introHeading.current?.scrollIntoView({ block: 'start' });
    });
  }

  return (
    <div className="assistant-page">
      {showIntro && (
        <div className="assistant-introduction">
          <section className="assistant-intro-hero" aria-labelledby="assistant-intro-title">
            <span className="eyebrow">
              <Icon name="sparkles" size={18} /> {t('AI 복지비서')}
            </span>
            <h1 id="assistant-intro-title" ref={introHeading} tabIndex={-1}>
              <span>{t('나에게 맞는 복지,')}</span>
              <span>{t('한곳에서 관리하세요.')}</span>
            </h1>
            <p>{t('내 정보에 맞는 지원을 찾고, 신청 준비와 새로운 기회까지 이어드립니다.')}</p>
            {user ? (
              <button className="button primary" onClick={startAssistant}>
                {t('AI 복지비서 시작하기')} <Icon name="arrow" size={18} />
              </button>
            ) : (
              <a className="button primary" href="#login?return=assistant" onClick={markSeen}>
                {t('로그인하고 시작하기')} <Icon name="arrow" size={18} />
              </a>
            )}
            <p className="assistant-intro-caption">
              {t('필요한 정보만 선택 입력하고, 동의한 정보만 저장합니다.')}
            </p>
          </section>
          <section className="assistant-intro-features" aria-label={t('AI 복지비서 주요 기능')}>
            {introFeatures.map(([icon, title, description], index) => (
              <article key={title}>
                <span className="assistant-intro-feature-icon">
                  <Icon name={icon} size={26} />
                </span>
                <p className="assistant-intro-step">{String(index + 1).padStart(2, '0')}</p>
                <h2>{t(title)}</h2>
                <p>{t(description)}</p>
              </article>
            ))}
          </section>
          <section className="assistant-intro-start" aria-labelledby="assistant-intro-start-title">
            <div>
              <h2 id="assistant-intro-start-title">{t('시작은 간단한 정보 등록부터')}</h2>
              <p>
                {t(
                  '경제활동 상태, 가구 구성, 관심 분야를 선택하세요. 필요한 경우 주거·피해 정보를 추가할 수 있습니다.',
                )}
              </p>
            </div>
            <p>
              <Icon name="shield" size={20} />{' '}
              {t('정보 수정·삭제와 지속 안내 설정은 언제든 변경할 수 있습니다.')}
            </p>
          </section>
        </div>
      )}
      <div hidden={showIntro} className="assistant-workspace">
        <section className="assistant-page-hero" aria-labelledby="assistant-page-title">
          <div>
            <span className="eyebrow">
              <Icon name="sparkles" size={18} /> {t('AI 복지비서')}
            </span>
            <h1 id="assistant-page-title" ref={workspaceHeading} tabIndex={-1}>
              {t('나에게 맞는 복지를 찾고, 다음 기회도 챙겨요.')}
            </h1>
            <p>{t('내 정보를 알려주시면 지원받을 만한 공고와 신청 준비를 도와드려요.')}</p>
          </div>
          <div className="assistant-page-actions">
            <button
              className="button secondary assistant-question-button"
              onClick={() => onStartConversation?.()}
            >
              <Icon name="headset" size={18} /> {t('궁금한 점 물어보기')}
            </button>
            <button className="text-button" onClick={openIntroduction}>
              {t('AI 복지비서 이용 안내')}
            </button>
          </div>
        </section>
        <MonitoringPanel
          user={user}
          profile={profile}
          mode={mode}
          onOpen={onOpen}
          onProfile={onProfile}
          onStartConversation={onStartConversation}
          onProfileDeleted={onProfileDeleted}
          onProfileChanged={onProfileChanged}
          refreshKey={refreshKey}
          profileEntryRequest={profileEntryRequest}
          variant="assistant"
        />
        {conversation && (
          <section
            className="assistant-conversation-section assistant-page-conversation"
            id="assistant-conversation"
            aria-labelledby="assistant-conversation-title"
          >
            <div className="assistant-conversation-heading">
              <h2 id="assistant-conversation-title">{t('궁금한 점 물어보기')}</h2>
              <p>{t('현재 상황이나 궁금한 내용을 자유롭게 적어 주세요.')}</p>
            </div>
            {conversation}
          </section>
        )}
      </div>
    </div>
  );
}
