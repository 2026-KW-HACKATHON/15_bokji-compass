import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function PasswordInput({ label, hint, ...props }) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  return (
    <div className="auth-password-field">
      <label className="field-label" htmlFor={props.id}>
        {t(label)}
      </label>
      <div className="auth-password-control">
        <input
          {...props}
          type={visible ? 'text' : 'password'}
          minLength={8}
          maxLength={128}
          required
        />
        <button
          type="button"
          className="auth-password-toggle"
          aria-label={
            visible
              ? t('{label} 숨기기', { label: t(label) })
              : t('{label} 보기', { label: t(label) })
          }
          aria-pressed={visible}
          aria-controls={props.id}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
          <span>{visible ? t('숨기기') : t('보기')}</span>
        </button>
      </div>
      {hint && (
        <small className="auth-field-hint" id={props.id + '-hint'}>
          {t(hint)}
        </small>
      )}
    </div>
  );
}
