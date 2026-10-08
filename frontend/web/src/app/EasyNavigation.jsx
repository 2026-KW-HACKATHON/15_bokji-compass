import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../shared/i18n/I18nProvider.jsx';
import Icon from '../shared/ui/Icon.jsx';
import { isSectionActive, portalSections } from './portalNavigation.js';

const sectionIcons = {
  home: 'house',
  local: 'pin',
  assistant: 'sparkles',
  explore: 'search',
  calendar: 'calendar',
  saved: 'bookmark',
  profile: 'user',
};

// An explicit disclosure keeps every destination available without hover or swiping.
export default function EasyNavigation({ page, savedCount = 0 }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggle = useRef(null);
  const section = portalSections.find((item) => isSectionActive(item, page));
  const current = section?.links.find((item) => item.id === page)?.label;
  const currentLabel = section?.id === page ? section.label : current || section?.label;
  useEffect(() => setOpen(false), [page]);
  const close = () => {
    setOpen(false);
    toggle.current?.focus({ preventScroll: true });
  };
  const selectDestination = (destination) => {
    if (destination === page) close();
    else setOpen(false);
  };
  return (
    <nav
      className="easy-navigation"
      aria-label={t('주 메뉴')}
      onKeyDown={(event) => {
        if (open && event.key === 'Escape') {
          event.preventDefault();
          close();
        }
      }}
    >
      <div className="easy-navigation-bar">
        <span className="easy-current-page">
          <Icon name={sectionIcons[section?.id] || 'compass'} size={24} />
          {t(
            currentLabel ||
              (page === 'signup' ? '회원가입' : page === 'login' ? '로그인' : '내 정보'),
          )}
        </span>
        <button
          ref={toggle}
          type="button"
          className="easy-menu-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          <Icon name={open ? 'x' : 'grid'} size={22} />
          {t(open ? '메뉴 닫기' : '전체 메뉴')}
        </button>
      </div>
      <div id={panelId} className="easy-menu-panel" hidden={!open}>
        {portalSections.map((item) => (
          <div className="easy-menu-section" key={item.id}>
            <a
              href={'#' + item.id}
              aria-current={page === item.id ? 'page' : undefined}
              onClick={() => selectDestination(item.id)}
            >
              <Icon name={sectionIcons[item.id]} size={24} />
              <span>
                {t(item.label)}
                {item.id === 'saved' && savedCount > 0 && ` (${savedCount})`}
              </span>
              {page === item.id && <Icon name="check" size={22} />}
            </a>
            {item.links.length > 1 &&
              item.links
                .filter((link) => link.id !== item.id)
                .map((link) => (
                  <a
                    className="easy-menu-child"
                    key={link.id}
                    href={'#' + link.id}
                    aria-current={page === link.id ? 'page' : undefined}
                    onClick={() => selectDestination(link.id)}
                  >
                    <span>{t(link.label)}</span>
                    {page === link.id && <Icon name="check" size={20} />}
                  </a>
                ))}
          </div>
        ))}
      </div>
    </nav>
  );
}
