import { useEffect, useRef, useState } from 'react';
import Icon from '../../shared/ui/Icon.jsx';
import { appConfig } from '../../shared/config.js';
import { createFinanceApi } from './financeApi.js';
import {
  emptyFinancialProfile,
  emptyMember,
  emptyVehicle,
  toFinancialProfile,
  financeRegions,
  recipientTypes,
  deductionTypes,
  vehicleKinds,
  vehicleUses,
  earnedIncomeBases,
  businessIncomeBases,
  vehicleOwnerships,
  vehicleRegistrationUses,
  vehicleValueBases,
  vehicleSubsidies,
  formatMoney,
  formatNumber,
  officialSourceUrl,
} from './financeModel.js';
import './calculator.css';

const api = createFinanceApi({ baseUrl: appConfig.apiBaseUrl });
const stepNames = ['가구와 소득', '재산과 부채', '계산 결과'];
const numericValue = (value) =>
  typeof value === 'number' ? new Intl.NumberFormat('ko-KR').format(value) : (value ?? '');
const hasPositiveAmount = (value) => {
  const text = String(value ?? '').trim();
  return /^[\d,]+$/.test(text) && Number(text.replaceAll(',', '')) > 0;
};
function AmountField({ label, value, onChange, hint, unit = '원', id }) {
  return (
    <div className="finance-field">
      <label htmlFor={id}>{label}</label>
      <div className="finance-number">
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={numericValue(value)}
          onChange={(event) => onChange(event.target.value)}
          placeholder="모르면 비워두세요"
          aria-describedby={hint ? id + '-hint' : undefined}
        />
        <span aria-hidden="true">{unit}</span>
      </div>
      {hint && <small id={id + '-hint'}>{hint}</small>}
    </div>
  );
}
function SelectField({ label, value, onChange, options, id, hint }) {
  return (
    <div className="finance-field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={hint ? id + '-hint' : undefined}
      >
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
      {hint && <small id={id + '-hint'}>{hint}</small>}
    </div>
  );
}
function ResultView({ calculation, onRecommend, easy }) {
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
export default function CalculatorPage({ easy, user, profile, onProfileChange, onRecommend }) {
  const [draft, setDraft] = useState(() =>
    profile ? structuredClone(profile) : emptyFinancialProfile(),
  );
  const [step, setStep] = useState(0);
  const [calculation, setCalculation] = useState(null);
  const [consent, setConsent] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const request = useRef(null);
  const revision = useRef(0);
  const account = useRef(user?.id ?? null);
  const headings = useRef([]);
  const errorRef = useRef(null);
  useEffect(
    () => () => {
      revision.current += 1;
      request.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (account.current !== (user?.id ?? null)) {
      account.current = user?.id ?? null;
      revision.current += 1;
      request.current?.abort();
      setDraft(emptyFinancialProfile());
      setCalculation(null);
      setConsent(false);
      setError('');
      setMessage('');
      setBusy('');
      setStep(0);
    }
  }, [user?.id]);
  const change = (updater) => {
    setDraft(updater);
    setCalculation(null);
    setError('');
    setMessage('');
    setConfirmDelete(false);
  };
  const update = (key, value) => change((current) => ({ ...current, [key]: value }));
  const updateMember = (index, key, value) =>
    change((current) => ({
      ...current,
      members: current.members.map((member, i) =>
        i === index ? { ...member, [key]: value } : member,
      ),
    }));
  const updateVehicle = (index, key, value) =>
    change((current) => ({
      ...current,
      vehicles: current.vehicles.map((vehicle, i) =>
        i === index ? { ...vehicle, [key]: value } : vehicle,
      ),
    }));
  const updateGroup = (group, key, value) =>
    change((current) => ({ ...current, [group]: { ...current[group], [key]: value } }));
  const moveStep = (next) => {
    setStep(next);
    requestAnimationFrame(() => headings.current[next]?.focus());
  };
  const showError = (text) => {
    setError(text);
    requestAnimationFrame(() => errorRef.current?.focus());
  };
  async function perform(kind, action) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const current = ++revision.current;
    setBusy(kind);
    setError('');
    setMessage('');
    try {
      const apply = await action(controller.signal);
      if (current === revision.current && !controller.signal.aborted) apply?.();
    } catch (err) {
      if (current === revision.current && !controller.signal.aborted) showError(err.message);
    } finally {
      if (current === revision.current) setBusy('');
    }
  }
  function readDraft() {
    try {
      return toFinancialProfile(draft);
    } catch (err) {
      showError(err.message);
      return null;
    }
  }
  function calculate() {
    const raw = readDraft();
    if (!raw) return;
    onProfileChange(raw);
    setCalculation(null);
    moveStep(2);
    perform('calculate', async (signal) => {
      const result = await api.calculate(raw, { signal });
      return () => {
        setCalculation(result);
        requestAnimationFrame(() => headings.current[2]?.focus());
      };
    });
  }
  function save() {
    const raw = readDraft();
    if (!raw || !user || !consent) return;
    perform('save', async (signal) => {
      const saved = await api.saveProfile(raw, { consent, signal });
      return () => {
        onProfileChange(saved.profile);
        setDraft(saved.profile);
        setCalculation(saved.calculation);
        setMessage('계정에 저장했습니다.');
        moveStep(2);
      };
    });
  }
  function load() {
    if (!user) return;
    perform('load', async (signal) => {
      const saved = await api.getProfile({ signal });
      if (!saved.profile)
        return () =>
          setMessage('계정에 저장한 정보가 없습니다. 지금 입력한 내용은 그대로 유지합니다.');
      return () => {
        onProfileChange(saved.profile);
        setDraft(saved.profile);
        setCalculation(saved.calculation);
        setConsent(false);
        setMessage('계정에 저장된 정보를 불러왔습니다.');
        moveStep(2);
      };
    });
  }
  function clearLocal() {
    revision.current += 1;
    request.current?.abort();
    setDraft(emptyFinancialProfile());
    setCalculation(null);
    setConsent(false);
    setBusy('');
    setError('');
    setMessage('이 화면의 입력 정보를 지웠습니다.');
    onProfileChange(null);
    moveStep(0);
  }
  function removeSaved() {
    if (!user) return;
    perform('delete', async (signal) => {
      await api.deleteProfile({ signal });
      return () => {
        onProfileChange(null);
        setDraft(emptyFinancialProfile());
        setCalculation(null);
        setConsent(false);
        setConfirmDelete(false);
        setMessage('계정에 저장한 소득·재산 정보를 삭제했습니다.');
        moveStep(0);
      };
    });
  }
  function changeHousehold(value) {
    const count = Number(value);
    change((current) => ({
      ...current,
      household_size: count,
      members: Array.from({ length: count }, (_, index) => current.members[index] || emptyMember()),
    }));
  }
  function next() {
    if (readDraft()) moveStep(1);
  }
  const heading = (index) => (
    <h2
      ref={(element) => {
        headings.current[index] = element;
      }}
      tabIndex={-1}
    >
      <span className="finance-step-number">{index + 1}</span>
      {stepNames[index]}
    </h2>
  );
  return (
    <section className="calculator-page">
      <div className="page-heading">
        <span className="eyebrow">2026년 기준</span>
        <h1>소득·재산 계산기</h1>
        <p>회원가입 없이 계산할 수 있어요. 아는 항목부터 입력해 주세요.</p>
      </div>
      <div className="finance-intro">
        <Icon name="shield" />
        <p>
          {easy
            ? '입력 정보는 서버에서 계산해요. 저장은 동의한 경우에만 합니다.'
            : '계산할 때 입력 정보를 서버로 보냅니다. 계정 저장은 따로 동의한 경우에만 하며, 이 브라우저에는 저장하지 않습니다.'}
        </p>
      </div>
      <p className="finance-input-guide">
        <strong>없는 항목은 0, 모르는 항목은 빈칸</strong>으로 두세요. 금액은 모두 원 단위입니다.
      </p>
      {easy && (
        <ol className="finance-progress" aria-label="계산 단계">
          {stepNames.map((name, index) => (
            <li key={name} aria-current={step === index ? 'step' : undefined}>
              <span>{index + 1}</span>
              {name}
            </li>
          ))}
        </ol>
      )}
      <div className="finance-feedback">
        {error && (
          <p ref={errorRef} tabIndex={-1} role="alert" className="auth-error">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="notice-box">
            {message}
          </p>
        )}
        {busy && (
          <p role="status">
            {
              {
                calculate: '계산하고 있습니다…',
                save: '저장하고 있습니다…',
                load: '저장한 정보를 불러오고 있습니다…',
                delete: '저장한 정보를 삭제하고 있습니다…',
              }[busy]
            }
          </p>
        )}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (easy && step === 0) next();
          else calculate();
        }}
        noValidate
      >
        <fieldset disabled={Boolean(busy)} className="finance-form-fields">
          <section className="finance-section" hidden={easy && step !== 0}>
            {heading(0)}
            <div className="finance-grid">
              <SelectField
                id="finance-household"
                label="가구원 수"
                value={draft.household_size}
                onChange={changeHousehold}
                options={Array.from({ length: 12 }, (_, i) => [i + 1, i + 1 + '명'])}
              />
              <SelectField
                id="finance-region"
                label="거주 지역"
                value={draft.region}
                onChange={(value) => update('region', value)}
                options={financeRegions}
              />
              <SelectField
                id="finance-recipient"
                label="현재 수급 상태"
                value={draft.recipient_status}
                onChange={(value) => update('recipient_status', value)}
                options={recipientTypes}
              />
              <AmountField
                id="finance-children"
                label="18세 미만 자녀 수"
                unit="명"
                value={draft.minor_children}
                onChange={(value) => update('minor_children', value)}
              />
            </div>
            <label className="finance-check">
              <input
                type="checkbox"
                checked={draft.household_scope_confirmed}
                onChange={(event) => update('household_scope_confirmed', event.target.checked)}
              />
              계산할 사업의 가구원 범위를 확인했어요
            </label>
            <details className="finance-details">
              <summary>누구의 소득을 입력하나요?</summary>
              <p>
                함께 사는 사람과 지원 사업에서 보는 가구원이 다를 수 있습니다. 생계급여의 보장가구와
                국민임대의 세대 구성 기준을 각각 공식 안내에서 확인해 주세요. 확인하지 않았다면
                체크하지 않아도 계산할 수 있습니다.
              </p>
              <p>가구원 수를 줄이면 뒤쪽 가구원의 입력 내용은 지워집니다.</p>
            </details>
            <details className="finance-details finance-guidance">
              <summary>어떤 기간의 금액을 입력하나요?</summary>
              <p>
                모든 소득을 최근 3개월로 맞추지 마세요. 지원 사업과 소득 종류에 따라 확인하는 자료와
                기간이 다릅니다.
              </p>
              <dl className="finance-guidance-list">
                <div>
                  <dt>상시근로소득</dt>
                  <dd>건강보험·국세청 등 공적 자료의 월 보수나 연간 소득을 확인합니다.</dd>
                </div>
                <div>
                  <dt>일용근로소득</dt>
                  <dd>기초생활보장 신청 조사는 최근 3개월, 확인 조사는 최근 6개월을 구분합니다.</dd>
                </div>
                <div>
                  <dt>연금</dt>
                  <dd>전월 지급액 등 해당 사업에서 정한 자료를 확인합니다.</dd>
                </div>
              </dl>
              <p>
                입력한 자료의 기간과 공고가 요구하는 조사 기간은 다를 수 있어요. 국민임대 등 개별
                공고의 기준도 확인해 주세요. 기준이 불확실하면 금액을 임의로 나누거나 평균 내지 말고
                모르는 항목으로 남겨 주세요.
              </p>
            </details>
            {draft.members.map((member, index) => (
              <fieldset className="finance-member" key={index}>
                <legend>가구원 {index + 1}</legend>
                <div className="finance-grid">
                  <AmountField
                    id={'finance-age-' + index}
                    label="만 나이"
                    unit="세"
                    value={member.age}
                    onChange={(value) => updateMember(index, 'age', value)}
                  />
                  <div className="finance-income-entry">
                    <AmountField
                      id={'finance-earned-' + index}
                      label="근로소득 (월·세전 기준)"
                      value={member.earned_income}
                      onChange={(value) => updateMember(index, 'earned_income', value)}
                      hint="세금·4대보험료를 떼기 전 금액"
                    />
                    {hasPositiveAmount(member.earned_income) && (
                      <SelectField
                        id={'finance-earned-basis-' + index}
                        label="입력한 근로소득의 기준"
                        value={member.earned_income_basis ?? 'unknown'}
                        onChange={(value) => updateMember(index, 'earned_income_basis', value)}
                        options={earnedIncomeBases}
                        hint={
                          member.earned_income_basis === 'net'
                            ? '실수령액을 세전 금액으로 자동 환산하지 않아요. 추가 확인이 필요합니다.'
                            : undefined
                        }
                      />
                    )}
                  </div>
                  <div className="finance-income-entry">
                    <AmountField
                      id={'finance-business-' + index}
                      label="사업소득 (월·경비 차감 후)"
                      value={member.business_income}
                      onChange={(value) => updateMember(index, 'business_income', value)}
                      hint="필요 경비를 빼고, 소득세·개인지방소득세를 빼기 전 금액"
                    />
                    {hasPositiveAmount(member.business_income) && (
                      <SelectField
                        id={'finance-business-basis-' + index}
                        label="입력한 사업소득의 기준"
                        value={member.business_income_basis ?? 'unknown'}
                        onChange={(value) => updateMember(index, 'business_income_basis', value)}
                        options={businessIncomeBases}
                        hint={
                          member.business_income_basis === 'revenue'
                            ? '매출액에서 경비를 임의로 빼지 않아요. 추가 확인이 필요합니다.'
                            : undefined
                        }
                      />
                    )}
                  </div>
                  <SelectField
                    id={'finance-deduction-' + index}
                    label="이 가구원의 공제 유형"
                    value={member.deduction}
                    onChange={(value) => updateMember(index, 'deduction', value)}
                    options={deductionTypes}
                  />
                </div>
                <details className="finance-details">
                  <summary>세전 금액과 공적 소득 자료가 다른가요?</summary>
                  <p>
                    세후 실수령액만 알고 있다면 금액을 입력한 뒤 ‘실수령액 (세후)’를 선택하세요.
                    세전 금액으로 추측해서 바꾸지 않습니다.
                  </p>
                  <p>
                    실제 심사에서는 공적 소득 자료를 사용하며 비과세 항목 등 반영 범위가 다를 수
                    있어요. 급여명세서의 총지급액이 모든 사업의 심사 소득과 같지는 않습니다.
                  </p>
                </details>
                <details className="finance-details" open={!easy}>
                  <summary>그 밖의 소득 입력</summary>
                  <div className="finance-grid">
                    <AmountField
                      id={'finance-other-' + index}
                      label="연금·임대·이자 등 기타소득 (월)"
                      value={member.other_income}
                      onChange={(value) => updateMember(index, 'other_income', value)}
                    />
                    <AmountField
                      id={'finance-transfer-' + index}
                      label="가족·지인에게 정기적으로 받는 돈 (월)"
                      value={member.private_transfer_income}
                      onChange={(value) => updateMember(index, 'private_transfer_income', value)}
                    />
                  </div>
                </details>
                <details className="finance-details">
                  <summary>공제 유형 선택 도움말</summary>
                  <p>
                    이 가구원 개인에게 해당하는 유형을 선택하세요. 학생·북한이탈주민 등의 특례는
                    자격과 적용 기간을 추가 확인해야 합니다. 확실하지 않으면 ‘모름’을 선택하세요.
                    금액을 직접 공제해서 입력하지 마세요.
                  </p>
                </details>
              </fieldset>
            ))}
            <label className="finance-check">
              <input
                type="checkbox"
                checked={draft.additional_review}
                onChange={(event) => update('additional_review', event.target.checked)}
              />
              다른 특례나 공제도 확인해야 해요
            </label>
            {easy && (
              <button className="button primary" type="submit">
                다음
                <Icon name="arrow" />
              </button>
            )}
          </section>
          <section className="finance-section" hidden={easy && step !== 1}>
            {heading(1)}
            <h3>가구 전체 재산</h3>
            <p className="finance-help">
              소유 주택과 전월세 보증금은 다른 항목입니다. 같은 금액을 두 번 입력하지 마세요.
            </p>
            <div className="finance-grid">
              <AmountField
                id="finance-housing"
                label="거주 중인 소유 주택"
                value={draft.assets.housing}
                onChange={(value) => updateGroup('assets', 'housing', value)}
                hint="실거래가가 아닌 시가표준액"
              />
              <AmountField
                id="finance-deposit"
                label="전월세 보증금"
                value={draft.assets.rental_deposit}
                onChange={(value) => updateGroup('assets', 'rental_deposit', value)}
                hint="계약서에 적힌 보증금"
              />
              <AmountField
                id="finance-general"
                label="기타 일반재산"
                value={draft.assets.general}
                onChange={(value) => updateGroup('assets', 'general', value)}
                hint="거주하지 않는 부동산 등 공적 평가액"
              />
              <AmountField
                id="finance-financial"
                label="금융재산"
                value={draft.assets.financial}
                onChange={(value) => updateGroup('assets', 'financial', value)}
                hint="예금·주식·보험 해약환급금 등"
              />
            </div>
            <h3>가구 전체 부채</h3>
            <div className="finance-grid">
              <AmountField
                id="finance-bank"
                label="금융기관 부채"
                value={draft.debts.bank}
                onChange={(value) => updateGroup('debts', 'bank', value)}
                hint="인정 가능한 대출의 남은 원금"
              />
              <AmountField
                id="finance-public"
                label="공공기관 부채"
                value={draft.debts.public}
                onChange={(value) => updateGroup('debts', 'public', value)}
                hint="인정 가능한 대출의 남은 원금"
              />
              <AmountField
                id="finance-other-debt"
                label="추가 확인이 필요한 부채"
                value={draft.debts.other}
                onChange={(value) => updateGroup('debts', 'other', value)}
              />
            </div>
            <details className="finance-details">
              <summary>어떤 부채를 어디에 입력하나요?</summary>
              <p>
                마이너스통장, 1년 이내 카드론, 기업대출, 개인 간 차용금은 ‘추가 확인이 필요한
                부채’에 입력하세요. 모든 부채가 재산에서 공제되는 것은 아닙니다. 공제 가능한 범위는
                담당 기관에서 확인해야 합니다.
              </p>
            </details>
            <h3>가구에서 보유하거나 빌려 쓰는 차량</h3>
            <SelectField
              id="finance-vehicle-status"
              label="차량 보유 여부"
              value={draft.vehicle_status}
              onChange={(value) =>
                change((current) => ({
                  ...current,
                  vehicle_status: value,
                  vehicles:
                    value === 'owned'
                      ? current.vehicles.length
                        ? current.vehicles
                        : [emptyVehicle()]
                      : [],
                }))
              }
              options={[
                ['unknown', '모름'],
                ['none', '없음'],
                ['owned', '있음'],
              ]}
            />
            {draft.vehicles.map((vehicle, index) => (
              <fieldset className="finance-member" key={index}>
                <legend>차량 {index + 1}</legend>
                <div className="finance-grid">
                  <SelectField
                    id={'finance-vehicle-owner-' + index}
                    label="차량 명의·계약 형태"
                    value={vehicle.ownership ?? 'unknown'}
                    onChange={(value) => updateVehicle(index, 'ownership', value)}
                    options={vehicleOwnerships}
                    hint={
                      vehicle.ownership === 'joint'
                        ? '공동명의여도 차량 전체 가액을 입력하세요. 지분 처리는 별도로 확인합니다.'
                        : ['leased', 'other'].includes(vehicle.ownership)
                          ? '소유 차량과 조건이 달라 해당 공고에서 별도로 확인해야 해요.'
                          : undefined
                    }
                  />
                  <SelectField
                    id={'finance-registration-' + index}
                    label="등록증상 영업용 여부"
                    value={vehicle.registration_use ?? 'unknown'}
                    onChange={(value) => updateVehicle(index, 'registration_use', value)}
                    options={vehicleRegistrationUses}
                    hint="사업자등록이 있다는 이유만으로 영업용 차량이 되지는 않아요."
                  />
                  <SelectField
                    id={'finance-vehicle-use-' + index}
                    label="실제 차량 사용 목적"
                    value={vehicle.use}
                    onChange={(value) => updateVehicle(index, 'use', value)}
                    options={vehicleUses}
                    hint="출퇴근에 쓰는 것만으로 생업용 특례를 적용하지 않아요."
                  />
                </div>
                <div className="finance-grid finance-vehicle-value">
                  <AmountField
                    id={'finance-vehicle-value-' + index}
                    label="차량 전체 가액"
                    value={vehicle.value}
                    onChange={(value) => updateVehicle(index, 'value', value)}
                    hint="구입 가격·중고 시세와 공고에서 쓰는 가액은 다를 수 있어요."
                  />
                  <SelectField
                    id={'finance-vehicle-value-basis-' + index}
                    label="차량 금액의 기준"
                    value={vehicle.value_basis ?? 'unknown'}
                    onChange={(value) => updateVehicle(index, 'value_basis', value)}
                    options={vehicleValueBases}
                  />
                </div>
                <details className="finance-details">
                  <summary>차량 가액은 어디서 확인하나요?</summary>
                  <p>
                    신청할 공고에서 지정한 차량가액 조회처와 기준일을 먼저 확인하세요. 현재 구입
                    가격이나 중고 시세만 안다면 해당 기준을 선택해 참고값으로 남길 수 있어요.
                  </p>
                  <p>
                    일부 LH 공고는 홈택스에서 차량가액을 조회하도록 안내합니다. 조회 금액과 실제
                    심사에 쓰는 개별 차량가액은 다를 수 있어요.
                  </p>
                  <div className="finance-help-links">
                    <a href="https://www.hometax.go.kr/" target="_blank" rel="noopener noreferrer">
                      홈택스에서 확인
                      <Icon name="external" size={17} />
                      <span className="sr-only">새 창</span>
                    </a>
                    <a
                      href="https://apply.lh.or.kr/lhapply/lhFile.do?fileid=68228411"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      LH 조회 안내 예시 (공고 31쪽)
                      <Icon name="external" size={17} />
                      <span className="sr-only">PDF 새 창</span>
                    </a>
                  </div>
                  <p>
                    영업용 등록, 실제 생업 사용, 장애인·국가유공자 사용은 서로 다른 정보입니다.
                    해당한다고 선택해도 재산에서 자동 제외하거나 특례를 확정하지 않습니다.
                  </p>
                </details>
                <details className="finance-details" open={!easy}>
                  <summary>차종·차량 제원·보조금 확인</summary>
                  <div className="finance-grid">
                    <SelectField
                      id={'finance-vehicle-kind-' + index}
                      label="차종"
                      value={vehicle.kind}
                      onChange={(value) => updateVehicle(index, 'kind', value)}
                      options={vehicleKinds}
                    />
                    <AmountField
                      id={'finance-cc-' + index}
                      label="배기량"
                      unit="cc"
                      value={vehicle.displacement_cc}
                      onChange={(value) => updateVehicle(index, 'displacement_cc', value)}
                    />
                    <AmountField
                      id={'finance-vehicle-age-' + index}
                      label="차령"
                      unit="년"
                      value={vehicle.age_years}
                      onChange={(value) => updateVehicle(index, 'age_years', value)}
                    />
                    <AmountField
                      id={'finance-seats-' + index}
                      label="승차 정원"
                      unit="명"
                      value={vehicle.seats}
                      onChange={(value) => updateVehicle(index, 'seats', value)}
                    />
                    <SelectField
                      id={'finance-vehicle-subsidy-' + index}
                      label="친환경차 구입 보조금"
                      value={vehicle.eco_subsidy ?? 'unknown'}
                      onChange={(value) => updateVehicle(index, 'eco_subsidy', value)}
                      options={vehicleSubsidies}
                      hint="전기·수소차 등 구입 때 받은 지원금. 받은 경우 차감 여부를 추가 확인해요."
                    />
                  </div>
                </details>
                {draft.vehicles.length > 1 && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      change((current) => ({
                        ...current,
                        vehicles: current.vehicles.filter((_, i) => i !== index),
                      }))
                    }
                  >
                    차량 {index + 1} 삭제
                  </button>
                )}
              </fieldset>
            ))}
            {draft.vehicle_status === 'owned' && (
              <button
                type="button"
                className="button secondary"
                disabled={draft.vehicles.length >= 10}
                onClick={() =>
                  change((current) => ({
                    ...current,
                    vehicles: [...current.vehicles, emptyVehicle()],
                  }))
                }
              >
                차량 추가
              </button>
            )}
            <div className="finance-actions">
              {easy && (
                <button type="button" className="button secondary" onClick={() => moveStep(0)}>
                  이전
                </button>
              )}
              <button className="button primary" type="submit">
                계산하기
                <Icon name="arrow" />
              </button>
            </div>
          </section>
        </fieldset>
      </form>
      <section className="finance-section finance-result-section" hidden={easy && step !== 2}>
        {heading(2)}
        {calculation ? (
          <ResultView calculation={calculation} onRecommend={onRecommend} easy={easy} />
        ) : (
          <div className="finance-empty">
            <Icon name="wallet" size={28} />
            <p>
              {busy === 'calculate'
                ? '입력한 정보로 계산하고 있습니다.'
                : '가구와 재산 정보를 입력한 뒤 계산하기를 눌러 주세요.'}
            </p>
            {error && (
              <button
                type="button"
                className="button primary"
                onClick={calculate}
                disabled={Boolean(busy)}
              >
                다시 계산하기
              </button>
            )}
          </div>
        )}
        {easy && (
          <button
            type="button"
            className="button secondary"
            onClick={() => moveStep(0)}
            disabled={Boolean(busy)}
          >
            입력 정보 수정
          </button>
        )}
      </section>
      <section className="finance-account">
        <h2>입력 정보 관리</h2>
        {user ? (
          <>
            <p>
              계정에 저장하면 다음에 불러와 계산할 수 있어요. 불러오기를 누르면 지금 입력한 내용이
              바뀝니다.
            </p>
            <label className="finance-check">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                disabled={Boolean(busy)}
              />
              이 정보를 내 계정에 저장
            </label>
            <div className="finance-actions">
              <button
                type="button"
                className="button primary"
                onClick={save}
                disabled={!consent || Boolean(busy)}
              >
                계정에 저장하기
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={load}
                disabled={Boolean(busy)}
              >
                저장한 정보 불러오기
              </button>
            </div>
            {confirmDelete ? (
              <div className="finance-delete-confirm">
                <p role="alert">
                  계정에 저장한 소득·재산 정보를 삭제할까요? 삭제하면 다시 입력해야 해요.
                </p>
                <div className="finance-actions">
                  <button
                    type="button"
                    className="button secondary"
                    disabled={Boolean(busy)}
                    onClick={() => setConfirmDelete(false)}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={Boolean(busy)}
                    onClick={removeSaved}
                  >
                    저장 정보 삭제하기
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="text-button"
                onClick={() => setConfirmDelete(true)}
                disabled={Boolean(busy)}
              >
                계정에 저장한 정보 삭제
              </button>
            )}
          </>
        ) : (
          <p>
            계산은 로그인 없이 할 수 있어요. <a href="#login">로그인</a>하면 계정에 저장할 수
            있습니다.
          </p>
        )}
        <button type="button" className="text-button" onClick={clearLocal}>
          이 화면의 입력 정보 지우기
        </button>
      </section>
    </section>
  );
}
