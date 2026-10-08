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

export function calendarEvents(items, month, type = 'all') {
  return items
    .flatMap((policy) =>
      [
        { date: policy.applicationStart, type: 'start', policy },
        { date: policy.applicationEnd, type: 'end', policy },
      ].filter(
        (event) =>
          isCalendarDate(event.date) &&
          event.date.startsWith(month + '-') &&
          (type === 'all' || event.type === type),
      ),
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.type.localeCompare(b.type) ||
        a.policy.title.localeCompare(b.policy.title, 'ko'),
    );
}

export function policiesOnDay(items, day, type = 'all') {
  return items.filter((policy) =>
    type === 'start'
      ? policy.applicationStart === day
      : type === 'end'
        ? policy.applicationEnd === day
        : policy.applicationStart === day ||
          policy.applicationEnd === day ||
          (policy.applicationStart &&
            policy.applicationEnd &&
            policy.applicationStart <= day &&
            day <= policy.applicationEnd),
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
