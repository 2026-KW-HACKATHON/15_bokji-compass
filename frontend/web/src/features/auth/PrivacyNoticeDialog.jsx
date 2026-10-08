import { useEffect, useId, useRef } from 'react';
import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import Icon from '../../shared/ui/Icon.jsx';
import './privacy-dialog.css';

const noticeSections = new Set(['collection', 'profile', 'ai']);

export default function PrivacyNoticeDialog({ children, onClose, initialSection }) {
  const { t } = useI18n();
  const titleId = useId();
  const dialog = useRef(null);
  const body = useRef(null);
  const backdropPointer = useRef(false);
  const positioned = useRef({ section: initialSection, done: false });

  useEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    if (!element.open) element.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      if (element.open) element.close();
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected && typeof trigger.focus === 'function')
        trigger.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (positioned.current.section !== initialSection)
      positioned.current = { section: initialSection, done: false };
    if (positioned.current.done) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const container = body.current;
      if (!container) return;
      if (!noticeSections.has(initialSection)) {
        container.scrollTop = 0;
        positioned.current.done = true;
        return;
      }
      const section = container.querySelector(`[data-privacy-section="${initialSection}"]`);
      // Loading and error content may not contain the requested section yet.
      if (!section) return;
      const padding = Number.parseFloat(window.getComputedStyle(container).paddingTop) || 0;
      container.scrollTop +=
        section.getBoundingClientRect().top - container.getBoundingClientRect().top - padding;
      positioned.current.done = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [children, initialSection]);

  const isBackdrop = (event) => {
    if (event.target !== event.currentTarget) return false;
    const bounds = event.currentTarget.getBoundingClientRect();
    return (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    );
  };

  return (
    <dialog
      ref={dialog}
      className="privacy-notice-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onPointerDown={(event) => {
        backdropPointer.current = isBackdrop(event);
      }}
      onPointerCancel={() => {
        backdropPointer.current = false;
      }}
      onClick={(event) => {
        const dismiss = backdropPointer.current && isBackdrop(event);
        backdropPointer.current = false;
        if (dismiss) onClose();
      }}
    >
      <header className="privacy-notice-dialog-header">
        <h2 id={titleId} className="privacy-notice-dialog-title">
          {t('개인정보 수집·이용 안내')}
        </h2>
        <button
          type="button"
          className="privacy-notice-dialog-close"
          aria-label={t('닫기')}
          onClick={() => onClose()}
          autoFocus
        >
          <Icon name="x" size={21} />
        </button>
      </header>
      <div
        ref={body}
        className="privacy-notice-dialog-body"
        role="region"
        aria-labelledby={titleId}
        tabIndex={0}
      >
        {children}
      </div>
      <footer className="privacy-notice-dialog-footer">
        <button type="button" className="privacy-notice-dialog-confirm" onClick={() => onClose()}>
          {t('확인')}
        </button>
      </footer>
    </dialog>
  );
}
