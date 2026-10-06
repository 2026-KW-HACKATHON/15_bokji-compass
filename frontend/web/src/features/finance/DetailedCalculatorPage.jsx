import { useEffect, useRef, useState } from 'react';
import Icon from '../../shared/ui/Icon.jsx';
import { appConfig } from '../../shared/config.js';
import { createFinanceApi } from './financeApi.js';
import {
  emptyFinancialProfile,
  emptyMember,
  emptyVehicle,
  MAX_HOUSEHOLD_SIZE,
  toFinancialProfile,
} from './financeModel.js';
import { financeGroups, financeQuestions, validateQuestion } from './financeFlow.js';
import { QuestionFields, FinanceReview } from './FinanceFields.jsx';
import FinanceResult from './FinanceResult.jsx';
import { financialDraftDefaults } from './financePrefill.js';
import './calculator.css';

const api = createFinanceApi({ baseUrl: appConfig.apiBaseUrl });

function groupedQuestions(questions) {
  const sections = [];
  for (const question of questions) {
    const section = { id: question.group, title: `${financeGroups[question.group]} 정보` };
    const previous = sections.at(-1);
    if (previous?.id === section.id) previous.questions.push(question);
    else sections.push({ ...section, questions: [question] });
  }
  return sections;
}

function questionHeading(question) {
  if (question.id === 'household') return '거주 지역과 가구원';
  if (question.id === 'household-details') return '가구 특성';
  if (question.id === 'assets-home') return '주택과 보증금';
  if (question.id === 'assets-other') return '그 밖의 재산';
  const suffix = question.id.split('-').at(-1);
  const entry = question.id.match(/^(member|vehicle)-(\d+)-/);
  const prefix = entry
    ? `${entry[1] === 'member' ? '가구원' : '차량'} ${Number(entry[2]) + 1} · `
    : '';
  return (
    prefix +
    ({
      basic: '나이·공제 유형',
      earned: '근로소득',
      business: '사업소득',
      other: '그 밖의 소득',
      use: '명의와 사용 목적',
      value: '차량 가액',
      spec: '차량 제원과 보조금',
    }[suffix] ?? question.title)
  );
}

export default function DetailedCalculatorPage({
  easy,
  user,
  profile,
  recommendation,
  quickDraft,
  useQuickHousehold,
  prefill,
  onAccountMutation,
  initialMessage = '',
  accountWriting = false,
  onSavedRecord,
  session,
  onSessionChange,
  onProfileChange,
  onRecommend,
}) {
  const useSession = session && (session.edited ?? session.mode !== 'start');
  const [draft, setDraft] = useState(() =>
    structuredClone(
      (useSession ? session.draft : null) ??
        financialDraftDefaults({
          user,
          recommendation,
          saved: profile,
          quick: quickDraft,
          useQuickHousehold,
        }),
    ),
  );
  const [mode, setMode] = useState(
    useSession ? session.mode : profile ? 'review' : (session?.mode ?? 'start'),
  );
  const [step, setStep] = useState(session?.step ?? 'household');
  const [calculation, setCalculation] = useState(session?.calculation ?? null);
  const [consent, setConsent] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState(initialMessage);
  const request = useRef(null);
  const revision = useRef(0);
  const heading = useRef(null);
  const errorRef = useRef(null);
  const memberCache = useRef(session?.memberCache ?? []);
  const vehicleCache = useRef(session?.vehicleCache ?? []);
  const edited = useRef(
    session?.edited ?? Boolean(profile || (session && session.mode !== 'start')),
  );
  const lastPrefill = useRef(profile);
  const dirty = useRef(session?.dirty ?? false);
  useEffect(() => {
    if (!profile || profile === lastPrefill.current || edited.current) return;
    lastPrefill.current = profile;
    edited.current = true;
    setDraft(
      financialDraftDefaults({
        user,
        recommendation,
        saved: profile,
        quick: quickDraft,
        useQuickHousehold,
      }),
    );
    setMode('review');
    setCalculation(null);
    setMessage('저장된 소득·재산 정보를 미리 채웠어요. 바뀐 항목만 확인해 주세요.');
  }, [profile, user, recommendation, quickDraft, useQuickHousehold]);
  const questions = financeQuestions(draft);
  const currentIndex = Math.max(
    0,
    questions.findIndex((question) => question.id === step),
  );
  const current = questions[currentIndex];
  const sections = groupedQuestions(questions);
  const sectionIndex = Math.max(
    0,
    sections.findIndex((section) => section.questions.some((question) => question.id === step)),
  );
  const currentSection = sections[sectionIndex];
  const editing = mode === 'edit';
  const group = mode === 'review' || mode === 'result' ? 5 : current.group;

  useEffect(() => {
    onSessionChange({
      draft,
      mode,
      step,
      calculation,
      edited: edited.current,
      dirty: dirty.current,
      memberCache: memberCache.current,
      vehicleCache: vehicleCache.current,
    });
  }, [draft, mode, step, calculation, onSessionChange]);
  useEffect(
    () => () => {
      revision.current += 1;
      request.current?.abort();
    },
    [],
  );

  function focusHeading() {
    requestAnimationFrame(() => {
      heading.current?.focus();
      heading.current?.scrollIntoView({ block: 'start' });
    });
  }
  function move(nextMode, nextStep = step) {
    setMode(nextMode);
    setStep(nextStep);
    setError('');
    setMessage('');
    focusHeading();
  }
  function showError(text, field) {
    setError(text);
    requestAnimationFrame(() => {
      const input =
        field &&
        (document.getElementById(`${field}-count`) ??
          document.getElementById(`${field}-exact`) ??
          document.getElementById(field) ??
          document.getElementById(`${field}-presence`));
      (input ?? errorRef.current)?.focus();
      (input ?? errorRef.current)?.scrollIntoView({ block: 'center' });
    });
  }
  function change(next) {
    edited.current = true;
    dirty.current = true;
    setDraft(next);
    setCalculation(null);
    setError('');
    setMessage('');
    setConfirmDelete(false);
    onProfileChange(null);
  }
  function update(path, value) {
    const next = structuredClone(draft);
    if (path === 'household_size') {
      const count = Number(value);
      draft.members.forEach((member, index) => {
        memberCache.current[index] = member;
      });
      next.household_size = count;
      if (!Number.isInteger(count) || count < 1 || count > MAX_HOUSEHOLD_SIZE) {
        next.household_size = value;
        change(next);
        return;
      }
      next.members = Array.from(
        { length: count },
        (_, index) => draft.members[index] ?? memberCache.current[index] ?? emptyMember(),
      );
      change(next);
      if (count < draft.members.length)
        setMessage('줄어든 가구원은 계산에서 제외했어요. 다시 늘리면 작성한 내용이 복구됩니다.');
      return;
    }
    if (path === 'vehicle_status') {
      if (draft.vehicles.length) vehicleCache.current = draft.vehicles;
      next.vehicle_status = value;
      next.vehicles =
        value === 'owned'
          ? draft.vehicles.length
            ? draft.vehicles
            : vehicleCache.current.length
              ? vehicleCache.current
              : [emptyVehicle()]
          : [];
      change(next);
      if (draft.vehicles.length && value !== 'owned')
        setMessage(
          '차량 상세 정보는 계산에서 제외했어요. 다시 ‘있음’을 선택하면 작성한 내용이 복구됩니다.',
        );
      return;
    }
    const keys = path.split('.');
    const key = keys.pop();
    const target = keys.reduce((object, part) => object[part], next);
    target[key] = value;
    change(next);
  }
  function addVehicle() {
    if (draft.vehicles.length < 10)
      change({ ...draft, vehicles: [...draft.vehicles, emptyVehicle()] });
  }
  function removeVehicle(index) {
    change({ ...draft, vehicles: draft.vehicles.filter((_, i) => i !== index) });
    setMessage('차량을 목록에서 삭제했어요. 계산에는 남아 있는 차량만 포함됩니다.');
  }
  function validateAll() {
    for (const question of questions) {
      const issue = validateQuestion(question, draft);
      if (issue) {
        setMode('edit');
        showError(issue.message, issue.field);
        return null;
      }
    }
    try {
      return toFinancialProfile(draft);
    } catch (err) {
      setMode('edit');
      showError(err.message);
      return null;
    }
  }
  function next() {
    for (const question of currentSection.questions) {
      const issue = validateQuestion(question, draft);
      if (issue) return showError(issue.message, issue.field);
    }
    if (sectionIndex < sections.length - 1)
      move('wizard', sections[sectionIndex + 1].questions[0].id);
    else if (validateAll()) move('review');
  }
  function edit(questionId) {
    move('edit');
    if (questionId)
      requestAnimationFrame(() => {
        const target = document.getElementById(`question-${questionId}`);
        target?.focus();
        target?.scrollIntoView({ block: 'start' });
      });
  }
  async function perform(kind, action) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const currentRevision = ++revision.current;
    setBusy(kind);
    setError('');
    setMessage('');
    try {
      const apply = await action(controller.signal);
      if (currentRevision === revision.current && !controller.signal.aborted) apply?.();
    } catch (err) {
      if (currentRevision === revision.current && !controller.signal.aborted)
        showError(err.message);
    } finally {
      if (currentRevision === revision.current) setBusy('');
    }
  }
  function calculate() {
    const raw = validateAll();
    if (!raw) return;
    edited.current = true;
    dirty.current = false;
    onProfileChange(raw);
    setCalculation(null);
    move('result');
    perform('calculate', async (signal) => {
      const result = await api.calculate(raw, { signal });
      return () => {
        setCalculation(result);
        focusHeading();
      };
    });
  }
  function applySaved(saved, nextMode) {
    edited.current = true;
    dirty.current = false;
    onSavedRecord?.(saved);
    onProfileChange(saved.profile);
    setDraft(saved.profile);
    memberCache.current = [];
    vehicleCache.current = [];
    setCalculation(saved.calculation);
    move(nextMode, 'household');
  }
  function save() {
    const raw = validateAll();
    if (!raw || !user || !consent) return;
    const complete = onAccountMutation?.('save');
    if (onAccountMutation && !complete) return;
    perform('save', async () => {
      let saved;
      try {
        // Account writes finish across navigation; only the screen response is cancelled.
        saved = await api.saveProfile(raw, { consent });
        complete?.(saved);
      } catch (error) {
        complete?.();
        throw error;
      }
      return () => {
        applySaved(saved, 'result');
        setMessage('계정에 저장했습니다.');
      };
    });
  }
  function load() {
    if (!user) return;
    perform('load', async (signal) => {
      const saved = await api.getProfile({ signal });
      if (!saved.profile)
        return () => {
          onSavedRecord?.(saved);
          setMessage('계정에 저장한 정보가 없습니다. 지금 입력한 내용은 그대로 유지합니다.');
        };
      return () => {
        applySaved(saved, 'review');
        setConsent(false);
        setMessage('계정에 저장된 정보를 불러왔습니다. 입력 내용을 확인하거나 수정해 주세요.');
      };
    });
  }
  function reset() {
    edited.current = true;
    dirty.current = false;
    memberCache.current = [];
    vehicleCache.current = [];
    setDraft(emptyFinancialProfile());
    setCalculation(null);
    setConsent(false);
    setConfirmDelete(false);
    onProfileChange(null);
    move('start', 'household');
  }
  function clearLocal() {
    revision.current += 1;
    request.current?.abort();
    setBusy('');
    reset();
    setMessage('이 화면의 입력 정보를 지웠습니다.');
  }
  function removeSaved() {
    const complete = onAccountMutation?.('delete');
    if (onAccountMutation && !complete) return;
    perform('delete', async () => {
      try {
        await api.deleteProfile();
        complete?.(null);
      } catch (error) {
        complete?.();
        throw error;
      }
      return () => {
        reset();
        setMessage('계정에 저장한 소득·재산 정보를 삭제했습니다.');
      };
    });
  }
  const title =
    {
      start: '6단계로 소득·재산 정보를 입력해요',
      review: '계산 전에 입력 내용을 확인해 주세요',
      edit: '입력 정보 수정',
      result: '계산 결과',
    }[mode] ?? currentSection.title;

  return (
    <section className={`calculator-page finance-mode-${mode}`}>
      <div className="page-heading">
        <span className="eyebrow">2026년 기준</span>
        <h1>소득·재산 상세 계산</h1>
        <p>회원가입 없이 계산할 수 있습니다. 모르는 항목은 ‘확인 필요’로 남길 수 있습니다.</p>
        <a className="text-button calculator-entry" href="#calculator">
          <Icon name="calculator" /> 중위소득 빠르게 확인하기
        </a>
      </div>
      {profile && (
        <p className="finance-intro">소득·재산 정보를 미리 채웠어요. 바뀐 항목만 수정해 주세요.</p>
      )}
      {!profile && user && (
        <p className="finance-intro">
          회원 정보의 지역과 나이를 미리 반영했어요. 가구원 1은 본인 기준으로 확인하고, 다른
          가구원의 정보만 추가해 주세요.
        </p>
      )}
      {prefill?.status === 'error' && (
        <div className="notice-box" role="status">
          <p>저장 정보를 불러오지 못했어요. 현재 입력은 유지됩니다.</p>
          <button type="button" className="text-button" onClick={prefill.retry}>
            저장 정보 다시 불러오기
          </button>
        </div>
      )}
      {mode === 'start' && (
        <div className="finance-intro">
          <Icon name="shield" />
          <p>계산할 때 입력 정보를 서버로 보냅니다. 계정에는 별도 동의한 경우에만 저장합니다.</p>
        </div>
      )}
      {mode !== 'start' && mode !== 'edit' && (
        <div className="finance-progress-wrap">
          {easy && (
            <p className="finance-progress-current">
              <span>
                {group + 1} / {financeGroups.length} 단계
              </span>
              <strong>{financeGroups[group]}</strong>
            </p>
          )}
          <ol className="finance-progress" aria-label="계산 단계">
            {financeGroups.map((name, index) => (
              <li key={name} aria-current={group === index ? 'step' : undefined}>
                <span>{index + 1}</span>
                {name}
              </li>
            ))}
          </ol>
        </div>
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
                delete: '저장 정보를 삭제하고 있습니다…',
              }[busy]
            }
          </p>
        )}
      </div>
      <h2 className="finance-screen-title" ref={heading} tabIndex={-1}>
        {title}
      </h2>
      {mode === 'start' && (
        <section className="finance-section finance-start">
          <p>가구 → 소득 → 재산 → 부채 → 차량 순서로 입력한 뒤, 전체 내용을 확인합니다.</p>
          <p className="finance-help">
            금액은 만원 단위입니다. 보증금 500만 원은 500으로 입력하세요.
          </p>
          <p className="finance-help">
            {easy
              ? '없는 금액은 ‘없음 (0원)’, 아직 모르는 금액은 ‘모름 · 확인 필요’를 선택하세요.'
              : '없는 금액은 ‘없어요’, 모르는 금액은 ‘모르겠어요’를 선택하세요.'}
          </p>
          <p className="finance-help">
            다른 메뉴에서도 이어서 입력할 수 있습니다. 새로고침하거나 로그아웃하면 저장하지 않은
            입력은 사라집니다.
          </p>
          <button
            type="button"
            className="button primary"
            disabled={Boolean(busy)}
            onClick={() => move('wizard', 'household')}
          >
            처음 계산하기
            <Icon name="arrow" />
          </button>
          {user && (
            <button
              type="button"
              className="button secondary"
              disabled={Boolean(busy)}
              onClick={load}
            >
              저장한 정보 불러오기
            </button>
          )}
        </section>
      )}
      {(mode === 'wizard' || editing) && (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (busy) return;
            if (editing) {
              if (validateAll()) move('review');
            } else next();
          }}
        >
          <fieldset className="finance-form-fields" disabled={Boolean(busy)}>
            {editing && (
              <div className="finance-edit-guide">
                <p>바뀐 항목만 수정하세요. 수정 후에는 입력 내용을 확인하고 다시 계산해 주세요.</p>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => move('wizard', 'household')}
                >
                  단계별로 수정하기
                </button>
              </div>
            )}
            {(editing ? questions : currentSection.questions).map((question) => (
              <section
                className="finance-section finance-question"
                key={question.id}
                aria-label={question.title}
              >
                {(editing || currentSection.questions.length > 1) && (
                  <h3 id={`question-${question.id}`} tabIndex={-1}>
                    {easy && !editing ? questionHeading(question) : question.title}
                  </h3>
                )}
                <QuestionFields
                  question={question}
                  draft={draft}
                  onChange={update}
                  onAddVehicle={addVehicle}
                  onRemoveVehicle={removeVehicle}
                  easy={easy}
                />
              </section>
            ))}
            <div className="finance-actions finance-step-actions">
              {!editing && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() =>
                    sectionIndex
                      ? move('wizard', sections[sectionIndex - 1].questions[0].id)
                      : move('start')
                  }
                >
                  이전
                </button>
              )}
              <button className="button primary" type="submit">
                {editing || sectionIndex === sections.length - 1 ? '입력 내용 확인' : '다음'}
                <Icon name="arrow" />
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {mode === 'review' && (
        <section className="finance-section">
          <p className="finance-help">
            ‘확인 필요’인 정보는 0원으로 계산하지 않습니다. 결과에서 추가 확인할 항목을 안내합니다.
          </p>
          <fieldset className="finance-form-fields" disabled={Boolean(busy)}>
            <div className="finance-actions">
              <button type="button" className="button secondary" onClick={() => edit()}>
                전체 정보 수정
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => move('wizard', questions[questions.length - 1].id)}
              >
                이전 단계
              </button>
            </div>
            <FinanceReview questions={questions} sections={sections} draft={draft} onEdit={edit} />
            <div className="finance-actions finance-step-actions">
              <button type="button" className="button primary" onClick={calculate}>
                계산하기
                <Icon name="arrow" />
              </button>
            </div>
          </fieldset>
        </section>
      )}
      {mode === 'result' && (
        <section className="finance-section finance-result-section">
          {calculation ? (
            <FinanceResult calculation={calculation} onRecommend={onRecommend} easy={easy} />
          ) : (
            <div className="finance-empty">
              <Icon name="wallet" size={28} />
              <p>
                {busy === 'calculate'
                  ? '입력한 정보로 계산하고 있습니다.'
                  : '계산을 완료하지 못했어요. 입력 정보는 그대로 유지됩니다.'}
              </p>
              {!busy && (
                <button type="button" className="button primary" onClick={calculate}>
                  다시 계산하기
                </button>
              )}
            </div>
          )}
          <button
            type="button"
            className="button secondary"
            disabled={Boolean(busy)}
            onClick={() => edit()}
          >
            입력 정보 수정
          </button>
        </section>
      )}
      <section className="finance-account" hidden={mode === 'start' || mode === 'wizard'}>
        <h2>입력 정보 관리</h2>
        {accountWriting && !busy && <p role="status">계정의 저장·삭제 처리를 기다리고 있어요.</p>}
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
                disabled={!consent || Boolean(busy) || accountWriting}
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
                    disabled={Boolean(busy) || accountWriting}
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
                disabled={Boolean(busy) || accountWriting}
              >
                계정에 저장한 정보 삭제
              </button>
            )}
          </>
        ) : (
          <p>
            계산은 로그인 없이 할 수 있어요. <a href="#login?return=calculator-details">로그인</a>
            하면 계정에 저장할 수 있습니다.
          </p>
        )}
        <button type="button" className="text-button" onClick={clearLocal}>
          이 화면의 입력 정보 지우기
        </button>
      </section>
    </section>
  );
}
