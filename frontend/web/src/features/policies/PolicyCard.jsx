import Icon from '../../shared/ui/Icon.jsx';

export default function PolicyCard({ policy, saved, onSave, onOpen }) {
  return (
    <article className="policy-card">
      <div className="card-top">
        <span className={`policy-icon ${policy.tone}`}>
          <Icon name={policy.icon} size={24} />
        </span>
        <span className="category-label">{policy.category}</span>
        <button
          className={`icon-button save-button ${saved ? 'is-saved' : ''}`}
          aria-label={`${policy.title} ${saved ? '저장 취소' : '저장'}`}
          aria-pressed={saved}
          onClick={() => onSave(policy.id)}
        >
          <Icon name="bookmark" fill={saved ? 'currentColor' : 'none'} />
        </button>
      </div>
      <p className="card-meta">
        {policy.region} <span>·</span> {policy.organization}
      </p>
      <h3>
        <button className="card-title" onClick={() => onOpen(policy)}>
          {policy.title}
        </button>
      </h3>
      <p className="card-summary">{policy.summary}</p>
      <p className="benefit">
        <Icon name="check" size={16} />
        {policy.benefit}
      </p>
      <div className="card-bottom">
        <div className="tags">
          {policy.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <button
          className="detail-link"
          aria-label={`${policy.title} 자세히 보기`}
          onClick={() => onOpen(policy)}
        >
          <Icon name="arrow" size={19} />
        </button>
      </div>
    </article>
  );
}
