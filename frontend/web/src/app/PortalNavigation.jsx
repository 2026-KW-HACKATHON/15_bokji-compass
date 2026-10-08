import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../shared/i18n/I18nProvider.jsx';
import Icon from '../shared/ui/Icon.jsx';
import { isSectionActive, portalSections } from './portalNavigation.js';

export default function PortalNavigation({ page, savedCount = 0 }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const returnFocus = useRef(null);
  const ignoreFocus = useRef(false);
  const panelId = useId();

  useEffect(() => {
    setOpen(false);
  }, [page]);
  useEffect(() => {
    if (!open) return;
    const outside = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const close = () => {
    setOpen(false);
    if (returnFocus.current && document.activeElement !== returnFocus.current) {
      ignoreFocus.current = true;
      returnFocus.current.focus({ preventScroll: true });
    }
  };

  return (
    <nav
      ref={root}
      className="portal-navigation"
      aria-label={t('주 메뉴')}
      onMouseLeave={() => {
        if (!root.current?.contains(document.activeElement)) setOpen(false);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <div className="portal-nav">
        {portalSections.map((section) => (
          <div
            key={section.id}
            className="portal-nav-group"
            data-active={isSectionActive(section, page)}
          >
            <a
              href={'#' + section.id}
              aria-current={
                isSectionActive(section, page) ? (page === section.id ? 'page' : 'true') : undefined
              }
              onClick={() => setOpen(false)}
              onMouseEnter={(event) => {
                if (window.matchMedia('(hover: hover)').matches) {
                  returnFocus.current = event.currentTarget;
                  setOpen(true);
                }
              }}
              onFocus={(event) => {
                returnFocus.current = event.currentTarget;
                if (ignoreFocus.current) {
                  ignoreFocus.current = false;
                  return;
                }
                setOpen(true);
              }}
            >
              {t(section.label)}
              {section.id === 'saved' && savedCount > 0 && (
                <span className="nav-count">{savedCount}</span>
              )}
            </a>
            {section.links.length > 1 && (
              <button
                className="portal-submenu-toggle"
                aria-label={t('{menu} 하위 메뉴', { menu: t(section.label) })}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={(event) => {
                  returnFocus.current = event.currentTarget;
                  setOpen((value) => !value);
                }}
              >
                <Icon name="down" size={16} />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="portal-mega-menu" id={panelId} hidden={!open}>
        <div className="portal-mega-inner">
          {portalSections.map((section) => (
            <section key={section.id} className="portal-menu-column" aria-label={t(section.label)}>
              <h2>{t(section.label)}</h2>
              <ul>
                {section.links.map((link) => (
                  <li key={link.id}>
                    <a
                      href={'#' + link.id}
                      aria-current={page === link.id ? 'page' : undefined}
                      onClick={() => setOpen(false)}
                    >
                      {t(link.label)}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="portal-menu-footer">
          <button className="text-button" onClick={close}>
            {t('메뉴 닫기')}
            <Icon name="x" size={16} />
          </button>
        </div>
      </div>
    </nav>
  );
}
