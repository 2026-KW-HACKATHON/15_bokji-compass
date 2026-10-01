import Icon from '../../shared/ui/Icon.jsx';
import { formatMoney, formatNumber, officialSourceUrl } from './financeModel.js';

export default function ResultView({ calculation, onRecommend, easy }) {
  const median = calculation.median;
  return (
    <div className="finance-result">
      <p className="finance-reference">
        {calculation.reference_year}년 공식 기준을 참고한 결과입니다.
      </p>
      <div className="finance-result-summary">
        <div>
          <span>월 소득 합계</span>
          <strong>{formatMoney(median.monthly_income)}</strong>
        </div>
        <div>
          <span>기준 중위소득 대비</span>
          <strong>
            {median.ratio_percent === null ? '확인 필요' : formatNumber(median.ratio_percent) + '%'}
          </strong>
        </div>
      </div>
      <p className="finance-help">
        중위소득 비율은 입력한 월 소득의 단순 비교입니다. 사업별 소득인정액이나 최종 신청 자격과
        다릅니다.
      </p>
      <details className="finance-details">
        <summary>중위소득 금액과 재산 합계 보기</summary>
        <dl className="finance-facts">
          <div>
            <dt>가구 기준 중위소득 100%</dt>
            <dd>{formatMoney(median.base)}</dd>
          </div>
          {median.thresholds.map((item) => (
            <div key={item.percent}>
              <dt>{formatNumber(item.percent)}%</dt>
              <dd>{formatMoney(item.amount)}</dd>
            </div>
          ))}
        </dl>
        <dl className="finance-facts">
          <div>
            <dt>재산 합계 (차량 포함)</dt>
            <dd>{formatMoney(calculation.assets.gross_total)}</dd>
          </div>
          <div>
            <dt>재산 합계 (차량 제외·부채 차감)</dt>
            <dd>{formatMoney(calculation.assets.without_vehicles)}</dd>
          </div>
          <div>
            <dt>차량 합계</dt>
            <dd>{formatMoney(calculation.assets.vehicle_total)}</dd>
          </div>
          <div>
            <dt>입력한 부채 합계</dt>
            <dd>{formatMoney(calculation.assets.debt_total)}</dd>
          </div>
          <div>
            <dt>부채를 뺀 단순 재산 합계</dt>
            <dd>{formatMoney(calculation.assets.net_total)}</dd>
          </div>
        </dl>
        <p className="finance-help">
          위 합계는 입력값을 정리한 것입니다. 사업별 인정 범위와 공제는 아래 결과에서 확인하세요.
        </p>
      </details>
      {calculation.assessments.map((assessment) => (
        <article className="finance-assessment" key={assessment.rule_id}>
          <div className="finance-assessment-heading">
            <h3>{assessment.label}</h3>
            <span className={'finance-status ' + assessment.status}>
              {assessment.status === 'estimated' ? '입력값으로 추정' : '추가 확인 필요'}
            </span>
          </div>
          <details className="finance-details finance-assessment-details" open={!easy}>
            <summary>기준 비교와 확인할 내용 보기</summary>
            {assessment.checks.length > 0 && (
              <ul className="finance-checks">
                {assessment.checks.map((check, index) => (
                  <li key={index}>
                    <div>
                      <strong>{check.label}</strong>
                      <span className={'finance-check-state ' + check.state}>
                        {
                          {
                            within: '입력값은 기준 이내',
                            over: '입력값은 기준 초과',
                            unknown: '확인 필요',
                          }[check.state]
                        }
                      </span>
                    </div>
                    <p>
                      계산값 {formatMoney(check.value)}{' '}
                      <span>· 기준 {formatMoney(check.limit)}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {assessment.missing.length > 0 && (
              <div className="finance-missing">
                <h4>추가로 확인할 내용</h4>
                <ul>
                  {assessment.missing.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {assessment.notes.length > 0 && (
              <ul className="finance-note-list">
                {assessment.notes.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            )}
            {assessment.breakdown.length > 0 && (
              <details className="finance-details">
                <summary>계산 내역 보기</summary>
                <dl className="finance-facts">
                  {assessment.breakdown.map((part, index) => (
                    <div key={index}>
                      <dt>{part.label}</dt>
                      <dd>{formatMoney(part.amount)}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
          </details>
        </article>
      ))}
      <details className="finance-details" open={!easy}>
        <summary>계산 기준과 공식 자료 보기</summary>
        {calculation.notes.length > 0 && (
          <ul className="finance-note-list">
            {calculation.notes.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        )}
        <p className="finance-disclaimer">
          <Icon name="info" /> 이 결과만으로 수급자·차상위계층 여부나 신청 자격이 확정되지 않습니다.
          자동차 특례와 추가 공제는 담당 기관의 확인이 필요합니다.
        </p>
        <div className="finance-sources">
          <h3>계산 기준과 공식 자료</h3>
          <ul>
            {calculation.sources.map((source, index) => {
              const url = officialSourceUrl(source.url);
              return (
                <li key={index}>
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      {source.title}
                      <Icon name="external" size={17} />
                      <span className="sr-only">새 창</span>
                    </a>
                  ) : (
                    <span>{source.title}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </details>
      {onRecommend && (
        <button type="button" className="button secondary" onClick={onRecommend}>
          관련 공고 살펴보기
          <Icon name="arrow" />
        </button>
      )}
    </div>
  );
}
