import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Icon, Pill, Button } from '../lib/ui';
import AnimatedTabs from '../components/smoothui/animated-tabs';

// `bar` is the chip stripe; `dot` is the same colour as a key beside each filter tab.
const CATEGORY: Record<string, { label: string; tone: string; bar: string; dot: string }> = {
  court:             { label: 'COURT',             tone: 'overdue',  bar: 'border-l-error',               dot: 'bg-error' },
  client_commitment: { label: 'CLIENT COMMITMENT',  tone: 'accent',   bar: 'border-l-secondary',           dot: 'bg-secondary' },
  deadline:          { label: 'DEADLINE',           tone: 'neutral',  bar: 'border-l-surface-tint',        dot: 'bg-surface-tint' },
  follow_up:         { label: 'FOLLOW-UP',          tone: 'awaiting', bar: 'border-l-status-awaiting-fg',  dot: 'bg-status-awaiting-fg' },
  consultation:      { label: 'CONSULTATION',       tone: 'neutral',  bar: 'border-l-outline',             dot: 'bg-outline' },
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
const NEW_KEY = 'bloomlex_calendar_new_ids';
const URGENT_KEY = 'bloomlex_calendar_urgent_ids';
const LAST_SYNC_KEY = 'bloomlex_calendar_last_sync';
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
function shiftISO(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
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

function load<T>(key: string, fallback: () => T): T {
  try { const raw = localStorage.getItem(key); if (raw) return JSON.parse(raw); } catch {}
  return fallback();
}
function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// First visit: the standing deadlines count as already synced, so a sync after a
// disclosure upload flags exactly the items that upload added.
const baselineIds = () => listDeadlines(false, '1970-01-01').map((d) => d.id);

/** State that must outlive the page: kept in localStorage so leaving Calendar loses nothing. */
function usePersistentSet(key: string) {
  const [set, setSet] = useState<Set<string>>(() => new Set(load<string[]>(key, () => [])));
  const update = useCallback((fn: (prev: Set<string>) => Set<string>) => setSet((prev) => {
    const next = fn(prev); save(key, [...next]); return next;
  }), [key]);
  return [set, update] as const;
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

/* ─── Modal shell ────────────────────────────────────────────────────────── */

/**
 * Renders at <body> level and makes the app behind it inert, so Tab stays inside.
 * Focus lands on the close button and goes back to `returnTo` when it closes.
 */
function Modal({ open, label, returnTo, onClose, children }: {
  open: boolean; label: string; returnTo: HTMLElement | null; onClose: () => void; children: (closeRef: React.RefObject<HTMLButtonElement>) => React.ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    closeRef.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('keydown', esc);
      root?.removeAttribute('inert');
      if (returnTo?.isConnected) returnTo.focus();
    };
  }, [open, onClose, returnTo]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-space-lg"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', bounce: 0.1, duration: 0.3 }}
            className="w-full max-w-md max-h-[85vh] overflow-y-auto bg-surface-container-lowest border border-surface-border rounded-xl shadow-2xl p-space-xl flex flex-col gap-space-lg">
            {children(closeRef)}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function ModalHeader({ title, sub, closeRef, onClose }: {
  title: string; sub?: string; closeRef: React.RefObject<HTMLButtonElement>; onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-space-md">
      <div>
        <h2 className="font-headline-matter text-headline-matter font-bold text-on-surface">{title}</h2>
        {sub && <p className="font-caption-meta text-caption-meta text-on-surface-variant">{sub}</p>}
      </div>
      <button ref={closeRef} type="button" aria-label="Close" onClick={onClose}
        className="w-10 h-10 shrink-0 rounded flex items-center justify-center text-on-surface-variant hover:bg-surface-container">
        <Icon name="close" className="text-[20px]" />
      </button>
    </div>
  );
}

function UrgentToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button type="button" aria-pressed={on} onClick={onToggle}
      className={`flex items-center gap-space-2xs px-space-sm py-space-2xs rounded-full border font-caption-meta text-caption-meta font-semibold whitespace-nowrap transition-colors ${
        on ? 'bg-error text-white border-error' : 'border-surface-border text-on-surface-variant hover:border-error/60 hover:text-error'}`}>
      <Icon name={on ? 'bolt' : 'flag'} className="text-[13px]" />
      {on ? 'Urgent' : 'Mark urgent'}
    </button>
  );
}

/* ─── Chip + popover ─────────────────────────────────────────────────────── */

type ChipProps = {
  d: Listed; isNew: boolean; isUrgent: boolean; compact?: boolean; roveKey: string; tabbable: boolean;
  onToggleUrgent: (id: string) => void; onSeen: (id: string) => void;
  onOpenMatter: (ref: string, opener: HTMLElement | null) => void;
};

function DeadlineChip({ d, isNew, isUrgent, compact, roveKey, tabbable, onToggleUrgent, onSeen, onOpenMatter }: ChipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const cat = CATEGORY[d.category] ?? CATEGORY.deadline;

  /** Closing clears the "new" mark (it has been looked at) and, unless focus is moving
   *  somewhere on purpose, hands focus back to the chip so keyboard users keep their place. */
  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (isNew) onSeen(d.id);
    if (returnFocus) btnRef.current?.focus();
  }, [isNew, onSeen, d.id]);

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
    const outside = (e: MouseEvent) => {
      if (popRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return;
      close(!!popRef.current?.contains(document.activeElement));
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(true); };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', esc);
    popRef.current?.querySelector<HTMLElement>('button')?.focus();
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', esc); };
  }, [open, close]);

  // The portal sits at the end of <body>, so Tab past either end would leave the page.
  // Treat the popover as an extension of the chip: tabbing out of it returns to the chip.
  const onPopKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const items = Array.from(popRef.current?.querySelectorAll<HTMLElement>('button') ?? []);
    const atEdge = e.shiftKey ? document.activeElement === items[0] : document.activeElement === items.at(-1);
    if (atEdge) { e.preventDefault(); close(true); }
  };

  return (
    <>
      <button ref={btnRef} type="button" aria-expanded={open} aria-haspopup="dialog"
        data-rove={roveKey} data-date={d.date} tabIndex={tabbable ? 0 : -1}
        aria-label={`${d.label}, ${d.matterRef}, ${CATEGORY[d.category] ? cat.label.toLowerCase() : 'deadline'}, ${fmtShort(d.date)}${isUrgent ? ', urgent' : ''}${isNew ? ', new since the last sync' : ''}`}
        onClick={() => (open ? close(false) : setOpen(true))}
        className={`relative w-full text-left rounded border-l-[3px] ${cat.bar} border border-surface-border transition-transform hover:-translate-y-px ${
          isUrgent ? 'bg-status-overdue-bg border-status-overdue-border' : 'bg-surface-container-lowest'} ${
          isNew ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface-container-low' : ''} ${
          compact ? 'px-space-md py-space-sm' : 'px-space-xs py-space-2xs'}`}>
        {/* pulses three times to draw the eye, then stays as a still dot */}
        {isNew && <span aria-hidden="true" style={{ animationIterationCount: 3 }}
          className="absolute -right-1 -top-1 w-2.5 h-2.5 rounded-full bg-accent animate-ping" />}
        <span className={`text-on-surface ${compact ? 'block truncate font-body-strong text-body-strong' : 'line-clamp-2 font-body-compact text-caption-meta font-semibold'}`}>
          {isUrgent && <Icon name="bolt" className="text-[12px] text-error align-[-2px] mr-space-3xs" />}
          {d.fromDisclosure && <Icon name="upload_file" className="text-[12px] text-status-satisfied-fg align-[-2px] mr-space-3xs" />}
          {d.label}
        </span>
        {compact && (
          <span className="block truncate font-code-timestamp text-caption-meta text-on-surface-variant mt-space-2xs">
            {d.matterRef} · {daysLabel(d.daysUntil)}
          </span>
        )}
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div ref={popRef} role="dialog" aria-label={d.label} onKeyDown={onPopKey}
              style={{ position: 'fixed', left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: 272, zIndex: 40 }}
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
                <UrgentToggle on={isUrgent} onToggle={() => onToggleUrgent(d.id)} />
                <button type="button" onClick={() => { close(false); onOpenMatter(d.matterRef, btnRef.current); }}
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

/* ─── Page ───────────────────────────────────────────────────────────────── */

type Opened = { key: string; opener: HTMLElement | null } | null;

export function Calendar({ meta }: { onChanged?: () => void; meta?: any }) {
  const today = new Date().toISOString().slice(0, 10);
  const [view, setView] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));
  const [dir, setDir] = useState(0);
  const [filter, setFilter] = useState('all');
  const [urgent, setUrgent] = usePersistentSet(URGENT_KEY);
  const [newIds, setNewIds] = usePersistentSet(NEW_KEY);
  const [sync, setSync] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle');
  const [lastSync, setLastSync] = useState<string | null>(() => load<string | null>(LAST_SYNC_KEY, () => null));
  const [announce, setAnnounce] = useState('');
  const [matter, setMatter] = useState<Opened>(null);
  const [day, setDay] = useState<Opened>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const syncedIds = useRef<string[]>(load(SYNC_KEY, baselineIds));
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
  const byUrgency = (a: Listed, b: Listed) => Number(urgent.has(b.id)) - Number(urgent.has(a.id));
  const byDate: Record<string, Listed[]> = {};
  shown.forEach((d) => { (byDate[d.date] ||= []).push(d); });
  Object.values(byDate).forEach((list) => list.sort(byUrgency));

  const monthKey = `${view.y}-${pad(view.m + 1)}`;
  const inMonth = all.filter((d) => d.date.startsWith(monthKey));
  const counts = Object.keys(CATEGORY).reduce<Record<string, number>>((acc, k) => {
    acc[k] = inMonth.filter((d) => d.category === k).length; return acc;
  }, {});
  const first = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
  const days = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const monthDays = Array.from({ length: days }, (_, i) => `${monthKey}-${pad(i + 1)}`);

  const step = (delta: number) => {
    setDir(delta); setActiveKey(null);
    setView((v) => {
      let m = v.m + delta, y = v.y;
      if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
      return { y, m };
    });
  };

  const toggleUrgent = useCallback((id: string) => setUrgent((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  }), [setUrgent]);
  const markSeen = useCallback((id: string) => setNewIds((prev) => {
    if (!prev.has(id)) return prev; const n = new Set(prev); n.delete(id); return n;
  }), [setNewIds]);
  const openMatter = useCallback((ref: string, opener: HTMLElement | null) => setMatter({ key: ref, opener }), []);
  const closeMatter = useCallback(() => setMatter(null), []);
  const closeDay = useCallback(() => setDay(null), []);

  // Same staged run as a real pull, minus the narration: the button only spins. The result
  // is still announced to screen readers through the status region below.
  async function runSync() {
    setSync('syncing'); setAnnounce('Syncing deadlines');
    try {
      for (let i = 0; i < 5; i++) {
        await wait(jitter(350, 600));
        if (!alive.current) return;
      }
      const flagged = syncDeadlines(all, syncedIds.current);
      syncedIds.current = all.map((d) => d.id);
      save(SYNC_KEY, syncedIds.current);
      setNewIds((prev) => new Set([...prev, ...flagged.map((f) => f.id)]));
      const at = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      setLastSync(at); save(LAST_SYNC_KEY, at);
      setSync('done');
      setAnnounce(`Synced. ${flagged.length === 0 ? 'No new deadlines' : `${flagged.length} new deadline${flagged.length === 1 ? '' : 's'}`}.`);
    } catch {
      if (!alive.current) return;
      setSync('error'); setAnnounce('Sync failed. Try again.');
    }
  }
  // The check (or error) mark is a momentary confirmation, not a permanent state.
  useEffect(() => {
    if (sync !== 'done' && sync !== 'error') return;
    const t = setTimeout(() => setSync('idle'), 2500);
    return () => clearTimeout(t);
  }, [sync]);

  // One Tab stop for the whole month; arrows move inside it (roving tabindex).
  const tabKey = activeKey ?? `day-${monthDays[0]}`;
  const onGridKey = (e: React.KeyboardEvent) => {
    // currentTarget, not a ref: during the month slide two containers exist and the
    // outgoing one clears a shared ref when it unmounts.
    const list = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-rove]'));
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    let target: HTMLElement | undefined;
    const byDay = (iso: string) => list.find((el) => el.dataset.rove === `day-${iso}`);
    if (e.key === 'ArrowRight' || (mobile && e.key === 'ArrowDown')) target = list[i + 1];
    else if (e.key === 'ArrowLeft' || (mobile && e.key === 'ArrowUp')) target = list[i - 1];
    else if (e.key === 'ArrowDown') target = byDay(shiftISO(list[i].dataset.date!, 7));
    else if (e.key === 'ArrowUp') target = byDay(shiftISO(list[i].dataset.date!, -7));
    else if (e.key === 'Home') target = list[0];
    else if (e.key === 'End') target = list.at(-1);
    else return;
    e.preventDefault();
    target?.focus();
  };
  const onGridFocus = (e: React.FocusEvent) => {
    const k = (e.target as HTMLElement).dataset?.rove;
    if (k) setActiveKey(k);
  };

  const chip = (d: Listed, compact?: boolean) => (
    <DeadlineChip key={d.id} d={d} compact={compact} roveKey={`chip-${d.id}`} tabbable={tabKey === `chip-${d.id}`}
      isNew={newIds.has(d.id)} isUrgent={urgent.has(d.id)}
      onToggleUrgent={toggleUrgent} onSeen={markSeen} onOpenMatter={openMatter} />
  );
  const dayButton = (iso: string, className: string, children: React.ReactNode) => {
    const n = (byDate[iso] ?? []).length;
    return (
      <button type="button" data-rove={`day-${iso}`} data-date={iso} tabIndex={tabKey === `day-${iso}` ? 0 : -1}
        aria-label={`${fmtShort(iso)}${iso === today ? ', today' : ''}, ${n} deadline${n === 1 ? '' : 's'}`}
        onClick={(e) => setDay({ key: iso, opener: e.currentTarget })} className={className}>
        {children}
      </button>
    );
  };

  const matterDeadlines = matter ? all.filter((d) => d.matterRef === matter.key) : [];
  const nextDue = matterDeadlines.find((d) => d.daysUntil >= 0);
  const dayDeadlines = day ? (byDate[day.key] ?? []) : [];
  const withDeadlines = monthDays.filter((iso) => byDate[iso]?.length);

  return (
    <div className="flex flex-col w-full">
      <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">{announce}</span>

      {/* ── header ──────────────────────────────────────────────────────── */}
      <div className="px-space-xl pt-space-lg pb-space-md bg-surface-container-lowest border-b border-surface-border flex flex-col gap-space-md">
        <div className="flex items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-xs min-w-0">
            <Button aria-label="Previous month" onClick={() => step(-1)}><Icon name="chevron_left" className="text-[18px]" /></Button>
            <Button aria-label="Next month" onClick={() => step(1)}><Icon name="chevron_right" className="text-[18px]" /></Button>
            <div className="relative overflow-hidden ml-space-xs">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.h1 key={monthKey} initial={{ opacity: 0, y: dir * 10 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -dir * 10, transition: { duration: 0.12 } }}
                  className="font-headline-matter text-headline-matter font-bold text-on-surface tracking-tight whitespace-nowrap">
                  {MONTHS[view.m]} {view.y}
                </motion.h1>
              </AnimatePresence>
            </div>
          </div>
          <motion.button type="button" onClick={runSync} disabled={sync === 'syncing'} whileTap={reduce ? undefined : { scale: 0.94 }}
            aria-label={sync === 'syncing' ? 'Syncing deadlines' : `Sync deadlines${lastSync ? `, last synced ${lastSync}` : ''}`}
            aria-busy={sync === 'syncing'}
            className={`w-10 h-10 shrink-0 rounded-full text-on-primary flex items-center justify-center disabled:opacity-70 ${
              sync === 'error' ? 'bg-error' : 'bg-primary hover:bg-primary-container'}`}>
            <motion.span className="flex"
              animate={sync === 'syncing' && !reduce ? { rotate: 360 } : { rotate: 0 }}
              transition={sync === 'syncing' ? { repeat: Infinity, duration: 0.9, ease: 'linear' } : { duration: 0.2 }}>
              <Icon name={sync === 'done' ? 'check' : sync === 'error' ? 'priority_high' : 'sync'} className="text-[20px]" />
            </motion.span>
          </motion.button>
        </div>

        <div className="overflow-x-auto py-space-2xs">
          {/* the dot beside each category is the key for the chip stripes */}
          <AnimatedTabs variant="pill" activeTab={filter} onChange={setFilter} layoutId="calendar-filter"
            className="bg-surface-container-low border border-surface-border whitespace-nowrap font-body-default"
            tabs={[
              { id: 'all', label: `All · ${inMonth.length}` },
              ...Object.entries(CATEGORY).map(([k, v]) => ({
                id: k, label: `${v.label.toLowerCase()} · ${counts[k]}`,
                icon: <span aria-hidden="true" className={`inline-block w-2 h-2 rounded-full ${v.dot}`} />,
              })),
            ]} />
        </div>
      </div>

      {/* ── month ───────────────────────────────────────────────────────── */}
      <div className="p-space-xl">
        <p id="calendar-keys" className="sr-only">Use the arrow keys to move between days and deadlines. Up and down move by a week.</p>
        <div className="overflow-hidden rounded-xl">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={`${monthKey}-${mobile}`} role="group" aria-label={`${MONTHS[view.m]} ${view.y}`}
              aria-describedby="calendar-keys" onKeyDown={onGridKey} onFocus={onGridFocus}
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: dir * 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: -dir * 60 }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}>
              {mobile ? (
                <div className="flex flex-col gap-space-lg">
                  {withDeadlines.length === 0 && (
                    <p className="p-space-lg rounded border border-dashed border-surface-border font-body-compact text-body-compact text-on-surface-variant">
                      No deadlines this month.
                    </p>
                  )}
                  {withDeadlines.map((iso) => (
                    <section key={iso} className="flex flex-col gap-space-xs">
                      <h2>
                        {dayButton(iso, `font-section-title text-section-title uppercase ${iso === today ? 'text-primary' : 'text-on-surface-variant'}`,
                          <>{fmtShort(iso)}{iso === today && ' · Today'}</>)}
                      </h2>
                      <ul className="flex flex-col gap-space-xs">
                        {byDate[iso].map((d) => <li key={d.id}>{chip(d, true)}</li>)}
                      </ul>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-7 gap-px bg-surface-border border border-surface-border rounded-xl overflow-hidden">
                  {DAYS.map((x) => (
                    <div key={x} aria-hidden="true" className="bg-surface-container py-space-xs text-center font-section-title text-caption-meta uppercase text-on-surface-variant">{x}</div>
                  ))}
                  {Array.from({ length: first }, (_, i) => <div key={`b${i}`} className="min-h-[112px] bg-surface-container-low" />)}
                  {monthDays.map((iso, i) => {
                    const isToday = iso === today;
                    return (
                      <div key={iso} className={`min-h-[112px] min-w-0 bg-surface-container-lowest p-space-xs flex flex-col gap-space-2xs ${
                        isToday ? 'ring-2 ring-inset ring-primary' : ''}`}>
                        {dayButton(iso, `self-start min-w-6 h-6 px-space-2xs -ml-space-2xs rounded font-code-timestamp text-caption-meta hover:bg-surface-container ${
                          isToday ? 'font-bold text-primary' : 'text-on-surface-variant'}`, i + 1)}
                        {(byDate[iso] ?? []).map((d) => chip(d))}
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

      {/* ── day window ──────────────────────────────────────────────────── */}
      <Modal open={!!day} label={day ? fmtShort(day.key) : ''} returnTo={day?.opener ?? null} onClose={closeDay}>
        {(closeRef) => day && (
          <>
            <ModalHeader title={fmtShort(day.key)} sub={`${dayDeadlines.length} deadline${dayDeadlines.length === 1 ? '' : 's'}${day.key === today ? ' · Today' : ''}`}
              closeRef={closeRef} onClose={closeDay} />
            {dayDeadlines.length === 0 ? (
              <p className="p-space-lg rounded border border-dashed border-surface-border font-body-compact text-body-compact text-on-surface-variant">
                Nothing due this day.
              </p>
            ) : (
              <ul className="flex flex-col gap-space-sm">
                {dayDeadlines.map((d) => {
                  const cat = CATEGORY[d.category] ?? CATEGORY.deadline;
                  return (
                    <li key={d.id} className={`p-space-md rounded border border-surface-border border-l-[3px] ${cat.bar} flex flex-col gap-space-xs ${
                      urgent.has(d.id) ? 'bg-status-overdue-bg' : 'bg-surface-container-lowest'}`}>
                      <div className="flex items-center gap-space-xs flex-wrap">
                        <Pill tone={cat.tone}>{cat.label}</Pill>
                        {d.fromDisclosure && <Pill tone="satisfied">From disclosure upload</Pill>}
                      </div>
                      <p className="font-body-strong text-body-strong text-on-surface">{d.label}</p>
                      <p className="font-code-timestamp text-caption-meta text-on-surface-variant">{d.matterRef} · via {d.channel}</p>
                      <div className="flex items-center justify-end gap-space-xs">
                        <UrgentToggle on={urgent.has(d.id)} onToggle={() => toggleUrgent(d.id)} />
                        <button type="button" onClick={() => { const opener = day.opener; closeDay(); openMatter(d.matterRef, opener); }}
                          className="px-space-sm py-space-2xs rounded-full bg-primary text-on-primary font-caption-meta text-caption-meta font-semibold whitespace-nowrap hover:bg-primary-container">
                          Open matter
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </Modal>

      {/* ── matter window ───────────────────────────────────────────────── */}
      <Modal open={!!matter} label={matter?.key ?? ''} returnTo={matter?.opener ?? null} onClose={closeMatter}>
        {(closeRef) => matter && (
          <>
            <ModalHeader title={matter.key} sub={meta?.firm} closeRef={closeRef} onClose={closeMatter} />
            <dl className="grid grid-cols-[auto_1fr] gap-x-space-xl gap-y-space-xs p-space-md bg-surface-container-low border border-surface-border rounded font-body-compact text-body-compact">
              <dt className="text-on-surface-variant">Deadlines on file</dt><dd className="text-on-surface">{matterDeadlines.length}</dd>
              <dt className="text-on-surface-variant">Next due</dt>
              <dd className="text-on-surface">{nextDue ? `${fmtShort(nextDue.date)} · ${daysLabel(nextDue.daysUntil)}` : 'Nothing upcoming'}</dd>
            </dl>
            <div className="flex flex-col gap-space-xs">
              <h3 className="font-section-title text-section-title uppercase text-on-surface-variant">Deadlines</h3>
              <ul className="divide-y divide-surface-border border border-surface-border rounded">
                {matterDeadlines.map((d) => (
                  <li key={d.id} className="px-space-md py-space-sm flex items-start justify-between gap-space-md">
                    <span className="font-body-compact text-body-compact text-on-surface">
                      {urgent.has(d.id) && <Icon name="bolt" className="text-[13px] text-error align-[-2px] mr-space-3xs" />}
                      {d.label}
                    </span>
                    <span className="font-code-timestamp text-caption-meta text-on-surface-variant whitespace-nowrap">{fmtShort(d.date)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </Modal>
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
