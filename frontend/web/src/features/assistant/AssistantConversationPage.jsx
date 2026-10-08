import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import Icon from '../../shared/ui/Icon.jsx';
import GuidedConversation from './GuidedConversation.jsx';
import './assistant-conversation-page.css';

export default function AssistantConversationPage({
  user,
  policy,
  session,
  onSessionChange,
  onProfile,
  onSaved,
  onOverview,
}) {
  const { t } = useI18n();
  return (
    <div className="assistant-conversation-page">
      <header className="assistant-conversation-page-header">
        <div>
          <span className="eyebrow">
            <Icon name="sparkles" size={18} /> {t('AI 복지비서')}
          </span>
          <h1>{t('AI 비서와 대화하기')}</h1>
          <p>{t('상황을 알려주시면 필요한 지원과 신청 준비를 함께 확인해요.')}</p>
        </div>
        {onOverview && (
          <button className="button secondary" onClick={onOverview}>
            <Icon name="grid" size={18} /> {t('추천 공고로 돌아가기')}
          </button>
        )}
      </header>
      <div className="assistant-conversation-page-panel">
        <GuidedConversation
          user={user}
          policy={policy}
          session={session}
          onSessionChange={onSessionChange}
          onProfile={onProfile}
          onSaved={onSaved}
          conversational
        />
      </div>
    </div>
  );
}
