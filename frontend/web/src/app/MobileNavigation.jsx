import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../shared/i18n/I18nProvider.jsx';
import Icon from '../shared/ui/Icon.jsx';
import { isSectionActive, portalSections } from './portalNavigation.js';

// Native dialog supplies focus containment, Escape dismissal and focus restoration.
export default function MobileNavigation({ page, savedCount = 0, user }) {
  const { t } = useI18n();
  const dialog = useRef(null);
  const [open, setOpen] = useState(false);
  const id = useId();
  const close = () => dialog.current?.close();
  useEffect(() => {
    close();
  }, [page, user?.id]);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1001px)');
    const change = () => {
      if (desktop.matches) close();
    };
    desktop.addEventListener('change', change);
    return () => desktop.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);
  return (
    <div className="mobile-navigation">
      <button
        className="mobile-menu-toggle"
        type="button"
        aria-label={t('메뉴 열기')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          dialog.current.showModal();
          setOpen(true);
        }}
      >
        <Icon name="menu" size={25} />
      </button>
      <dialog
        ref={dialog}
        id={id}
        className="mobile-menu-dialog"
        aria-label={t('전체 메뉴')}
        onClose={() => setOpen(false)}
      >
        <div className="mobile-menu-heading">
          <a className="brand" href="#home" onClick={close} aria-label={t('복지나침반 홈')}>
            <img className="brand-image" src="/brand-logo.png" alt="" />
            <span>{t('복지나침반')}</span>
          </a>
          <button
            type="button"
            className="mobile-menu-toggle"
            aria-label={t('메뉴 닫기')}
            onClick={close}
            autoFocus
          >
            <Icon name="x" size={25} />
          </button>
        </div>
        <div className="mobile-menu-scroll">
          <nav aria-label={t('주 메뉴')}>
            {portalSections.map((section) => {
              const label = (
                <>
                  {t(section.label)}
                  {section.id === 'saved' && savedCount > 0 && (
                    <span className="nav-count">{savedCount}</span>
                  )}
                </>
              );
              return section.links.length > 1 ? (
                <details
                  key={section.id}
                  className="mobile-menu-group"
                  name={id}
                  data-active={isSectionActive(section, page)}
                >
                  <summary>
                    {label}
                    <Icon name="down" size={20} />
                  </summary>
                  <div className="mobile-menu-children">
                    {section.links.map((link) => (
                      <a
                        key={link.id}
                        href={'#' + link.id}
                        aria-current={page === link.id ? 'page' : undefined}
                        onClick={close}
                      >
                        {t(link.label)}
                        <Icon name="right" size={18} />
                      </a>
                    ))}
                  </div>
                </details>
              ) : (
                <a
                  key={section.id}
                  className="mobile-menu-destination"
                  href={'#' + section.id}
                  aria-current={isSectionActive(section, page) ? 'page' : undefined}
                  onClick={close}
                >
                  {label}
                  <Icon name="right" size={20} />
                </a>
              );
            })}
          </nav>
          <div className="mobile-menu-account">
            {user ? (
              <>
                <p>{t('{name}님', { name: user.name || t('회원') })}</p>
                <a href="#profile" onClick={close}>
                  {t('회원 정보')}
                </a>
                {user.admin_role === 'superadmin' && (
                  <a href="#admin" onClick={close}>
                    {t('관리자 관리')}
                  </a>
                )}
                {user.is_admin === true && (
                  <a href="/admin/exhibition/" onClick={close}>
                    {t('전시 QR 관리')}
                  </a>
                )}
              </>
            ) : (
              <>
                <a href="#login" onClick={close}>
                  {t('로그인')}
                </a>
                <a href="#signup" onClick={close}>
                  {t('회원가입')}
                </a>
              </>
            )}
          </div>
        </div>
      </dialog>
    </div>
  );
}
