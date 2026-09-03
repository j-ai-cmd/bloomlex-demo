import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { Icon, Pill, Button, Card } from '../lib/ui';

// ─── Pre-baked demo results (pure frontend, zero API) ────────────────────────
const DEMO_FILES = [
  {
    id: 'd1',
    filename: 'supp_pkg_scan.pdf',
    pages: 10,
    docType: 'Supplementary Package',
    description: 'Officer notebook entries spanning 10 pages. Occurrence number and event date were not recoverable from the scan.',
    status: 'flagged' as const,
    matchedItem: null,
  },
  {
    id: 'd2',
    filename: 'DOC_0031.pdf',
    pages: 22,
    docType: 'Police Report',
    description: 'Occurrence report with witness statements.',
    status: 'matched' as const,
    matchedItem: 'Request Item 3 — General Occurrence Report',
  },
  {
    id: 'd3',
    filename: 'Officer_shift_roster_Div14.pdf',
    pages: 6,
    docType: 'Personnel Record',
    description: 'Division 14 officer shift roster.',
    status: 'matched' as const,
    matchedItem: 'Request Item 7 — Officer Notes and Records',
  },
];

const DEMO_ANOMALIES = 1;

// ─── Processing steps ────────────────────────────────────────────────────────
const STEPS = [
  { label: 'Package received',                sub: 'Securing your files…'                   },
  { label: 'Reading files',                   sub: 'Counting pages, verifying integrity…'    },
  { label: 'Reviewing documents',             sub: 'Identifying document types…'             },
  { label: 'Matching against your register',  sub: 'Checking outstanding requests…'          },
  { label: 'Checking for changes',            sub: 'Comparing with previous disclosure…'     },
];

// ─── Processing modal (full-screen overlay, matches Nuvei pattern) ───────────
function ProcessingModal({ filename, step }: { filename: string; step: number }) {
  return (
    <div className="fixed inset-0 bg-surface/80 backdrop-blur-sm z-50 flex items-center justify-center p-space-xl">
      <div className="bg-surface-container-lowest border border-surface-border rounded-xl shadow-2xl p-space-xl flex flex-col items-center gap-space-xl w-full max-w-md">
        <div className="flex flex-col items-center gap-space-sm text-center">
          <div className={`w-12 h-12 rounded-full border-2 border-surface-border flex items-center justify-center ${
            step >= STEPS.length
              ? 'bg-status-satisfied-bg border-status-satisfied-border'
              : 'border-t-primary animate-spin'}`}>
            {step >= STEPS.length && <Icon name="check" className="text-[22px] text-status-satisfied-fg" />}
          </div>
          <span className="font-headline-matter text-subhead-lead font-bold text-on-surface">Processing package</span>
          <span className="font-code-timestamp text-caption-meta text-on-surface-variant">{filename}</span>
        </div>

        <div className="w-full flex flex-col gap-space-md">
          {STEPS.map(({ label, sub }, i) => {
            const done   = i < step;
            const active = i === step;
            return (
              <div key={i} className="flex items-center gap-space-md">
                <span className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 ${
                  done   ? 'bg-status-satisfied-bg border-status-satisfied-border'
                         : active ? 'border-primary bg-surface-container'
                         : 'border-surface-border bg-surface-container'}`}>
                  {done   && <Icon name="check" className="text-[14px] text-status-satisfied-fg" />}
                  {active && <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />}
                </span>
                <div className="flex flex-col min-w-0">
                  <span className={`font-body-compact text-body-compact ${
                    done ? 'text-on-surface' : active ? 'text-on-surface font-semibold' : 'text-on-surface-variant'}`}>
                    {label}
                  </span>
                  {active && sub && (
                    <span className="font-code-timestamp text-caption-meta text-on-surface-variant">{sub}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── File result card ────────────────────────────────────────────────────────
const STATUS_STYLE: Record<string, { label: string; tone: string }> = {
  matched: { label: 'Matched',          tone: 'satisfied' },
  flagged: { label: 'Needs your review', tone: 'awaiting'  },
};

function FileCard({ f }: { f: typeof DEMO_FILES[0] }) {
  const s = STATUS_STYLE[f.status] ?? { label: f.status, tone: 'neutral' };
  return (
    <Card className="p-space-lg flex flex-col gap-space-sm">
      <div className="flex flex-wrap items-start justify-between gap-space-sm">
        <div className="flex flex-col gap-space-2xs">
          <span className="font-headline-matter font-bold text-body-strong text-on-surface">
            {f.docType ?? 'Unidentified document'}
          </span>
          <span className="font-code-timestamp text-caption-meta text-on-surface-variant">
            {f.filename}{f.pages ? ` · ${f.pages} pages` : ''}
          </span>
        </div>
        <Pill tone={s.tone}>{s.label}</Pill>
      </div>
      <p className="font-body-compact text-body-compact text-on-surface-variant">{f.description}</p>
      {f.matchedItem && (
        <div className="flex items-center gap-space-xs text-status-satisfied-fg font-caption-meta text-caption-meta">
          <Icon name="check_circle" className="text-[15px] shrink-0" />
          {f.matchedItem}
        </div>
      )}
      {f.status === 'flagged' && (
        <div className="flex items-center gap-space-xs text-status-awaiting-fg font-caption-meta text-caption-meta">
          <Icon name="flag" className="text-[15px] shrink-0" />
          Raised for your review — open Disclosure Register to act.
        </div>
      )}
    </Card>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
export function Intake({ onChanged }: { onChanged: () => void }) {
  const [matters, setMatters]   = useState<any[]>([]);
  const [matterRef, setMatterRef] = useState('R. v. Okafor');
  const [processing, setProcessing] = useState(false);
  const [step, setStep]         = useState(0);
  const [filename, setFilename] = useState('');
  const [files, setFiles]       = useState<typeof DEMO_FILES | null>(null);
  const [anomalies, setAnomalies] = useState(0);
  const [error, setError]       = useState('');
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { api('/v1/matters').then(setMatters).catch(() => null); }, []);

  // ── Demo: pure frontend, 500 ms per step ──────────────────────────────────
  async function runDemo() {
    setError(''); setFiles(null); setAnomalies(0);
    setFilename('Demo_Disclosure_Package.zip');
    setStep(0); setProcessing(true);
    for (let i = 0; i <= STEPS.length; i++) {
      setStep(i);
      await sleep(i === 2 ? 800 : 500);
    }
    setProcessing(false);
    setFiles(DEMO_FILES);
    setAnomalies(DEMO_ANOMALIES);
    onChanged();
  }

  // ── Real upload: 1200 ms step interval, real API ──────────────────────────
  async function upload(fileList: FileList | null) {
    if (!fileList?.length) return;
    const name = Array.from(fileList).map((f) => f.name).join(', ');
    setError(''); setFiles(null); setAnomalies(0);
    setFilename(name); setStep(0); setProcessing(true);

    const loop = setInterval(() => setStep((n) => Math.min(n + 1, STEPS.length - 1)), 1200);
    const fd = new FormData();
    fd.append('matter_ref', matterRef); fd.append('source', 'usb');
    fd.append('label', `Upload ${new Date().toISOString().slice(11, 16)}`);
    for (const f of Array.from(fileList)) fd.append('file', f);
    try {
      const r = await fetch('/v1/files', { method: 'POST', body: fd });
      clearInterval(loop); setStep(STEPS.length);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      const pkgId = data.result?.package_id;
      const pkg = pkgId ? await api(`/v1/packages/${pkgId}`) : null;
      setProcessing(false);
      if (pkg?.files) {
        setFiles(pkg.files.map((f: any) => ({
          id: f.id,
          filename: f.original_filename,
          pages: f.page_count ?? null,
          docType: f.doc_type ?? null,
          description: f.description ?? 'Could not be identified — raised for your review.',
          status: f.doc_type ? 'matched' as const : 'flagged' as const,
          matchedItem: f.matched_item ?? null,
        })));
        setAnomalies(data.result?.anomalies ?? 0);
      }
      onChanged();
    } catch (e: any) {
      clearInterval(loop); setProcessing(false);
      setError(String(e.message).slice(0, 300));
    }
  }

  return (
    <>
      {processing && <ProcessingModal filename={filename} step={step} />}

      <div className="max-w-4xl mx-auto w-full px-space-xl py-space-xl flex flex-col gap-space-xl">

        {/* header */}
        <div>
          <h1 className="font-display-hero text-display-hero text-on-surface">Upload a disclosure package.</h1>
          <p className="font-body-default text-body-default text-on-surface-variant max-w-2xl mt-space-sm">
            Drop the files the Crown served. BloomLex checks them against this matter's outstanding requests and flags anything that needs your attention.
          </p>
        </div>

        {/* matter selector */}
        <div className="flex flex-wrap items-center gap-space-sm">
          <span className="font-caption-meta text-caption-meta text-on-surface-variant uppercase tracking-wider">Matter</span>
          <select value={matterRef} onChange={(e) => setMatterRef(e.target.value)}
            className="px-space-md py-space-xs bg-surface-container-lowest border border-surface-border rounded font-body-strong text-body-strong text-on-surface">
            {matters.map((m) => <option key={m.id} value={m.matter_ref}>{m.matter_ref}</option>)}
            {matters.length === 0 && <option value="R. v. Okafor">R. v. Okafor</option>}
          </select>
        </div>

        {/* drop zone */}
        {!files && !processing && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); }}
            className={`border-2 border-dashed rounded-xl p-space-4xl flex flex-col items-center gap-space-md transition-colors ${
              dragging ? 'border-accent bg-accent/5' : 'border-surface-border bg-surface-container-lowest'}`}>
            <span className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center">
              <Icon name="cloud_upload" className="text-[28px] text-on-surface-variant" />
            </span>
            <span className="font-headline-matter text-subhead-lead font-bold text-on-surface">
              Drop the disclosure package here
            </span>
            <span className="font-body-compact text-body-compact text-on-surface-variant">
              PDF or any file format the Crown provides
            </span>
            <input ref={fileRef} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
            <div className="flex flex-wrap items-center gap-space-sm">
              <Button variant="dark" onClick={() => fileRef.current?.click()}>Browse files</Button>
              <Button variant="primary" onClick={runDemo}>
                <Icon name="play_arrow" className="text-[16px]" /> Try a demo package
              </Button>
            </div>
          </div>
        )}

        {/* error */}
        {error && (
          <div className="p-space-md bg-status-overdue-bg border border-status-overdue-border rounded font-body-compact text-body-compact text-status-overdue-fg">
            {error}
          </div>
        )}

        {/* results */}
        {files && (
          <div className="flex flex-col gap-space-md">
            <div className="flex items-center justify-between flex-wrap gap-space-sm">
              <h2 className="font-headline-matter text-subhead-lead font-bold text-on-surface">
                {files.length} {files.length === 1 ? 'document' : 'documents'} reviewed
              </h2>
              <Button onClick={() => { setFiles(null); setError(''); setStep(0); }}>
                Process another package
              </Button>
            </div>

            {anomalies > 0 && (
              <div className="p-space-md bg-status-awaiting-bg border border-status-awaiting-border rounded font-body-compact text-body-compact text-status-awaiting-fg flex items-center gap-space-sm">
                <Icon name="info" className="text-[18px] shrink-0" />
                {anomalies} document{anomalies > 1 ? 's differ' : ' differs'} from what was served earlier.
                Open the Disclosure Register → Document Differences to review the changes.
              </div>
            )}

            {files.map((f) => <FileCard key={f.id} f={f} />)}
          </div>
        )}
      </div>
    </>
  );
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
