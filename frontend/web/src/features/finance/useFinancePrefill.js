import { useEffect, useRef, useState } from 'react';
import { appConfig } from '../../shared/config.js';
import { createFinanceApi } from './financeApi.js';

const api = createFinanceApi({ baseUrl: appConfig.apiBaseUrl });
const empty = (owner) => ({ owner, status: 'idle', record: null, error: '' });

// One account lookup shared by quick calculation, detailed calculation and profile.
export default function useFinancePrefill(user, enabled) {
  const owner = user?.id ?? null;
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const cache = useRef(empty(null));
  const pending = useRef(null);
  const generation = useRef(0);
  const [state, setState] = useState(cache.current);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (cache.current.owner !== owner) cache.current = empty(owner);
    if (!owner || !enabled) {
      setState(cache.current);
      return;
    }
    if (cache.current.status === 'ready') {
      setState(cache.current);
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    const revision = ++generation.current;
    setState({ ...empty(owner), status: 'loading' });
    api
      .getProfile({ signal: controller.signal })
      .then((record) => {
        if (!controller.signal.aborted && revision === generation.current) {
          cache.current = { owner, status: 'ready', record, error: '' };
          setState(cache.current);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted && revision === generation.current)
          setState({ ...empty(owner), status: 'error', error: error.message });
      });
    return () => controller.abort();
  }, [owner, enabled, retry]);
  return {
    ...(state.owner === owner ? state : empty(owner)),
    retry: () => {
      if (currentOwner.current !== owner) return;
      generation.current += 1;
      pending.current?.abort();
      cache.current = empty(owner);
      setRetry((value) => value + 1);
    },
    clear: () => {
      if (currentOwner.current !== owner) return;
      generation.current += 1;
      pending.current?.abort();
      cache.current = { owner, status: 'ready', record: null, error: '' };
      setState(cache.current);
    },
    update: (record) => {
      if (currentOwner.current !== owner) return;
      generation.current += 1;
      pending.current?.abort();
      cache.current = { owner, status: 'ready', record, error: '' };
      setState(cache.current);
    },
  };
}
