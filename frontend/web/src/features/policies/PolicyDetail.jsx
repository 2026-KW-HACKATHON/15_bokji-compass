import Modal from '../../shared/ui/Modal.jsx';
import Icon from '../../shared/ui/Icon.jsx';
import { safeSourceUrl } from './policyModel.js';
import PolicyQuestion from '../assistant/PolicyQuestion.jsx';
export default function PolicyDetail({ policy, saved, onSave, onClose, onTag, mode, easy, user }) {
  const source = safeSourceUrl(policy.sourceUrl);
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
          #{tag}
          <span className="sr-only"> 태그로 공고 찾기</span>
        </button>
      ))}
    </div>
  );
  return (
    <Modal title={policy.title} onClose={onClose}>
      <div className="detail-badges">
        <span className="soft-badge">{policy.category}</span>
        <span className="soft-badge">{policy.region}</span>
      </div>
      <p className="modal-description">{policy.summary}</p>
      <div className="detail-highlight">
        <h3>{easy ? '지원 내용' : '어떤 도움을 받을 수 있나요?'}</h3>
        <p>{policy.benefit}</p>
      </div>
      {easy && (
        <dl className="policy-detail detail-key-facts">
          <div>
            <dt>지원 대상</dt>
            <dd>{policy.audience} · 자세한 조건은 공식 공고를 확인하세요.</dd>
          </div>
          <div>
            <dt>신청 기간</dt>
            <dd>{policy.applicationPeriod || '공식 공고에서 확인'}</dd>
          </div>
        </dl>
      )}
      <details className="detail-more" open={easy ? undefined : true}>
        <summary>{easy ? '담당 기관 확인' : '기관과 신청 정보 보기'}</summary>
        <dl className="policy-detail">
          <div>
            <dt>담당 기관</dt>
            <dd>{policy.organization}</dd>
          </div>
          {!easy && (
            <>
              <div>
                <dt>신청 기간</dt>
                <dd>{policy.applicationPeriod || '공식 공고에서 확인'}</dd>
              </div>
              <div>
                <dt>지원 대상</dt>
                <dd>{policy.audience} · 자세한 조건은 공식 공고를 확인하세요.</dd>
              </div>
            </>
          )}
        </dl>
      </details>
      {easy ? (
        <details className="detail-related">
          <summary>관련 공고 더 찾기</summary>
          {relatedTags}
        </details>
      ) : (
        relatedTags
      )}
      <p className="notice-box">
        추천받은 공고도 신청 조건을 충족하지 않을 수 있어요. 신청 전에 공식 공고를 확인하세요.
      </p>
      <div className="detail-actions">
        {mode === 'api' && source && (
          <a className="button primary" href={source} target="_blank" rel="noopener noreferrer">
            공식 공고 보기
            <Icon name="external" size={18} />
            <span className="sr-only">새 창</span>
          </a>
        )}
        <button className="button secondary" onClick={() => onSave(policy)}>
          <Icon name="bookmark" size={18} />
          {saved ? '저장 취소하기' : '이 공고 저장하기'}
        </button>
      </div>
      <PolicyQuestion
        key={`${user?.id || 'guest'}:${policy.revisionId || policy.id}`}
        revisionId={policy.revisionId}
        user={user}
      />
    </Modal>
  );
}
