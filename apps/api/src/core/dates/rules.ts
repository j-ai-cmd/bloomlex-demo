/**
 * DETERMINISTIC DATE RESOLVER — an explicit, inspectable rules table.
 *
 * Contract: a phrase resolves to a POINT, or to a RANGE of candidates, or to nothing.
 * Where a phrase yields a range or is genuinely ambiguous we DO NOT INVENT A DATE.
 * The caller creates a NEEDS CONFIRMATION item preserving the original phrase and the
 * candidate dates. Never guess a date.
 *
 * Every resolution carries the rule_id that fired so it can be pointed at on stage.
 */
import {
  ISODate, addDays, addBusinessDays, dow, nextWeekday, mondayOfNextWeek,
  firstOfNextMonth, lastOfMonth, WEEKDAYS, isBusinessDay,
} from '../time.js';

export type Precision = 'exact' | 'morning' | 'afternoon' | 'evening' | 'allday' | 'unresolved';
export type Candidate = { date: ISODate; label: string };

export type Resolution =
  | { kind: 'point'; rule_id: string; date: ISODate; precision: Precision; phrase: string }
  | { kind: 'range'; rule_id: string; candidates: Candidate[]; precision: Precision; phrase: string; reason: string }
  | { kind: 'unresolved'; rule_id: string; phrase: string; reason: string };

export type Ctx = {
  /** Reference "today" in firm timezone. */
  today: ISODate;
  /** The matter's next known court date, if any. Used only by the before_court rules. */
  nextCourtDate?: ISODate | null;
};

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
  september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11,
  december: 12, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, '0');

function partOfDay(text: string): Precision {
  if (/\bmorning\b/i.test(text)) return 'morning';
  if (/\bafternoon\b/i.test(text)) return 'afternoon';
  if (/\bevening|tonight\b/i.test(text)) return 'evening';
  return 'allday';
}

export type Rule = {
  id: string;
  description: string;
  example: string;
  yields: 'point' | 'range' | 'either';
  match: (phrase: string, ctx: Ctx) => Resolution | null;
};

/** The rules table. Order matters: the first rule that matches wins. */
export const RULES: Rule[] = [
  {
    id: 'exact_date_iso',
    description: 'ISO date appearing literally in the phrase',
    example: '2026-09-14',
    yields: 'point',
    match: (p) => {
      const m = p.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
      if (!m) return null;
      return { kind: 'point', rule_id: 'exact_date_iso', date: m[0], precision: partOfDay(p), phrase: m[0] };
    },
  },
  {
    id: 'exact_date_words',
    description: 'Month name with a day number; year inferred as the next occurrence',
    example: 'September 14',
    yields: 'point',
    match: (p, ctx) => {
      const m = p.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/) ??
                p.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+of\s+([A-Za-z]{3,9})\b/);
      if (!m) return null;
      const monthName = (MONTHS[m[1].toLowerCase()] ? m[1] : m[2]).toLowerCase();
      const dayStr = MONTHS[m[1].toLowerCase()] ? m[2] : m[1];
      const month = MONTHS[monthName];
      if (!month) return null;
      const day = parseInt(dayStr, 10);
      if (!day || day > 31) return null;
      const year = parseInt(ctx.today.slice(0, 4), 10);
      let d = `${year}-${pad(month)}-${pad(day)}`;
      if (d < ctx.today) d = `${year + 1}-${pad(month)}-${pad(day)}`;
      return { kind: 'point', rule_id: 'exact_date_words', date: d, precision: partOfDay(p), phrase: m[0] };
    },
  },
  {
    id: 'today_part',
    description: 'Today, optionally with a part of day',
    example: 'this afternoon',
    yields: 'point',
    match: (p, ctx) => {
      const m = p.match(/\b(today|this (morning|afternoon|evening)|tonight)\b/i);
      if (!m) return null;
      return { kind: 'point', rule_id: 'today_part', date: ctx.today, precision: partOfDay(m[0]), phrase: m[0] };
    },
  },
  {
    id: 'tomorrow_part',
    description: 'Tomorrow, optionally with a part of day',
    example: 'tomorrow afternoon',
    yields: 'point',
    match: (p, ctx) => {
      const m = p.match(/\btomorrow(\s+(morning|afternoon|evening))?\b/i);
      if (!m) return null;
      return { kind: 'point', rule_id: 'tomorrow_part', date: addDays(ctx.today, 1), precision: partOfDay(m[0]), phrase: m[0] };
    },
  },
  {
    id: 'n_days_before_court',
    description: 'A count of days before the matter\'s next court date',
    example: 'two days before court',
    yields: 'point',
    match: (p, ctx) => {
      const m = p.match(/\b(\d+|one|two|three|four|five)\s+(business\s+)?days?\s+before\s+(court|the hearing|trial)\b/i);
      if (!m) return null;
      if (!ctx.nextCourtDate) {
        return { kind: 'unresolved', rule_id: 'n_days_before_court', phrase: m[0],
          reason: 'no known next court date for this matter to anchor to' };
      }
      const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
      const n = parseInt(m[1], 10) || words[m[1].toLowerCase()];
      const d = m[2] ? addBusinessDays(ctx.nextCourtDate, -n) : addDays(ctx.nextCourtDate, -n);
      return { kind: 'point', rule_id: 'n_days_before_court', date: d, precision: 'allday', phrase: m[0] };
    },
  },
  {
    id: 'before_court',
    description: 'Anchored to the matter\'s next court date; yields the business days before it',
    example: 'before court',
    yields: 'range',
    match: (p, ctx) => {
      const m = p.match(/\bbefore (court|the hearing|the appearance|trial)\b/i);
      if (!m) return null;
      if (!ctx.nextCourtDate) {
        return { kind: 'unresolved', rule_id: 'before_court', phrase: m[0],
          reason: 'no known next court date for this matter to anchor to' };
      }
      const candidates: Candidate[] = [];
      for (let i = 3; i >= 1; i--) {
        const d = addBusinessDays(ctx.nextCourtDate, -i);
        candidates.push({ date: d, label: `${i} business day${i > 1 ? 's' : ''} before court (${ctx.nextCourtDate})` });
      }
      return { kind: 'range', rule_id: 'before_court', candidates, precision: 'allday', phrase: m[0],
        reason: `"before court" names a window, not a day; anchored to next court date ${ctx.nextCourtDate}` };
    },
  },
  {
    id: 'weekday_next',
    description: 'Explicit "next <weekday>"',
    example: 'next Wednesday',
    yields: 'point',
    match: (p, ctx) => {
      const m = p.match(/\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
      if (!m) return null;
      const target = WEEKDAYS[m[1].toLowerCase()];
      // "next <weekday>" = that weekday in the week following the current one.
      let d = mondayOfNextWeek(ctx.today);
      while (dow(d) !== target) d = addDays(d, 1);
      return { kind: 'point', rule_id: 'weekday_next', date: d, precision: partOfDay(p), phrase: m[0] };
    },
  },
  {
    id: 'weekday_bare',
    description: 'A bare weekday name; resolves to the next occurrence',
    example: 'sometime Friday',
    yields: 'point',
    match: (p, ctx) => {
      const m = p.match(/\b(?:sometime\s+|on\s+|this\s+|by\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
      if (!m) return null;
      const d = nextWeekday(ctx.today, WEEKDAYS[m[1].toLowerCase()]);
      return { kind: 'point', rule_id: 'weekday_bare', date: d, precision: partOfDay(p), phrase: m[0] };
    },
  },
  {
    id: 'in_n_days',
    description: 'A relative count of days or weeks',
    example: 'in three days',
    yields: 'point',
    match: (p, ctx) => {
      const m = p.match(/\bin\s+(\d+|a|one|two|three|four|five|six)\s+(business\s+)?(day|week)s?\b/i);
      if (!m) return null;
      const words: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
      const n = parseInt(m[1], 10) || words[m[1].toLowerCase()];
      const days = m[3].toLowerCase() === 'week' ? n * 7 : n;
      const d = m[2] ? addBusinessDays(ctx.today, days) : addDays(ctx.today, days);
      return { kind: 'point', rule_id: 'in_n_days', date: d, precision: partOfDay(p), phrase: m[0] };
    },
  },
  {
    id: 'end_of_week',
    description: 'End of the current week resolves to the coming Friday',
    example: 'by the end of the week',
    yields: 'point',
    match: (p, ctx) => {
      const m = p.match(/\b(end of (the )?week|by friday)\b/i);
      if (!m) return null;
      const d = dow(ctx.today) === 5 ? ctx.today : nextWeekday(ctx.today, 5);
      return { kind: 'point', rule_id: 'end_of_week', date: d, precision: 'allday', phrase: m[0] };
    },
  },
  {
    id: 'next_week',
    description: 'Names a week, not a day — RANGE, needs confirmation',
    example: 'next week',
    yields: 'range',
    match: (p, ctx) => {
      const m = p.match(/\bnext week\b/i);
      if (!m) return null;
      const mon = mondayOfNextWeek(ctx.today);
      const candidates: Candidate[] = [];
      for (let i = 0; i < 5; i++) {
        const d = addDays(mon, i);
        candidates.push({ date: d, label: new Date(`${d}T12:00:00Z`).toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }) });
      }
      return { kind: 'range', rule_id: 'next_week', candidates, precision: 'allday', phrase: m[0],
        reason: '"next week" names a week, not a day' };
    },
  },
  {
    id: 'early_next_month',
    description: 'Early / mid / end of next month — RANGE, needs confirmation',
    example: 'early next month',
    yields: 'range',
    match: (p, ctx) => {
      const m = p.match(/\b(early|mid|middle of|end of|late)\s+next month\b/i);
      if (!m) return null;
      const first = firstOfNextMonth(ctx.today);
      const which = m[1].toLowerCase();
      let dates: ISODate[] = [];
      if (which === 'early') dates = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(first, i));
      else if (which === 'mid' || which === 'middle of') dates = [13, 14, 15, 16].map((i) => addDays(first, i));
      else {
        const last = lastOfMonth(first);
        dates = [-3, -2, -1, 0].map((i) => addDays(last, i));
      }
      const candidates = dates.filter(isBusinessDay).map((d) => ({
        date: d,
        label: new Date(`${d}T12:00:00Z`).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }),
      }));
      return { kind: 'range', rule_id: 'early_next_month', candidates, precision: 'allday', phrase: m[0],
        reason: `"${m[0]}" names a window within ${first.slice(0, 7)}, not a day` };
    },
  },
  {
    id: 'vague_soon',
    description: 'Genuinely unresolvable vagueness — creates nothing, raises a review item',
    example: 'soon / shortly / in due course',
    yields: 'range',
    match: (p) => {
      const m = p.match(/\b(soon|shortly|in due course|asap|at some point|when I can|later)\b/i);
      if (!m) return null;
      return { kind: 'unresolved', rule_id: 'vague_soon', phrase: m[0],
        reason: `"${m[0]}" carries no date information` };
    },
  },
];

export function resolveDate(phrase: string, ctx: Ctx): Resolution {
  for (const rule of RULES) {
    const r = rule.match(phrase, ctx);
    if (r) return r;
  }
  return { kind: 'unresolved', rule_id: 'no_rule_matched', phrase,
    reason: 'no rule in the date table matched this phrase' };
}

/** Exposed over the API so the rules table is inspectable from the UI. */
export const rulesTable = () => RULES.map(({ id, description, example, yields }) => ({ id, description, example, yields }));
