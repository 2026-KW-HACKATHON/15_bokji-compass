import { formatSignalDate } from './policyModel.js';

export default function PolicyIndicators({ policy }) {
  const { popularity, budget, budgetNotice } = policy;
  if (!popularity && !budget && !budgetNotice) return null;
  return (
    <dl className="policy-indicators">
      {popularity && (
        <div>
          <dt>{popularity.source === 'gov24' ? '정부24' : '복지로'} 누적 조회</dt>
          <dd>
            {popularity.views.toLocaleString('ko-KR')}회
            {popularity.asOf && <small>{formatSignalDate(popularity.asOf)} 수집</small>}
          </dd>
        </div>
      )}
      {budget && (
        <div className="policy-budget">
          <dt>공식 예산 소진률</dt>
          <dd>
            {budget.usedPercent.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}%
            <progress value={budget.usedPercent} max="100" aria-label="공식 예산 소진률" />
            <small>
              {budget.asOf ? `${formatSignalDate(budget.asOf)} 기준 · ` : '기준일 미제공 · '}
              <a
                href={budget.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={budget.evidence}
              >
                공식 근거 확인
              </a>
            </small>
          </dd>
        </div>
      )}
      {budgetNotice && (
        <div>
          <dt>예산 안내</dt>
          <dd>{budgetNotice}</dd>
        </div>
      )}
    </dl>
  );
}
