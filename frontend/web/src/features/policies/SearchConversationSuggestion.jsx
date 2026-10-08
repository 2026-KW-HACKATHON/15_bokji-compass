import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import Icon from '../../shared/ui/Icon.jsx';
import { suggestsConversation } from './searchConversation.js';
import './search-conversation.css';

export default function SearchConversationSuggestion({ query, onAskAssistant }) {
  const { t } = useI18n();
  if (!onAskAssistant || !suggestsConversation(query)) return null;
  return (
    <aside className="search-conversation" aria-label={t('AI 비서 상담 안내')}>
      <Icon name="sparkles" size={24} />
      <div>
        <strong>{t('내 상황에 맞는 지원을 더 자세히 알아보고 싶다면')}</strong>
        <p>{t('AI 비서가 필요한 조건을 함께 확인해 드려요. 입력한 문장을 그대로 가져가요.')}</p>
      </div>
      <button className="button secondary" type="button" onClick={() => onAskAssistant(query)}>
        {t('이 내용으로 AI 비서와 상담하기')}
      </button>
    </aside>
  );
}
