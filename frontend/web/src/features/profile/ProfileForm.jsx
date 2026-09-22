import { useState } from 'react';
import { regions, categories } from '../policies/demoPolicies.js';
import Icon from '../../shared/ui/Icon.jsx';

export default function ProfileForm({ profile, onSave }) {
  const [draft, setDraft] = useState(profile);
  return (
    <form
      className="profile-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
    >
      <p className="muted">관심 지역과 분야를 설정하면 원하는 혜택을 더 빠르게 탐색할 수 있어요.</p>
      <label className="field-label">
        관심 지역
        <select
          value={draft.region}
          onChange={(event) => setDraft({ ...draft, region: event.target.value })}
        >
          {regions.map((region) => (
            <option key={region}>{region}</option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>
          관심 분야 <span className="muted">여러 개 선택 가능</span>
        </legend>
        <div className="interest-options">
          {categories.slice(1).map((category) => (
            <label key={category} className={draft.interests.includes(category) ? 'selected' : ''}>
              <input
                type="checkbox"
                checked={draft.interests.includes(category)}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    interests: event.target.checked
                      ? [...draft.interests, category]
                      : draft.interests.filter((item) => item !== category),
                  })
                }
              />
              {category}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="privacy-note">
        <Icon name="shield" size={18} />
        설정은 이 브라우저에만 저장되며 서버로 전송하지 않아요. 지원 자격을 판정하는 정보로 사용하지
        않습니다.
      </p>
      <button type="submit" className="button primary full">
        설정 저장하기
        <Icon name="check" size={18} />
      </button>
    </form>
  );
}
