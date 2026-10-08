import { useEffect, useRef, useState } from 'react';
import { request } from '../../shared/api/client.js';
import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import { createMonitoringApi } from './monitoringApi.js';

const api = createMonitoringApi(request);

export default function useAlertNavigation({
  owner,
  scope,
  repository,
  onOpen,
  onRelatedPage,
  onMessage,
}) {
  const { t } = useI18n();
  const current = useRef({ owner, scope });
  current.current = { owner, scope };
  const pending = useRef(null);
  const [openingId, setOpeningId] = useState(null);

  useEffect(() => {
    setOpeningId(null);
    return () => {
      pending.current?.abort();
      pending.current = null;
    };
  }, [owner, scope]);

  async function openAlert(alert) {
    if (!owner || pending.current) return false;
    const controller = new AbortController();
    pending.current = controller;
    setOpeningId(alert.id);
    const active = () =>
      !controller.signal.aborted &&
      current.current.owner === owner &&
      current.current.scope === scope;
    try {
      let policy = null;
      try {
        policy = await repository.get(alert.policy_id, { signal: controller.signal });
      } catch (error) {
        if (error.status !== 404) throw error;
      }
      if (!active()) return false;
      let readFailed = false;
      if (!alert.read) {
        try {
          await api.readAlerts([alert.id], { signal: controller.signal });
        } catch {
          readFailed = true;
        }
      }
      if (!active()) return false;
      const message = readFailed
        ? t('알림을 읽음으로 저장하지 못했어요. 다시 시도해 주세요.')
        : !policy
          ? t('공고가 더 이상 제공되지 않아 관련 복지 안내로 이동했어요.')
          : '';
      if (policy) {
        onOpen(policy);
        if (message) onMessage(message);
      } else onRelatedPage(message);
      return true;
    } catch {
      if (active()) onMessage(t('관련 공고를 불러오지 못했어요. 알림을 다시 눌러 주세요.'));
      return false;
    } finally {
      if (pending.current === controller) pending.current = null;
      if (active()) setOpeningId(null);
    }
  }

  return { openAlert, openingId };
}
