import Icon from '../../shared/ui/Icon.jsx';
export default function PolicyCard({ policy, saved, onSave, onOpen, onTag, easy = false, reason }) {
  return (
    <article className="policy-card">
      <div className="card-top">
        <span className={'policy-icon ' + policy.tone}>
          <Icon name={policy.icon} size={25} />
        </span>
        <span className="category-label">{policy.category}</span>
        <button
          className={'save-button ' + (saved ? 'is-saved' : '')}
          aria-label={policy.title + (saved ? ' 저장 취소' : ' 저장')}
          aria-pressed={saved}
          onClick={() => onSave(policy)}
        >
          <Icon name="bookmark" size={21} fill={saved ? 'currentColor' : 'none'} />
          <span>{saved ? '저장됨' : '저장'}</span>
        </button>
      </div>
      <p className="card-meta">
        {policy.region} · {policy.organization}
      </p>
      <h3>
        <button className="card-title" onClick={() => onOpen(policy)}>
          {policy.title}
        </button>
      </h3>
      {reason ? (
        <div className="recommendation-reason">
          <span>
            <Icon name="sparkles" size={17} />
            추천 이유
          </span>
          <p>{reason}</p>
        </div>
      ) : (
        <p className="card-summary">{policy.summary}</p>
      )}
      {!easy && (
        <p className="benefit">
          <Icon name="check" size={17} />
          {policy.benefit}
        </p>
      )}
      <div className="card-bottom">
        <div className="tags" aria-label="이 공고의 태그">
          {policy.tags.map((tag) => (
            <button key={tag} onClick={() => onTag(tag)} aria-label={tag + ' 태그로 공고 찾기'}>
              #{tag}
            </button>
          ))}
        </div>
        <button
          className="detail-link"
          onClick={() => onOpen(policy)}
          aria-label={policy.title + ' 자세히 보기'}
        >
          자세히 보기
          <Icon name="arrow" size={18} />
        </button>
      </div>
    </article>
  );
}
