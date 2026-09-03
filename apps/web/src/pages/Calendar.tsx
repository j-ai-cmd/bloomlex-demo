import React, { useEffect, useState } from 'react';
import { api, post, fmtLong, fmtDate, iso } from '../lib/api';
import { Icon, Pill, Button, Card, Provenance, Empty } from '../lib/ui';
import { SimulateAva } from '../components/SimulateAva';

const CATEGORY: Record<string, { label: string; tone: string; bar: string }> = {
  court: { label: 'COURT', tone: 'overdue', bar: 'border-l-error' },
  client_commitment: { label: 'CLIENT COMMITMENT', tone: 'accent', bar: 'border-l-secondary' },
  deadline: { label: 'DEADLINE', tone: 'neutral', bar: 'border-l-surface-tint' },
  follow_up: { label: 'FOLLOW-UP', tone: 'awaiting', bar: 'border-l-status-awaiting-fg' },
  consultation: { label: 'CONSULTATION', tone: 'neutral', bar: 'border-l-outline' },
  other: { label: 'OTHER', tone: 'neutral', bar: 'border-l-outline' },
};

export function Calendar({ onChanged }: { onChanged: () => void }) {
  const [day, setDay] = useState<string>('');
  const [commitments, setCommitments] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [sim, setSim] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [actors, setActors] = useState<any[]>([]);

  async function load(d?: string) {
    const meta = await api('/v1/meta');
    const today = d ?? day ?? '';
    const target = today || new Date().toISOString().slice(0, 10);
    if (!day) setDay(target);
    const [all, queue, acts] = await Promise.all([
      api(`/v1/commitments`), api('/v1/review-queue'), api('/v1/actors'),
    ]);
    setCommitments(all);
    setPending(queue.proposals);
    setActors(acts);
    return meta;
  }
  useEffect(() => { load(); }, []);

  const today = day || new Date().toISOString().slice(0, 10);
  const onDay = commitments.filter((c) => iso(c.due_date) === today && !['superseded', 'cancelled'].includes(c.status));
  const shown = filter === 'all' ? onDay : onDay.filter((c) => c.category === filter);
  const needsConfirmation = commitments.filter((c) => c.status === 'needs_confirmation');
  const human = actors.find((a) => a.kind === 'human');

  const counts = Object.keys(CATEGORY).reduce<Record<string, number>>((acc, k) => {
    acc[k] = onDay.filter((c) => c.category === k).length; return acc;
  }, {});

  async function confirm(c: any, date: string) {
    await post(`/v1/commitments/${c.id}/confirm`, { date, actor_id: human?.id });
    await load(); onChanged();
  }

  return (
    <div className="flex flex-col w-full">
      {sim && <SimulateAva onClose={() => setSim(false)} onDone={() => { load(); onChanged(); }} />}

      <div className="px-space-xl pt-space-lg pb-space-md bg-surface-container-lowest border-b border-surface-border flex flex-col gap-space-md">
        <div className="flex flex-wrap items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-lg">
            <div className="flex items-center gap-space-xs">
              <Button onClick={() => setDay(shiftDay(today, -1))}><Icon name="chevron_left" className="text-[18px]" /></Button>
              <Button onClick={() => setDay(shiftDay(today, 1))}><Icon name="chevron_right" className="text-[18px]" /></Button>
              <h1 className="font-headline-matter text-headline-matter font-bold text-on-surface ml-space-xs tracking-tight">{fmtLong(today)}</h1>
            </div>
            <Button onClick={() => setDay(new Date().toISOString().slice(0, 10))}>Today</Button>
          </div>
          <Button variant="primary" onClick={() => setSim(true)}>
            <Icon name="electric_bolt" className="text-[16px]" /> Simulate Ava input
          </Button>
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

      <div className="relative flex flex-col lg:flex-row w-full min-h-[calc(100vh-14rem)]">
        <div className="flex-1 p-space-xl flex flex-col gap-space-md">
          <p className="font-body-compact text-body-compact text-on-surface-variant max-w-3xl">
            Everything Ava heard that the lawyer needs to remember. Incidental commitments spoken in
            passing are the point — each one keeps the sentence it came from.
          </p>
          {shown.length === 0 && <Empty>No commitments on this day. Use “Simulate Ava input” to add one live.</Empty>}
          {shown.map((c) => {
            const cat = CATEGORY[c.category] ?? CATEGORY.other;
            return (
              <button key={c.id} onClick={() => setSelected(c)}
                className={`text-left bg-surface-container-lowest border border-surface-border ${cat.bar} border-l-4 p-space-lg rounded shadow-sm hover:shadow-md transition-all flex flex-col gap-space-sm`}>
                <div className="flex items-start justify-between gap-space-md">
                  <div className="flex flex-col gap-space-2xs">
                    <div className="flex items-center gap-space-xs flex-wrap">
                      <Pill tone={cat.tone}>{cat.label}</Pill>
                      <span className="font-code-timestamp text-caption-meta text-on-surface-variant">
                        {c.matter_ref ?? 'matter unresolved'}
                      </span>
                      {c.status === 'missed' && <Pill tone="overdue">PAST DUE</Pill>}
                      {c.supersedes && <Pill tone="awaiting">CHANGED</Pill>}
                    </div>
                    <h2 className="font-headline-matter text-subhead-lead font-bold text-on-surface">{c.action_text}</h2>
                  </div>
                  <div className="flex flex-col items-end gap-space-2xs shrink-0">
                    <span className="font-code-timestamp text-caption-meta text-on-surface font-semibold uppercase">{c.time_precision}</span>
                    <span className="px-space-xs py-space-2xs bg-surface-container-low border border-surface-border text-on-surface-variant font-code-timestamp text-[10px] rounded">
                      Ava · {c.channel} · conf {Number(c.confidence).toFixed(2)}
                    </span>
                  </div>
                </div>
                <p className="font-body-default text-body-compact text-on-surface-variant line-clamp-1 italic">“{c.verbatim_text}”</p>
              </button>
            );
          })}
        </div>

        <div className="w-full lg:w-inspector-width bg-surface-container-low border-l border-surface-border p-space-lg flex flex-col gap-space-xl">
          <div className="flex flex-col gap-space-sm">
            <div className="flex items-center gap-space-xs">
              <span className="font-headline-matter font-bold text-xs uppercase tracking-wider text-on-surface">Needs confirmation</span>
              <Pill tone="overdue">{needsConfirmation.length}</Pill>
            </div>
            <p className="font-caption-meta text-caption-meta text-on-surface-variant">
              The phrase named a window, not a day. No date was invented — pick one.
            </p>
            {needsConfirmation.length === 0 && <Empty>Nothing waiting.</Empty>}
            {needsConfirmation.map((c) => (
              <Card key={c.id} className="p-space-md flex flex-col gap-space-xs">
                <div className="flex items-center justify-between">
                  <span className="font-code-timestamp text-[11px] text-on-surface-variant font-medium">{c.matter_ref ?? 'matter unresolved'}</span>
                  <span className="font-code-timestamp text-[10px] text-outline">{c.date_rule_id}</span>
                </div>
                <span className="font-headline-matter font-semibold text-body-compact text-on-surface">{c.action_text}</span>
                <p className="font-code-citation text-caption-meta text-on-surface-variant italic bg-surface-container-low border border-surface-border p-space-xs rounded">
                  “{c.verbatim_text}”
                </p>
                {/* Two different reasons an item waits here, and they are never conflated:
                    the DATE was a range, or the EXTRACTION was mid-confidence. */}
                {c.candidates?.length > 0 ? (
                  <div className="flex flex-col gap-space-xs">
                    <span className="font-caption-meta text-caption-meta text-on-surface-variant">
                      “{c.date_rule_id?.replace(/_/g, ' ')}” named a window. Pick the day:
                    </span>
                    <div className="flex flex-wrap items-center gap-space-xs">
                      {c.candidates.slice(0, 4).map((cd: any) => (
                        <button key={cd.date} onClick={() => confirm(c, cd.date)}
                          className="py-space-2xs px-space-xs bg-surface-container hover:bg-surface-container-high border border-surface-border rounded font-code-timestamp text-caption-meta text-on-surface">
                          {fmtDate(cd.date)}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : c.due_date ? (
                  <div className="flex items-center justify-between gap-space-xs">
                    <span className="font-caption-meta text-caption-meta text-on-surface-variant">
                      Date resolved ({c.date_rule_id}); extraction confidence {Number(c.confidence).toFixed(2)} is mid-band.
                    </span>
                    <button onClick={() => confirm(c, iso(c.due_date)!)}
                      className="py-space-2xs px-space-sm bg-accent text-accent-ink rounded font-code-timestamp text-caption-meta font-bold">
                      Confirm {fmtDate(c.due_date)}
                    </button>
                  </div>
                ) : (
                  <span className="font-caption-meta text-caption-meta text-on-surface-variant">
                    No date could be derived from what was said — a lawyer must set one.
                  </span>
                )}
              </Card>
            ))}
          </div>

          <div className="flex flex-col gap-space-sm">
            <div className="flex items-center gap-space-xs">
              <span className="font-headline-matter font-bold text-xs uppercase tracking-wider text-on-surface">Awaiting approval</span>
              <Pill tone="accent">{pending.length}</Pill>
            </div>
            <p className="font-caption-meta text-caption-meta text-on-surface-variant">Write-back to Ava. Nothing is sent.</p>
            {pending.slice(0, 4).map((p) => (
              <Card key={p.id} className="p-space-md flex items-center justify-between gap-space-sm">
                <span className="flex flex-col min-w-0">
                  <span className="font-headline-matter font-semibold text-body-compact text-on-surface truncate">{p.type}</span>
                  <span className="font-caption-meta text-caption-meta text-on-surface-variant truncate">{p.matter_ref ?? '—'}</span>
                </span>
                <Pill tone="awaiting">pending</Pill>
              </Card>
            ))}
          </div>
        </div>

        {selected && <Drawer c={selected} onClose={() => setSelected(null)} />}
      </div>
    </div>
  );
}

function shiftDay(d: string, n: number) {
  const dt = new Date(`${d}T12:00:00Z`); dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function Drawer({ c, onClose }: { c: any; onClose: () => void }) {
  const [history, setHistory] = useState<any>(null);
  useEffect(() => { api(`/v1/commitments/${c.id}/history`).then(setHistory); }, [c.id]);
  return (
    <div className="absolute top-0 right-0 w-full md:w-[26rem] h-full bg-surface-container-lowest border-l border-surface-border shadow-2xl z-30 flex flex-col overflow-y-auto">
      <div className="p-space-lg bg-surface-container-low border-b border-surface-border flex items-center justify-between sticky top-0">
        <span className="flex items-center gap-space-xs">
          <Icon name="verified" className="text-[18px] text-primary" />
          <span className="font-headline-matter font-bold text-xs uppercase tracking-wider">Provenance</span>
        </span>
        <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface"><Icon name="close" className="text-[20px]" /></button>
      </div>
      <div className="p-space-xl flex flex-col gap-space-lg">
        <div>
          <span className="font-caption-meta text-caption-meta text-on-surface-variant uppercase tracking-wider">What</span>
          <h2 className="font-headline-matter text-headline-matter font-bold text-on-surface">{c.action_text}</h2>
        </div>
        <div className="grid grid-cols-2 gap-space-sm bg-surface-container-low border border-surface-border p-space-md rounded">
          <Field label="When" value={`${fmtDate(c.due_date)} · ${c.time_precision}`} />
          <Field label="Matter" value={c.matter_ref ?? 'unresolved — flagged, not guessed'} />
          <Field label="Direction" value={c.direction} />
          <Field label="Date rule" value={c.date_rule_id ?? '—'} />
        </div>
        <Provenance verbatim={c.verbatim_text} channel={c.channel} occurred_at={c.source_occurred_at}
                    confidence={c.confidence} model={c.model} prompt_version={c.prompt_version} />
        {history?.links?.length > 0 && (
          <div className="flex flex-col gap-space-xs">
            <span className="font-caption-meta text-caption-meta text-on-surface-variant uppercase tracking-wider">Changed from</span>
            {history.links.map((l: any) => (
              <div key={l.id} className="p-space-sm bg-surface-container-low border border-surface-border rounded font-code-citation text-caption-meta flex flex-col gap-1">
                {Object.entries(l.changed_fields).map(([f, v]: any) => (
                  <span key={f}>
                    <span className="text-outline">{f}: </span>
                    <span className="line-through text-outline">{String(v.from).slice(0, 10)}</span>
                    <span className="mx-1">→</span>
                    <span className="font-bold text-on-surface">{String(v.to).slice(0, 10)}</span>
                  </span>
                ))}
                <span className="text-on-surface-variant">{l.reason}</span>
              </div>
            ))}
            <p className="font-caption-meta text-caption-meta text-on-surface-variant">
              The earlier record still exists. Nothing was overwritten.
            </p>
          </div>
        )}
        {history?.transitions?.length > 0 && (
          <div className="flex flex-col gap-space-xs">
            <span className="font-caption-meta text-caption-meta text-on-surface-variant uppercase tracking-wider">State history</span>
            {history.transitions.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between font-code-timestamp text-caption-meta text-on-surface-variant border-b border-surface-border/60 py-1">
                <span>{t.from_state ?? '∅'} → <span className="text-on-surface font-bold">{t.to_state}</span></span>
                <span>{t.trigger} · {t.actor_kind}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const Field = ({ label, value }: any) => (
  <div>
    <span className="font-caption-meta text-caption-meta text-on-surface-variant block mb-1 uppercase">{label}</span>
    <span className="font-headline-matter font-semibold text-body-compact text-on-surface">{value}</span>
  </div>
);
