import { useI18n } from '../shared/i18n/I18nProvider.jsx';
import Icon from '../shared/ui/Icon.jsx';
import './SourceFooter.css';

const sources = [
  { name: '정부24', url: 'https://www.gov.kr/', logo: 'gov24.svg' },
  { name: '복지로', url: 'https://www.bokjiro.go.kr/', logo: 'bokjiro.jpg' },
  { name: '서울특별시', url: 'https://www.seoul.go.kr/', logo: 'seoul.png' },
  {
    name: '광운대학교',
    url: 'https://www.kw.ac.kr/ko/life/notice.jsp',
    logo: 'kwangwoon.png',
  },
];

export default function SourceFooter({ easy, showSources = false }) {
  const { t } = useI18n();
  return (
    <footer className={showSources ? 'source-footer' : undefined}>
      {showSources && (
        <section className="notice-sources" aria-labelledby="notice-sources-title">
          <div className="notice-sources-heading">
            <h2 id="notice-sources-title">{t('공고 출처')}</h2>
            <p>{t('공식 사이트의 공고를 모아 안내해요.')}</p>
          </div>
          <ul className="notice-source-list">
            {sources.map((source) => (
              <li key={source.name}>
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  <img src={'/source-logos/' + source.logo} alt="" width="160" height="48" />
                  <span className="notice-source-name">
                    {t(source.name)}
                    <Icon name="external" size={14} />
                    <span className="sr-only"> {t('(새 창)')}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="page-footer">
        <span className="footer-brand">
          <img src="/brand-logo.png" alt="" /> {t('복지나침반')}{' '}
        </span>
        {!easy && <span>{t('추천을 참고하고, 신청 조건은 공식 공고에서 확인하세요.')}</span>}
      </div>
    </footer>
  );
}
