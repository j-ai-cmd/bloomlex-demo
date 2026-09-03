import React, { useEffect, useRef, useState } from 'react';
import { api, post } from '../lib/api';
import { Icon, Pill, Button, Card, Empty, stateTone, Origin } from '../lib/ui';

const STAGES = ['Received', 'Indexed', 'Classified', 'Reconciled', 'Anomalies Detected'] as const;

/** Which pipeline stage a run step belongs to, so the workflow strip advances honestly. */
function stageOf(name: string): number {
  if (name.startsWith('create_package')) return 0;
  if (name.startsWith('index_files')) return 1;
  if (name.startsWith('classify') || name.startsWith('classification_policy')) return 2;
  if (name.startsWith('propose_matches') || name.startsWith('match_policy') || name.startsWith('request_item_state')) return 3;
  if (name.startsWith('diff')) return 4;
  return -1;
}

export function Intake({ onChanged }: { onChanged: () => void }) {
  const [matters, setMatters] = useState<any[]>([]);
  const [matterRef, setMatterRef] = useState('R. v. Okafor');
  const [meta, setMeta] = useState<any>(null);
  const [busy, setBusy] = useState<'' | 'upload' | 'demo'>('');
  const [steps, setSteps] = useState<any[]>([]);
  const [outcome, setOutcome] = useState<any>(null);
  const [pkg, setPkg] = useState<any>(null);
  const [error, setError] = useState<string>('');
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { api('/v1/meta').then(setMeta); api('/v1/matters').then(setMatters); }, []);

  async function afterRun(r: any) {
    setSteps(r.trace?.steps ?? []);
    setOutcome(r.result ?? null);
    if (r.result?.package_id) setPkg(await api(`/v1/packages/${r.result.package_id}`));
    setBusy(''); onChanged();
  }

  async function runDemo() {
    setError(''); setBusy('demo'); setSteps([]); setOutcome(null); setPkg(null);
    try { await afterRun(await post('/v1/demo/package', { matter_ref: matterRef })); }
    catch (e: any) { setError(String(e.message)); setBusy(''); }
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(''); setBusy('upload'); setSteps([]); setOutcome(null); setPkg(null);
    const fd = new FormData();
    fd.append('matter_ref', matterRef);
    fd.append('source', 'usb');
    fd.append('label', `Dragged in ${new Date().toISOString().slice(11, 16)}`);
    for (const f of Array.from(files)) fd.append('file', f);
    try {
      const r = await fetch('/v1/files', { method: 'POST', body: fd });
      if (!r.ok) throw new Error(await r.text());
      await afterRun(await r.json());
    } catch (e: any) { setError(String(e.message).slice(0, 300)); setBusy(''); }
  }

  const reached = steps.reduce((n, s) => Math.max(n, stageOf(s.name)), -1);
  const running = busy !== '';

  return (
    <div className="max-w-7xl mx-auto w-full px-space-xl py-space-xl flex flex-col gap-space-xl">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-xl">
        <div className="lg:col-span-2 flex flex-col gap-space-lg">
          <div>
            <h1 className="font-display-hero text-display-hero text-on-surface">Process a disclosure package.</h1>
            <p className="font-body-default text-body-default text-on-surface-variant max-w-2xl mt-space-sm">
              Drop the files the Crown served. They are hashed, classified, reconciled against
              this matter's request register, compared with anything previously served, and a
              follow-up is proposed for whatever is still outstanding. Nothing is sent.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-space-sm">
            <span className="font-caption-meta text-caption-meta text-on-surface-variant uppercase tracking-wider">Matter</span>
            <select value={matterRef} onChange={(e) => setMatterRef(e.target.value)}
              className="px-space-md py-space-xs bg-surface-container-lowest border border-surface-border rounded font-body-strong text-body-strong text-on-surface">
              {matters.map((m) => <option key={m.id} value={m.matter_ref}>{m.matter_ref}</option>)}
            </select>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); }}
            className={`border-2 border-dashed rounded p-space-4xl flex flex-col items-center gap-space-md transition-colors ${
              dragging ? 'border-accent bg-accent/5' : 'border-surface-border bg-surface-container-lowest'}`}>
            <span className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center">
              <Icon name={running ? 'hourglass_top' : 'cloud_upload'} className="text-[28px] text-on-surface-variant" />
            </span>
            <span className="font-headline-matter text-subhead-lead font-bold text-on-surface">
              {running ? 'Processing…' : 'Drop the disclosure package here'}
            </span>
            <span className="font-body-compact text-body-compact text-on-surface-variant">
              PDF, media stubs · files are hashed on arrival
            </span>
            <input ref={fileRef} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
            <div className="flex flex-wrap items-center gap-space-sm">
              <Button variant="dark" disabled={running} onClick={() => fileRef.current?.click()}>Browse files</Button>
              <Button variant="primary" disabled={running} onClick={runDemo}>
                <Icon name="play_arrow" className="text-[16px]" /> Try a demo package
              </Button>
            </div>
            <span className="font-caption-meta text-caption-meta text-on-surface-variant text-center max-w-md">
              Both buttons take the identical code path. The demo package uses documents already
              on the server; nothing about its result is pre-computed.
            </span>
          </div>

          {error && (
            <div className="p-space-md bg-status-overdue-bg border border-status-overdue-border rounded font-body-compact text-body-compact text-status-overdue-fg">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-space-sm">
            <span className="font-section-title text-section-title uppercase text-on-surface-variant tracking-wider">Analysis workflow</span>
            <div className="flex items-center">
              {STAGES.map((s, i) => (
                <React.Fragment key={s}>
                  <div className="flex flex-col items-center gap-space-2xs">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center font-code-timestamp text-caption-meta font-bold border ${
                      i <= reached ? 'bg-primary text-on-primary border-primary'
                                   : 'bg-surface-container text-on-surface-variant border-surface-border'}`}>
                      {i + 1}
                    </span>
                    <span className="font-caption-meta text-caption-meta text-on-surface-variant whitespace-nowrap">{s}</span>
                  </div>
                  {i < STAGES.length - 1 && (
                    <span className={`flex-1 h-0.5 mx-space-xs mb-space-lg ${i < reached ? 'bg-primary' : 'bg-surface-border'}`} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {steps.length > 0 && (
            <Card className="overflow-hidden">
              <div className="px-space-md py-space-sm bg-surface-container-low border-b border-surface-border flex items-center justify-between">
                <span className="font-section-title text-section-title uppercase font-bold text-on-surface">Run trace</span>
                <span className="font-code-timestamp text-caption-meta text-on-surface-variant">
                  {steps.length} steps · {steps.reduce((n, s) => n + (s.latency_ms ?? 0), 0)}ms
                </span>
              </div>
              <div className="max-h-96 overflow-auto">
                {steps.map((s) => (
                  <div key={s.seq} className="grid grid-cols-[2.5rem_7rem_1fr_auto] gap-space-md items-start px-space-md py-space-xs border-b border-surface-border last:border-0">
                    <span className="font-code-timestamp text-caption-meta text-outline">#{s.seq}</span>
                    <span className={`font-code-timestamp text-caption-meta font-bold uppercase ${
                      s.kind === 'llm' ? 'text-secondary' : s.kind === 'io' ? 'text-on-surface-variant' : 'text-status-satisfied-fg'}`}>
                      {s.kind}
                    </span>
                    <span className="flex flex-col min-w-0">
                      <span className="font-body-strong text-body-strong text-on-surface truncate">{s.name}</span>
                      {s.decision && <span className="font-caption-meta text-caption-meta text-on-surface-variant">{s.decision}</span>}
                    </span>
                    <span className="font-code-timestamp text-caption-meta text-outline whitespace-nowrap">
                      {s.model && s.model !== 'n/a' ? `${s.model} · ` : ''}{s.latency_ms}ms
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {pkg && (
            <Card className="p-space-lg flex flex-col gap-space-md">
              <div className="flex flex-wrap items-center justify-between gap-space-sm">
                <span className="font-headline-matter text-subhead-lead font-bold text-on-surface">{pkg.package.label}</span>
                <Pill tone={pkg.package.state === 'Anomalies Detected' ? 'awaiting' : 'satisfied'}>{pkg.package.state}</Pill>
              </div>
              <div className="flex flex-col divide-y divide-surface-border border border-surface-border rounded overflow-hidden">
                {pkg.files.map((f: any) => (
                  <div key={f.id} className="p-space-md flex flex-col gap-space-2xs bg-surface-container-lowest">
                    <span className="flex flex-wrap items-center justify-between gap-space-sm">
                      <span className="font-code-timestamp text-code-timestamp font-bold text-on-surface">{f.original_filename}</span>
                      <span className="font-code-timestamp text-caption-meta text-outline">
                        {f.page_count ? `${f.page_count}pp · ` : ''}{f.sha256.slice(0, 12)}…
                      </span>
                    </span>
                    <span className="font-body-compact text-body-compact text-on-surface-variant">
                      {f.doc_type ? `${f.doc_type} — ${f.description}` : 'Below the classification threshold; raised for lawyer review rather than filed'}
                    </span>
                    {f.classification_confidence != null &&
                      <Origin model={meta?.ai?.model} confidence={f.classification_confidence} approvedBy={null} />}
                  </div>
                ))}
              </div>
              {outcome?.anomalies > 0 && (
                <div className="p-space-md bg-status-awaiting-bg border border-status-awaiting-border rounded font-body-compact text-body-compact text-status-awaiting-fg">
                  {outcome.anomalies} version difference(s) observed against material served earlier.
                  Open the Disclosure Desk → Document diff to read them.
                </div>
              )}
            </Card>
          )}

          {!steps.length && !running && <Empty>Nothing processed yet. Drop a file, or run the demo package.</Empty>}
        </div>

        <div className="flex flex-col gap-space-lg">
          <Card className="p-space-lg flex flex-col gap-space-sm">
            <span className="flex items-center gap-space-xs">
              <Icon name="info" className="text-[18px] text-primary" />
              <span className="font-headline-matter text-subhead-lead font-bold text-on-surface">What runs where</span>
            </span>
            <p className="font-body-compact text-body-compact text-on-surface-variant">
              Hashing, page counts, version comparison, request-item state and every number are
              deterministic code. The model only classifies a file, proposes a match, and drafts
              prose. It never advances a state or computes a date.
            </p>
            <div className="pt-space-xs border-t border-surface-border">
              <Origin model={meta?.ai?.model} approvedBy={null} />
            </div>
          </Card>

          <Card className="p-space-lg flex flex-col gap-space-sm">
            <span className="font-headline-matter text-subhead-lead font-bold text-on-surface">Not attempted</span>
            <p className="font-body-compact text-body-compact text-on-surface-variant">
              {(meta?.diff_out_of_scope ?? []).join(', ') || '—'}. Where page-level data is
              unavailable the comparison reports fewer observations rather than inventing any.
            </p>
          </Card>

          <Card className="p-space-lg flex flex-col gap-space-sm">
            <span className="font-headline-matter text-subhead-lead font-bold text-on-surface">Handling</span>
            <p className="font-body-compact text-body-compact text-on-surface-variant">
              Uploaded files are written to the server's fixtures directory for this prototype and
              are not encrypted or retained under any policy. {meta?.demo_notice}.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
