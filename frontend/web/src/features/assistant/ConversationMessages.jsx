import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import { TranslatedPolicyTitle } from '../../shared/i18n/PolicyTranslation.jsx';
import { safeSourceUrl } from '../policies/policyModel.js';

// Every response travels with its own turn so later questions never replace earlier
// answers or change which notice "the first one" referred to in that response.
export default function ConversationMessages({ exchanges, latest, answerRef }) {
  const { t } = useI18n();
  return (
    <ol className="conversation-messages" role="log" aria-label={t('이전 대화')} aria-live="polite">
      {exchanges.map((entry, index) => {
        const isLatest = index === exchanges.length - 1;
        const response = entry.response || (isLatest ? latest : null);
        const selected = response?.selected_policy?.policy;
        const policies = selected
          ? [selected]
          : (response?.candidates || []).slice(0, 3).map((item) => item.policy);
        return (
          <li key={index} className="conversation-turn" ref={isLatest ? answerRef : undefined}>
            <p className="guided-user-reply">{entry.question}</p>
            <div
              className="conversation-assistant-message"
              role={isLatest ? 'region' : undefined}
              aria-label={isLatest ? t('생활 상담 안내') : undefined}
            >
              <p className="guided-answer-text">{entry.answer}</p>
              {policies.length > 0 && (
                <ol className="conversation-notices">
                  {policies.map((policy, policyIndex) => {
                    const url = safeSourceUrl(policy.sourceUrl);
                    return (
                      <li key={policy.revisionId || policy.id}>
                        <span className="conversation-notice-number">{policyIndex + 1}</span>
                        <div>
                          <TranslatedPolicyTitle policy={policy} as="strong" />
                          <p>{policy.benefit}</p>
                          {policy.applicationPeriod && <p>{policy.applicationPeriod}</p>}
                          {url && (
                            <a href={url} target="_blank" rel="noreferrer">
                              {t('공고 원문 보기')}
                            </a>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
