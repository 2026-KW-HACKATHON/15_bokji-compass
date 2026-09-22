import { useRef, useState } from 'react';
import { regions, categories } from '../policies/policyModel.js';
import { ageBands, occupations, households } from './profileModel.js';
import Icon from '../../shared/ui/Icon.jsx';
export default function ProfileForm({ profile, onSave, easy, remembered = false, mode }) {
  const [draft, setDraft] = useState(profile);
  const [step, setStep] = useState(0);
  const [remember, setRemember] = useState(remembered);
  const title = useRef(null);
  const changeStep = (next) => {
    setStep(next);
    requestAnimationFrame(() => title.current?.focus());
  };
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
        if (easy && step < 2) changeStep(step + 1);
        else onSave(draft, remember);
      }}
    >
      <div className="form-intro">
        <p>개인비서가 참고할 정보를 알려주세요. 모르는 항목은 선택하지 않아도 괜찮아요.</p>
      </div>
      {easy && (
        <div className="step-indicator" aria-label={'3단계 중 ' + (step + 1) + '단계'}>
          <span>{step + 1} / 3</span>
          <h2 ref={title} tabIndex={-1}>
            {['어디에 살고 계신가요?', '현재 생활을 알려주세요', '어떤 도움이 필요하세요?'][step]}
          </h2>
        </div>
      )}
      {(!easy || step === 0) && (
        <section className="form-section" aria-label="지역과 연령">
          <h2 className={easy ? 'sr-only' : ''}>기본 정보</h2>
          <div className="form-grid">
            {select('region', '거주 지역', regions)}
            {select('ageBand', '연령대 (선택)', ageBands)}
          </div>
        </section>
      )}
      {(!easy || step === 1) && (
        <section className="form-section" aria-label="생활 정보">
          <h2 className={easy ? 'sr-only' : ''}>생활 정보</h2>
          <div className="form-grid">
            {select('occupation', '현재 상황 (선택)', occupations)}
            {select('household', '함께 사는 사람 (선택)', households)}
          </div>
        </section>
      )}
      {(!easy || step === 2) && (
        <section className="form-section">
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
          <label className="remember-choice">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            이 브라우저에 내 정보 기억하기
          </label>
          <p className="field-hint">
            공용 기기에서는 선택하지 마세요. 선택하지 않으면 새로고침할 때 입력 정보가 사라져요.
            {mode === 'api' && ' 기억하면 다음 방문에도 이 정보로 추천을 요청해요.'}
          </p>
          <p className="privacy-note">
            <Icon name="shield" />
            {mode === 'demo'
              ? '지금은 체험 화면이라 입력 정보를 서버로 보내지 않아요.'
              : '추천받기를 누르면 입력한 정보를 복지나침반 서버에 보내 추천을 요청해요.'}{' '}
            지원 자격을 확정하는 정보는 아니에요.
          </p>
        </section>
      )}
      <div className="form-actions">
        {easy && step > 0 && (
          <button className="button secondary" type="button" onClick={() => changeStep(step - 1)}>
            이전
          </button>
        )}
        <button className="button primary" type="submit">
          {easy && step < 2 ? '다음' : '내 정보로 추천받기'}
          <Icon name="arrow" size={20} />
        </button>
      </div>
    </form>
  );
}
