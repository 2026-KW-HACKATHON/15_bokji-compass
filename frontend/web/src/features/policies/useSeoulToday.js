import { useSyncExternalStore } from 'react';
import { seoulToday } from '../calendar/calendarModel.js';

const subscribers = new Set();
let currentDay = seoulToday();
let timer;

function refresh() {
  const nextDay = seoulToday();
  if (nextDay !== currentDay) {
    currentDay = nextDay;
    for (const subscriber of subscribers) subscriber();
  }
  window.clearTimeout(timer);
  const nextMidnight = Date.parse(`${nextDay}T00:00:00+09:00`) + 86400000;
  timer = window.setTimeout(refresh, Math.max(1, nextMidnight - Date.now() + 50));
}

function onVisible() {
  if (document.visibilityState === 'visible') refresh();
}

function subscribe(subscriber) {
  subscribers.add(subscriber);
  if (subscribers.size === 1) {
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
  }
  return () => {
    subscribers.delete(subscriber);
    if (!subscribers.size) {
      window.clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    }
  };
}

export default function useSeoulToday() {
  return useSyncExternalStore(subscribe, seoulToday, seoulToday);
}
