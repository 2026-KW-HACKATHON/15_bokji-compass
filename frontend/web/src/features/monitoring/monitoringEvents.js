// Invalidate account-scoped views without putting any member data in a global event.
const eventName = 'bokji:monitoring-changed';

export function notifyMonitoringChanged(signal) {
  if (typeof window !== 'undefined' && !signal?.aborted) window.dispatchEvent(new Event(eventName));
}

export function subscribeMonitoringChanges(listener) {
  window.addEventListener(eventName, listener);
  return () => window.removeEventListener(eventName, listener);
}
