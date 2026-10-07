import Icon from '../../shared/ui/Icon.jsx';
import { formatMoney, formatNumber, officialSourceUrl } from './financeModel.js';

export default function ResultView({ calculation, onRecommend, easy }) {
  const median = calculation.median;
  return (
    <div className="finance-result">
      <p className="finance-reference">
        {calculation.reference_year}년 공식 기준을 참고한 결과입니다.
      </p>
      <section className="finance-result-guide" aria-labelledby="finance-result-guide-title">
        <h3 id="finance-result-guide-title">결과에 나오는 용어를 먼저 알아보세요</h3>
        <dl>
          <div>
            <dt>월 소득 합계</dt>
            <dd>입력한 가구원들의 한 달 소득을 모두 더한 금액이에요.</dd>
          </div>
          <div>
            <dt>기준 중위소득</dt>
            <dd>
              가구들의 소득 중 중간에 해당하는 금액을 바탕으로 정부가 정한 소득 기준이에요. 가구원
              수에 따라 기준 금액이 달라요.
            </dd>
          </div>
          <div>
            <dt>기준 중위소득 대비</dt>
            <dd>
              우리 가구의 월 소득이 같은 인원수의 기준 금액에 비해 어느 정도인지 나타내요. 50%라면
              기준 금액의 절반이라는 뜻이에요.
            </dd>
          </div>
          <div>
            <dt>소득인정액</dt>
            <dd>
              사업에서 정한 금액을 소득에서 빼고, 재산을 월 소득으로 바꿔 계산한 금액을 더한
              값이에요. 월 소득 합계와는 다른 금액이에요.
            </dd>
          </div>
          <div>
            <dt>계산값과 기준</dt>
            <dd>
              계산값은 입력한 정보로 계산한 금액, 기준은 해당 사업이 정한 비교 금액이에요. 사업마다
              소득과 재산을 비교하는 기준이 달라요.
            </dd>
          </div>
          <div>
            <dt>확인 필요</dt>
            <dd>
              정보가 부족하거나 적용 기준을 더 확인해야 한다는 뜻이에요. 0원이라는 뜻은 아니에요.
            </dd>
          </div>
        </dl>
        <p className="finance-help">
          중위소득 비율은 입력한 금액을 기준 중위소득과 나눈 단순 참고값입니다. 입력한 소득이 세후
          금액이면 세전 소득 기준과 다를 수 있으며, 사업별 소득인정액이나 최종 신청 자격과는
          다릅니다.
        </p>
      </section>
      <div className="finance-result-summary">
        <div>
          <span>입력한 월 소득 합계</span>
          <strong>{formatMoney(median.monthly_income)}</strong>
        </div>
        <div>
          <span>기준 중위소득 대비</span>
          <strong>
            {median.ratio_percent === null ? '확인 필요' : formatNumber(median.ratio_percent) + '%'}
          </strong>
        </div>
      </div>
      {median.monthly_income === null && (
        <p className="finance-help">
          소득 합계와 비율은 가구원별 금액이 모두 확인될 때 표시합니다. 모르는 소득은 0원으로
          계산하지 않으므로 전체 합계가 확인 필요로 표시될 수 있어요.
        </p>
      )}
      {median.monthly_income !== null && median.ratio_percent === null && (
        <p className="finance-help">
          입력한 금액의 합계는 표시했지만, 해당 연도의 기준 중위소득이 등록되지 않아 비율을 계산하지
          않았어요.
        </p>
      )}
      <details className="finance-details">
        <summary>중위소득 금액과 재산 합계 보기</summary>
        <p className="finance-help">
          재산 합계는 입력한 재산을 더한 금액입니다. 차량을 포함했는지, 부채를 뺐는지를 각 항목명에
          표시합니다. 사업별 인정 범위와 공제는 아래 결과에서 확인하세요.
        </p>
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
