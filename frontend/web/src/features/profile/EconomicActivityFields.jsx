import { useId, useState } from 'react';
import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import {
  economicActivityGroup,
  economicActivityGroups,
  legacyActivityGroup,
  legacyOccupation,
  occupationForGroup,
  occupationLabel,
} from './economicActivityModel.js';

export default function EconomicActivityFields({ value, onChange }) {
  const { t } = useI18n();
  const prefix = useId();
  const [pendingGroup, setPendingGroup] = useState(() => economicActivityGroup(value));
  const selectedGroup = economicActivityGroup(value) || pendingGroup;
  const group = economicActivityGroups.find((item) => item.value === selectedGroup);
  const isLegacy = value === legacyOccupation;

  return (
    <>
      <label className="field-label" htmlFor={`${prefix}-activity`}>
        {t('경제활동 구분')}
        <select
          id={`${prefix}-activity`}
          value={selectedGroup}
          onChange={(event) => {
            const nextGroup = event.target.value;
            setPendingGroup(nextGroup);
            onChange(occupationForGroup(nextGroup, value));
          }}
          aria-describedby={isLegacy ? `${prefix}-legacy` : undefined}
        >
          <option value="">{t('선택하지 않음')}</option>
          {isLegacy && (
            <option value={legacyActivityGroup} disabled>
              {t('경제활동 상태 확인 필요')}
            </option>
          )}
          {economicActivityGroups.map((item) => (
            <option key={item.value} value={item.value}>
              {t(item.label)}
            </option>
          ))}
        </select>
        {isLegacy && (
          <small id={`${prefix}-legacy`}>
            {t('기존 은퇴 정보가 저장되어 있습니다. 현재 경제활동 상태를 선택해 주세요.')}
          </small>
        )}
      </label>
      {group?.occupations.length > 1 && (
        <label className="field-label" htmlFor={`${prefix}-occupation`}>
          {t('세부 상태')}
          <select
            id={`${prefix}-occupation`}
            value={group.occupations.includes(value) ? value : ''}
            onChange={(event) => onChange(event.target.value || null)}
          >
            <option value="">{t('선택하지 않음')}</option>
            {group.occupations.map((occupation) => (
              <option key={occupation} value={occupation}>
                {t(occupationLabel(occupation))}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  );
}
