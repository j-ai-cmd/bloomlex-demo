import React, { useState } from 'react';
import { fmtLong } from '../lib/api';
import { Icon, Pill, Button, Card, Empty } from '../lib/ui';

const CATEGORY: Record<string, { label: string; tone: string; bar: string }> = {
  court:             { label: 'COURT',             tone: 'overdue',  bar: 'border-l-error' },
  client_commitment: { label: 'CLIENT COMMITMENT',  tone: 'accent',   bar: 'border-l-secondary' },
  deadline:          { label: 'DEADLINE',           tone: 'neutral',  bar: 'border-l-surface-tint' },
  follow_up:         { label: 'FOLLOW-UP',          tone: 'awaiting', bar: 'border-l-status-awaiting-fg' },
  consultation:      { label: 'CONSULTATION',       tone: 'neutral',  bar: 'border-l-outline' },
};

// Week of 2026-09-01. Repeating every week — the kind of standing deadlines
// that look routine but become liabilities when one slips.
const DEMO: Record<string, any[]> = {
  '2026-09-01': [
    { id: 1, category: 'court',             action_text: 'File amended statement of claim — Patel v. Horizon Realty',            matter_ref: 'MAT-2024-0091', due_date: '2026-09-01', time_precision: 'exact', channel: 'email',  confidence: 0.97, verbatim_text: 'Amended claim must be in by end of day Monday without fail.', status: 'confirmed' },
    { id: 2, category: 'follow_up',         action_text: 'Follow up with Silvio on retainer signature — Nakamura estate',       matter_ref: 'MAT-2024-0103', due_date: '2026-09-01', time_precision: 'day',   channel: 'call',   confidence: 0.88, verbatim_text: 'I said I would circle back to him Monday to get that signed.', status: 'confirmed' },
  ],
  '2026-09-02': [
    { id: 3, category: 'deadline',          action_text: 'Submit discovery responses — Chen v. Westfield Group',                matter_ref: 'MAT-2025-0017', due_date: '2026-09-02', time_precision: 'exact', channel: 'email',  confidence: 0.95, verbatim_text: 'Discovery responses are due Tuesday, 30-day window closes.', status: 'confirmed' },
    { id: 4, category: 'client_commitment', action_text: 'Send settlement summary letter to Mrs. Okafor',                       matter_ref: 'MAT-2024-0055', due_date: '2026-09-02', time_precision: 'day',   channel: 'call',   confidence: 0.91, verbatim_text: 'I will have that letter to you by Tuesday, I promise.', status: 'confirmed' },
    { id: 5, category: 'consultation',      action_text: 'Initial consultation — Mercer family trust restructure',              matter_ref: null,            due_date: '2026-09-02', time_precision: 'day',   channel: 'call',   confidence: 0.85, verbatim_text: 'Tuesday at 2 pm, the Mercers are coming in for the trust review.', status: 'confirmed' },
  ],
  '2026-09-03': [
    { id: 6, category: 'court',             action_text: 'Motion to compel hearing — Al-Rashid v. City Transit Authority',      matter_ref: 'MAT-2023-0198', due_date: '2026-09-03', time_precision: 'exact', channel: 'call',   confidence: 0.98, verbatim_text: 'The motion to compel is on Wednesday, courtroom 4B at 10 am.', status: 'confirmed' },
    { id: 7, category: 'client_commitment', action_text: 'Deliver contract review memo — Drummond Logistics',                   matter_ref: 'MAT-2025-0041', due_date: '2026-09-03', time_precision: 'day',   channel: 'email',  confidence: 0.93, verbatim_text: 'I told them they would have my comments by Wednesday afternoon.', status: 'confirmed' },
    { id: 8, category: 'follow_up',         action_text: 'Confirm expert witness availability — Goldstein v. MedPath Inc.',     matter_ref: 'MAT-2024-0077', due_date: '2026-09-03', time_precision: 'day',   channel: 'email',  confidence: 0.82, verbatim_text: 'Need to lock in Dr. Osei by Wednesday or we lose the slot.', status: 'confirmed' },
  ],
  '2026-09-04': [
    { id: 9,  category: 'deadline',          action_text: 'Statutory limitation period — Singh property dispute',               matter_ref: 'MAT-2022-0303', due_date: '2026-09-04', time_precision: 'exact', channel: 'email',  confidence: 0.99, verbatim_text: 'Thursday is the hard limitation date — we cannot miss it.', status: 'confirmed' },
    { id: 10, category: 'client_commitment', action_text: 'Return call to Huang family re: immigration appeal update',          matter_ref: 'MAT-2025-0088', due_date: '2026-09-04', time_precision: 'day',   channel: 'call',   confidence: 0.87, verbatim_text: 'I said I would call them back Thursday with the appeal status.', status: 'confirmed' },
  ],
  '2026-09-05': [
    { id: 11, category: 'court',             action_text: 'File trial brief — Kowalski v. Apex Construction',                   matter_ref: 'MAT-2023-0141', due_date: '2026-09-05', time_precision: 'exact', channel: 'email',  confidence: 0.96, verbatim_text: 'Trial brief is due Friday by 4 pm, no extensions available.', status: 'confirmed' },
    { id: 12, category: 'deadline',          action_text: 'Weekly conflict-check sweep — all new intake files',                 matter_ref: null,            due_date: '2026-09-05', time_precision: 'day',   channel: 'email',  confidence: 1.00, verbatim_text: 'Run the conflict check every Friday before anything new opens.', status: 'confirmed' },
    { id: 13, category: 'follow_up',         action_text: 'Chase opposing counsel response — Park v. Bridgemont Developments',  matter_ref: 'MAT-2025-0009', due_date: '2026-09-05', time_precision: 'day',   channel: 'email',  confidence: 0.89, verbatim_text: 'If I have not heard back by Friday I need to escalate to the court.', status: 'confirmed' },
  ],
};

function shiftDay(d: string, n: number) {
  const dt = new Date(`${d}T12:00:00Z`); dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export function Calendar({ onChanged }: { onChanged: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [day, setDay] = useState(today);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<any>(null);

  const onDay = DEMO[day] ?? [];
  const shown = filter === 'all' ? onDay : onDay.filter((c) => c.category === filter);

  const counts = Object.keys(CATEGORY).reduce<Record<string, number>>((acc, k) => {
    acc[k] = onDay.filter((c) => c.category === k).length; return acc;
  }, {});

  return (
    <div className="flex flex-col w-full">
      {/* header */}
      <div className="px-space-xl pt-space-lg pb-space-md bg-surface-container-lowest border-b border-surface-border flex flex-col gap-space-md">
        <div className="flex flex-wrap items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-lg">
            <div className="flex items-center gap-space-xs">
              <Button onClick={() => setDay(shiftDay(day, -1))}><Icon name="chevron_left" className="text-[18px]" /></Button>
              <Button onClick={() => setDay(shiftDay(day, 1))}><Icon name="chevron_right" className="text-[18px]" /></Button>
              <h1 className="font-headline-matter text-headline-matter font-bold text-on-surface ml-space-xs tracking-tight">{fmtLong(day)}</h1>
            </div>
            <Button onClick={() => setDay(today)}>Today</Button>
          </div>
          <div className="flex items-center gap-space-xs px-space-md py-space-xs rounded bg-surface-container-low border border-surface-border">
            <Icon name="smart_toy" className="text-[14px] text-on-surface-variant" />
            <span className="font-code-timestamp text-caption-meta text-on-surface-variant">FIXTURE — demo week Sep 1–5</span>
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

      {/* body */}
      <div className="relative flex flex-col lg:flex-row w-full min-h-[calc(100vh-14rem)]">
        <div className="flex-1 p-space-xl flex flex-col gap-space-md">
          <p className="font-body-compact text-body-compact text-on-surface-variant max-w-3xl">
            Deadlines Ava surfaced from calls, emails, and passing remarks. Each one stays
            tied to the sentence it came from.
          </p>

          {shown.length === 0 && (
            <Empty>No commitments logged for this day. Navigate to Sep 1–5 to see the demo week.</Empty>
          )}

          {shown.map((c) => {
            const cat = CATEGORY[c.category] ?? CATEGORY.deadline;
            return (
              <button key={c.id} onClick={() => setSelected(c === selected ? null : c)}
                className={`text-left bg-surface-container-lowest border border-surface-border ${cat.bar} border-l-4 p-space-lg rounded shadow-sm hover:shadow-md transition-all flex flex-col gap-space-sm`}>
                <div className="flex items-start justify-between gap-space-md">
                  <div className="flex flex-col gap-space-2xs">
                    <div className="flex items-center gap-space-xs flex-wrap">
                      <Pill tone={cat.tone}>{cat.label}</Pill>
                      <span className="font-code-timestamp text-caption-meta text-on-surface-variant">
                        {c.matter_ref ?? 'new intake'}
                      </span>
                    </div>
                    <h2 className="font-headline-matter text-subhead-lead font-bold text-on-surface">{c.action_text}</h2>
                  </div>
                  <div className="flex flex-col items-end gap-space-2xs shrink-0">
                    <span className="font-code-timestamp text-caption-meta text-on-surface font-semibold uppercase">{c.time_precision}</span>
                    <span className="px-space-xs py-space-2xs bg-surface-container-low border border-surface-border text-on-surface-variant font-code-timestamp text-[10px] rounded">
                      Ava · {c.channel} · conf {c.confidence.toFixed(2)}
                    </span>
                  </div>
                </div>
                <p className="font-body-default text-body-compact text-on-surface-variant line-clamp-1 italic">"{c.verbatim_text}"</p>

                {selected?.id === c.id && (
                  <div className="mt-space-sm border-t border-surface-border pt-space-sm flex flex-col gap-space-xs">
                    <span className="font-caption-meta text-caption-meta text-on-surface-variant uppercase tracking-wider">What Ava heard</span>
                    <p className="font-code-citation text-caption-meta text-on-surface-variant italic bg-surface-container-low border border-surface-border p-space-xs rounded">
                      "{c.verbatim_text}"
                    </p>
                    <div className="flex gap-space-lg mt-space-xs flex-wrap">
                      <span className="font-caption-meta text-caption-meta text-on-surface-variant">Channel: <b className="text-on-surface">{c.channel}</b></span>
                      <span className="font-caption-meta text-caption-meta text-on-surface-variant">Precision: <b className="text-on-surface">{c.time_precision}</b></span>
                      <span className="font-caption-meta text-caption-meta text-on-surface-variant">Confidence: <b className="text-on-surface">{c.confidence.toFixed(2)}</b></span>
                      <span className="font-caption-meta text-caption-meta text-on-surface-variant">Model: <b className="text-on-surface">FIXTURE · demo-v1</b></span>
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* sidebar — week at a glance */}
        <div className="w-full lg:w-inspector-width bg-surface-container-low border-l border-surface-border p-space-lg flex flex-col gap-space-xl">
          <div className="flex flex-col gap-space-sm">
            <span className="font-headline-matter font-bold text-xs uppercase tracking-wider text-on-surface">Week at a glance</span>
            <p className="font-caption-meta text-caption-meta text-on-surface-variant">Click a day to jump to it.</p>
            {['2026-09-01','2026-09-02','2026-09-03','2026-09-04','2026-09-05'].map((d) => {
              const items = DEMO[d] ?? [];
              const hasCourtDeadline = items.some((i) => i.category === 'court');
              const isToday = d === today;
              const isSel = d === day;
              return (
                <button key={d} onClick={() => setDay(d)}
                  className={`p-space-md rounded border flex items-center justify-between gap-space-sm text-left transition-all ${
                    isSel ? 'bg-primary/10 border-primary' : 'bg-surface-container-lowest border-surface-border hover:border-primary/40'}`}>
                  <span className="flex items-center gap-space-xs">
                    {hasCourtDeadline && <Icon name="gavel" className="text-[14px] text-error" />}
                    <span className="font-headline-matter font-semibold text-body-compact text-on-surface">
                      {new Date(`${d}T12:00:00Z`).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}
                      {isToday && <span className="ml-space-xs text-primary text-[10px] font-code-timestamp">TODAY</span>}
                    </span>
                  </span>
                  <Pill tone={items.length > 2 ? 'overdue' : 'neutral'}>{items.length}</Pill>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-space-sm">
            <span className="font-headline-matter font-bold text-xs uppercase tracking-wider text-on-surface">Legend</span>
            {Object.entries(CATEGORY).map(([k, v]) => (
              <div key={k} className="flex items-center gap-space-xs">
                <div className={`w-1 h-4 rounded ${v.bar.replace('border-l-', 'bg-')}`} />
                <span className="font-code-timestamp text-caption-meta text-on-surface-variant">{v.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
