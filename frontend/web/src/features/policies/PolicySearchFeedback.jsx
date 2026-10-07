import './policy-search.css';
import { searchRelationForScope } from './searchMetadata.js';

export const searchScopeLabels = {
  all: '자동으로 찾기',
  organization: '게시 기관',
  content: '공고 내용',
};

export function SearchScopeControl({ value, onChange, id }) {
  return (
    <details className="policy-search-options">
      <summary>
        검색 범위 직접 선택{value !== 'all' ? ` · ${searchScopeLabels[value]}` : ''}
      </summary>
      <div className="policy-search-options-content">
        <label>
          검색 범위
          <select
            value={value}
            aria-describedby={id}
            onChange={(event) => onChange(event.target.value)}
          >
            {Object.entries(searchScopeLabels).map(([scope, label]) => (
              <option key={scope} value={scope}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <p id={id}>
          기본은 입력한 말의 뜻으로 찾아요. 직접 고르면 게시 기관은 공고를 올린 기관, 공고 내용은
          제목과 본문에서 검색해요.
        </p>
      </div>
    </details>
  );
}

export function SearchInterpretation({ search, relation, onRefine, onLiteral }) {
  if (!search?.originalQuery.trim()) return null;
  return (
    <div className="search-interpretation" role="region" aria-label="검색 해석">
      <p aria-live="polite">{search.summary}</p>
      {search.corrections.length > 0 && (
        <div className="search-corrections">
          <p>
            {search.corrections.map(({ from, to }) => `‘${from}’ → ‘${to}’`).join(', ')}로 찾았어요.
          </p>
          <button className="text-button" onClick={onLiteral}>
            원래 검색어로 찾기
          </button>
        </div>
      )}
      {search.warnings.map((warning) => (
        <p className="fine-print" key={warning}>
          {warning}
        </p>
      ))}
      {search.alternatives.length > 0 && (
        <div className="search-alternatives" aria-label="검색 결과 좁히기">
          {search.alternatives.map((item) => (
            <button
              key={item.scope}
              aria-pressed={(relation || '') === searchRelationForScope(item.scope)}
              onClick={() => onRefine(searchRelationForScope(item.scope))}
            >
              {item.label} <span>{item.count}개</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const fieldLabels = {
  title: '제목',
  organization: '게시 기관',
  text: '본문',
  purpose_summary: '사업 목적',
  eligibility: '지원 대상',
  selection: '선정 기준',
  benefits: '지원 내용',
  _editor_summary: '공고 요약',
  _editor_benefits: '지원 내용',
  _editor_region: '지역 조건',
  _editor_age: '지원 대상',
  _editor_gender: '성별 조건',
  _editor_other: '기타 조건',
};

export function PolicySearchMatch({ match }) {
  if (!match) return null;
  return (
    <div className="policy-search-match">
      <p>
        <strong>찾은 이유</strong> {match.reason}
      </p>
      <details>
        <summary>근거 보기</summary>
        {match.evidence.map(({ field, quote }, index) => (
          <blockquote key={`${field}-${index}`}>
            <span>{fieldLabels[field] || '원문'}</span>
            {quote}
          </blockquote>
        ))}
      </details>
    </div>
  );
}
