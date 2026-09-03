/**
 * DETERMINISTIC. Every date and every number shown in the UI comes from here.
 * The LLM never computes a date.
 * Dates are handled as 'YYYY-MM-DD' strings anchored at UTC noon to keep the
 * arithmetic free of DST and timezone drift.
 */
import { TZ } from '../config/firm.js';

export type ISODate = string;

const anchor = (d: ISODate) => new Date(`${d}T12:00:00Z`);
export const fmt = (dt: Date): ISODate => dt.toISOString().slice(0, 10);

export function todayInTz(now: Date = new Date()): ISODate {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, dateStyle: 'short' }).format(now);
}

export function addDays(d: ISODate, n: number): ISODate {
  const dt = anchor(d);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fmt(dt);
}

/** 0 = Sunday .. 6 = Saturday */
export const dow = (d: ISODate): number => anchor(d).getUTCDay();

// Ontario statutory holidays relevant to the demo window.
export const HOLIDAYS = new Set<ISODate>([
  '2026-01-01', '2026-02-16', '2026-04-03', '2026-05-18', '2026-07-01',
  '2026-08-03', '2026-09-07', '2026-10-12', '2026-12-25', '2026-12-26',
]);

export const isBusinessDay = (d: ISODate) => dow(d) !== 0 && dow(d) !== 6 && !HOLIDAYS.has(d);

export function addBusinessDays(d: ISODate, n: number): ISODate {
  let cur = d;
  let left = Math.abs(n);
  const step = n < 0 ? -1 : 1;
  while (left > 0) {
    cur = addDays(cur, step);
    if (isBusinessDay(cur)) left--;
  }
  return cur;
}

/** Inclusive of neither endpoint's weekend/holiday days. from < to => positive. */
export function businessDaysBetween(from: ISODate, to: ISODate): number {
  if (from === to) return 0;
  const backwards = from > to;
  let [a, b] = backwards ? [to, from] : [from, to];
  let n = 0;
  let cur = a;
  while (cur < b) {
    cur = addDays(cur, 1);
    if (isBusinessDay(cur)) n++;
  }
  return backwards ? -n : n;
}

export function calendarDaysBetween(from: ISODate, to: ISODate): number {
  return Math.round((anchor(to).getTime() - anchor(from).getTime()) / 86400000);
}

/** Next occurrence of a weekday name strictly after `from`. */
export function nextWeekday(from: ISODate, targetDow: number): ISODate {
  let cur = addDays(from, 1);
  while (dow(cur) !== targetDow) cur = addDays(cur, 1);
  return cur;
}

/** Monday of the week following the week containing `from`. */
export function mondayOfNextWeek(from: ISODate): ISODate {
  let cur = addDays(from, 1);
  while (dow(cur) !== 1) cur = addDays(cur, 1);
  return cur;
}

export function firstOfNextMonth(from: ISODate): ISODate {
  const dt = anchor(from);
  dt.setUTCDate(1);
  dt.setUTCMonth(dt.getUTCMonth() + 1);
  return fmt(dt);
}

export function lastOfMonth(d: ISODate): ISODate {
  const dt = anchor(d);
  dt.setUTCMonth(dt.getUTCMonth() + 1, 0);
  return fmt(dt);
}

export const WEEKDAYS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};
