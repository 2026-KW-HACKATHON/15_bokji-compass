import { useEffect, useId, useRef, useState } from 'react';
import { request } from '../../shared/api/client.js';
import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import Icon from '../../shared/ui/Icon.jsx';
import { createMonitoringApi } from './monitoringApi.js';
import { subscribeMonitoringChanges } from './monitoringEvents.js';
import './notification-bell.css';

const api = createMonitoringApi(request);

// App keys this component by account, so no previous member's inbox can render.
export default function NotificationBell({ refreshKey, routeKey, onOpenAlert, openingId }) {
  const { t, intlLocale } = useI18n();
  const id = useId();
  const root = useRef(null);
  const trigger = useRef(null);
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision((value) => value + 1);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api
      .read({ signal: controller.signal })
      .then((value) => {
        if (controller.signal.aborted) return;
        setSnapshot(value);
        setError(false);
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        if (failure.status === 401) setSnapshot(null);
        setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [refreshKey, revision]);

  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== 'hidden') refresh();
    };
    const unsubscribe = subscribeMonitoringChanges(refresh);
    const timer = window.setInterval(check, 60000);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  useEffect(() => setOpen(false), [routeKey]);
  useEffect(() => {
    if (!open) return;
    const outside = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
    };
  }, [open]);

  const count = snapshot?.unread_count || 0;
  return (
    <div
      className="notification-center"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        type="button"
        className="notification-trigger"
        ref={trigger}
        aria-label={snapshot ? t('알림, 안 읽은 알림 {count}개', { count }) : t('알림')}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          setOpen((value) => !value);
          if (!open) refresh();
        }}
      >
        <Icon name="bell" size={23} />
        {count > 0 && (
          <span className="notification-badge" aria-hidden="true">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>
      {open && (
        <section className="notification-popover" id={id} aria-labelledby={`${id}-title`}>
          <div className="notification-heading">
            <h2 id={`${id}-title`}>
              {t('알림')}{' '}
              <span>
                {t('안 읽음')} {count}
              </span>
            </h2>
            <button
              type="button"
              className="notification-close"
              aria-label={t('알림 닫기')}
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <Icon name="x" size={20} />
            </button>
          </div>
          {error && (
            <div className="notification-error" role="alert">
              <p>{t('알림을 불러오지 못했어요.')}</p>
              <button type="button" onClick={refresh} disabled={loading}>
                {t('다시 불러오기')}
              </button>
            </div>
          )}
          {!snapshot && loading && (
            <p className="notification-empty" role="status">
              {t('알림을 불러오고 있어요.')}
            </p>
          )}
          {snapshot?.alerts.length ? (
            <ul className="notification-list" aria-busy={!!openingId}>
              {snapshot.alerts.slice(0, 6).map((alert) => (
                <li key={alert.id}>
                  <button
                    type="button"
                    className={`notification-item${alert.read ? ' is-read' : ''}`}
                    disabled={!!openingId}
                    onClick={async () => {
                      // Keep a stable return target when the detail dialog replaces this list.
                      trigger.current?.focus();
                      if (await onOpenAlert(alert)) setOpen(false);
                    }}
                  >
                    <span className="notification-item-icon">
                      <Icon name="bell" size={18} />
                    </span>
                    <span className="notification-item-content">
                      <span className="notification-item-label">
                        {t(alert.read ? '읽음' : '새 알림')}
                      </span>
                      <strong>{alert.title}</strong>
                      <span className="notification-item-body">{alert.body}</span>
                      <time dateTime={alert.created_at}>
                        {new Intl.DateTimeFormat(intlLocale, {
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: 'Asia/Seoul',
                        }).format(new Date(alert.created_at))}
                      </time>
                      {openingId === alert.id && (
                        <span role="status">{t('관련 공고를 여는 중이에요.')}</span>
                      )}
                    </span>
                    <Icon name="right" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            snapshot &&
            !error && (
              <div className="notification-empty">
                <Icon name="bell" size={30} />
                <p>{t('아직 새 알림이 없어요.')}</p>
                <span>{t('내 상황에 맞는 공고가 도착하면 알려드려요.')}</span>
              </div>
            )
          )}
          <a className="notification-all" href="#new-notices" onClick={() => setOpen(false)}>
            {t('알림 전체 보기')}
            <Icon name="right" size={16} />
          </a>
        </section>
      )}
    </div>
  );
}
