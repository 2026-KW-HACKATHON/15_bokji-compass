import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import Icon from '../../shared/ui/Icon.jsx';
import {
  noticeStageLabel,
  noticeStagePresentation,
  parseNoticeStage,
} from './noticeSeriesModel.js';
import './notice-series.css';

export function NoticeStageBadge({ stage, title = '' }) {
  const { t } = useI18n();
  const checked = parseNoticeStage(stage);
  return checked ? (
    <span className={`notice-stage-badge ${checked}`}>{t(noticeStageLabel(checked, title))}</span>
  ) : null;
}

export default function NoticeSeries({ policy, detail = false }) {
  const { t, intlLocale } = useI18n();
  const group = policy.noticeGroup;
  const { stage, note } = noticeStagePresentation(policy);
  const latestTitle = group?.notices.at(-1)?.title || policy.title;
  if (!group && !stage) return null;
  const notices = group && (
    <ol className="notice-series-list">
      {group.notices.map((notice) => (
        <li key={notice.id}>
          <div className="notice-series-meta">
            <NoticeStageBadge stage={notice.stage} title={notice.title} />
            {notice.publishedDate && (
              <time dateTime={notice.publishedDate}>{notice.publishedDate}</time>
            )}
            {detail && notice.id === policy.id && (
              <span className="notice-series-current">{t('현재 보고 있는 공고')}</span>
            )}
          </div>
          {notice.sourceUrl ? (
            <a href={notice.sourceUrl} target="_blank" rel="noopener noreferrer">
              <span>{notice.title}</span>
              <Icon name="external" size={14} />
              <span className="sr-only">{t('새 창')}</span>
            </a>
          ) : (
            <p>{notice.title}</p>
          )}
        </li>
      ))}
    </ol>
  );
  return (
    <section
      className={`notice-series${detail ? ' notice-series-detail' : ''}`}
      aria-label={t('같은 사업의 단계별 안내')}
    >
      {detail && group && <h3>{group.title}</h3>}
      <div className="notice-series-status">
        <NoticeStageBadge stage={stage} title={latestTitle} />
        {group && <span>{t('같은 사업의 단계별 안내')}</span>}
      </div>
      {note && <p className="notice-series-note">{t(note)}</p>}
      {group &&
        (detail ? (
          notices
        ) : (
          <details className="notice-series-disclosure">
            <summary>
              {t('관련 공고 {count}개', {
                count: new Intl.NumberFormat(intlLocale).format(group.noticeCount),
              })}
            </summary>
            {notices}
          </details>
        ))}
    </section>
  );
}
