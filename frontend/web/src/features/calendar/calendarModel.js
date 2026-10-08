export function seoulToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function shiftMonth(month, amount) {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1 + amount, 1)).toISOString().slice(0, 7);
}

export function calendarCells(month) {
  const [year, number] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year, number - 1, 1));
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(Date.UTC(year, number - 1, index - first.getUTCDay() + 1))
      .toISOString()
      .slice(0, 10);
    return { date, day: Number(date.slice(-2)), current: date.startsWith(month + '-') };
  });
}

export function policyApplicationWindows(policy) {
  return policy.applicationWindows?.length
    ? policy.applicationWindows
    : [{ applicationStart: policy.applicationStart, applicationEnd: policy.applicationEnd }];
}

function windowMatchesDay(window, day, type = 'all') {
  return type === 'start'
    ? window.applicationStart === day
    : type === 'end'
      ? window.applicationEnd === day
      : window.applicationStart === day ||
        window.applicationEnd === day ||
        (window.applicationStart &&
          window.applicationEnd &&
          window.applicationStart <= day &&
          day <= window.applicationEnd);
}

export function applicationWindowOnDay(policy, day, type = 'all') {
  const windows = policyApplicationWindows(policy);
  return (
    windows.find(
      (window) =>
        (type !== 'end' && window.applicationStart === day) ||
        (type !== 'start' && window.applicationEnd === day),
    ) ||
    windows.find((window) => windowMatchesDay(window, day, type)) ||
    null
  );
}

export function calendarEvents(items, month, type = 'all') {
  return items
    .flatMap((policy) => {
      const seen = new Set();
      return policyApplicationWindows(policy)
        .flatMap((window) => [
          { date: window.applicationStart, type: 'start', policy },
          { date: window.applicationEnd, type: 'end', policy },
        ])
        .filter((event) => {
          if (
            !isCalendarDate(event.date) ||
            !event.date.startsWith(month + '-') ||
            (type !== 'all' && event.type !== type)
          )
            return false;
          const key = event.date + event.type;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    })
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.type.localeCompare(b.type) ||
        a.policy.title.localeCompare(b.policy.title, 'ko'),
    );
}

export function policiesOnDay(items, day, type = 'all') {
  return items.filter((policy) =>
    policyApplicationWindows(policy).some((window) => windowMatchesDay(window, day, type)),
  );
}

// Keep unchanged notice objects so refreshing the calendar does not restart visible translations.
export function reconcileCalendarResult(previous, next) {
  const notices = new Map(
    [...previous.items, ...previous.undatedItems].map((policy) => [policy.id, policy]),
  );
  const reconcile = (policy) => {
    const existing = notices.get(policy.id);
    return existing && JSON.stringify(existing) === JSON.stringify(policy) ? existing : policy;
  };
  return {
    ...next,
    items: next.items.map(reconcile),
    undatedItems: next.undatedItems.map(reconcile),
  };
}
