import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import './policy-search.css';
import { searchRelationForScope } from './searchMetadata.js';

export const searchScopeLabels = {
  all: '자동으로 찾기',
  organization: '게시 기관',
  content: '공고 내용',
};

export function SearchScopeControl({ value, onChange, id }) {
  const { t, intlLocale } = useI18n();

  return (
    <details className="policy-search-options">
      <summary>
        {' '}
        {t('검색 범위 직접 선택')}
        {value !== 'all' ? ` · ${t(searchScopeLabels[value])}` : ''}
      </summary>
      <div className="policy-search-options-content">
        <label>
          {' '}
          {t('검색 범위')}{' '}
          <select
            value={value}
            aria-describedby={id}
            onChange={(event) => onChange(event.target.value)}
          >
            {Object.entries(searchScopeLabels).map(([scope, label]) => (
              <option key={scope} value={scope}>
                {t(label)}
              </option>
            ))}
          </select>
        </label>
        <p id={id}>
          {' '}
          {t(
            '기본은 입력한 말의 뜻으로 찾아요. 직접 고르면 게시 기관은 공고를 올린 기관, 공고 내용은 제목과 본문에서 검색해요.',
          )}{' '}
        </p>
      </div>
    </details>
  );
}

export function SearchInterpretation({ search, relation, onRefine, onLiteral }) {
  const { t, intlLocale } = useI18n();

  if (!search?.originalQuery.trim()) return null;
  return (
    <div className="search-interpretation" role="region" aria-label={t('검색 해석')}>
      <p aria-live="polite">{search.summary}</p>
      {search.corrections.length > 0 && (
        <div className="search-corrections">
          <p>
            {search.corrections.map(({ from, to }) => `‘${from}’ → ‘${to}’`).join(', ')}
            {t('로 찾았어요.')}{' '}
          </p>
          <button className="text-button" onClick={onLiteral}>
            {' '}
            {t('원래 검색어로 찾기')}{' '}
          </button>
        </div>
      )}
      {search.warnings.map((warning) => (
        <p className="fine-print" key={warning}>
          {warning}
        </p>
      ))}
      {search.alternatives.length > 0 && (
        <div className="search-alternatives" aria-label={t('검색 결과 좁히기')}>
          {search.alternatives.map((item) => (
            <button
              key={item.scope}
              aria-pressed={(relation || '') === searchRelationForScope(item.scope)}
              onClick={() => onRefine(searchRelationForScope(item.scope))}
            >
              {item.label}{' '}
              <span>
                {item.count}
                {t('개')}
              </span>
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
  const { t, intlLocale } = useI18n();

  if (!match) return null;
  return (
    <div className="policy-search-match">
      <p>
        <strong>{t('찾은 이유')}</strong> {match.reason}
      </p>
      <details>
        <summary>{t('근거 보기')}</summary>
        {match.evidence.map(({ field, quote }, index) => (
          <blockquote key={`${field}-${index}`}>
            <span>{t(fieldLabels[field] || '원문')}</span>
            {quote}
          </blockquote>
        ))}
      </details>
    </div>
  );
}
