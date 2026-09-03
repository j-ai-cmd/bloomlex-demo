/**
 * DETERMINISTIC dedup. Semantically duplicate obligations — same matter, same subject,
 * same date window — merge into the existing record rather than creating a second one.
 */
import { createHash } from 'node:crypto';
import { ISODate } from './time.js';

const STOP = new Set([
  'the','a','an','to','by','for','of','on','in','will','ll','send','me','my','his','her',
  'their','and','is','be','that','this','it','i','we','you','they','with','at','please',
]);

export function normaliseSubject(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .map((w) => w.replace(/(ing|ed|s)$/, ''))
    .sort()
    .join(' ')
    .trim();
}

/** A date window bucket: the ISO week, so "Thursday" and "Friday" of one week collide. */
export function dateBucket(d: ISODate | null): string {
  if (!d) return 'nodate';
  const dt = new Date(`${d}T12:00:00Z`);
  const day = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((dt.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function dedupKey(matterId: string | null, subject: string, due: ISODate | null): string {
  const raw = `${matterId ?? 'nomatter'}|${normaliseSubject(subject)}|${dateBucket(due)}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

/** Which fields differ between an existing commitment and a newly extracted one. */
export function changedFields(a: Record<string, any>, b: Record<string, any>, fields: string[]) {
  const out: Record<string, { from: any; to: any }> = {};
  for (const f of fields) {
    const av = a[f] instanceof Date ? a[f].toISOString().slice(0, 10) : a[f];
    const bv = b[f] instanceof Date ? b[f].toISOString().slice(0, 10) : b[f];
    if (String(av ?? '') !== String(bv ?? '')) out[f] = { from: av ?? null, to: bv ?? null };
  }
  return out;
}

/**
 * SUPERSESSION CANDIDATE MATCHING (deterministic).
 *
 * The exact hash above catches literal repeats. This catches the case that actually
 * matters: the SAME obligation described again with DIFFERENT information ("by Wednesday"
 * then "by Friday instead"). Subject tokens are compared with an overlap coefficient after
 * the date phrase is stripped, because the date is precisely the thing that changed.
 */
export const SUPERSESSION_OVERLAP_THRESHOLD = 0.7;
export const SUPERSESSION_MIN_SHARED_TOKENS = 2;

export function subjectTokens(actionText: string, datePhrase?: string | null): Set<string> {
  let t = actionText;
  if (datePhrase) t = t.replace(new RegExp(datePhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ');
  return new Set(normaliseSubject(t).split(' ').filter(Boolean));
}

/** Intersection over the smaller set. 1.0 means one subject fully contains the other. */
export function overlapCoefficient(a: Set<string>, b: Set<string>): { score: number; shared: string[] } {
  const shared = [...a].filter((x) => b.has(x));
  const denom = Math.max(1, Math.min(a.size, b.size));
  return { score: shared.length / denom, shared };
}

export function isSupersession(a: Set<string>, b: Set<string>): boolean {
  const { score, shared } = overlapCoefficient(a, b);
  return score >= SUPERSESSION_OVERLAP_THRESHOLD && shared.length >= SUPERSESSION_MIN_SHARED_TOKENS;
}
