import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../shared/i18n/I18nProvider.jsx';
import Icon from '../shared/ui/Icon.jsx';
import { isSectionActive, portalSections } from './portalNavigation.js';

export default function PortalNavigation({ page, savedCount = 0 }) {
  const { t } = useI18n();
  const [openSection, setOpenSection] = useState(null);
  // Keep the last column mounted while CSS finishes folding the panel closed.
  const [renderedSection, setRenderedSection] = useState(null);
  const root = useRef(null);
  const returnFocus = useRef(null);
  const openedBy = useRef(null);
  const closeTimer = useRef(null);
  const panel = useRef(null);
  const panelId = useId();
  const sectionIndex = portalSections.findIndex((item) => item.id === renderedSection);
  const section = portalSections[sectionIndex];
  const cancelClose = () => window.clearTimeout(closeTimer.current);
  const dismiss = () => {
    cancelClose();
    setOpenSection(null);
  };
  const reveal = (id, trigger, source) => {
    cancelClose();
    returnFocus.current = trigger;
    openedBy.current = source;
    setRenderedSection(id);
    setOpenSection(id);
  };
  const focusFirstLink = () =>
    window.requestAnimationFrame(() => panel.current?.querySelector('a')?.focus());

  useEffect(() => {
    dismiss();
  }, [page]);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  useEffect(() => {
    if (!openSection) return;
    const outside = (event) => {
      if (!root.current?.contains(event.target)) dismiss();
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [openSection]);

  const close = () => {
    dismiss();
    if (returnFocus.current && document.activeElement !== returnFocus.current) {
      returnFocus.current.focus({ preventScroll: true });
    }
  };

  return (
    <nav
      ref={root}
      className="portal-navigation"
      aria-label={t('주 메뉴')}
      onPointerEnter={cancelClose}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse' && openedBy.current === 'hover') {
          closeTimer.current = window.setTimeout(() => {
            if (!panel.current?.contains(document.activeElement)) setOpenSection(null);
          }, 160);
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) dismiss();
      }}
      onKeyDown={(event) => {
        if (openSection && event.key === 'Escape') {
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
            data-open={openSection === section.id}
            onPointerEnter={(event) => {
              if (event.pointerType === 'mouse' && window.matchMedia('(hover: hover)').matches) {
                reveal(section.id, event.currentTarget.querySelector('button'), 'hover');
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                reveal(section.id, event.currentTarget.querySelector('button'), 'keyboard');
                focusFirstLink();
              } else if (
                event.key === 'Tab' &&
                !event.shiftKey &&
                openSection === section.id &&
                event.target.tagName === 'BUTTON'
              ) {
                event.preventDefault();
                focusFirstLink();
              }
            }}
          >
            <a
              href={'#' + section.id}
              aria-current={
                isSectionActive(section, page) ? (page === section.id ? 'page' : 'true') : undefined
              }
              onClick={dismiss}
            >
              {t(section.label)}
              {section.id === 'saved' && savedCount > 0 && (
                <span className="nav-count">{savedCount}</span>
              )}
            </a>
            <button
              type="button"
              className="portal-submenu-toggle"
              aria-label={t('{menu} 하위 메뉴', { menu: t(section.label) })}
              aria-expanded={openSection === section.id}
              aria-controls={panelId}
              onClick={(event) => {
                if (openSection === section.id && openedBy.current !== 'hover') dismiss();
                else reveal(section.id, event.currentTarget, 'click');
              }}
            >
              <Icon name="down" size={16} />
            </button>
          </div>
        ))}
      </div>
      <div
        ref={panel}
        className="portal-mega-menu"
        id={panelId}
        data-open={!!openSection}
        aria-hidden={!openSection}
        inert={!openSection}
        style={{ '--portal-menu-index': Math.max(0, sectionIndex) }}
        onKeyDown={(event) => {
          if (
            event.key === 'Tab' &&
            event.shiftKey &&
            event.target === panel.current?.querySelector('a')
          ) {
            event.preventDefault();
            returnFocus.current?.focus();
          }
        }}
      >
        <div className="portal-mega-clip">
          <div className="portal-mega-content">
            <div className="portal-mega-inner">
              {section && (
                <section
                  key={section.id}
                  className="portal-menu-column"
                  aria-label={t(section.label)}
                >
                  <h2>{t(section.label)}</h2>
                  <ul>
                    {section.links.map((link, index) => (
                      <li key={link.id} style={{ '--portal-item-index': index }}>
                        <a
                          href={'#' + link.id}
                          aria-current={page === link.id ? 'page' : undefined}
                          onClick={dismiss}
                        >
                          <span>{t(link.label)}</span>
                          <Icon name="right" size={18} />
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
            <div className="portal-menu-footer">
              <button className="text-button" onClick={close}>
                {t('메뉴 닫기')}
                <Icon name="x" size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
