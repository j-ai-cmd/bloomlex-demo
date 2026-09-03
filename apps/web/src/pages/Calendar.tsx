import React, { useState, useEffect } from 'react';
import { fmtLong } from '../lib/api';
import { Icon, Pill, Button, Empty } from '../lib/ui';

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

function shiftDay(d: string, n: number) {
  const dt = new Date(`${d}T12:00:00Z`); dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export function Calendar({ onChanged }: { onChanged: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [day, setDay] = useState(today);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<any>(null);
  const [urgent, setUrgent] = useState<Set<number>>(new Set());
  const [disclosureRan, setDisclosureRan] = useState(() => {
    try { return localStorage.getItem(DISCLOSURE_KEY) === 'true'; } catch { return false; }
  });

  // listen for disclosure running in another tab/component
  useEffect(() => {
    const check = () => {
      try { setDisclosureRan(localStorage.getItem(DISCLOSURE_KEY) === 'true'); } catch {}
    };
    window.addEventListener('storage', check);
    window.addEventListener('bloomlex_disclosure', check);
    return () => { window.removeEventListener('storage', check); window.removeEventListener('bloomlex_disclosure', check); };
  }, []);

  function allForDay(d: string) {
    const base = BASE[d] ?? [];
    const disc = disclosureRan ? (DISCLOSURE_ITEMS[d] ?? []) : [];
    return [...base, ...disc];
  }

  const onDay = allForDay(day);
  const baseShown = filter === 'all' ? onDay : onDay.filter((c) => c.category === filter);
  const shown = [...baseShown.filter((c) => urgent.has(c.id)), ...baseShown.filter((c) => !urgent.has(c.id))];

  const counts = Object.keys(CATEGORY).reduce<Record<string, number>>((acc, k) => {
    acc[k] = onDay.filter((c) => c.category === k).length; return acc;
  }, {});

  // which days in the month have items
  const monthDays = Array.from({ length: 30 }, (_, i) => {
    const d = `2026-09-${String(i + 1).padStart(2, '0')}`;
    return { date: d, count: allForDay(d).length };
  }).filter((x) => x.count > 0);

  return (
    <div className="flex flex-col w-full">
      {/* ── header ──────────────────────────────────────────────────────── */}
      <div className="px-space-xl pt-space-lg pb-space-md bg-surface-container-lowest border-b border-surface-border flex flex-col gap-space-md">
        <div className="flex flex-wrap items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-lg">
            <div className="flex items-center gap-space-xs">
              <Button onClick={() => setDay(shiftDay(day, -1))}><Icon name="chevron_left" className="text-[18px]" /></Button>
              <Button onClick={() => setDay(shiftDay(day, 1))}><Icon name="chevron_right" className="text-[18px]" /></Button>
              <h1 className="font-headline-matter text-headline-matter font-bold text-on-surface ml-space-xs tracking-tight">{fmtLong(day)}</h1>
            </div>
            {day !== today && <Button onClick={() => setDay(today)}>Today</Button>}
          </div>
        </div>

        <div className="flex items-center gap-space-xs overflow-x-auto py-space-2xs">
          <button onClick={() => setFilter('all')}
            className={`px-space-md py-space-xs rounded font-headline-matter font-semibold text-caption-meta border ${
              filter === 'all' ? 'bg-accent text-accent-ink border-accent' : 'bg-surface-container-low border-surface-border text-on-surface-variant'}`}>
            All · {onDay.length}
          </button>
          {Object.entries(CATEGORY).map(([k, v]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`px-space-md py-space-xs rounded font-body-default text-caption-meta border flex items-center gap-space-xs ${
                filter === k ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-low border-surface-border text-on-surface-variant'}`}>
              {v.label.toLowerCase()} <span className="font-code-timestamp text-[10px]">{counts[k]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── body ────────────────────────────────────────────────────────── */}
      <div className="relative flex flex-col lg:flex-row w-full min-h-[calc(100vh-14rem)]">

        {/* main list */}
        <div className="flex-1 p-space-xl flex flex-col gap-space-md">
          {shown.length === 0 && (
            <Empty>No deadlines on this day. Use the arrows to navigate to a day with items.</Empty>
          )}

          {shown.map((c) => {
            const cat = CATEGORY[c.category] ?? CATEGORY.deadline;
            const isUrgent = urgent.has(c.id);
            return (
              <div key={c.id}
                className={`text-left bg-surface-container-lowest border-l-4 ${cat.bar} rounded shadow-sm hover:shadow-md transition-all ${
                  isUrgent ? 'border border-error/40 bg-red-50/30' : 'border border-surface-border'}`}>
                <div className="p-space-lg flex flex-col gap-space-sm">
                  <div className="flex items-start justify-between gap-space-md">
                    <div className="flex flex-col gap-space-2xs flex-1 min-w-0">
                      <div className="flex items-center gap-space-xs flex-wrap">
                        <Pill tone={cat.tone}>{cat.label}</Pill>
                        <span className="font-code-timestamp text-caption-meta text-on-surface-variant">
                          {c.matter_ref ?? 'new intake'}
                        </span>
                        {c.fromDisclosure && <Pill tone="satisfied">From disclosure upload</Pill>}
                      </div>
                      <button onClick={() => setSelected(c === selected ? null : c)}
                        className="text-left">
                        <h2 className="font-headline-matter text-subhead-lead font-bold text-on-surface hover:text-primary transition-colors">{c.action_text}</h2>
                      </button>
                      <p className="font-body-default text-body-compact text-on-surface-variant line-clamp-1 italic">"{c.verbatim_text}"</p>
                    </div>
                    <div className="flex flex-col items-end gap-space-sm shrink-0">
                      <button
                        onClick={() => setUrgent((prev) => { const n = new Set(prev); isUrgent ? n.delete(c.id) : n.add(c.id); return n; })}
                        className={`flex items-center gap-space-2xs px-space-sm py-space-2xs rounded-full border font-caption-meta text-[11px] font-semibold transition-all ${
                          isUrgent
                            ? 'bg-error text-white border-error shadow-sm'
                            : 'border-surface-border text-on-surface-variant hover:border-error/60 hover:text-error bg-transparent'}`}>
                        <Icon name={isUrgent ? 'bolt' : 'flag'} className="text-[13px]" />
                        {isUrgent ? 'Urgent' : 'Mark urgent'}
                      </button>
                      <span className="px-space-xs py-space-2xs bg-surface-container-low border border-surface-border text-on-surface-variant font-code-timestamp text-[10px] rounded">
                        {c.channel}
                      </span>
                    </div>
                  </div>

                  {selected?.id === c.id && (
                    <div className="border-t border-surface-border pt-space-sm flex flex-col gap-space-xs">
                      <span className="font-caption-meta text-caption-meta text-on-surface-variant uppercase tracking-wider">What Ava heard</span>
                      <p className="font-code-citation text-caption-meta text-on-surface-variant italic bg-surface-container-low border border-surface-border p-space-xs rounded">
                        "{c.verbatim_text}"
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* sidebar — month at a glance */}
        <div className="w-full lg:w-inspector-width bg-surface-container-low border-l border-surface-border p-space-lg flex flex-col" style={{minHeight: 'calc(100vh - 14rem)'}}>
          <div className="flex flex-col gap-space-sm flex-1 overflow-hidden">
            <span className="font-headline-matter font-bold text-xs uppercase tracking-wider text-on-surface">September 2026</span>
            <div className="flex flex-col gap-space-xs flex-1 overflow-y-auto">
              {monthDays.map(({ date, count }) => {
                const items = allForDay(date);
                const hasCourtDeadline = items.some((i) => i.category === 'court');
                const hasDisclosure = items.some((i) => i.fromDisclosure);
                const isToday = date === today;
                const isSel = date === day;
                return (
                  <button key={date} onClick={() => setDay(date)}
                    className={`p-space-sm rounded border flex items-center justify-between gap-space-sm text-left transition-all ${
                      isSel ? 'bg-primary/10 border-primary' : 'bg-surface-container-lowest border-surface-border hover:border-primary/40'}`}>
                    <span className="flex items-center gap-space-xs">
                      {hasCourtDeadline && <Icon name="gavel" className="text-[13px] text-error" />}
                      {hasDisclosure && <Icon name="upload_file" className="text-[13px] text-status-satisfied-fg" />}
                      <span className="font-headline-matter font-semibold text-body-compact text-on-surface">
                        {new Date(`${date}T12:00:00Z`).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}
                        {isToday && <span className="ml-space-xs text-primary text-[10px] font-code-timestamp"> TODAY</span>}
                      </span>
                    </span>
                    <Pill tone={count > 2 ? 'overdue' : 'neutral'}>{count}</Pill>
                  </button>
                );
              })}
            </div>
          </div>

        </div>
      </div>
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
