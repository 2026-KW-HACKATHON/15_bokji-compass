import { useI18n } from '../i18n/I18nProvider.jsx';
import { useEffect, useRef } from 'react';
import Icon from './Icon.jsx';

export default function Modal({ title, onClose, children, dismissible = true }) {
  const { t } = useI18n();
  const ref = useRef(null);
  useEffect(() => {
    const element = ref.current;
    const previous = document.activeElement;
    element.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-inner">
        <div className="modal-heading">
          <h2 id="dialog-title">{title}</h2>
          <button
            className="icon-button modal-close"
            disabled={!dismissible}
            onClick={onClose}
            aria-label={t('닫기')}
            autoFocus
          >
            <Icon name="x" />
            <span className="easy-control-label">{t('닫기')}</span>
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
