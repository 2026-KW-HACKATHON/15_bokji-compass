import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import { useRef, useState } from 'react';
import MemberProfileForm from '../auth/MemberProfileForm.jsx';
import { financeQuestions } from '../finance/financeFlow.js';
import { FinanceReview } from '../finance/FinanceFields.jsx';
import { appConfig } from '../../shared/config.js';
import Icon from '../../shared/ui/Icon.jsx';
import ProfileForm from './ProfileForm.jsx';
import { defaultProfile, memberRecommendationProfile } from './profileModel.js';
import {
  financeRows,
  financeInputStatus,
  mergeProfileCategory,
  profileCategories,
  profileRows,
  rowStatus,
} from './profileSummary.js';
import './profile.css';

const tabs = [{ id: 'overview', label: '전체 요약' }, ...profileCategories];

function Facts({ rows, onAdd }) {
  const { t } = useI18n();
  return (
    <dl className="profile-facts">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{t(label)}</dt>
          <dd>
            {value ??
              (onAdd ? (
                <button
                  type="button"
                  className="text-button"
                  onClick={onAdd}
                  aria-label={t('{label} 입력하기', { label: t(label) })}
                >
                  {t('미입력 · 추가하기 ')}
                  <Icon name="right" size={16} />
                </button>
              ) : (
                t('미입력')
              ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function ProfilePage({
  user,
  profile,
  remembered,
  easy,
  onSave,
  onMemberSaved,
  onClear,
  financialProfile,
  savedFinance,
  financialSession,
  onFinancialLoaded,
}) {
  const { t } = useI18n();
  const savedProfile = profile || (user ? memberRecommendationProfile(user) : defaultProfile);
  const [active, setActive] = useState('overview');
  const [editing, setEditing] = useState({});
  const [message, setMessage] = useState('');
  const storedFinance = savedFinance?.record;
  const financeState = savedFinance?.status ?? 'idle';
  const financeError = savedFinance?.error ?? '';
  const tabRefs = useRef({});
  const headingRefs = useRef({});
  const hasFinanceDraft = !financialProfile && financialSession?.dirty;
  const finance = financialProfile || (!hasFinanceDraft ? storedFinance?.profile : null);

  const financialStatus = finance
    ? financeInputStatus(finance)
    : hasFinanceDraft
      ? '작성 중'
      : !user
        ? '미입력'
        : ['idle', 'loading'].includes(financeState)
          ? '확인 중'
          : financeState === 'error'
            ? '확인 필요'
            : '미입력';
  const rowsOf = (id) => {
    const rows =
      id === 'finance'
        ? finance
          ? financeRows(finance)
          : []
        : profileRows(id, user, savedProfile);
    return rows.map(([label, value]) => {
      if (value == null || ['이름', '거주 주소', '우편번호'].includes(label)) return [label, value];
      if (label === '나이 (만 나이)') return [label, t('{age}세', { age: user.age })];
      if (label === '가구원') return [label, t('{count}명', { count: finance.household_size })];
      if (label === '차량' && finance?.vehicle_status === 'owned')
        return [label, t('{count}대', { count: finance.vehicles.length })];
      const counts = String(value).match(/^(\d+) \/ (\d+)개 항목 입력$/);
      if (counts)
        return [
          label,
          t('{filled} / {total}개 항목 입력', { filled: counts[1], total: counts[2] }),
        ];
      return [
        label,
        String(value)
          .split(' · ')
          .map((item) => t(item))
          .join(' · '),
      ];
    });
  };
  const statusOf = (id) => (id === 'finance' ? financialStatus : rowStatus(rowsOf(id)));
  function choose(id, focusHeading = false) {
    setActive(id);
    if (focusHeading) requestAnimationFrame(() => headingRefs.current[id]?.focus());
  }
  function tabKey(event, index) {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next == null) return;
    event.preventDefault();
    choose(tabs[next].id);
    tabRefs.current[tabs[next].id]?.focus();
  }
  function edit(id) {
    setMessage('');
    setEditing((previous) => ({ ...previous, [id]: true }));
    requestAnimationFrame(() =>
      document
        .querySelector(`#profile-panel-${id} input:not([readonly]), #profile-panel-${id} select`)
        ?.focus(),
    );
  }
  function closeEditor(id) {
    setEditing((previous) => ({ ...previous, [id]: false }));
    requestAnimationFrame(() => headingRefs.current[id]?.focus());
  }
  function saveCategory(id, draft, remember) {
    const stored = onSave(mergeProfileCategory(savedProfile, draft, id), remember);
    closeEditor(id);
    setMessage(
      stored === false
        ? '이번 방문에 사용할 정보를 저장했어요. 브라우저 저장 설정을 변경하지 못했어요.'
        : { category: profileCategories.find((category) => category.id === id).label },
    );
  }
  function financeLink() {
    if (storedFinance?.profile && !financialProfile && !hasFinanceDraft)
      onFinancialLoaded(storedFinance.profile);
  }

  return (
    <section className="profile-page profile-manager">
      <div className="page-heading">
        {!easy && <span className="eyebrow">{t('회원·추천 정보')}</span>}
        <h1>{t('내 정보')}</h1>
        <p>{t('입력한 정보를 확인하고, 필요한 항목만 추가하거나 수정해요.')}</p>
      </div>
      <div className="profile-tabs" role="tablist" aria-label={t('내 정보 카테고리')}>
        {tabs.map(({ id, label }, index) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`profile-tab-${id}`}
            aria-selected={active === id}
            aria-label={t(label)}
            aria-description={editing[id] ? t('저장 전 입력이 있어요.') : undefined}
            aria-controls={`profile-panel-${id}`}
            tabIndex={active === id ? 0 : -1}
            ref={(node) => {
              tabRefs.current[id] = node;
            }}
            onClick={() => choose(id)}
            onKeyDown={(event) => tabKey(event, index)}
          >
            {t(label)}
            {editing[id] && <span className="profile-draft-dot" aria-hidden="true" />}
          </button>
        ))}
      </div>
      {message && (
        <p className="notice-box profile-save-message" role="status">
          {typeof message === 'string'
            ? t(message)
            : t('{category} 저장이 완료됐어요.', { category: t(message.category) })}
        </p>
      )}
      <div
        role="tabpanel"
        id="profile-panel-overview"
        aria-labelledby="profile-tab-overview"
        hidden={active !== 'overview'}
        tabIndex={0}
      >
        <div className="profile-overview-heading">
          <h2>{t('입력한 정보 한눈에 보기')}</h2>
          <p>{t('카테고리를 선택하면 상세 정보를 볼 수 있어요. 모든 항목은 선택 사항이에요.')}</p>
        </div>
        <div className="profile-overview-grid">
          {profileCategories.map(({ id, label, icon, description }) => {
            const rows = rowsOf(id);
            const preview = rows
              .filter(([, value]) => value != null)
              .slice(0, 2)
              .map(([key, value]) => `${t(key)} · ${value}`)
              .join(' / ');
            return (
              <button
                key={id}
                type="button"
                className="profile-category-card"
                onClick={() => choose(id, true)}
                aria-label={t('{label} 상세 보기', { label: t(label) })}
              >
                <span className="profile-category-top">
                  <span className="profile-category-icon">
                    <Icon name={icon} size={22} />
                  </span>
                  <span
                    className={`profile-status ${statusOf(id) === '입력됨' ? 'is-filled' : ''}`}
                  >
                    {editing[id] ? t('저장 전') : t(statusOf(id))}
                  </span>
                </span>
                <strong>{t(label)}</strong>
                <span className="profile-category-description">{t(description)}</span>
                <span className="profile-category-preview">
                  {preview ||
                    (id === 'finance' && financialStatus !== '미입력'
                      ? {
                          '확인 중': t('계정에 저장된 정보를 확인하고 있어요.'),
                          '확인 필요': t('저장된 정보를 불러오지 못했어요.'),
                          '작성 중': t('계산기에서 입력을 이어갈 수 있어요.'),
                        }[financialStatus]
                      : t('아직 입력한 정보가 없어요.'))}
                </span>
                <span className="profile-category-link">
                  {t('정보 보기 ')}
                  <Icon name="right" size={17} />
                </span>
              </button>
            );
          })}
        </div>
        {!user && (
          <p className="profile-account-note">
            <Icon name="info" size={18} />
            <span>
              {t(
                '추천 정보는 로그인 없이 입력할 수 있어요. 회원 정보와 소득·재산을 계정에 저장하려면 로그인해 주세요.',
              )}{' '}
              <a className="text-button" href="#login?return=profile">
                {t('로그인')}
              </a>
            </span>
          </p>
        )}
      </div>
      {profileCategories.map(({ id, label, description }) => (
        <div
          key={id}
          role="tabpanel"
          id={`profile-panel-${id}`}
          aria-labelledby={`profile-tab-${id}`}
          hidden={active !== id}
          tabIndex={0}
        >
          <div className="profile-category-heading">
            <div>
              <h2
                tabIndex={-1}
                ref={(node) => {
                  headingRefs.current[id] = node;
                }}
              >
                {t(label)}
              </h2>
              <p>{t(description)}</p>
            </div>
            {!editing[id] && id !== 'finance' && (
              <button type="button" className="button secondary" onClick={() => edit(id)}>
                {t(statusOf(id) === '미입력' ? '{label} 추가' : '{label} 수정', {
                  label: t(label),
                })}
              </button>
            )}
          </div>
          {id === 'finance' ? (
            <div className="profile-form profile-finance-card">
              {finance ? (
                <>
                  <Facts rows={rowsOf(id)} />
                  <details className="profile-finance-details">
                    <summary>{t('입력한 소득·재산 상세 보기')}</summary>
                    <FinanceReview draft={finance} questions={financeQuestions(finance)} />
                  </details>
                  <p className="field-hint">
                    {t(
                      '입력한 정보 기준이에요. 모르는 금액은 ‘확인 필요’로 표시해요. 계정 저장은 계산기에서 동의 후 진행할 수 있어요.',
                    )}
                  </p>
                </>
              ) : (
                <div className="profile-finance-empty">
                  <Icon name="wallet" size={32} />
                  <h3>
                    {hasFinanceDraft
                      ? t('작성 중인 정보가 있어요')
                      : financialStatus === '확인 중'
                        ? t('저장된 정보를 확인하고 있어요')
                        : financialStatus === '확인 필요'
                          ? t('저장된 정보를 확인하지 못했어요')
                          : t('소득·재산 정보를 추가해 보세요')}
                  </h3>
                  <p>
                    {hasFinanceDraft
                      ? t('계산기에서 작성하던 내용을 이어서 입력할 수 있어요.')
                      : t('가구원별 소득과 재산을 차례로 입력하고 계산할 수 있어요.')}
                  </p>
                </div>
              )}
              {financeError && (
                <div className="profile-finance-error" role="status">
                  <p>{t(financeError)}</p>
                  <button type="button" className="text-button" onClick={savedFinance?.retry}>
                    {t('다시 불러오기')}
                  </button>
                </div>
              )}
              <a className="button primary" href="#calculator-details" onClick={financeLink}>
                <Icon name="calculator" />
                {finance
                  ? t('계산기에서 확인·수정')
                  : hasFinanceDraft
                    ? t('계산기에서 이어서 입력')
                    : t('소득·재산 입력하기')}
              </a>
            </div>
          ) : editing[id] ? (
            <>
              {id === 'basic' && user ? (
                <>
                  <MemberProfileForm
                    user={user}
                    onCancel={() => closeEditor(id)}
                    onSaved={(current) => {
                      onMemberSaved(current);
                      closeEditor(id);
                      setMessage('기본 정보를 저장했어요.');
                    }}
                  />
                  <details className="profile-recommendation-options">
                    <summary>{t('추천에 사용할 지역·연령대 별도로 설정')}</summary>
                    <p className="field-hint">
                      {t('회원 정보와 다른 기준으로 공고를 추천받고 싶을 때 설정해요.')}
                    </p>
                    <ProfileForm
                      profile={savedProfile}
                      remembered={remembered}
                      easy={easy}
                      mode={appConfig.dataMode}
                      section="basic"
                      onCancel={() => closeEditor(id)}
                      onSave={(draft, remember) => saveCategory(id, draft, remember)}
                    />
                  </details>
                </>
              ) : (
                <ProfileForm
                  profile={savedProfile}
                  remembered={remembered}
                  easy={easy}
                  mode={appConfig.dataMode}
                  section={id}
                  onCancel={() => closeEditor(id)}
                  onSave={(draft, remember) => saveCategory(id, draft, remember)}
                />
              )}
            </>
          ) : (
            <div className="profile-form profile-readonly-card">
              <Facts rows={rowsOf(id)} onAdd={() => edit(id)} />
              {id === 'basic' && user && (
                <p className="field-hint">
                  {t('아이디 · ')}
                  {user.username || t('카카오 계정')}
                  {t(' / 회원 정보는 계정에 저장돼요.')}
                </p>
              )}
              {id !== 'basic' || !user ? (
                <p className="field-hint">
                  {remembered
                    ? t('이 브라우저에 저장된 추천 정보예요.')
                    : t(
                        '이번 방문에 사용할 추천 정보예요. 수정할 때 브라우저 저장 여부를 선택할 수 있어요.',
                      )}
                </p>
              ) : null}
            </div>
          )}
        </div>
      ))}
      {profile && active === 'overview' && (
        <div className="profile-manage-footer">
          <span>{t('추천 설정을 지우면 회원 정보와 소득·재산은 유지돼요.')}</span>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              onClear();
              setMessage('맞춤 추천 설정을 지웠어요.');
            }}
          >
            {t('맞춤 추천 설정 지우기')}
          </button>
        </div>
      )}
    </section>
  );
}
