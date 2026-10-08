import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import Icon from '../../shared/ui/Icon.jsx';
import MonitoringPanel from './MonitoringPanel.jsx';

// Both destinations use the same account-scoped API and preserve its read/consent rules.
export default function MonitoringPage({ notices = false, ...props }) {
  const { t } = useI18n();
  return (
    <section className="monitoring-page">
      <div className="page-heading">
        <a className="monitoring-parent" href={notices ? '#profile' : '#assistant-overview'}>
          {t(notices ? '내 정보' : 'AI 비서')} <Icon name="right" size={16} />
        </a>
        <h1>{t(notices ? '신규공고 확인하기' : '지속 복지 안내')}</h1>
        <p>
          {t(notices
            ? '내 상황과 관련해 새로 도착한 공고 안내를 모아봤어요.'
            : '거주 지역과 생활정보를 기준으로 새 공고와 필요한 지원을 계속 살펴봐요.')}
        </p>
        <a className="text-button monitoring-page-link" href={notices ? '#assistant-monitoring' : '#new-notices'}>
          {t(notices ? '지속 복지 안내 설정' : '신규공고 확인하기')} <Icon name="arrow" size={18} />
        </a>
      </div>
      <MonitoringPanel {...props} variant={notices ? 'notices' : 'guidance'} />
    </section>
  );
}
