import React, { useEffect, useRef, useState } from 'react';
import { api, post } from '../lib/api';
import { Icon, Button, Card, Empty } from '../lib/ui';

const INTAKE_KEY = 'bloomlex_intake_state';

type ReviewItem = {
  id: string; title: string; kind: string; matter_ref: string | null;
  confidence: number | null; created_at: string;
};

type IntakeFile = {
  id: string; filename: string; pages: number | null; docType: string | null;
  description: string; status: 'flagged' | 'matched'; matchedItem: string | null;
};

const KIND_LABELS: Record<string, string> = {
  ambiguous_date:          'Unclear date — needs clarification',
  unmatched_document:      'Document not matched to a request',
  low_confidence_match:    'Match uncertain — please confirm',
  missing_item:            'Potentially missing from disclosure',
  default:                 'Flagged for your attention',
};

function kindLabel(kind: string) {
  return KIND_LABELS[kind] ?? KIND_LABELS.default;
}

function loadIntakeFlagged(): IntakeFile[] {
  try {
    const raw = sessionStorage.getItem(INTAKE_KEY);
    if (!raw) return [];
    return (JSON.parse(raw).files ?? []).filter((f: IntakeFile) => f.status === 'flagged');
  } catch { return []; }
}

// ─── Matter dropdown for "Add to matter" ─────────────────────────────────────
function AddToMatterButton({ onAdd }: { onAdd: (matterId: string, matterRef: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const [matters, setMatters] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  async function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setOpen((o) => !o);
    if (matters.length === 0) {
      setLoading(true);
      try {
        const m = await api('/v1/matters');
        setMatters(m ?? []);
      } finally { setLoading(false); }
    }
  }

  return (
    <>
      <button ref={btnRef} onClick={toggle}
        className="inline-flex items-center gap-space-xs px-space-md py-space-xs rounded border bg-primary text-on-primary border-primary font-body-compact text-body-compact hover:opacity-90 transition-opacity">
        <Icon name="add" className="text-[16px]" /> Add to matter
        <Icon name="expand_more" className={`text-[14px] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div ref={dropRef}
          style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999 }}
          className="bg-surface-container-lowest border border-surface-border rounded shadow-lg min-w-[200px] flex flex-col py-space-xs">
          {loading && (
            <span className="px-space-md py-space-sm font-body-compact text-body-compact text-on-surface-variant">Loading…</span>
          )}
          {!loading && matters.length === 0 && (
            <span className="px-space-md py-space-sm font-body-compact text-body-compact text-on-surface-variant">No matters found</span>
          )}
          {!loading && matters.map((m) => (
            <button key={m.id} onClick={() => { onAdd(m.id, m.matter_ref); setOpen(false); }}
              className="px-space-md py-space-sm text-left font-body-compact text-body-compact text-on-surface hover:bg-surface-container transition-colors">
              {m.matter_ref}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export function Review({ onChanged }: { onChanged: () => void }) {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [intakeFlagged, setIntakeFlagged] = useState<IntakeFile[]>([]);
  const [actors, setActors] = useState<any[]>([]);
  const [busy, setBusy] = useState('');
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [intakeActioned, setIntakeActioned] = useState<Set<string>>(new Set());

  async function load() {
    const [queue, ac] = await Promise.all([
      api('/v1/review-queue'), api('/v1/actors').catch(() => []),
    ]);
    setItems(queue.review_items ?? []);
    setActors(ac ?? []);
    setIntakeFlagged(loadIntakeFlagged());
  }

  useEffect(() => { load(); }, []);

  const human = actors.find((a: any) => a.kind === 'human');

  async function resolve(id: string) {
    setBusy(id);
    try {
      await post(`/v1/review-items/${id}/resolve`, { status: 'resolved', actor_id: human?.id ?? null });
      setResolved((prev) => new Set([...prev, id]));
      onChanged();
    } finally { setBusy(''); }
  }

  function addIntakeToMatter(fileId: string, _matterId: string, _matterRef: string) {
    setIntakeActioned((prev) => new Set([...prev, fileId]));
    onChanged();
  }

  function dismissIntake(fileId: string) {
    setIntakeActioned((prev) => new Set([...prev, fileId]));
    onChanged();
  }

  const pendingItems   = items.filter((r) => !resolved.has(r.id));
  const pendingIntake  = intakeFlagged.filter((f) => !intakeActioned.has(f.id));
  const totalPending   = pendingItems.length + pendingIntake.length;

  return (
    <div className="max-w-4xl mx-auto w-full px-space-xl py-space-xl flex flex-col gap-space-xl">

      <div>
        <h1 className="font-display-hero text-display-hero text-on-surface">Pending Review</h1>
        <p className="font-body-default text-body-default text-on-surface-variant max-w-2xl mt-space-sm">
          Items that could not be resolved automatically — unclear dates, unmatched documents, or anything that needs a decision before the file moves forward.
        </p>
      </div>

      {totalPending === 0 && (
        <Empty>Nothing waiting for your review. Upload a disclosure package or check back after the next update.</Empty>
      )}

      {/* ── All pending items — flat list ── */}
      <div className="flex flex-col gap-space-md">
        {pendingIntake.map((f) => (
          <Card key={f.id} className="p-space-lg flex flex-col gap-space-md">
            <div className="flex flex-col gap-space-2xs">
              <span className="font-headline-matter font-bold text-body-strong text-on-surface">
                {f.docType ?? 'Unidentified document'}
              </span>
              <span className="font-code-timestamp text-caption-meta text-on-surface-variant">
                {f.filename}{f.pages ? ` · ${f.pages} pages` : ''}
              </span>
            </div>
            <p className="font-body-compact text-body-compact text-on-surface-variant">{f.description}</p>
            <div className="flex flex-wrap items-center justify-between gap-space-md pt-space-xs border-t border-surface-border">
              <span className="font-caption-meta text-caption-meta text-on-surface-variant">
                Could not be matched to a request — decide what to do.
              </span>
              <span className="flex items-center gap-space-sm">
                <Button onClick={() => dismissIntake(f.id)}>Set aside</Button>
                <AddToMatterButton onAdd={(mId, mRef) => addIntakeToMatter(f.id, mId, mRef)} />
              </span>
            </div>
          </Card>
        ))}

        {pendingItems.map((r) => (
          <Card key={r.id} className="p-space-lg flex flex-col gap-space-md">
            <div className="flex flex-col gap-space-2xs">
              <span className="font-headline-matter font-bold text-body-strong text-on-surface">{r.title}</span>
              {r.matter_ref && (
                <span className="font-code-timestamp text-caption-meta text-on-surface-variant">{r.matter_ref}</span>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-space-md pt-space-xs border-t border-surface-border">
              <span className="font-caption-meta text-caption-meta text-on-surface-variant">
                Needs your attention before this file moves forward.
              </span>
              <Button variant="primary" onClick={() => resolve(r.id)} disabled={busy === r.id}>
                <Icon name="check" className="text-[16px]" />
                {busy === r.id ? 'Saving…' : 'Mark resolved'}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
