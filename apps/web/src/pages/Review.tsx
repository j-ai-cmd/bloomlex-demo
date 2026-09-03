import React, { useEffect, useState } from 'react';
import { api, post, fmtDate } from '../lib/api';
import { Icon, Pill, Button, Card, Empty, SectionTitle } from '../lib/ui';

export function Review({ onChanged }: { onChanged: () => void }) {
  const [queue, setQueue] = useState<any>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [actors, setActors] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [busy, setBusy] = useState<string>('');

  async function load() {
    const [q, a, ac] = await Promise.all([
      api('/v1/review-queue'), api('/v1/review-queue/audit'), api('/v1/actors'),
    ]);
    setQueue(q); setAudit(a); setActors(ac);
  }
  useEffect(() => { load(); }, []);

  const human = actors.find((a) => a.kind === 'human');
  const proposals = queue?.proposals ?? [];
  const types = [...new Set(proposals.map((p: any) => p.type))] as string[];
  const shown = filter === 'all' ? proposals : proposals.filter((p: any) => p.type === filter);

  async function decide(p: any, action: 'approve' | 'reject') {
    setBusy(p.id);
    await post(`/v1/review-queue/${p.id}/${action}`, { actor_id: human?.id, note: `${action}d in review queue` });
    await load(); onChanged(); setBusy('');
  }

  return (
    <div className="flex flex-col w-full">
      <div className="bg-primary-container text-on-primary px-space-xl py-space-xl border-b border-surface-tint/20">
        <div className="max-w-7xl mx-auto flex flex-col gap-space-md">
          <div className="flex items-center gap-space-sm">
            <span className="p-space-xs bg-accent text-accent-ink rounded flex items-center justify-center">
              <Icon name="verified_user" className="text-[20px]" />
            </span>
            <div className="flex flex-col">
              <span className="font-display-hero text-subhead-lead text-primary-fixed uppercase tracking-wider font-bold">The boundary</span>
              <h1 className="font-headline-matter text-headline-matter tracking-tight text-on-primary font-bold">
                NOTHING IS SENT. APPROVAL IS A DISTINCT, LOGGED HUMAN ACT.
              </h1>
            </div>
          </div>
          <p className="font-body-default text-body-default text-on-primary-container max-w-4xl leading-relaxed">
            Every outbound or state-altering suggestion arrives here as a proposal with its evidence and
            its provenance. The system has no outbound transport at all: approving one writes an audit
            row. {queue?.note}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-space-md pt-space-xs">
            <Stat label="Pending proposals" value={proposals.length} />
            <Stat label="Open review items" value={queue?.review_items?.length ?? 0} />
            <Stat label="Decided (logged)" value={audit.length} />
            <Stat label="Actually sent" value={0} accent />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto w-full px-space-xl py-space-xl flex flex-col gap-space-xl">
        <div className="flex flex-wrap items-center gap-space-xs">
          <button onClick={() => setFilter('all')}
            className={`px-space-md py-space-xs rounded border font-section-title text-section-title ${
              filter === 'all' ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container border-surface-border text-on-surface-variant'}`}>
            All pending · {proposals.length}
          </button>
          {types.map((t) => (
            <button key={t} onClick={() => setFilter(t)}
              className={`px-space-md py-space-xs rounded border font-section-title text-section-title ${
                filter === t ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container border-surface-border text-on-surface-variant'}`}>
              {t} · {proposals.filter((p: any) => p.type === t).length}
            </button>
          ))}
        </div>

        {shown.length === 0 && <Empty>Nothing pending.</Empty>}

        <div className="flex flex-col gap-space-lg">
          {shown.map((p: any) => (
            <Card key={p.id} className="overflow-hidden">
              <div className="bg-surface-container-low border-b border-surface-border px-space-lg py-space-sm flex flex-wrap items-center justify-between gap-space-xs">
                <span className="flex items-center gap-space-sm">
                  <Icon name="outgoing_mail" className="text-[18px] text-primary" />
                  <span className="font-section-title text-section-title uppercase font-bold text-on-surface">{p.type}</span>
                  <Pill tone="neutral">{p.matter_ref ?? 'no matter'}</Pill>
                </span>
                <Pill tone="awaiting">DRAFT — NOT SENT</Pill>
              </div>

              <div className="p-space-lg flex flex-col gap-space-md">
                <p className="font-body-default text-body-default text-on-surface">{p.rationale}</p>

                {p.payload?.draft_body && (
                  <div className="p-space-md bg-surface-container border border-surface-border rounded flex flex-col gap-space-xs">
                    <span className="font-caption-meta text-caption-meta text-on-surface-variant uppercase tracking-wider">
                      Drafted body — the only part the model wrote
                    </span>
                    <pre className="font-body-default text-body-default text-on-surface whitespace-pre-wrap">{p.payload.draft_body}</pre>
                  </div>
                )}
                {p.payload?.suggested_message && (
                  <div className="p-space-md bg-surface-container border border-surface-border rounded">
                    <span className="font-caption-meta text-caption-meta text-on-surface-variant uppercase tracking-wider block mb-space-xs">
                      Suggested message
                    </span>
                    <p className="font-body-default text-body-default text-on-surface">{p.payload.suggested_message}</p>
                  </div>
                )}

                {p.verbatim_text && (
                  <div className="p-space-sm bg-surface-container-low border border-surface-border rounded">
                    <span className="font-caption-meta text-caption-meta text-on-surface-variant uppercase tracking-wider block">Provenance</span>
                    <p className="font-code-citation text-code-citation text-on-surface-variant italic">“{p.verbatim_text}”</p>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-space-xs font-code-timestamp text-caption-meta text-on-surface-variant">
                  {(p.evidence ?? []).map((e: any, i: number) => (
                    <span key={i} className="px-space-xs py-space-2xs bg-surface-container-low border border-surface-border rounded">
                      {Object.entries(e).map(([k, v]) => `${k}=${v}`).join(' · ')}
                    </span>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-space-md pt-space-xs border-t border-surface-border">
                  <span className="font-caption-meta text-caption-meta text-on-surface-variant">
                    Proposed by {p.proposed_by} · {fmtDate(p.proposed_at)} · approving logs an audit row and sends nothing
                  </span>
                  <span className="flex items-center gap-space-sm">
                    <Button onClick={() => decide(p, 'reject')} disabled={busy === p.id}>Reject</Button>
                    <Button variant="primary" onClick={() => decide(p, 'approve')} disabled={busy === p.id}>
                      <Icon name="verified" className="text-[16px]" /> Approve &amp; log
                    </Button>
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {queue?.review_items?.length > 0 && (
          <div className="flex flex-col gap-space-md">
            <SectionTitle icon="help">Items the system refused to decide</SectionTitle>
            <p className="font-body-compact text-body-compact text-on-surface-variant max-w-3xl">
              Below the low-confidence threshold nothing is created at all, and an ambiguous date is
              never guessed. These are the cases the system handed back rather than inventing an answer.
            </p>
            {queue.review_items.map((r: any) => (
              <Card key={r.id} className="p-space-md flex flex-wrap items-center justify-between gap-space-md">
                <span className="flex flex-col min-w-0">
                  <span className="font-body-strong text-body-strong text-on-surface">{r.title}</span>
                  <span className="font-caption-meta text-caption-meta text-on-surface-variant">
                    {r.matter_ref ?? 'matter unresolved'} · confidence {Number(r.confidence).toFixed(2)}
                  </span>
                  <span className="font-code-citation text-caption-meta text-outline italic">“{r.verbatim_text}”</span>
                </span>
                <Pill tone="awaiting">{r.kind.replace(/_/g, ' ')}</Pill>
              </Card>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-space-md">
          <SectionTitle icon="history_toggle_off">Audit log — decided</SectionTitle>
          {audit.length === 0 && <Empty>Nothing decided yet.</Empty>}
          <Card className="divide-y divide-surface-border">
            {audit.map((a: any) => (
              <div key={a.id} className="px-space-lg py-space-sm flex flex-wrap items-center justify-between gap-space-md">
                <span className="flex flex-col">
                  <span className="font-body-strong text-body-strong text-on-surface">{a.matter_ref ?? '—'} · {a.type}</span>
                  <span className="font-caption-meta text-caption-meta text-on-surface-variant">{a.decision_note ?? ''}</span>
                </span>
                <span className="font-code-timestamp text-caption-meta text-on-surface-variant">
                  {a.actor_name} · {a.decided_at ? new Date(a.decided_at).toISOString().slice(0, 16).replace('T', ' ') : ''}
                </span>
                <Pill tone={a.status === 'executed' ? 'satisfied' : 'closed'}>{a.status}</Pill>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

const Stat = ({ label, value, accent }: any) => (
  <div className={`p-space-sm rounded border flex flex-col gap-space-2xs ${
    accent ? 'bg-accent/15 border-accent/40' : 'bg-surface-container-lowest/10 border-white/10'}`}>
    <span className="font-caption-meta text-caption-meta text-primary-fixed uppercase tracking-wider">{label}</span>
    <span className="font-display-hero text-headline-matter text-on-primary font-bold">{value}</span>
  </div>
);
