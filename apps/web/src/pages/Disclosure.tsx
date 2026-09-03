import React, { useEffect, useState } from 'react';
import { api, fmtDate } from '../lib/api';
import { Icon, Pill, Card, Empty, stateTone, SectionTitle, Origin } from '../lib/ui';

type Tab = 'register' | 'reconcile' | 'diff' | 'evidence';

export function Disclosure() {
  const [matters, setMatters] = useState<any[]>([]);
  const [matterId, setMatterId] = useState<string>('');
  const [register, setRegister] = useState<any>(null);
  const [recon, setRecon] = useState<any>(null);
  const [unmatched, setUnmatched] = useState<any[]>([]);
  const [diffs, setDiffs] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('register');
  const [evidenceId, setEvidenceId] = useState<string>('');
  const [evidence, setEvidence] = useState<any>(null);

  useEffect(() => {
    api('/v1/meta').then(setMeta);
    api('/v1/matters').then((m) => { setMatters(m); setMatterId(m.find((x: any) => x.matter_ref === 'R. v. Okafor')?.id ?? m[0]?.id); });
  }, []);

  useEffect(() => {
    if (!matterId) return;
    api(`/v1/matters/${matterId}/register`).then(setRegister);
    api(`/v1/reconciliation?matter_id=${matterId}`).then(setRecon);
    api(`/v1/unmatched?matter_id=${matterId}`).then(setUnmatched);
    api(`/v1/diffs?matter_id=${matterId}`).then(setDiffs);
    setEvidenceId(''); setEvidence(null);
  }, [matterId]);

  useEffect(() => { if (evidenceId) api(`/v1/request-items/${evidenceId}/evidence`).then(setEvidence); }, [evidenceId]);

  const matter = matters.find((m) => m.id === matterId);
  const roll = register?.rollup;

  const openEvidence = (itemId: string) => { setEvidenceId(itemId); setTab('evidence'); };

  return (
    <div className="flex flex-col w-full">
      <div className="px-space-xl py-space-md bg-surface-container-low border-b border-surface-border flex flex-wrap items-center justify-between gap-space-md">
        <div className="flex items-center gap-space-sm flex-wrap">
          <h1 className="font-headline-matter text-headline-matter text-on-surface font-bold">{matter?.matter_ref ?? '—'}</h1>
          <span className="font-code-citation text-code-citation px-space-xs py-space-2xs bg-surface-container rounded text-on-surface border border-surface-border">
            {matter?.key_dates?.court_file ?? '—'}
          </span>
          <span className="font-caption-meta text-caption-meta text-on-surface-variant">Prosecutor: {matter?.crown_contact ?? '—'}</span>
        </div>
        {roll && (
          <div className="flex items-center gap-space-md">
            <Metric label="Items" value={roll.total_items} />
            <Metric label="Satisfied" value={roll.satisfied} tone="text-status-satisfied-fg" />
            <Metric label="Partially served" value={roll.partially_received} tone="text-status-awaiting-fg" />
            <Metric label="Follow-up needed" value={roll.still_outstanding} tone="text-status-overdue-fg" />
            <Metric label="Oldest gap" value={`${roll.oldest_outstanding_days}d`} tone="text-status-overdue-fg" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-12 w-full min-h-[calc(100vh-9rem)]">
        <section className="col-span-12 lg:col-span-3 bg-surface-container-low border-r border-surface-border flex flex-col">
          <div className="p-space-md border-b border-surface-border flex items-center justify-between">
            <span className="font-headline-matter text-[13px] font-bold uppercase tracking-wider">Matters ({matters.length})</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-surface-border">
            {matters.map((m) => (
              <button key={m.id} onClick={() => setMatterId(m.id)}
                className={`w-full text-left p-space-md transition-colors ${
                  m.id === matterId ? 'bg-surface-container-lowest border-l-4 border-accent' : 'hover:bg-surface-container'}`}>
                <div className="flex items-center justify-between mb-space-2xs">
                  <span className="font-subhead-lead text-subhead-lead font-bold text-on-surface">{m.matter_ref}</span>
                  <span className="font-code-citation text-caption-meta px-1 bg-surface-container-high rounded text-on-surface-variant border border-surface-border">
                    {m.key_dates?.court_file?.split('-').pop() ?? ''}
                  </span>
                </div>
                <div className="flex items-center gap-space-xs">
                  <Pill tone={Number(m.outstanding_items) > 0 ? 'overdue' : 'satisfied'}>
                    {m.outstanding_items} open
                  </Pill>
                  {Number(m.open_reviews) > 0 && <Pill tone="awaiting">{m.open_reviews} to review</Pill>}
                </div>
                <p className="font-body-compact text-body-compact text-on-surface-variant line-clamp-1 mt-space-xs">
                  {(m.charges ?? []).join(', ')}
                </p>
              </button>
            ))}
          </div>
        </section>

        <section className="col-span-12 lg:col-span-9 flex flex-col">
          <div className="flex items-center gap-space-xs px-space-xl border-b border-surface-border bg-surface-container-lowest">
            {([['register', 'Outstanding requests', 'checklist_rtl'],
               ['reconcile', 'Matched documents', 'rule'],
               ['diff', 'Document differences', 'difference'],
               ['evidence', 'Evidence list', 'account_tree']] as [Tab, string, string][]).map(([id, label, icon]) => (
              <button key={id} onClick={() => setTab(id)}
                className={`px-space-sm py-space-md flex items-center gap-space-xs font-body-strong text-body-strong border-b-2 transition-colors ${
                  tab === id ? 'border-accent text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}>
                <Icon name={icon} className="text-[16px]" />{label}
                {id === 'diff' && diffs.length > 0 && <Pill tone="awaiting">{diffs.reduce((n, d) => n + d.observations.length, 0)}</Pill>}
              </button>
            ))}
          </div>

          <div className="p-space-xl flex flex-col gap-space-xl">
            {tab === 'register' && register && (
              <div className="flex flex-col gap-space-md">
                <SectionTitle icon="checklist_rtl">Outstanding requests</SectionTitle>
                <div className="flex flex-col divide-y divide-surface-border border border-surface-border rounded overflow-hidden">
                  {register.items.map((it: any) => (
                    <button key={it.id} onClick={() => openEvidence(it.id)}
                      className="text-left p-space-md bg-surface-container-lowest hover:bg-surface-container-low transition-colors flex items-start justify-between gap-space-md">
                      <span className="flex flex-col min-w-0">
                        <span className="font-code-citation text-caption-meta text-outline">ITEM #{String(it.seq).padStart(2, '0')}</span>
                        <span className="font-body-strong text-body-strong text-on-surface">{it.description}</span>
                        <span className="font-caption-meta text-caption-meta text-on-surface-variant">
                          Requested {fmtDate(it.first_requested_at)} · {it.clock?.age_calendar_days ?? 0} days · {it.clock?.followups ?? 0} follow-up(s) · {it.clock?.packages_received ?? 0} package(s)
                        </span>
                      </span>
                      <Pill tone={stateTone(it.state)}>{it.state}</Pill>
                    </button>
                  ))}
                </div>
                <p className="font-caption-meta text-caption-meta text-on-surface-variant">
                  Every number above is computed from recorded dates in {meta?.timezone}. The model never
                  produced one. Click any item for its full evidence history.
                </p>
              </div>
            )}

            {tab === 'reconcile' && recon && (
              <>
                <div className="flex flex-col gap-space-md">
                  <SectionTitle icon="rule">Files matched to the register</SectionTitle>
                  {recon.items.filter((i: any) => i.matches).map((it: any) => (
                    <Card key={it.id} className="p-space-md flex flex-col gap-space-sm">
                      <div className="flex items-center justify-between gap-space-md">
                        <span className="font-body-strong text-body-strong text-on-surface">#{it.seq} {it.description}</span>
                        <Pill tone={stateTone(it.state)}>{it.state}</Pill>
                      </div>
                      {it.matches.map((m: any) => (
                        <div key={m.match_id} className="flex items-center justify-between gap-space-md p-space-sm bg-surface-container-low border border-surface-border rounded">
                          <span className="flex flex-col min-w-0 gap-space-2xs">
                            <span className="font-code-timestamp text-code-timestamp text-on-surface font-bold">{m.filename}</span>
                            <span className="font-caption-meta text-caption-meta text-on-surface-variant">
                              {m.doc_type} · {m.description}
                            </span>
                            <span className="font-caption-meta text-caption-meta text-outline">{m.evidence?.evidence}</span>
                            <span className="flex flex-col gap-space-2xs pt-space-2xs border-t border-surface-border/60">
                              <span className="font-caption-meta text-caption-meta text-outline uppercase">Classification</span>
                              <Origin confidence={m.classification_confidence}
                                      at={m.classification_recorded_at} approvedBy={null} />
                              <span className="font-caption-meta text-caption-meta text-outline uppercase">Match</span>
                              <Origin confidence={m.confidence}
                                      at={m.match_recorded_at} approvedBy={m.approved_by} />
                            </span>
                          </span>
                          <span className="flex flex-col items-end gap-space-2xs shrink-0">
                            <Pill tone={m.state === 'confirmed' ? 'satisfied' : 'awaiting'}>{m.state}</Pill>
                            <span className="font-code-timestamp text-caption-meta text-on-surface-variant">
                              {Math.round(Number(m.confidence) * 100)}% match
                            </span>
                          </span>
                        </div>
                      ))}
                    </Card>
                  ))}
                </div>

                <div className="flex flex-col gap-space-md">
                  <SectionTitle icon="flag">Unmatched / unrequested material</SectionTitle>
                  <p className="font-body-compact text-body-compact text-on-surface-variant max-w-3xl">
                    Nothing on the register asked for these. They are kept because extras can reveal
                    items the firm never knew to ask for. No conclusion is drawn about them here.
                  </p>
                  {unmatched.length === 0 && <Empty>Every file served maps to a request item.</Empty>}
                  {unmatched.map((f: any) => (
                    <Card key={f.id} className="p-space-md flex items-center justify-between gap-space-md">
                      <span className="flex flex-col gap-space-2xs">
                        <span className="font-code-citation text-code-citation font-bold text-on-surface">{f.original_filename}</span>
                        <span className="font-caption-meta text-caption-meta text-on-surface-variant">
                          {f.description ?? 'Not classified with sufficient confidence — raised for lawyer review'}
                        </span>
                        {f.classification_confidence != null &&
                          <Origin confidence={f.classification_confidence} approvedBy={null} />}
                      </span>
                      <Pill tone="awaiting">Lawyer review required</Pill>
                    </Card>
                  ))}
                </div>
              </>
            )}

            {tab === 'diff' && (
              <div className="flex flex-col gap-space-md">
                <SectionTitle icon="difference">Observed differences between served versions</SectionTitle>
                <div className="bg-surface-container-low border border-surface-border px-space-lg py-space-sm rounded flex items-center gap-space-sm">
                  <Icon name="info" className="text-[18px] text-on-surface-variant" />
                  <span className="font-body-compact text-body-compact text-on-surface-variant">
                    Out of scope, and not attempted: {(meta?.diff_out_of_scope ?? []).join(', ')}.
                    Observations state what changed. They do not characterise why.
                  </span>
                </div>
                {diffs.length === 0 && <Empty>No document has been re-served on this matter.</Empty>}
                {diffs.map((d: any) => (
                  <Card key={d.id} className="p-space-lg flex flex-col gap-space-md">
                    <div className="flex flex-wrap items-center justify-between gap-space-sm">
                      <span className="font-body-strong text-body-strong text-on-surface">
                        {d.from_filename} <span className="text-outline">→</span> {d.to_filename}
                      </span>
                      <span className="font-code-timestamp text-caption-meta text-on-surface-variant">
                        {d.from_package} → {d.to_package}
                      </span>
                    </div>
                    <Origin deterministic at={d.computed_at} approvedBy={null} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
                      {d.observations.map((o: any, i: number) => (
                        <div key={i} className="p-space-md bg-surface-container-low border border-surface-border rounded flex flex-col gap-space-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-code-timestamp text-caption-meta font-bold uppercase text-on-surface-variant">{o.type.replace(/_/g, ' ')}</span>
                            <Pill tone="neutral">{o.locator}</Pill>
                          </div>
                          <p className="font-body-strong text-body-strong text-on-surface">{o.statement}</p>
                          <span className="font-code-citation text-caption-meta text-outline">
                            before: {String(o.before ?? '—').slice(0, 30)} · after: {String(o.after ?? '—').slice(0, 30)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {tab === 'evidence' && (
              <div className="flex flex-col gap-space-md">
                <SectionTitle icon="account_tree">Evidence list</SectionTitle>
                {!evidence && <Empty>Pick an item on the request register to see its whole history.</Empty>}
                {evidence && <EvidenceIndex e={evidence} />}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

const Metric = ({ label, value, tone = 'text-on-surface' }: any) => (
  <div className="flex flex-col items-end">
    <span className="font-caption-meta text-caption-meta text-on-surface-variant uppercase tracking-wider">{label}</span>
    <span className={`font-display-case text-[20px] font-bold ${tone}`}>{value}</span>
  </div>
);

function EvidenceIndex({ e }: { e: any }) {
  const steps: { title: string; when: any; detail: string; tone?: string }[] = [
    { title: `Requested in ${e.item.letter_ref}`, when: e.item.first_requested_at, detail: `Sent via ${e.item.channel}` },
    ...e.followups.map((f: any, i: number) => ({ title: `Follow-up ${i + 1}`, when: f.sent_at, detail: `via ${f.channel}` })),
    ...e.files.map((f: any) => ({
      title: `Received in ${f.package_label}`, when: f.received_at,
      detail: `${f.original_filename} · ${f.doc_type ?? 'unclassified'} · match ${f.match_state} at ${Math.round(Number(f.match_confidence) * 100)}%`,
    })),
    ...e.diffs.flatMap((d: any) => d.observations.map((o: any) => ({
      title: 'Version difference observed', when: d.computed_at, detail: o.statement, tone: 'awaiting',
    }))),
  ].sort((a, b) => String(a.when).localeCompare(String(b.when)));

  return (
    <Card className="p-space-lg flex flex-col gap-space-lg">
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <span className="flex flex-col">
          <span className="font-headline-matter text-headline-matter font-bold text-on-surface">{e.item.description}</span>
          <span className="font-caption-meta text-caption-meta text-on-surface-variant">
            {e.item.matter_ref} · item #{e.item.seq} · current state {e.item.state}
          </span>
        </span>
        <span className="font-code-timestamp text-caption-meta text-on-surface-variant">
          {e.clock?.age_calendar_days} days since first requested · {e.clock?.age_business_days} business days
        </span>
      </div>

      <div className="flex flex-col">
        {steps.map((s, i) => (
          <div key={i} className="flex items-start gap-space-lg">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-surface-container-high text-on-surface border border-surface-border flex items-center justify-center font-code-timestamp text-caption-meta font-bold">
                {String(i + 1).padStart(2, '0')}
              </div>
              {i < steps.length - 1 && <div className="w-0.5 flex-1 min-h-8 bg-surface-border" />}
            </div>
            <div className={`flex-1 mb-space-md p-space-md border rounded flex flex-col md:flex-row md:items-center justify-between gap-space-sm ${
              s.tone === 'awaiting' ? 'bg-status-awaiting-bg border-status-awaiting-border' : 'bg-surface-container-low border-surface-border'}`}>
              <span className="flex flex-col">
                <span className="font-body-strong text-body-strong text-on-surface">{s.title}</span>
                <span className="font-body-compact text-body-compact text-on-surface-variant">{s.detail}</span>
              </span>
              <span className="font-code-timestamp text-caption-meta text-on-surface-variant">{fmtDate(s.when)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-space-xs">
        <span className="font-caption-meta text-caption-meta text-on-surface-variant uppercase tracking-wider">Recorded state changes</span>
        {e.transitions.map((t: any) => (
          <div key={t.id} className="flex items-center justify-between font-code-timestamp text-caption-meta text-on-surface-variant border-b border-surface-border/60 py-1">
            <span>{t.from_state ?? '∅'} → <span className="text-on-surface font-bold">{t.to_state}</span></span>
            <span>{t.trigger} · {t.actor_kind}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
