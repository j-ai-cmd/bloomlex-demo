import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Icon, Pill, Button } from '../lib/ui';
import AnimatedTabs from '../components/smoothui/animated-tabs';

const CATEGORY: Record<string, { label: string; tone: string; bar: string }> = {
  court:             { label: 'COURT',             tone: 'overdue',  bar: 'border-l-error' },
  client_commitment: { label: 'CLIENT COMMITMENT',  tone: 'accent',   bar: 'border-l-secondary' },
  deadline:          { label: 'DEADLINE',           tone: 'neutral',  bar: 'border-l-surface-tint' },
  follow_up:         { label: 'FOLLOW-UP',          tone: 'awaiting', bar: 'border-l-status-awaiting-fg' },
  consultation:      { label: 'CONSULTATION',       tone: 'neutral',  bar: 'border-l-outline' },
};

// ─── Standing demo deadlines — full September 2026 ───────────────────────────
const BASE: Record<string, any[]> = {
  '2026-09-01': [
    { id: 1,  category: 'court',             action_text: 'File amended statement of claim — Patel v. Horizon Realty',                   matter_ref: 'MAT-2024-0091', time_precision: 'exact', channel: 'email', confidence: 0.97, verbatim_text: 'Amended claim must be in by end of day Monday without fail.' },
    { id: 2,  category: 'follow_up',         action_text: 'Follow up with Silvio on retainer signature — Nakamura estate',              matter_ref: 'MAT-2024-0103', time_precision: 'day',   channel: 'call',  confidence: 0.88, verbatim_text: 'I said I would circle back to him Monday to get that signed.' },
  ],
  '2026-09-02': [
    { id: 3,  category: 'deadline',          action_text: 'Submit discovery responses — Chen v. Westfield Group',                       matter_ref: 'MAT-2025-0017', time_precision: 'exact', channel: 'email', confidence: 0.95, verbatim_text: 'Discovery responses are due Tuesday, 30-day window closes.' },
    { id: 4,  category: 'client_commitment', action_text: 'Send settlement summary letter to Mrs. Okafor',                              matter_ref: 'MAT-2024-0055', time_precision: 'day',   channel: 'call',  confidence: 0.91, verbatim_text: 'I will have that letter to you by Tuesday, I promise.' },
    { id: 5,  category: 'consultation',      action_text: 'Initial consultation — Mercer family trust restructure',                     matter_ref: null,            time_precision: 'day',   channel: 'call',  confidence: 0.85, verbatim_text: 'Tuesday at 2 pm, the Mercers are coming in for the trust review.' },
  ],
  '2026-09-03': [
    { id: 6,  category: 'court',             action_text: 'Motion to compel hearing — Al-Rashid v. City Transit Authority',             matter_ref: 'MAT-2023-0198', time_precision: 'exact', channel: 'call',  confidence: 0.98, verbatim_text: 'The motion to compel is on Wednesday, courtroom 4B at 10 am.' },
    { id: 7,  category: 'client_commitment', action_text: 'Deliver contract review memo — Drummond Logistics',                          matter_ref: 'MAT-2025-0041', time_precision: 'day',   channel: 'email', confidence: 0.93, verbatim_text: 'I told them they would have my comments by Wednesday afternoon.' },
    { id: 8,  category: 'follow_up',         action_text: 'Confirm expert witness availability — Goldstein v. MedPath Inc.',            matter_ref: 'MAT-2024-0077', time_precision: 'day',   channel: 'email', confidence: 0.82, verbatim_text: 'Need to lock in Dr. Osei by Wednesday or we lose the slot.' },
  ],
  '2026-09-04': [
    { id: 9,  category: 'deadline',          action_text: 'Statutory limitation period — Singh property dispute',                       matter_ref: 'MAT-2022-0303', time_precision: 'exact', channel: 'email', confidence: 0.99, verbatim_text: 'Thursday is the hard limitation date — we cannot miss it.' },
    { id: 10, category: 'client_commitment', action_text: 'Return call to Huang family re: immigration appeal update',                  matter_ref: 'MAT-2025-0088', time_precision: 'day',   channel: 'call',  confidence: 0.87, verbatim_text: 'I said I would call them back Thursday with the appeal status.' },
  ],
  '2026-09-05': [
    { id: 11, category: 'court',             action_text: 'File trial brief — Kowalski v. Apex Construction',                           matter_ref: 'MAT-2023-0141', time_precision: 'exact', channel: 'email', confidence: 0.96, verbatim_text: 'Trial brief is due Friday by 4 pm, no extensions available.' },
    { id: 12, category: 'deadline',          action_text: 'Weekly conflict-check sweep — all new intake files',                         matter_ref: null,            time_precision: 'day',   channel: 'email', confidence: 1.00, verbatim_text: 'Run the conflict check every Friday before anything new opens.' },
    { id: 13, category: 'follow_up',         action_text: 'Chase opposing counsel response — Park v. Bridgemont Developments',          matter_ref: 'MAT-2025-0009', time_precision: 'day',   channel: 'email', confidence: 0.89, verbatim_text: 'If I have not heard back by Friday I need to escalate to the court.' },
  ],
  '2026-09-08': [
    { id: 20, category: 'court',             action_text: 'Pre-trial conference — R. v. Okafor',                                       matter_ref: 'MAT-2024-0055', time_precision: 'exact', channel: 'call',  confidence: 0.97, verbatim_text: 'Pre-trial is Monday the 8th, courtroom 2 at 9 am, be there early.' },
    { id: 21, category: 'deadline',          action_text: 'File disclosure request letter — Kowalski v. Apex Construction',             matter_ref: 'MAT-2023-0141', time_precision: 'exact', channel: 'email', confidence: 0.94, verbatim_text: 'Disclosure request has to go out Monday or we lose the two-week window.' },
    { id: 22, category: 'client_commitment', action_text: 'Return call to Patel family on amended claim status',                        matter_ref: 'MAT-2024-0091', time_precision: 'day',   channel: 'call',  confidence: 0.88, verbatim_text: 'I will call them Monday once the filing is confirmed.' },
  ],
  '2026-09-09': [
    { id: 23, category: 'deadline',          action_text: 'File defence motion materials — Chen v. Westfield Group',                    matter_ref: 'MAT-2025-0017', time_precision: 'exact', channel: 'email', confidence: 0.95, verbatim_text: 'Motion materials are due Tuesday the 9th by noon.' },
    { id: 24, category: 'consultation',      action_text: 'Intake consultation — Vega family estate dispute',                           matter_ref: null,            time_precision: 'day',   channel: 'call',  confidence: 0.83, verbatim_text: 'The Vega family is coming in Tuesday afternoon for the estate matter.' },
  ],
  '2026-09-10': [
    { id: 25, category: 'court',             action_text: 'Status conference — Singh property dispute',                                  matter_ref: 'MAT-2022-0303', time_precision: 'exact', channel: 'call',  confidence: 0.96, verbatim_text: 'Status conference Wednesday the 10th, Judge Fontaine presiding.' },
    { id: 26, category: 'client_commitment', action_text: 'Deliver updated immigration brief to Huang family',                          matter_ref: 'MAT-2025-0088', time_precision: 'day',   channel: 'email', confidence: 0.90, verbatim_text: 'I promised to have the updated brief to them by Wednesday.' },
  ],
  '2026-09-11': [
    { id: 27, category: 'deadline',          action_text: 'Bail review hearing prep — compile materials — R. v. Okafor',               matter_ref: 'MAT-2024-0055', time_precision: 'day',   channel: 'email', confidence: 0.91, verbatim_text: 'Materials for the bail review need to be ready Thursday for Monday hearing.' },
    { id: 28, category: 'follow_up',         action_text: 'Review expert toxicology report — Goldstein v. MedPath',                    matter_ref: 'MAT-2024-0077', time_precision: 'day',   channel: 'email', confidence: 0.86, verbatim_text: 'Dr. Osei said the report would land Thursday — review it same day.' },
  ],
  '2026-09-12': [
    { id: 29, category: 'deadline',          action_text: 'File trial compendium — Kowalski v. Apex Construction',                     matter_ref: 'MAT-2023-0141', time_precision: 'exact', channel: 'email', confidence: 0.97, verbatim_text: 'Trial compendium due Friday — court will not accept it after 4 pm.' },
    { id: 30, category: 'deadline',          action_text: 'Weekly conflict-check sweep — all new intake files',                         matter_ref: null,            time_precision: 'day',   channel: 'email', confidence: 1.00, verbatim_text: 'Run the conflict check every Friday before anything new opens.' },
    { id: 31, category: 'follow_up',         action_text: 'Confirm Crown availability for disclosure conference — R. v. Okafor',       matter_ref: 'MAT-2024-0055', time_precision: 'day',   channel: 'email', confidence: 0.84, verbatim_text: 'Reach out Friday to lock in the Crown for the week of the 15th.' },
  ],
  '2026-09-15': [
    { id: 40, category: 'court',             action_text: 'Bail review hearing — R. v. Okafor',                                        matter_ref: 'MAT-2024-0055', time_precision: 'exact', channel: 'call',  confidence: 0.99, verbatim_text: 'Bail review is Monday the 15th, 10 am — this is the critical one.' },
    { id: 41, category: 'client_commitment', action_text: 'Call Patel family with amended claim outcome',                              matter_ref: 'MAT-2024-0091', time_precision: 'day',   channel: 'call',  confidence: 0.88, verbatim_text: 'Call them right after the filing is confirmed Monday.' },
  ],
  '2026-09-16': [
    { id: 42, category: 'deadline',          action_text: 'File disclosure follow-up letter — R. v. Okafor',                           matter_ref: 'MAT-2024-0055', time_precision: 'exact', channel: 'email', confidence: 0.93, verbatim_text: 'Follow-up letter to Crown due Tuesday — 14-day window from first request.' },
    { id: 43, category: 'consultation',      action_text: 'Settlement conference prep meeting — Chen v. Westfield Group',               matter_ref: 'MAT-2025-0017', time_precision: 'day',   channel: 'call',  confidence: 0.86, verbatim_text: 'Meet with Chen Tuesday before the conference to align on offers.' },
  ],
  '2026-09-17': [
    { id: 44, category: 'court',             action_text: 'Pre-trial conference — Kowalski v. Apex Construction',                      matter_ref: 'MAT-2023-0141', time_precision: 'exact', channel: 'call',  confidence: 0.97, verbatim_text: 'Pre-trial on Wednesday the 17th, Judge Lawson, 11 am.' },
    { id: 45, category: 'follow_up',         action_text: 'Follow up on expert invoice approval — Goldstein v. MedPath',               matter_ref: 'MAT-2024-0077', time_precision: 'day',   channel: 'email', confidence: 0.81, verbatim_text: 'Chase accounts Wednesday — expert will not file without confirmation.' },
  ],
  '2026-09-18': [
    { id: 46, category: 'deadline',          action_text: 'File trial brief amendment — Kowalski v. Apex Construction',                matter_ref: 'MAT-2023-0141', time_precision: 'exact', channel: 'email', confidence: 0.95, verbatim_text: 'Amendment to the brief has to be in by Thursday the 18th.' },
    { id: 47, category: 'client_commitment', action_text: 'Send Singh estate summary to client',                                        matter_ref: 'MAT-2022-0303', time_precision: 'day',   channel: 'email', confidence: 0.89, verbatim_text: 'Promised a written summary to the Singhs by Thursday.' },
  ],
  '2026-09-19': [
    { id: 48, category: 'deadline',          action_text: 'Weekly conflict-check sweep — all new intake files',                         matter_ref: null,            time_precision: 'day',   channel: 'email', confidence: 1.00, verbatim_text: 'Run the conflict check every Friday before anything new opens.' },
    { id: 49, category: 'follow_up',         action_text: 'Confirm witness list with client — Kowalski trial',                         matter_ref: 'MAT-2023-0141', time_precision: 'day',   channel: 'call',  confidence: 0.87, verbatim_text: 'Friday is the last day to add or remove witnesses before trial.' },
  ],
  '2026-09-22': [
    { id: 50, category: 'court',             action_text: 'Jury selection — Kowalski v. Apex Construction, Day 1',                     matter_ref: 'MAT-2023-0141', time_precision: 'exact', channel: 'call',  confidence: 0.99, verbatim_text: 'Jury selection starts Monday the 22nd — be there by 8:30 am.' },
    { id: 51, category: 'deadline',          action_text: 'File defence witness list — Kowalski v. Apex Construction',                  matter_ref: 'MAT-2023-0141', time_precision: 'exact', channel: 'email', confidence: 0.96, verbatim_text: 'Witness list must be filed Monday morning before selection starts.' },
  ],
  '2026-09-23': [
    { id: 52, category: 'court',             action_text: 'Jury selection — Kowalski v. Apex Construction, Day 2',                     matter_ref: 'MAT-2023-0141', time_precision: 'exact', channel: 'call',  confidence: 0.98, verbatim_text: 'Selection continues Tuesday — expect to finish by end of day.' },
    { id: 53, category: 'client_commitment', action_text: 'Trial prep session with client — Kowalski',                                 matter_ref: 'MAT-2023-0141', time_precision: 'day',   channel: 'call',  confidence: 0.92, verbatim_text: 'Tuesday evening with Kowalski — final run-through before opening.' },
  ],
  '2026-09-24': [
    { id: 54, category: 'deadline',          action_text: 'File supplementary witness statements — Kowalski v. Apex',                  matter_ref: 'MAT-2023-0141', time_precision: 'exact', channel: 'email', confidence: 0.94, verbatim_text: 'Supplementary statements must go in Wednesday — trial starts Thursday.' },
    { id: 55, category: 'follow_up',         action_text: 'Confirm court reporter for trial — Kowalski v. Apex',                       matter_ref: 'MAT-2023-0141', time_precision: 'day',   channel: 'call',  confidence: 0.85, verbatim_text: 'Call the reporting firm Wednesday to confirm they are set for Thursday.' },
  ],
  '2026-09-25': [
    { id: 56, category: 'court',             action_text: 'Trial begins — Kowalski v. Apex Construction, Day 1',                       matter_ref: 'MAT-2023-0141', time_precision: 'exact', channel: 'call',  confidence: 1.00, verbatim_text: 'Trial starts Thursday the 25th. Opening statements in the morning.' },
    { id: 57, category: 'deadline',          action_text: 'Pre-trial motions filed — Park v. Bridgemont Developments',                 matter_ref: 'MAT-2025-0009', time_precision: 'exact', channel: 'email', confidence: 0.93, verbatim_text: 'Pre-trial motions deadline is Thursday — 30 days before the scheduled hearing.' },
  ],
  '2026-09-26': [
    { id: 58, category: 'court',             action_text: 'Trial — Kowalski v. Apex Construction, Day 2',                              matter_ref: 'MAT-2023-0141', time_precision: 'exact', channel: 'call',  confidence: 1.00, verbatim_text: 'Day 2 of trial — Crown witnesses in the morning.' },
    { id: 59, category: 'deadline',          action_text: 'Last day to serve supplementary disclosure — R. v. Okafor',                matter_ref: 'MAT-2024-0055', time_precision: 'exact', channel: 'email', confidence: 0.95, verbatim_text: 'Supplementary materials must be served Friday — Crown confirmed this window.' },
    { id: 60, category: 'deadline',          action_text: 'Weekly conflict-check sweep — all new intake files',                         matter_ref: null,            time_precision: 'day',   channel: 'email', confidence: 1.00, verbatim_text: 'Run the conflict check every Friday before anything new opens.' },
  ],
  '2026-09-29': [
    { id: 61, category: 'court',             action_text: 'Trial — Kowalski v. Apex Construction, Day 3 (defence opens)',              matter_ref: 'MAT-2023-0141', time_precision: 'exact', channel: 'call',  confidence: 1.00, verbatim_text: 'Defence opens Monday — this is our day.' },
    { id: 62, category: 'client_commitment', action_text: 'Month-end billing review — all active matters',                             matter_ref: null,            time_precision: 'day',   channel: 'email', confidence: 1.00, verbatim_text: 'Invoices go out Monday — run the billing sweep before 10 am.' },
  ],
  '2026-09-30': [
    { id: 63, category: 'court',             action_text: 'Trial — Kowalski v. Apex Construction, Day 4',                              matter_ref: 'MAT-2023-0141', time_precision: 'exact', channel: 'call',  confidence: 1.00, verbatim_text: 'Cross-examination of defence witnesses on Tuesday.' },
    { id: 64, category: 'deadline',          action_text: 'File trial record — all matters closed this quarter',                       matter_ref: null,            time_precision: 'day',   channel: 'email', confidence: 0.97, verbatim_text: 'End of month — file the trial record for every matter that closed.' },
  ],
};

// ─── Disclosure-generated items (appear after demo upload runs) ───────────────
const DISCLOSURE_ITEMS: Record<string, any[]> = {
  '2026-09-03': [
    { id: 100, category: 'follow_up',  action_text: 'Review unidentified supplementary package — R. v. Okafor',          matter_ref: 'MAT-2024-0055', time_precision: 'day', channel: 'disclosure', confidence: 0.97, verbatim_text: 'Ava flagged an unidentified scan in the disclosure package — lawyer review required before it can be filed.', fromDisclosure: true },
  ],
  '2026-09-04': [
    { id: 101, category: 'follow_up',  action_text: 'Follow up with Crown on outstanding disclosure items — R. v. Okafor', matter_ref: 'MAT-2024-0055', time_precision: 'day', channel: 'disclosure', confidence: 0.94, verbatim_text: 'Three items remain outstanding on the register. Chase Crown before the bail review.', fromDisclosure: true },
  ],
  '2026-09-05': [
    { id: 102, category: 'deadline',   action_text: 'Serve disclosure acknowledgement letter — R. v. Okafor',             matter_ref: 'MAT-2024-0055', time_precision: 'day', channel: 'disclosure', confidence: 0.91, verbatim_text: 'Standard practice — serve acknowledgement within 5 days of receiving Crown disclosure.', fromDisclosure: true },
  ],
};

const DISCLOSURE_KEY = 'bloomlex_demo_disclosure_ran';

const SYNC_KEY = 'bloomlex_calendar_synced_ids';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number) => String(n).padStart(2, '0');
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const jitter = (a: number, b: number) => a + Math.random() * (b - a);

type Listed = {
  id: string; date: string; daysUntil: number; matterRef: string; label: string;
  category: string; channel: string; fromDisclosure: boolean;
};

function daysBetween(fromISO: string, toISO: string) {
  return Math.round((Date.parse(`${toISO}T12:00:00Z`) - Date.parse(`${fromISO}T12:00:00Z`)) / 86400000);
}
const daysLabel = (n: number) =>
  n === 0 ? 'Today' : n < 0 ? `${-n} day${n === -1 ? '' : 's'} ago` : `In ${n} day${n === 1 ? '' : 's'}`;
const fmtShort = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Every deadline on file, soonest first, with days until due. */
function listDeadlines(disclosureRan: boolean, todayISO: string): Listed[] {
  const out: Listed[] = [];
  const add = (src: Record<string, any[]>, fromDisclosure: boolean) =>
    Object.entries(src).forEach(([date, items]) => items.forEach((c) => out.push({
      id: String(c.id), date, daysUntil: daysBetween(todayISO, date), matterRef: c.matter_ref ?? 'New intake',
      label: c.action_text, category: c.category, channel: c.channel, fromDisclosure,
    })));
  add(BASE, false);
  if (disclosureRan) add(DISCLOSURE_ITEMS, true);
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Compares against the IDs seen at the previous sync; anything unseen is flagged as new. */
function syncDeadlines(all: Listed[], previousSyncIds: string[]) {
  const seen = new Set(previousSyncIds);
  return all.filter((d) => !seen.has(d.id));
}

function loadSyncedIds(): string[] {
  try {
    const raw = localStorage.getItem(SYNC_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  // First visit: the standing deadlines count as already synced, so a sync after a
  // disclosure upload flags exactly the items that upload added.
  return listDeadlines(false, '1970-01-01').map((d) => d.id);
}

function useIsMobile(query = '(max-width: 767px)') {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMobile(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return mobile;
}

/* ─── Chip + popover ─────────────────────────────────────────────────────── */

function DeadlineChip({ d, isNew, isUrgent, compact, onToggleUrgent, onOpenMatter }: {
  d: Listed; isNew: boolean; isUrgent: boolean; compact?: boolean;
  onToggleUrgent: (id: string) => void; onOpenMatter: (ref: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const cat = CATEGORY[d.category] ?? CATEGORY.deadline;

  // The popover lives in a portal so the grid's overflow never clips it; place it above the
  // chip when there is room, otherwise below, and keep it inside the viewport.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const place = () => {
      const r = btnRef.current!.getBoundingClientRect();
      const w = 272, h = popRef.current?.offsetHeight ?? 170, gap = 8;
      const above = r.top - h - gap > 8;
      setPos({
        left: Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8),
        top: above ? r.top - h - gap : r.bottom + gap,
        above,
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, isUrgent]); // urgent chips sort first, so the anchor can move

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!popRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); } };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    popRef.current?.querySelector<HTMLElement>('button')?.focus();
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <>
      <button ref={btnRef} type="button" aria-expanded={open} aria-haspopup="dialog"
        aria-label={`${d.label}, ${d.matterRef}, ${fmtShort(d.date)}${isUrgent ? ', urgent' : ''}${isNew ? ', new since the last sync' : ''}`}
        onClick={() => setOpen((o) => !o)}
        className={`relative w-full text-left rounded border-l-[3px] ${cat.bar} border border-surface-border transition-transform hover:-translate-y-px ${
          isUrgent ? 'bg-status-overdue-bg border-status-overdue-border' : 'bg-surface-container-lowest'} ${
          isNew ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface-container-low' : ''} ${
          compact ? 'px-space-md py-space-sm' : 'px-space-xs py-space-2xs'}`}>
        {isNew && <span aria-hidden="true" className="absolute -right-1 -top-1 w-2.5 h-2.5 rounded-full bg-accent animate-ping" />}
        <span className="flex items-center gap-space-2xs">
          {isUrgent && <Icon name="bolt" className="text-[13px] text-error shrink-0" />}
          {d.fromDisclosure && <Icon name="upload_file" className="text-[13px] text-status-satisfied-fg shrink-0" />}
          <span className="truncate font-code-timestamp text-caption-meta text-on-surface-variant">{d.matterRef}</span>
        </span>
        <span className={`block truncate text-on-surface ${compact ? 'font-body-strong text-body-strong' : 'font-body-compact text-caption-meta font-semibold'}`}>{d.label}</span>
        {compact && (
          <span className="block font-caption-meta text-caption-meta text-on-surface-variant mt-space-2xs">
            {fmtShort(d.date)} · {daysLabel(d.daysUntil)}
          </span>
        )}
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div ref={popRef} role="dialog" aria-label={d.label}
              style={{ position: 'fixed', left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: 272, zIndex: 60 }}
              initial={{ opacity: 0, y: pos?.above === false ? -6 : 6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.97, transition: { duration: 0.12 } }}
              transition={{ type: 'spring', bounce: 0.1, duration: 0.25 }}
              className="bg-surface-container-lowest border border-surface-border rounded-xl shadow-xl p-space-lg flex flex-col gap-space-sm">
              <div className="flex items-center justify-between gap-space-xs">
                <Pill tone={cat.tone}>{cat.label}</Pill>
                <span className="px-space-sm py-space-2xs rounded-full bg-surface-container font-caption-meta text-caption-meta text-on-surface whitespace-nowrap">
                  {daysLabel(d.daysUntil)}
                </span>
              </div>
              <p className="font-body-strong text-body-strong text-on-surface">{d.label}</p>
              <p className="font-code-timestamp text-caption-meta text-on-surface-variant">
                {d.matterRef} · {fmtShort(d.date)} · via {d.channel}
              </p>
              {d.fromDisclosure && <span className="self-start"><Pill tone="satisfied">From disclosure upload</Pill></span>}
              <div className="flex items-center justify-end gap-space-xs pt-space-sm border-t border-surface-border">
                <button type="button" aria-pressed={isUrgent} onClick={() => onToggleUrgent(d.id)}
                  className={`flex items-center gap-space-2xs px-space-sm py-space-2xs rounded-full border font-caption-meta text-caption-meta font-semibold whitespace-nowrap transition-colors ${
                    isUrgent ? 'bg-error text-white border-error' : 'border-surface-border text-on-surface-variant hover:border-error/60 hover:text-error'}`}>
                  <Icon name={isUrgent ? 'bolt' : 'flag'} className="text-[13px]" />
                  {isUrgent ? 'Urgent' : 'Mark urgent'}
                </button>
                <button type="button" onClick={() => { setOpen(false); onOpenMatter(d.matterRef); }}
                  className="px-space-sm py-space-2xs rounded-full bg-primary text-on-primary font-caption-meta text-caption-meta font-semibold whitespace-nowrap hover:bg-primary-container">
                  Open matter
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

/* ─── Matter modal ───────────────────────────────────────────────────────── */

function MatterCard({ matterRef, deadlines, firm, onClose }: {
  matterRef: string | null; deadlines: Listed[]; firm: string; onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!matterRef) return;
    const back = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('keydown', esc); back?.focus?.(); };
  }, [matterRef, onClose]);

  const next = deadlines.find((d) => d.daysUntil >= 0);
  return (
    <AnimatePresence>
      {matterRef && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-space-lg"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div role="dialog" aria-modal="true" aria-label={matterRef} onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', bounce: 0.1, duration: 0.3 }}
            className="w-full max-w-md bg-surface-container-lowest border border-surface-border rounded-xl shadow-2xl p-space-xl flex flex-col gap-space-lg">
            <div className="flex items-start justify-between gap-space-md">
              <div>
                <h2 className="font-headline-matter text-headline-matter font-bold text-on-surface">{matterRef}</h2>
                <p className="font-caption-meta text-caption-meta text-on-surface-variant">{firm}</p>
              </div>
              <button ref={closeRef} type="button" aria-label="Close" onClick={onClose}
                className="w-10 h-10 rounded flex items-center justify-center text-on-surface-variant hover:bg-surface-container">
                <Icon name="close" className="text-[20px]" />
              </button>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-space-xl gap-y-space-xs p-space-md bg-surface-container-low border border-surface-border rounded font-body-compact text-body-compact">
              <dt className="text-on-surface-variant">Deadlines on file</dt><dd className="text-on-surface">{deadlines.length}</dd>
              <dt className="text-on-surface-variant">Next due</dt>
              <dd className="text-on-surface">{next ? `${fmtShort(next.date)} · ${daysLabel(next.daysUntil)}` : 'Nothing upcoming'}</dd>
            </dl>
            <div className="flex flex-col gap-space-xs">
              <h3 className="font-section-title text-section-title uppercase text-on-surface-variant">Deadlines</h3>
              <ul className="divide-y divide-surface-border border border-surface-border rounded max-h-64 overflow-y-auto">
                {deadlines.map((d) => (
                  <li key={d.id} className="px-space-md py-space-sm flex items-start justify-between gap-space-md">
                    <span className="font-body-compact text-body-compact text-on-surface">{d.label}</span>
                    <span className="font-code-timestamp text-caption-meta text-on-surface-variant whitespace-nowrap">{fmtShort(d.date)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export function Calendar({ meta }: { onChanged?: () => void; meta?: any }) {
  const today = new Date().toISOString().slice(0, 10);
  const [view, setView] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));
  const [dir, setDir] = useState(0);
  const [filter, setFilter] = useState('all');
  const [urgent, setUrgent] = useState<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);
  const [openMatter, setOpenMatter] = useState<string | null>(null);
  const syncedIds = useRef<string[]>(loadSyncedIds());
  const alive = useRef(true);
  const mobile = useIsMobile();
  const reduce = useReducedMotion();
  const [disclosureRan, setDisclosureRan] = useState(() => {
    try { return localStorage.getItem(DISCLOSURE_KEY) === 'true'; } catch { return false; }
  });

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const check = () => { try { setDisclosureRan(localStorage.getItem(DISCLOSURE_KEY) === 'true'); } catch {} };
    window.addEventListener('storage', check);
    window.addEventListener('bloomlex_disclosure', check);
    return () => { window.removeEventListener('storage', check); window.removeEventListener('bloomlex_disclosure', check); };
  }, []);

  const all = listDeadlines(disclosureRan, today);
  const shown = filter === 'all' ? all : all.filter((d) => d.category === filter);
  const byDate: Record<string, Listed[]> = {};
  shown.forEach((d) => { (byDate[d.date] ||= []).push(d); });
  Object.values(byDate).forEach((list) => list.sort((a, b) => Number(urgent.has(b.id)) - Number(urgent.has(a.id))));

  const monthKey = `${view.y}-${pad(view.m + 1)}`;
  const inMonth = all.filter((d) => d.date.startsWith(monthKey));
  const counts = Object.keys(CATEGORY).reduce<Record<string, number>>((acc, k) => {
    acc[k] = inMonth.filter((d) => d.category === k).length; return acc;
  }, {});
  const monthShown = shown
    .filter((d) => d.date.startsWith(monthKey))
    .sort((a, b) => a.date.localeCompare(b.date) || Number(urgent.has(b.id)) - Number(urgent.has(a.id)));

  const step = (delta: number) => {
    setDir(delta);
    setView((v) => {
      let m = v.m + delta, y = v.y;
      if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
      return { y, m };
    });
  };

  const toggleUrgent = useCallback((id: string) => setUrgent((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  }), []);
  const closeMatter = useCallback(() => setOpenMatter(null), []);

  // Same staged run as a real pull, minus the narration: the button only spins.
  async function sync() {
    setSyncing(true); setSynced(false);
    for (let i = 0; i < 5; i++) {
      await wait(jitter(350, 600));
      if (!alive.current) return;
    }
    const flagged = syncDeadlines(all, syncedIds.current);
    syncedIds.current = all.map((d) => d.id);
    try { localStorage.setItem(SYNC_KEY, JSON.stringify(syncedIds.current)); } catch {}
    setNewIds(flagged.map((f) => f.id));
    setSyncing(false); setSynced(true);
  }

  const first = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
  const days = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const chip = (d: Listed, compact?: boolean) => (
    <DeadlineChip key={d.id} d={d} compact={compact} isNew={newIds.includes(d.id)} isUrgent={urgent.has(d.id)}
      onToggleUrgent={toggleUrgent} onOpenMatter={setOpenMatter} />
  );

  return (
    <div className="flex flex-col w-full">
      {/* ── header ──────────────────────────────────────────────────────── */}
      <div className="px-space-xl pt-space-lg pb-space-md bg-surface-container-lowest border-b border-surface-border flex flex-col gap-space-md">
        <div className="flex items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-xs min-w-0">
            <Button aria-label="Previous month" onClick={() => step(-1)}><Icon name="chevron_left" className="text-[18px]" /></Button>
            <Button aria-label="Next month" onClick={() => step(1)}><Icon name="chevron_right" className="text-[18px]" /></Button>
            <div className="relative overflow-hidden ml-space-xs">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.h1 key={monthKey} initial={{ opacity: 0, y: dir * 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -dir * 10 }}
                  className="font-headline-matter text-headline-matter font-bold text-on-surface tracking-tight whitespace-nowrap">
                  {MONTHS[view.m]} {view.y}
                </motion.h1>
              </AnimatePresence>
            </div>
          </div>
          <motion.button type="button" onClick={sync} disabled={syncing} whileTap={reduce ? undefined : { scale: 0.94 }}
            aria-label={syncing ? 'Syncing deadlines' : 'Sync deadlines'} aria-busy={syncing}
            className="w-10 h-10 shrink-0 rounded-full bg-primary text-on-primary flex items-center justify-center hover:bg-primary-container disabled:opacity-70">
            <motion.span className="flex"
              animate={syncing && !reduce ? { rotate: 360 } : { rotate: 0 }}
              transition={syncing ? { repeat: Infinity, duration: 0.9, ease: 'linear' } : { duration: 0.2 }}>
              <Icon name={synced && !syncing ? 'check' : 'sync'} className="text-[20px]" />
            </motion.span>
          </motion.button>
        </div>

        <div className="overflow-x-auto py-space-2xs">
          <AnimatedTabs variant="pill" activeTab={filter} onChange={setFilter} layoutId="calendar-filter"
            className="bg-surface-container-low border border-surface-border whitespace-nowrap font-body-default"
            tabs={[
              { id: 'all', label: `All · ${inMonth.length}` },
              ...Object.entries(CATEGORY).map(([k, v]) => ({ id: k, label: `${v.label.toLowerCase()} · ${counts[k]}` })),
            ]} />
        </div>
      </div>

      {/* ── month ───────────────────────────────────────────────────────── */}
      <div className="p-space-xl">
        <div className="overflow-hidden rounded-xl">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={`${monthKey}-${mobile}`}
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: dir * 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: -dir * 60 }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}>
              {mobile ? (
                <ul className="flex flex-col gap-space-sm">
                  {monthShown.length === 0 && (
                    <li className="p-space-lg rounded border border-dashed border-surface-border font-body-compact text-body-compact text-on-surface-variant">
                      No deadlines this month.
                    </li>
                  )}
                  {monthShown.map((d) => <li key={d.id}>{chip(d, true)}</li>)}
                </ul>
              ) : (
                <div className="grid grid-cols-7 gap-px bg-surface-border border border-surface-border rounded-xl overflow-hidden">
                  {DAYS.map((x) => (
                    <div key={x} className="bg-surface-container py-space-xs text-center font-section-title text-caption-meta uppercase text-on-surface-variant">{x}</div>
                  ))}
                  {Array.from({ length: first }, (_, i) => <div key={`b${i}`} className="min-h-[112px] bg-surface-container-low" />)}
                  {Array.from({ length: days }, (_, i) => {
                    const iso = `${monthKey}-${pad(i + 1)}`;
                    const isToday = iso === today;
                    const list = byDate[iso] ?? [];
                    return (
                      <div key={iso} className={`min-h-[112px] min-w-0 bg-surface-container-lowest p-space-xs flex flex-col gap-space-2xs ${
                        isToday ? 'ring-2 ring-inset ring-primary' : ''}`}>
                        <div className={`font-code-timestamp text-caption-meta ${isToday ? 'font-bold text-primary' : 'text-on-surface-variant'}`}>
                          {i + 1}{isToday && <span className="sr-only"> (today)</span>}
                        </div>
                        {list.map((d) => chip(d))}
                      </div>
                    );
                  })}
                  {Array.from({ length: (7 - ((first + days) % 7)) % 7 }, (_, i) => <div key={`e${i}`} className="min-h-[112px] bg-surface-container-low" />)}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <MatterCard matterRef={openMatter} firm={meta?.firm ?? ''} onClose={closeMatter}
        deadlines={all.filter((d) => d.matterRef === openMatter)} />
    </div>
  );
}

/** Call this from Intake after demo runs to surface disclosure items on the Calendar. */
export function markDisclosureRan() {
  try {
    localStorage.setItem(DISCLOSURE_KEY, 'true');
    window.dispatchEvent(new Event('bloomlex_disclosure'));
  } catch {}
}
