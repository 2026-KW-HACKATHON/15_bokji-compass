import Icon from '../../shared/ui/Icon.jsx';
import MonitoringPanel from '../monitoring/MonitoringPanel.jsx';
import './assistant-page.css';

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
}) {
  return (
    <div className="assistant-page">
      <section className="assistant-page-hero" aria-labelledby="assistant-page-title">
        <div>
          <span className="eyebrow">
            <Icon name="sparkles" size={18} /> 내 상황을 기억하는 복지 안내
          </span>
          <h1 id="assistant-page-title">AI 복지비서</h1>
          <p>새로 발견한 지원부터 신청 준비까지, 나에게 필요한 다음 단계를 한곳에서 확인해요.</p>
        </div>
        <button className="button primary" onClick={() => onStartConversation?.()}>
          <Icon name="headset" size={20} /> 상황을 대화로 추가하기
        </button>
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
        variant="assistant"
      />
      <section
        className="assistant-conversation-section assistant-page-conversation"
        id="assistant-conversation"
        aria-labelledby="assistant-conversation-title"
      >
        <div className="assistant-conversation-heading">
          <div>
            <span className="eyebrow">필요한 정보만, 하나씩</span>
            <h2 id="assistant-conversation-title">내 상황을 더 알려주세요</h2>
            <p>모르는 정보는 건너뛰어도 괜찮아요. 확인한 내용은 동의 후에만 내 정보로 저장해요.</p>
          </div>
          <Icon name="compass" size={34} />
        </div>
        {conversation || (
          <div className="assistant-conversation-starters">
            {[
              ['house', '집수리 지원이 궁금해요', '주택 수리 지원을 알아보고 싶어요'],
              ['briefcase', '취업을 준비하고 있어요', '취업 지원을 알아보고 싶어요'],
              ['shield', '재난 피해를 입었어요', '재난 피해 지원을 알아보고 싶어요'],
            ].map(([icon, title, question]) => (
              <button key={icon} onClick={() => onStartConversation?.(question)}>
                <Icon name={icon} size={22} />
                <span>{title}</span>
                <Icon name="arrow" size={18} />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
