import { useState } from 'react';
import { regions, categories } from '../policies/policyModel.js';
import { ageBands, occupations, households, normalizeProfile } from './profileModel.js';
import Icon from '../../shared/ui/Icon.jsx';
export default function ProfileForm({
  profile,
  onSave,
  easy,
  remembered = false,
  mode,
  section,
  onCancel,
}) {
  const [draft, setDraft] = useState(() => normalizeProfile(profile));
  const [remember, setRemember] = useState(remembered);
  const select = (key, label, options) => (
    <label className="field-label">
      {label}
      <select
        value={draft[key]}
        onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
      >
        {options.map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
    </label>
  );
  return (
    <form
      className="profile-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft, remember);
      }}
    >
      <div className="form-intro">
        <p>
          {easy
            ? '추천에 필요한 정보를 선택해 주세요. 선택 항목은 비워둘 수 있으며, 언제든 수정할 수 있습니다.'
            : '아는 항목만 입력해 주세요. 나중에 바꿀 수 있어요.'}
        </p>
      </div>
      {(!section || section === 'basic') && (
        <section className="form-section" aria-label="지역과 연령">
          <h2>기본 정보</h2>
          <div className="form-grid">
            {select('region', '거주 지역', regions)}
            {select('ageBand', '연령대 (선택)', ageBands)}
          </div>
        </section>
      )}
      {(!section || section === 'life') && (
        <section className="form-section" aria-label="생활 정보">
          <h2>생활 정보 {easy && <small>선택</small>}</h2>
          <div className="form-grid">
            {select('occupation', '일·학업 상태 (선택)', occupations)}
            {select('household', '함께 사는 사람 (선택)', households)}
          </div>
          <p className="field-hint">
            일·학업 상태는 공고 추천을 위한 선택 정보예요. 중위소득 기준은 가구원 수로 확인할 수
            있어요.
          </p>
        </section>
      )}
      <section className="form-section">
        {(!section || section === 'interests') && (
          <fieldset>
            <legend>
              관심 분야 <small>여러 개 선택할 수 있어요</small>
            </legend>
            <div className="interest-options">
              {categories.slice(1).map((category) => (
                <label
                  key={category}
                  className={draft.interests.includes(category) ? 'selected' : ''}
                >
                  <input
                    type="checkbox"
                    checked={draft.interests.includes(category)}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        interests: event.target.checked
                          ? [...draft.interests, category]
                          : draft.interests.filter((value) => value !== category),
                      })
                    }
                  />
                  {category}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <label className="remember-choice">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />
          이 브라우저에 내 정보 저장
        </label>
        <p className="field-hint">
          선택하면 다음 방문에도 입력한 정보를 사용할 수 있어요. 공용 기기에서는 선택하지 마세요.
          {!remember && ' 선택하지 않으면 새로고침할 때 입력 정보가 사라져요.'}
          {mode === 'api' && remember && ' 다음 방문에도 이 정보로 추천을 요청해요.'}
        </p>
        <p className="privacy-note">
          <Icon name="shield" />
          {mode === 'demo'
            ? '체험 중에는 이 화면에서 입력한 정보를 서버로 보내지 않아요.'
            : section
              ? '저장하면 입력한 추천 정보를 복지나침반 서버에 보내요.'
              : '추천받기를 누르면 입력한 정보를 복지나침반 서버에 보내요.'}
        </p>
      </section>
      <div className="form-actions">
        {onCancel && (
          <button className="button secondary" type="button" onClick={onCancel}>
            취소
          </button>
        )}
        <button className="button primary" type="submit">
          {section ? '정보 저장' : '내 정보로 추천받기'}
          {!section && <Icon name="arrow" size={20} />}
        </button>
      </div>
    </form>
  );
}
