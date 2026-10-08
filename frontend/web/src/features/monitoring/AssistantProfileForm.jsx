import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import Icon from '../../shared/ui/Icon.jsx';
import { categories } from '../policies/policyModel.js';
import { households } from '../profile/profileModel.js';
import EconomicActivityFields from '../profile/EconomicActivityFields.jsx';
import { householdLabel } from '../profile/economicActivityModel.js';
import { disasterTypes, housingTenures, housingTypes, todayInSeoul } from './monitoringModel.js';
import './assistant-profile-form.css';

export function AssistantMemberSummary({ user, onProfile }) {
  const { t } = useI18n();
  return (
    <div className="assistant-member-summary">
      <dl>
        <div>
          <dt>{t('나이')}</dt>
          <dd>{user?.age == null ? t('미입력') : t('{age}세', { age: user.age })}</dd>
        </div>
        <div>
          <dt>{t('거주 지역')}</dt>
          <dd>{t(user?.region || '미입력')}</dd>
        </div>
      </dl>
      <a
        className="text-button"
        href="#profile"
        onClick={
          onProfile
            ? (event) => {
                event.preventDefault();
                onProfile();
              }
            : undefined
        }
      >
        {t('회원 정보에서 수정')}
      </a>
    </div>
  );
}

export default function AssistantProfileForm({
  user,
  draft,
  setDraft,
  enabled,
  setEnabled,
  consent,
  setConsent,
  busy,
  error,
  onSubmit,
  onCancel,
  onProfile,
}) {
  const { t } = useI18n();
  const prefix = useId();
  const heading = useRef(null);
  const errorRef = useRef(null);
  const [housingOpen, setHousingOpen] = useState(() =>
    ['housing_tenure', 'housing_type', 'building_year', 'repair_needed'].some(
      (key) => draft[key] != null,
    ),
  );
  const [damageOpen, setDamageOpen] = useState(() =>
    ['disaster_type', 'disaster_damage', 'disaster_occurred_on'].some((key) => draft[key] != null),
  );
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const id = (name) => `${prefix}-${name}`;
  const update = (name, value) => setDraft((current) => ({ ...current, [name]: value }));

  function select(name, label, options, boolean = false) {
    return (
      <label className="field-label" htmlFor={id(name)}>
        {t(label)}
        <select
          id={id(name)}
          value={draft[name] == null ? '' : String(draft[name])}
          onChange={(event) =>
            update(
              name,
              event.target.value === ''
                ? null
                : boolean
                  ? event.target.value === 'true'
                  : event.target.value,
            )
          }
        >
          <option value="">{t('선택하지 않음')}</option>
          {options.map(([value, text]) => (
            <option key={String(value)} value={String(value)}>
              {t(text)}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <form className="assistant-profile-form" onSubmit={onSubmit} aria-labelledby={id('heading')}>
      <header className="assistant-profile-form-heading">
        <h3 id={id('heading')} ref={heading} tabIndex={-1}>
          {t('나에게 맞는 지원을 위한 정보')}
        </h3>
        <p>{t('아는 항목만 선택해 주세요. 모르는 정보는 비워 두어도 괜찮아요.')}</p>
      </header>
      <AssistantMemberSummary user={user} onProfile={onProfile} />
      <p className="assistant-profile-account-note">
        {t('나이와 지역을 바꾸려면 회원 정보로 이동해요. 작성 중인 내용은 먼저 저장해 주세요.')}
      </p>
      {error && (
        <div ref={errorRef} tabIndex={-1} className="notice-box monitoring-error" role="alert">
          {t(error)}
          {error.includes('로그인 상태') && (
            <a href="#login?return=assistant" className="text-button">
              {t('로그인하기')}
            </a>
          )}
        </div>
      )}
      <fieldset disabled={!!busy} className="assistant-profile-section">
        <legend>{t('기본 생활정보')}</legend>
        <div className="assistant-profile-grid">
          <EconomicActivityFields
            value={draft.occupation}
            onChange={(value) => update('occupation', value)}
          />
          {select(
            'household',
            '가구 구성',
            households.slice(1).map((value) => [value, householdLabel(value)]),
          )}
          {select(
            'job_seeking',
            '구직 상태',
            [
              [true, '구직 중'],
              [false, '구직 활동 없음'],
            ],
            true,
          )}
        </div>
      </fieldset>
      <fieldset disabled={!!busy} className="assistant-profile-section">
        <legend>{t('관심 있는 지원')}</legend>
        <p className="assistant-profile-help">
          {t('여러 개를 선택해도 좋아요. 나중에 바꿀 수 있어요.')}
        </p>
        <div className="assistant-profile-interests">
          {categories.slice(1).map((category) => (
            <label key={category}>
              <input
                type="checkbox"
                checked={draft.interests.includes(category)}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    interests: event.target.checked
                      ? [...current.interests, category]
                      : current.interests.filter((item) => item !== category),
                  }))
                }
              />
              <span>
                <Icon name="check" size={16} />
                {t(category)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="assistant-profile-optional">
        <p>{t('필요한 정보가 더 있다면 함께 입력해 주세요.')}</p>
        <details open={housingOpen} onToggle={(event) => setHousingOpen(event.currentTarget.open)}>
          <summary>
            <span>
              <Icon name="house" size={20} />
              {t('주거 정보')}
            </span>
            <span>
              {t('선택')} <Icon name="down" size={18} />
            </span>
          </summary>
          <fieldset disabled={!!busy}>
            <legend className="sr-only">{t('주거 정보')}</legend>
            <div className="assistant-profile-grid">
              {select('housing_tenure', '현재 주택의 소유·거주 형태', housingTenures)}
              {select('housing_type', '주택 종류', housingTypes)}
              <label className="field-label" htmlFor={id('building_year')}>
                {t('주택 준공연도')}
                <input
                  id={id('building_year')}
                  type="number"
                  inputMode="numeric"
                  min="1800"
                  max={todayInSeoul().slice(0, 4)}
                  step="1"
                  value={draft.building_year ?? ''}
                  onChange={(event) =>
                    update(
                      'building_year',
                      event.target.value === '' ? null : Number(event.target.value),
                    )
                  }
                />
                <small>{t('모르면 비워 두세요.')}</small>
              </label>
              {select(
                'repair_needed',
                '주택 수리가 필요한가요?',
                [
                  [true, '수리가 필요함'],
                  [false, '필요하지 않음'],
                ],
                true,
              )}
            </div>
          </fieldset>
        </details>
        <details open={damageOpen} onToggle={(event) => setDamageOpen(event.currentTarget.open)}>
          <summary>
            <span>
              <Icon name="shield" size={20} />
              {t('최근 피해 정보')}
            </span>
            <span>
              {t('선택')} <Icon name="down" size={18} />
            </span>
          </summary>
          <fieldset disabled={!!busy}>
            <legend className="sr-only">{t('최근 피해 정보')}</legend>
            <p className="assistant-profile-help">
              {t('직접 겪은 피해만 알려주세요. 지역의 재난 발생만으로 피해를 판단하지 않아요.')}
            </p>
            <div className="assistant-profile-grid">
              {select(
                'disaster_damage',
                '내 재난 피해 여부',
                [
                  [true, '피해 있음'],
                  [false, '피해 없음'],
                ],
                true,
              )}
              {select('disaster_type', '재난 종류', disasterTypes)}
              <label className="field-label" htmlFor={id('disaster_occurred_on')}>
                {t('피해 발생일')}
                <input
                  id={id('disaster_occurred_on')}
                  type="date"
                  max={todayInSeoul()}
                  value={draft.disaster_occurred_on || ''}
                  onChange={(event) => update('disaster_occurred_on', event.target.value || null)}
                />
              </label>
            </div>
          </fieldset>
        </details>
      </div>
      <fieldset disabled={!!busy} className="assistant-profile-permissions">
        <legend className="sr-only">{t('정보 저장과 안내 설정')}</legend>
        <label className="assistant-profile-watch">
          <span>
            <strong>{t('새 공고도 계속 알려받기')}</strong> <small>{t('선택')}</small>
            <span>{t('저장한 정보로 새 공고를 확인하고, 이 화면에서 알려드려요.')}</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            aria-label={t('새 공고도 계속 알려받기 (선택)')}
          />
        </label>
        <label className="assistant-profile-consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />
          <span>{t('생활정보를 내 계정에 저장하고 지속 복지 안내에 사용하는 데 동의해요.')}</span>
        </label>
        <p className="assistant-profile-help">
          {t('저장한 정보는 언제든 수정하거나 삭제할 수 있어요.')}
        </p>
      </fieldset>
      <div className="assistant-profile-actions">
        <button type="submit" className="button primary" disabled={!!busy || !consent}>
          {busy === 'save'
            ? t('저장 중…')
            : enabled
              ? t('저장하고 지원 찾기')
              : t('내 정보 저장하기')}
        </button>
        <button type="button" className="text-button" disabled={!!busy} onClick={onCancel}>
          {t('취소')}
        </button>
      </div>
    </form>
  );
}
