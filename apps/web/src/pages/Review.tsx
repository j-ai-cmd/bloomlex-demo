import React, { useEffect, useState } from 'react';
import { api, post } from '../lib/api';
import { Icon, Pill, Button, Card, Empty, SectionTitle } from '../lib/ui';

const INTAKE_KEY = 'bloomlex_intake_state';

type ReviewItem = {
  id: string; title: string; kind: string; matter_ref: string | null;
  verbatim_text: string | null; confidence: number | null; created_at: string;
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

export function Review({ onChanged }: { onChanged: () => void }) {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [intakeFlagged, setIntakeFlagged] = useState<IntakeFile[]>([]);
  const [actors, setActors] = useState<any[]>([]);
  const [busy, setBusy] = useState('');
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [intakeDecided, setIntakeDecided] = useState<Record<string, 'added' | 'dismissed'>>({});

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

  function actOnIntake(id: string, action: 'added' | 'dismissed') {
    setIntakeDecided((prev) => ({ ...prev, [id]: action }));
    onChanged();
  }

  const pendingItems    = items.filter((r) => !resolved.has(r.id));
  const resolvedItems   = items.filter((r) =>  resolved.has(r.id));
  const pendingIntake   = intakeFlagged.filter((f) => !intakeDecided[f.id]);
  const decidedIntake   = intakeFlagged.filter((f) =>  intakeDecided[f.id]);
  const totalPending    = pendingItems.length + pendingIntake.length;

  return (
    <div className="max-w-4xl mx-auto w-full px-space-xl py-space-xl flex flex-col gap-space-xl">

      <div>
        <h1 className="font-display-hero text-display-hero text-on-surface">Pending Review</h1>
        <p className="font-body-default text-body-default text-on-surface-variant max-w-2xl mt-space-sm">
          Items BloomLex could not resolve on its own — unclear dates, unmatched documents, or anything that needs a decision before the file moves forward.
        </p>
      </div>

      {totalPending === 0 && decidedIntake.length === 0 && resolvedItems.length === 0 && (
        <Empty>Nothing waiting for your review. Upload a disclosure package or check back after the next update.</Empty>
      )}

      {/* ── Disclosure items flagged from intake upload ── */}
      {pendingIntake.length > 0 && (
        <div className="flex flex-col gap-space-md">
          <SectionTitle icon="cloud_upload">From your latest upload</SectionTitle>
          {pendingIntake.map((f) => (
            <Card key={f.id} className="overflow-hidden">
              <div className="px-space-lg py-space-sm bg-status-awaiting-bg border-b border-status-awaiting-border flex flex-wrap items-center justify-between gap-space-xs">
                <span className="flex items-center gap-space-sm">
                  <Icon name="flag" className="text-[18px] text-status-awaiting-fg" />
                  <span className="font-body-strong text-body-strong text-status-awaiting-fg">
                    Could not be matched to a request
                  </span>
                </span>
                <Pill tone="awaiting">Needs your review</Pill>
              </div>
              <div className="p-space-lg flex flex-col gap-space-md">
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
                    Decide what to do with this document.
                  </span>
                  <span className="flex items-center gap-space-sm">
                    <Button onClick={() => actOnIntake(f.id, 'dismissed')}>Set aside</Button>
                    <Button variant="primary" onClick={() => actOnIntake(f.id, 'added')}>
                      <Icon name="add" className="text-[16px]" /> Add to register
                    </Button>
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── System-flagged review items ── */}
      {pendingItems.length > 0 && (
        <div className="flex flex-col gap-space-md">
          <SectionTitle icon="fact_check">
            {pendingIntake.length > 0 ? 'Also flagged by the system' : `${pendingItems.length} item${pendingItems.length > 1 ? 's' : ''} flagged`}
          </SectionTitle>
          {pendingItems.map((r) => (
            <Card key={r.id} className="p-space-lg flex flex-col gap-space-md">
              <div className="flex flex-wrap items-start justify-between gap-space-sm">
                <div className="flex flex-col gap-space-2xs">
                  <span className="font-headline-matter font-bold text-body-strong text-on-surface">{r.title}</span>
                  {r.matter_ref && (
                    <span className="font-code-timestamp text-caption-meta text-on-surface-variant">{r.matter_ref}</span>
                  )}
                </div>
                <Pill tone="awaiting">{kindLabel(r.kind)}</Pill>
              </div>
              {r.verbatim_text && (
                <p className="font-body-compact text-body-compact text-on-surface-variant italic">
                  "{r.verbatim_text}"
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-space-md pt-space-xs border-t border-surface-border">
                <span className="font-caption-meta text-caption-meta text-on-surface-variant">
                  Marked resolved once you have confirmed or corrected this item.
                </span>
                <Button variant="primary" onClick={() => resolve(r.id)} disabled={busy === r.id}>
                  <Icon name="check" className="text-[16px]" />
                  {busy === r.id ? 'Saving…' : 'Mark resolved'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── Resolved / decided ── */}
      {(resolvedItems.length > 0 || decidedIntake.length > 0) && (
        <div className="flex flex-col gap-space-md">
          <SectionTitle icon="history_toggle_off">Decided this session</SectionTitle>
          <Card className="divide-y divide-surface-border">
            {resolvedItems.map((r) => (
              <div key={r.id} className="px-space-lg py-space-sm flex flex-wrap items-center justify-between gap-space-md">
                <span className="flex flex-col">
                  <span className="font-body-strong text-body-strong text-on-surface">{r.title}</span>
                  <span className="font-caption-meta text-caption-meta text-on-surface-variant">{r.matter_ref ?? ''}</span>
                </span>
                <Pill tone="satisfied">Resolved</Pill>
              </div>
            ))}
            {decidedIntake.map((f) => (
              <div key={f.id} className="px-space-lg py-space-sm flex flex-wrap items-center justify-between gap-space-md">
                <span className="flex flex-col">
                  <span className="font-body-strong text-body-strong text-on-surface">{f.docType ?? 'Unidentified document'}</span>
                  <span className="font-caption-meta text-caption-meta text-on-surface-variant">{f.filename}</span>
                </span>
                <Pill tone={intakeDecided[f.id] === 'added' ? 'satisfied' : 'neutral'}>
                  {intakeDecided[f.id] === 'added' ? 'Added to register' : 'Set aside'}
                </Pill>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}
