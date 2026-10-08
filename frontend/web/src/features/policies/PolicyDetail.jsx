import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import {
  PolicyTranslationStatus,
  useTranslatedPolicy,
} from '../../shared/i18n/PolicyTranslation.jsx';
import Modal from '../../shared/ui/Modal.jsx';
import Icon from '../../shared/ui/Icon.jsx';
import { safeSourceUrl } from './policyModel.js';
import PolicyQuestion from '../assistant/PolicyQuestion.jsx';
export default function PolicyDetail({
  policy: original,
  saved,
  onSave,
  onClose,
  onTag,
  easy,
  user,
  onAsk,
}) {
  const { t, intlLocale } = useI18n();
  const translation = useTranslatedPolicy(original, { priority: 10 });
  const { policy } = translation;

  const source = safeSourceUrl(policy.sourceUrl);
  const application = safeSourceUrl(policy.applicationUrl);
  const sourceLabels = {
    text: '공고 본문',
    purpose_summary: '사업 목적',
    eligibility: '지원 대상',
    selection: '선정 기준',
    benefits: '지원 내용',
    application_period: '신청 기간',
    application_method: '신청 방법',
    application_url: '신청 주소',
    contact: '문의처',
    documents: '제출 서류',
    published_date: '게시일',
    modified_date: '수정일',
    laws: '근거 법령',
    support_type: '지원 형태',
    support_cycle: '지원 주기',
    provider_category: '서비스 분야',
    receipt_agency: '접수 기관',
    attachments: '첨부 파일',
    source_year: '기준 연도',
    links: '관련 링크',
    attachment_status: '첨부 파일 확인 상태',
  };
  const relatedTags = (
    <div className="tags detail-tags">
      {policy.tags.map((tag) => (
        <button
          key={tag}
          onClick={() => {
            onClose();
            onTag(tag);
          }}
        >
          #{t(tag)}
          <span className="sr-only"> {t('태그로 공고 찾기')}</span>
        </button>
      ))}
    </div>
  );
  return (
    <Modal title={policy.title} onClose={onClose}>
      <PolicyTranslationStatus translation={translation} controls />
      <div className="detail-badges">
        <span className="soft-badge">{t(policy.category)}</span>
        <span className="soft-badge">{t(policy.region)}</span>
      </div>
      <p className="modal-description">{policy.summary}</p>
      {source && (
        <p className="detail-original-link">
          <a href={source} target="_blank" rel="noopener noreferrer">
            {t('공고 원문 보기')} <Icon name="external" size={16} />
            <span className="sr-only">{t('새 창')}</span>
          </a>
        </p>
      )}
      <div className="detail-highlight">
        <h3>{t('지원 내용')}</h3>
        <p>{policy.benefit}</p>
      </div>
      {easy && (
        <dl className="policy-detail detail-key-facts">
          <div>
            <dt>{t('지원 대상')}</dt>
            <dd>{policy.audience}</dd>
          </div>
          <div>
            <dt>{t('신청 기간')}</dt>
            <dd>{policy.applicationPeriod || t('공식 공고에서 확인')}</dd>
          </div>
          {policy.paymentSchedule && (
            <div>
              <dt>{t('지급 시기')}</dt>
              <dd>{policy.paymentSchedule}</dd>
            </div>
          )}
        </dl>
      )}
      <details className="detail-more" open={easy ? undefined : true}>
        <summary>{easy ? t('담당 기관 확인') : t('기관과 신청 정보 보기')}</summary>
        <dl className="policy-detail">
          {!easy && policy.paymentSchedule && (
            <div>
              <dt>{t('지급 시기')}</dt>
              <dd>{policy.paymentSchedule}</dd>
            </div>
          )}
          <div>
            <dt>{t('담당 기관')}</dt>
            <dd>{policy.organization}</dd>
          </div>
          {policy.publishedDate && (
            <div>
              <dt>{t('게시일')}</dt>
              <dd>{policy.publishedDate}</dd>
            </div>
          )}
          {policy.modifiedDate && (
            <div>
              <dt>{t('수정일')}</dt>
              <dd>{policy.modifiedDate}</dd>
            </div>
          )}
          {policy.applicationMethod && (
            <div>
              <dt>{t('신청 방법')}</dt>
              <dd>{policy.applicationMethod}</dd>
            </div>
          )}
          {policy.contact && (
            <div>
              <dt>{t('문의처')}</dt>
              <dd>{policy.contact}</dd>
            </div>
          )}
          {policy.gender && (
            <div>
              <dt>{t('성별 조건')}</dt>
              <dd>{policy.gender}</dd>
            </div>
          )}
          {policy.otherConditions?.length > 0 && (
            <div>
              <dt>{t('기타 조건')}</dt>
              <dd>{policy.otherConditions.join('\n')}</dd>
            </div>
          )}
          {!easy && (
            <>
              <div>
                <dt>{t('신청 기간')}</dt>
                <dd>{policy.applicationPeriod || t('공식 공고에서 확인')}</dd>
              </div>
              <div>
                <dt>{t('지원 대상')}</dt>
                <dd>{policy.audience}</dd>
              </div>
            </>
          )}
        </dl>
      </details>
      {policy.content && (
        <details className="detail-more">
          <summary>{t('공고 본문 보기')}</summary>
          <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{policy.content}</p>
        </details>
      )}
      {Object.keys(policy.sourceFields || {}).length > 0 && (
        <details className="detail-more">
          <summary>{t('공고의 전체 항목 확인')}</summary>
          <dl className="policy-detail">
            {Object.entries(policy.sourceFields).map(([key, value]) => (
              <div key={key}>
                <dt>{t(Object.hasOwn(sourceLabels, key) ? sourceLabels[key] : key)}</dt>
                <dd style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{value}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      {easy ? (
        <details className="detail-related">
          <summary>{t('관련 공고 더 찾기')}</summary>
          {relatedTags}
        </details>
      ) : (
        relatedTags
      )}
      <div className="detail-actions">
        {onAsk && (
          <button className="button secondary" onClick={onAsk}>
            <Icon name="headset" size={20} /> {t('챗봇 창에서 질문하기')}{' '}
          </button>
        )}
        <button className="button secondary" onClick={() => onSave(original)}>
          <Icon name="bookmark" size={18} />
          {saved ? t('저장 취소하기') : t('이 공고 저장하기')}
        </button>
      </div>
      <PolicyQuestion
        key={`${user?.id || 'guest'}:${policy.revisionId || policy.id}`}
        revisionId={policy.revisionId}
        user={user}
      />
      <div className="notice-box detail-source">
        <p>{t('신청 전에 공식 공고에서 자세한 지원 조건과 최신 일정을 확인해 주세요.')}</p>
        {source && (
          <a className="button primary" href={source} target="_blank" rel="noopener noreferrer">
            {' '}
            {t('자세한 공고 확인하기')} <Icon name="external" size={18} />
            <span className="sr-only">{t('새 창')}</span>
          </a>
        )}
        {application && (
          <a
            className="button secondary"
            href={application}
            target="_blank"
            rel="noopener noreferrer"
          >
            {' '}
            {t('신청 페이지 열기')} <Icon name="external" size={18} />
            <span className="sr-only">{t('새 창')}</span>
          </a>
        )}
      </div>
    </Modal>
  );
}
