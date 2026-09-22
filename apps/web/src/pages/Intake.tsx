import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { Icon, Button, Card } from '../lib/ui';
import AnimatedFileUpload from '../components/smoothui/animated-file-upload';
import AITaskList from '../components/smoothui/ai-task-list';
import Select from '../components/smoothui/select';
import { MorphLoader } from '../components/amicro/morph-loader';
import { FadeUp } from '../components/amicro/fade-up';
import { markDisclosureRan } from './Calendar';
import type { Page } from '../components/Shell';

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
    matchedSeq: null as number | null,
  },
  {
    id: 'd2',
    filename: 'DOC_0031.pdf',
    pages: 22,
    docType: 'Police Report',
    description: 'Occurrence report with witness statements.',
    status: 'matched' as const,
    matchedItem: 'Request Item 3 — General Occurrence Report',
    matchedSeq: 3 as number | null,
  },
  {
    id: 'd3',
    filename: 'Officer_shift_roster_Div14.pdf',
    pages: 6,
    docType: 'Personnel Record',
    description: 'Division 14 officer shift roster.',
    status: 'matched' as const,
    matchedItem: 'Request Item 7 — Officer Notes and Records',
    matchedSeq: 7 as number | null,
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

const INTAKE_KEY = 'bloomlex_intake_state';

// ─── Processing modal ─────────────────────────────────────────────────────────
function ProcessingModal({ filename, step }: { filename: string; step: number }) {
  return (
    <div className="fixed inset-0 bg-surface/80 backdrop-blur-sm z-50 flex items-center justify-center p-space-xl">
      <div role="dialog" aria-modal="true" aria-label="Processing package" aria-busy={step < STEPS.length}
        className="bg-surface-container-lowest border border-surface-border rounded-xl shadow-2xl p-space-xl flex flex-col items-center gap-space-xl w-full max-w-md">
        <div className="flex flex-col items-center gap-space-sm text-center">
          {step >= STEPS.length ? (
            <div className="w-12 h-12 rounded-full border-2 bg-status-satisfied-bg border-status-satisfied-border flex items-center justify-center">
              <Icon name="check" className="text-[22px] text-status-satisfied-fg" />
            </div>
          ) : (
            <MorphLoader size={36} color="bg-primary" className="m-1.5" />
          )}
          <span className="font-headline-matter text-subhead-lead font-bold text-on-surface">Processing package</span>
          <span className="font-code-timestamp text-caption-meta text-on-surface-variant">{filename}</span>
        </div>

        <AITaskList className="w-full" label="Pipeline"
          tasks={STEPS.map(({ label, sub }, i) => ({
            id: String(i), label,
            note: i === step ? sub : undefined,
            status: i < step ? 'done' : i === step ? 'running' : 'pending',
          }))} />
      </div>
    </div>
  );
}

// ─── File result card ─────────────────────────────────────────────────────────
const STATUS_STYLE: Record<string, { label: string; tone: string }> = {
  matched: { label: 'Matched',          tone: 'satisfied' },
  flagged: { label: 'Needs your review', tone: 'awaiting'  },
};

function FileCard({ f, onReview, onViewInMatters }: { f: typeof DEMO_FILES[0]; onReview?: () => void; onViewInMatters?: () => void }) {
  const clickable = f.status === 'flagged' ? !!onReview : !!onViewInMatters;
  const handler = f.status === 'flagged' ? onReview : onViewInMatters;
  return (
    <Card className={`p-space-lg flex flex-col gap-space-sm ${clickable ? 'cursor-pointer hover:border-accent transition-colors' : ''}`}
      onClick={clickable ? handler : undefined}>
      <div className="flex flex-col gap-space-2xs">
        <span className="font-headline-matter font-bold text-body-strong text-on-surface">
          {f.docType ?? 'Unidentified document'}
        </span>
        <span className="font-code-timestamp text-caption-meta text-on-surface-variant">
          {f.filename}{f.pages ? ` · ${f.pages} pages` : ''}
        </span>
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
          {onReview ? 'Click to review in Pending Review →' : 'Open Pending Review to act on this.'}
        </div>
      )}
      {f.status === 'matched' && onViewInMatters && (
        <div className="flex items-center gap-space-xs text-on-surface-variant font-caption-meta text-caption-meta">
          <Icon name="open_in_new" className="text-[13px] shrink-0" />
          Click to view in Matters →
        </div>
      )}
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
type FileRecord = typeof DEMO_FILES[0];

function loadSession(matter: string): { files: FileRecord[] | null; anomalies: number } | null {
  try {
    const raw = sessionStorage.getItem(INTAKE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.matterRef !== matter) return null;
    return { files: parsed.files, anomalies: parsed.anomalies };
  } catch { return null; }
}

function saveSession(matter: string, files: FileRecord[] | null, anomalies: number) {
  try {
    if (files) {
      sessionStorage.setItem(INTAKE_KEY, JSON.stringify({ matterRef: matter, files, anomalies }));
    } else {
      sessionStorage.removeItem(INTAKE_KEY);
    }
  } catch {}
}

export function Intake({ onChanged, setPage }: { onChanged: () => void; setPage: (p: Page) => void }) {
  const [matters, setMatters]   = useState<any[]>([]);
  const [matterRef, setMatterRef] = useState('R. v. Okafor');
  const [processing, setProcessing] = useState(false);
  const [step, setStep]         = useState(0);
  const [filename, setFilename] = useState('');
  const [files, setFiles]       = useState<FileRecord[] | null>(null);
  const [anomalies, setAnomalies] = useState(0);
  const [error, setError]       = useState('');

  // Restore saved state on mount
  useEffect(() => {
    const saved = loadSession(matterRef);
    if (saved) { setFiles(saved.files); setAnomalies(saved.anomalies); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { api('/v1/matters').then(setMatters).catch(() => null); }, []);

  // Persist analysis to sessionStorage whenever it changes
  useEffect(() => { saveSession(matterRef, files, anomalies); }, [files, anomalies, matterRef]);

  function handleMatterChange(newMatter: string) {
    setMatterRef(newMatter);
    setFiles(null);
    setAnomalies(0);
    setError('');
    saveSession(newMatter, null, 0);
  }

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
    markDisclosureRan();
    onChanged();
  }

  // ── Real upload ───────────────────────────────────────────────────────────
  async function upload(fileList: FileList | File[] | null) {
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
        const mapped: FileRecord[] = pkg.files.map((f: any) => ({
          id: f.id,
          filename: f.original_filename,
          pages: f.page_count ?? null,
          docType: f.doc_type ?? null,
          description: f.description ?? 'Could not be identified — raised for your review.',
          status: f.matched_item ? 'matched' as const : 'flagged' as const,
          matchedItem: f.matched_item ?? null,
          matchedSeq: f.matched_seq ?? null,
        }));
        setFiles(mapped);
        setAnomalies(data.result?.anomalies ?? 0);
      }
      onChanged();
    } catch (e: any) {
      clearInterval(loop); setProcessing(false);
      setError(String(e.message).slice(0, 300));
    }
  }

  const flaggedCount = files?.filter((f) => f.status === 'flagged').length ?? 0;

  return (
    <>
      {processing && <ProcessingModal filename={filename} step={step} />}

      <div className="max-w-4xl mx-auto w-full px-space-xl py-space-xl flex flex-col gap-space-xl">

        {/* header */}
        <div>
          <h1 className="font-display-hero text-display-hero text-on-surface">Upload a disclosure package.</h1>
          <p className="font-body-default text-body-default text-on-surface-variant max-w-2xl mt-space-sm">
            Drop the files the Crown served. BloomLex checks them against their matter's outstanding requests and flags anything that needs your attention.
          </p>
        </div>

        {/* matter selector */}
        <div className="flex flex-wrap items-center gap-space-sm">
          <span className="font-caption-meta text-caption-meta text-on-surface-variant uppercase tracking-wider">Matter</span>
          <div className="w-64"><Select size="sm" aria-label="Matter" value={matterRef} onValueChange={handleMatterChange}
            className="min-w-[14rem] bg-surface-container-lowest border-surface-border font-body-strong text-body-strong text-on-surface"
            options={matters.length ? matters.map((m) => ({ value: m.matter_ref, label: m.matter_ref }))
                                    : [{ value: 'R. v. Okafor', label: 'R. v. Okafor' }]} /></div>
        </div>

        {/* drop zone */}
        {!files && !processing && (
          <div className="border border-surface-border rounded-xl p-space-2xl bg-surface-container-lowest flex flex-col items-center gap-space-md">
            <span className="font-headline-matter text-subhead-lead font-bold text-on-surface">
              Drop the disclosure package here
            </span>
            <AnimatedFileUpload multiple onFilesSelected={(fs) => { if (fs.length) upload(fs); }}
              className="font-body-compact [&>div[role=button]]:py-space-3xl" />
            <Button variant="primary" onClick={runDemo}>
              <Icon name="play_arrow" className="text-[16px]" /> Try a demo package
            </Button>
          </div>
        )}

        {/* error */}
        {error && (
          <div role="alert" className="p-space-md bg-status-overdue-bg border border-status-overdue-border rounded font-body-compact text-body-compact text-status-overdue-fg">
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
                Process new package
              </Button>
            </div>

            {files.map((f, i) => (
              <FadeUp key={f.id} delay={i * 0.08} yOffset={14} duration={0.5}>
              <FileCard f={f}
                onReview={f.status === 'flagged' ? () => {
                  try { sessionStorage.setItem('bloomlex_nav_intent', JSON.stringify({ page: 'review', filename: f.filename })); } catch {}
                  setPage('review');
                } : undefined}
                onViewInMatters={f.status === 'matched' && f.matchedSeq ? () => {
                  try { sessionStorage.setItem('bloomlex_nav_intent', JSON.stringify({ page: 'disclosure', matterRef: matterRef, itemSeq: f.matchedSeq })); } catch {}
                  setPage('disclosure');
                } : undefined} />
              </FadeUp>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
