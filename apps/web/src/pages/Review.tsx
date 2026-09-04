import React, { useEffect, useRef, useState } from 'react';
import { api, post } from '../lib/api';
import { Icon, Button, Card, Empty } from '../lib/ui';

const INTAKE_KEY = 'bloomlex_intake_state';

type ReviewItem = {
  id: string; title: string; kind: string; matter_ref: string | null;
  confidence: number | null; created_at: string; verbatim_text?: string | null; channel?: string | null;
};

type IntakeFile = {
  id: string; filename: string; pages: number | null; docType: string | null;
  description: string; status: 'flagged' | 'matched'; matchedItem: string | null;
};

const KIND_META: Record<string, { label: string; description: string }> = {
  ambiguous_date: {
    label: 'Unclear date — needs clarification',
    description: 'Ava detected a date reference in this document but could not determine the exact date. This may affect how the disclosure timeline is calculated. Confirm the correct date before the file moves forward.',
  },
  low_confidence_extraction: {
    label: 'Details could not be extracted',
    description: 'Ava was unable to reliably read the key details from this document. The scan quality or formatting may be preventing a clean read. Manually review the document and confirm the relevant information.',
  },
  low_confidence_match: {
    label: 'Match uncertain — please confirm',
    description: 'Ava found a possible match to a disclosure request but is not confident enough to confirm it automatically. Review the document and verify whether it satisfies the outstanding request.',
  },
  missing_item: {
    label: 'Potentially missing from disclosure',
    description: 'This item appears to be absent from the disclosure package received. It may need to be followed up with the Crown. Check whether it was served separately or is outstanding.',
  },
  unmatched_document: {
    label: 'Document not matched to a request',
    description: 'This document arrived in the disclosure package but could not be linked to any outstanding request on file. It may be supplementary material, misfiled, or something that should be logged as a new item.',
  },
  default: {
    label: 'Flagged for your attention',
    description: 'Ava flagged this item because it could not be resolved automatically. Review the details and decide how to proceed before the matter moves forward.',
  },
};

function kindMeta(kind: string) { return KIND_META[kind] ?? KIND_META.default; }

function loadIntakeFlagged(): IntakeFile[] {
  try {
    const raw = sessionStorage.getItem(INTAKE_KEY);
    if (!raw) return [];
    return (JSON.parse(raw).files ?? []).filter((f: IntakeFile) => f.status === 'flagged');
  } catch { return []; }
}

// ─── Matter dropdown ──────────────────────────────────────────────────────────
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
      try { setMatters((await api('/v1/matters')) ?? []); } finally { setLoading(false); }
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
          {loading && <span className="px-space-md py-space-sm font-body-compact text-body-compact text-on-surface-variant">Loading…</span>}
          {!loading && matters.length === 0 && <span className="px-space-md py-space-sm font-body-compact text-body-compact text-on-surface-variant">No matters found</span>}
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

// ─── Expanded detail view ────────────────────────────────────────────────────
function ExpandedReviewItem({
  item, onBack, onResolve, busy,
}: { item: ReviewItem; onBack: () => void; onResolve: () => void; busy: boolean }) {
  const meta = kindMeta(item.kind);
  return (
    <div className="flex flex-col gap-space-lg p-space-xl max-w-4xl mx-auto w-full">
      <button onClick={onBack}
        className="flex items-center gap-space-xs font-body-compact text-body-compact text-on-surface-variant hover:text-on-surface transition-colors self-start">
        <Icon name="arrow_back" className="text-[18px]" /> Back to all items
      </button>
      <Card className="p-space-xl flex flex-col gap-space-lg">
        <div className="flex flex-wrap items-start justify-between gap-space-md">
          <div className="flex flex-col gap-space-xs min-w-0">
            <span className="font-caption-meta text-caption-meta text-on-surface-variant uppercase tracking-wider">{meta.label}</span>
            <h2 className="font-headline-matter text-headline-matter font-bold text-on-surface">{item.title}</h2>
            {item.matter_ref && <span className="font-code-timestamp text-caption-meta text-on-surface-variant">{item.matter_ref}</span>}
          </div>
          <span className="px-space-sm py-space-2xs rounded border border-status-awaiting-border bg-status-awaiting-bg text-status-awaiting-fg font-caption-meta text-caption-meta font-semibold">
            Needs review
          </span>
        </div>
        <p className="font-body-default text-body-default text-on-surface-variant">{meta.description}</p>
        {item.verbatim_text && (
          <div className="flex flex-col gap-space-xs">
            <span className="font-caption-meta text-caption-meta text-on-surface-variant uppercase tracking-wider">What Ava heard</span>
            <p className="font-code-citation text-caption-meta text-on-surface-variant italic bg-surface-container-low border border-surface-border p-space-md rounded">
              "{item.verbatim_text}"
            </p>
            {item.channel && <span className="font-caption-meta text-caption-meta text-on-surface-variant">Channel: <b className="text-on-surface">{item.channel}</b></span>}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-end gap-space-md pt-space-sm border-t border-surface-border">
          <Button variant="primary" onClick={onResolve} disabled={busy}>
            <Icon name="check" className="text-[16px]" />
            {busy ? 'Saving…' : 'Mark resolved'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function ExpandedIntakeItem({ file, onBack, onAdd }: {
  file: IntakeFile; onBack: () => void; onAdd: (mId: string, mRef: string) => void;
}) {
  return (
    <div className="flex flex-col gap-space-lg p-space-xl max-w-4xl mx-auto w-full">
      <button onClick={onBack}
        className="flex items-center gap-space-xs font-body-compact text-body-compact text-on-surface-variant hover:text-on-surface transition-colors self-start">
        <Icon name="arrow_back" className="text-[18px]" /> Back to all items
      </button>
      <Card className="p-space-xl flex flex-col gap-space-lg">
        <div className="flex flex-wrap items-start justify-between gap-space-md">
          <div className="flex flex-col gap-space-xs min-w-0">
            <span className="font-caption-meta text-caption-meta text-on-surface-variant uppercase tracking-wider">Document not matched to a request</span>
            <h2 className="font-headline-matter text-headline-matter font-bold text-on-surface">{file.docType ?? 'Unidentified document'}</h2>
            <span className="font-code-timestamp text-caption-meta text-on-surface-variant">{file.filename}{file.pages ? ` · ${file.pages} pages` : ''}</span>
          </div>
          <span className="px-space-sm py-space-2xs rounded border border-status-awaiting-border bg-status-awaiting-bg text-status-awaiting-fg font-caption-meta text-caption-meta font-semibold">Needs review</span>
        </div>
        <p className="font-body-default text-body-default text-on-surface-variant">{file.description}</p>
        <p className="font-body-default text-body-default text-on-surface-variant">
          This document arrived in the disclosure package but could not be linked to any outstanding request on file. Add it to the relevant matter or dismiss it if it is not applicable.
        </p>
        <div className="flex flex-wrap items-center justify-end gap-space-md pt-space-sm border-t border-surface-border">
          <AddToMatterButton onAdd={onAdd} />
        </div>
      </Card>
    </div>
  );
}

export function Review({ onChanged }: { onChanged: () => void }) {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [intakeFlagged, setIntakeFlagged] = useState<IntakeFile[]>([]);
  const [actors, setActors] = useState<any[]>([]);
  const [busy, setBusy] = useState('');
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [intakeActioned, setIntakeActioned] = useState<Set<string>>(new Set());
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [expandedIntakeId, setExpandedIntakeId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [queue, ac] = await Promise.all([api('/v1/review-queue'), api('/v1/actors').catch(() => [])]);
      const reviewItems = queue.review_items ?? [];
      setItems(reviewItems);
      setActors(ac ?? []);
      const flagged = loadIntakeFlagged();
      setIntakeFlagged(flagged);

      // nav intent from Matters page
      try {
        const raw = sessionStorage.getItem('bloomlex_nav_intent');
        if (raw) {
          const intent = JSON.parse(raw);
          if (intent.page === 'review') {
            if (intent.itemId) {
              const match = reviewItems.find((r: ReviewItem) => r.id === intent.itemId);
              if (match) setExpandedItemId(match.id);
            } else if (intent.filename) {
              const match = flagged.find((f) => f.filename === intent.filename);
              if (match) setExpandedIntakeId(match.id);
            }
            sessionStorage.removeItem('bloomlex_nav_intent');
          }
        }
      } catch {}
    })();
  }, []);

  const human = actors.find((a: any) => a.kind === 'human');

  async function resolve(id: string) {
    setBusy(id);
    try {
      await post(`/v1/review-items/${id}/resolve`, { status: 'resolved', actor_id: human?.id ?? null });
      setResolved((prev) => new Set([...prev, id]));
      setExpandedItemId(null);
      onChanged();
    } finally { setBusy(''); }
  }

  function addIntakeToMatter(fileId: string) {
    setIntakeActioned((prev) => new Set([...prev, fileId]));
    setExpandedIntakeId(null);
    onChanged();
  }

  const pendingItems  = items.filter((r) => !resolved.has(r.id));
  const pendingIntake = intakeFlagged.filter((f) => !intakeActioned.has(f.id));
  const totalPending  = pendingItems.length + pendingIntake.length;

  const expandedItem   = expandedItemId   ? pendingItems.find((r) => r.id === expandedItemId) : null;
  const expandedIntake = expandedIntakeId ? pendingIntake.find((f) => f.id === expandedIntakeId) : null;

  if (expandedItem) {
    return (
      <ExpandedReviewItem
        item={expandedItem}
        onBack={() => setExpandedItemId(null)}
        onResolve={() => resolve(expandedItem.id)}
        busy={busy === expandedItem.id}
      />
    );
  }
  if (expandedIntake) {
    return (
      <ExpandedIntakeItem
        file={expandedIntake}
        onBack={() => setExpandedIntakeId(null)}
        onAdd={(mId, mRef) => addIntakeToMatter(expandedIntake.id)}
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto w-full px-space-xl py-space-xl flex flex-col gap-space-xl">
      <div>
        <h1 className="font-display-hero text-display-hero text-on-surface">Pending Review</h1>
        <p className="font-body-default text-body-default text-on-surface-variant max-w-2xl mt-space-sm">
          Items that could not be resolved automatically — unclear dates, unmatched documents, or anything that needs a decision before the file moves forward.
        </p>
      </div>

      {totalPending === 0 && (
        <Empty>Nothing waiting for your review.</Empty>
      )}

      <div className="flex flex-col gap-space-md">
        {pendingIntake.map((f) => (
          <Card key={f.id} className="p-space-lg flex flex-col gap-space-md cursor-pointer hover:border-accent transition-colors"
            onClick={() => setExpandedIntakeId(f.id)}>
            <div className="flex items-start justify-between gap-space-md">
              <div className="flex flex-col gap-space-2xs min-w-0">
                <span className="font-headline-matter font-bold text-body-strong text-on-surface">{f.docType ?? 'Unidentified document'}</span>
                <span className="font-code-timestamp text-caption-meta text-on-surface-variant">{f.filename}{f.pages ? ` · ${f.pages} pages` : ''}</span>
              </div>
              <Icon name="chevron_right" className="text-[20px] text-on-surface-variant shrink-0" />
            </div>
            <p className="font-body-compact text-body-compact text-on-surface-variant">{f.description}</p>
            <div className="flex items-center justify-end pt-space-xs border-t border-surface-border"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}>
              <AddToMatterButton onAdd={(mId, mRef) => { addIntakeToMatter(f.id); }} />
            </div>
          </Card>
        ))}

        {pendingItems.map((r) => {
          const meta = kindMeta(r.kind);
          return (
            <Card key={r.id} className="p-space-lg flex flex-col gap-space-md cursor-pointer hover:border-accent transition-colors"
              onClick={() => setExpandedItemId(r.id)}>
              <div className="flex items-start justify-between gap-space-md">
                <div className="flex flex-col gap-space-2xs min-w-0">
                  <span className="font-headline-matter font-bold text-body-strong text-on-surface">{r.title}</span>
                  {r.matter_ref && <span className="font-code-timestamp text-caption-meta text-on-surface-variant">{r.matter_ref}</span>}
                </div>
                <Icon name="chevron_right" className="text-[20px] text-on-surface-variant shrink-0" />
              </div>
              <p className="font-body-compact text-body-compact text-on-surface-variant">{meta.label}</p>
              <div className="flex items-center justify-end pt-space-xs border-t border-surface-border" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                <Button variant="primary" onClick={(e: React.MouseEvent) => { e.stopPropagation(); resolve(r.id); }} disabled={busy === r.id}>
                  <Icon name="check" className="text-[16px]" />
                  {busy === r.id ? 'Saving…' : 'Mark resolved'}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
