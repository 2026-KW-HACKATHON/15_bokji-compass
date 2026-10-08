import { seoulToday } from '../calendar/calendarModel.js';

const millisecondsPerDay = 24 * 60 * 60 * 1000;

function utcDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  // A leap-year base avoids Date.UTC's special handling of years 00 through 99.
  const date = new Date(Date.UTC(2000, month - 1, day));
  date.setUTCFullYear(year);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date.getTime() / millisecondsPerDay
    : null;
}

export function policyDeadline(policy, today = seoulToday()) {
  const end = policy?.applicationEnd;
  if (end === null || end === undefined || end === '') {
    return { state: policy?.scheduleStatus === 'ongoing' ? 'ongoing' : 'unknown', days: null };
  }
  const endDay = utcDay(end);
  const todayDay = utcDay(today);
  if (endDay === null || todayDay === null) return { state: 'unknown', days: null };
  const days = endDay - todayDay;
  return { state: days > 0 ? 'upcoming' : days === 0 ? 'today' : 'closed', days };
}
