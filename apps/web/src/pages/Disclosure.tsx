import React, { useEffect, useRef, useState } from 'react';
import { api, fmtDate } from '../lib/api';
import { Icon, Pill, Card, Empty, stateTone } from '../lib/ui';
import type { Page } from '../components/Shell';
import DropdownMenu from '../components/smoothui/dropdown-menu';
import { AlertDialog } from '../components/smoothui/dialog';
import AnimatedTabs from '../components/smoothui/animated-tabs';
import Skeleton from '../components/smoothui/skeleton-loader';
import { FadeUp } from '../components/amicro/fade-up';
import { Button } from '../lib/ui';

const KIND_DESC: Record<string, { label: string; description: string }> = {
  ambiguous_date:          { label: 'Unclear date — needs clarification',  description: 'Ava detected a date reference in this document but could not determine the exact date. Confirm the correct date before the file moves forward.' },
  low_confidence_extraction: { label: 'Details could not be extracted',   description: 'Ava was unable to reliably read the key details from this document. Manually review and confirm the relevant information.' },
  low_confidence_match:    { label: 'Match uncertain — please confirm',    description: 'Ava found a possible match to a disclosure request but is not confident enough to confirm it automatically. Verify whether it satisfies the outstanding request.' },
  missing_item:            { label: 'Potentially missing from disclosure', description: 'This item appears to be absent from the disclosure package received. Check whether it was served separately or is still outstanding.' },
  unmatched_document:      { label: 'Document not matched to a request',   description: 'This document arrived in the disclosure package but could not be linked to any outstanding request on file.' },
  default:                 { label: 'Flagged for your attention',          description: 'Ava flagged this item because it could not be resolved automatically. Review the details and decide how to proceed.' },
};

// 4-state system: Requested / Partially Received / Verified (Satisfied) / Pending Review (Needs Review)
const NEXT_STATES: Record<string, string[]> = {
  'Requested':             ['Partially Received', 'Satisfied', 'Needs Review'],
  'Acknowledged':          ['Partially Received', 'Satisfied', 'Needs Review', 'Requested'],
  'Partially Received':    ['Satisfied', 'Requested', 'Needs Review'],
  'Satisfied':             ['Partially Received', 'Requested', 'Needs Review'],
  'Refused':               ['Partially Received', 'Satisfied', 'Requested', 'Needs Review'],
  'Needs Review':          ['Partially Received', 'Satisfied', 'Requested'],
  'Follow-up Recommended': ['Partially Received', 'Satisfied', 'Requested', 'Needs Review'],
};

// Display label for each state value
function displayState(s: string) {
  if (s === 'Satisfied') return 'Verified';
  if (s === 'Needs Review') return 'Pending Review';
  return s;
}

type FilterKey = 'all' | 'matched' | 'partial' | 'requested' | 'pending_review';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',            label: 'All documents'       },
  { key: 'matched',        label: 'Verified documents'  },
  { key: 'partial',        label: 'Partially received'  },
  { key: 'requested',      label: 'Requested documents' },
  { key: 'pending_review', label: 'Pending Review'      },
];

function matchesFilter(state: string, filter: FilterKey) {
  switch (filter) {
    case 'matched':        return state === 'Satisfied';
    case 'partial':        return state === 'Partially Received';
    case 'requested':      return ['Requested', 'Acknowledged', 'Follow-up Recommended', 'Refused'].includes(state);
    case 'pending_review': return state === 'Needs Review';
    default:               return true;
  }
}

// ─── State tag with inline dropdown ──────────────────────────────────────────
const STATE_DOT: Record<string, string> = {
  'Satisfied':          'bg-status-satisfied-fg',
  'Partially Received': 'bg-status-awaiting-fg',
  'Needs Review':       'bg-status-overdue-fg',
};

function StateTag({ state, onChangeState }: { state: string; onChangeState: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const options = NEXT_STATES[state] ?? [];

  // Moving a verified document back out of Verified is the one change worth a second look.
  const choose = (s: string) => (state === 'Satisfied' ? setPending(s) : onChangeState(s));

  const tag = (
    <button onClick={(e) => e.stopPropagation()} aria-label={`Status: ${displayState(state)}${options.length ? '. Change status' : ''}`}
      className="flex items-center gap-space-2xs group">
      <Pill tone={stateTone(state)}>{state === 'Satisfied' ? 'Verified' : state}</Pill>
      {options.length > 0 && (
        <Icon name="expand_more" className={`text-[14px] text-on-surface-variant transition-transform ${open ? 'rotate-180' : ''}`} />
      )}
    </button>
  );

  return (
    <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
      {options.length === 0 ? tag : (
        <DropdownMenu align="end" open={open} onOpenChange={setOpen}
          className="min-w-[180px] bg-surface-container-lowest border-surface-border font-body-compact"
          items={[
            { key: 'label', label: '', groupLabel: 'Change status to' },
            ...options.map((s) => ({
              key: s, label: displayState(s), onSelect: () => choose(s),
              icon: <span className={`inline-block w-2 h-2 rounded-full ${STATE_DOT[s] ?? 'bg-on-surface-variant'}`} />,
            })),
          ]}>
          {tag}
        </DropdownMenu>
      )}
      <AlertDialog open={pending !== null} onOpenChange={(o) => { if (!o) setPending(null); }}
        title="Move this document out of Verified?"
        description={`It will be marked ${pending ? displayState(pending) : ''} and counted as outstanding again.`}
        footer={
          <div className="flex justify-end gap-space-sm">
            <Button onClick={() => setPending(null)}>Keep verified</Button>
            <Button variant="dark" onClick={() => { if (pending) onChangeState(pending); setPending(null); }}>
              Mark {pending ? displayState(pending) : ''}
            </Button>
          </div>
        } />
    </div>
  );
}

// ─── Expanded item view ───────────────────────────────────────────────────────
function ExpandedItem({ item, state, onBack, onChangeState }: {
  item: any; state: string; onBack: () => void; onChangeState: (s: string) => void;
}) {
  return (
    <FadeUp yOffset={10} duration={0.4} className="flex flex-col gap-space-lg p-space-xl">
      <button onClick={onBack}
        className="flex items-center gap-space-xs font-body-compact text-body-compact text-on-surface-variant hover:text-on-surface transition-colors self-start">
        <Icon name="arrow_back" className="text-[18px]" />
        Back to all documents
      </button>

      <Card className="p-space-xl flex flex-col gap-space-lg">
        <div className="flex flex-wrap items-start justify-between gap-space-md">
          <div className="flex flex-col gap-space-xs min-w-0">
            <span className="font-caption-meta text-caption-meta text-on-surface-variant uppercase tracking-wider">
              Item #{String(item.seq).padStart(2, '0')}
            </span>
            <h2 className="font-headline-matter text-headline-matter font-bold text-on-surface">
              {item.description}
            </h2>
          </div>
          <StateTag state={state} onChangeState={onChangeState} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-space-md">
          <InfoBlock label="Requested"       value={fmtDate(item.first_requested_at) ?? '—'} />
          <InfoBlock label="Days open"       value={`${item.clock?.age_calendar_days ?? 0}d`} />
          <InfoBlock label="Follow-ups sent" value={item.clock?.followups ?? 0} />
          <InfoBlock label="Packages"        value={item.clock?.packages_received ?? 0} />
          <InfoBlock label="Channel"         value={item.channel ?? '—'} />
        </div>


      </Card>
    </FadeUp>
  );
}

function InfoBlock({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex flex-col gap-space-2xs">
      <span className="font-caption-meta text-caption-meta text-on-surface-variant uppercase tracking-wider">{label}</span>
      <span className="font-body-strong text-body-strong text-on-surface">{String(value)}</span>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export function Disclosure({ setPage }: { setPage?: (p: Page) => void }) {
  const [matters, setMatters]           = useState<any[]>([]);
  const [matterId, setMatterId]         = useState<string>('');
  const [register, setRegister]         = useState<any>(null);
  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [filter, setFilter]             = useState<FilterKey>('all');
  const [reviewItems, setReviewItems]   = useState<any[]>([]);
  function openReviewItem(id: string) {
    try { sessionStorage.setItem('bloomlex_nav_intent', JSON.stringify({ page: 'review', itemId: id })); } catch {}
    setPage?.('review');
  }
  // client-side state overrides (demo — no API write needed)
  const [stateOverrides, setStateOverrides] = useState<Record<string, string>>({});

  const [navIntent, setNavIntent] = useState<{ matterRef?: string; itemSeq?: number } | null>(null);

  useEffect(() => {
    let intent: { matterRef?: string; itemSeq?: number } | null = null;
    try {
      const raw = sessionStorage.getItem('bloomlex_nav_intent');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.page === 'disclosure') intent = { matterRef: parsed.matterRef, itemSeq: parsed.itemSeq };
        sessionStorage.removeItem('bloomlex_nav_intent');
      }
    } catch {}
    if (intent) setNavIntent(intent);

    api('/v1/matters').then((m: any[]) => {
      const sorted = [...m].sort((a, b) =>
        a.matter_ref === 'R. v. Okafor' ? -1 : b.matter_ref === 'R. v. Okafor' ? 1 : 0
      );
      setMatters(sorted);
      const targetRef = intent?.matterRef ?? 'R. v. Okafor';
      setMatterId(sorted.find((x) => x.matter_ref === targetRef)?.id ?? sorted[0]?.id ?? '');
    });
    api('/v1/review-queue').then((q: any) => setReviewItems(q.review_items ?? []));
  }, []);

  useEffect(() => {
    if (!matterId) return;
    setRegister(null); setExpandedId(null);
    api(`/v1/matters/${matterId}/register`).then((reg) => {
      setRegister(reg);
      if (navIntent?.itemSeq) {
        const target = (reg?.items ?? []).find((it: any) => it.seq === navIntent.itemSeq);
        if (target) { setExpandedId(target.id); setNavIntent(null); }
      }
    });
  }, [matterId]); // eslint-disable-line react-hooks/exhaustive-deps

  const matter = matters.find((m) => m.id === matterId);
  const roll   = register?.rollup;
  const items: any[] = register?.items ?? [];

  function effectiveState(item: any): string {
    return stateOverrides[item.id] ?? item.state;
  }

  function changeState(itemId: string, newState: string) {
    setStateOverrides((prev) => ({ ...prev, [itemId]: newState }));
  }

  const matterReviewItems = matter
    ? reviewItems.filter((r) => r.matter_ref === matter.matter_ref)
    : [];

  const shown  = filter === 'pending_review'
    ? []  // pending_review shows reviewItems, not register items
    : items.filter((it) => matchesFilter(effectiveState(it), filter));
  const expanded = expandedId ? items.find((it) => it.id === expandedId) : null;

  // Filter chip counts
  const counts: Record<FilterKey, number> = {
    all:            items.length,
    matched:        items.filter((i) => matchesFilter(effectiveState(i), 'matched')).length,
    partial:        items.filter((i) => matchesFilter(effectiveState(i), 'partial')).length,
    requested:      items.filter((i) => matchesFilter(effectiveState(i), 'requested')).length,
    pending_review: matterReviewItems.length,
  };

  return (
    <div className="flex flex-col w-full">
      {/* matter header */}
      <div className="px-space-xl py-space-md bg-surface-container-low border-b border-surface-border flex flex-wrap items-center justify-between gap-space-md">
        <div className="flex items-center gap-space-sm flex-wrap">
          <h1 className="font-headline-matter text-headline-matter text-on-surface font-bold">
            <FadeUp key={matter?.id ?? 'none'} yOffset={6} duration={0.35}>{matter?.matter_ref ?? '—'}</FadeUp>
          </h1>
          {matter?.key_dates?.court_file && (
            <span className="font-code-citation text-code-citation px-space-xs py-space-2xs bg-surface-container rounded text-on-surface border border-surface-border">
              {matter.key_dates.court_file}
            </span>
          )}
          {matter?.crown_contact && (
            <span className="font-caption-meta text-caption-meta text-on-surface-variant">
              Prosecutor: {matter.crown_contact}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-12 w-full lg:min-h-[calc(100vh-9rem)]">
        {/* ── left: matter list ── */}
        <section className="col-span-12 lg:col-span-3 bg-surface-container-low border-r border-surface-border flex flex-col">
          <div className="p-space-md border-b border-surface-border">
            <span className="font-headline-matter text-[13px] font-bold uppercase tracking-wider">
              Matters ({matters.length})
            </span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-surface-border max-h-72 lg:max-h-none">
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
                <div className="flex items-center gap-space-xs flex-wrap">
                  <Pill tone={Number(m.outstanding_items) > 0 ? 'overdue' : 'satisfied'}>
                    {m.outstanding_items} requested
                  </Pill>
                </div>
                <p className="font-body-compact text-body-compact text-on-surface-variant line-clamp-1 mt-space-xs">
                  {(m.charges ?? []).join(', ')}
                </p>
              </button>
            ))}
          </div>
        </section>

        {/* ── right: documents ── */}
        <section className="col-span-12 lg:col-span-9 flex flex-col">
          {expanded ? (
            <ExpandedItem
              item={expanded}
              state={effectiveState(expanded)}
              onBack={() => setExpandedId(null)}
              onChangeState={(s) => changeState(expanded.id, s)}
            />
          ) : (
            <div className="flex flex-col gap-space-lg p-space-xl">
              {/* filter chips */}
              <div className="overflow-x-auto">
                <AnimatedTabs variant="pill" activeTab={filter} onChange={(k) => setFilter(k as FilterKey)} layoutId="disclosure-filter"
                  className="bg-surface-container border border-surface-border whitespace-nowrap flex-nowrap md:flex-wrap rounded-xl font-body-compact"
                  tabs={FILTERS.map(({ key, label }) => ({ id: key, label: `${label} · ${counts[key]}` }))} />
              </div>

              {/* document list */}
              {!register && (
                <div className="flex flex-col gap-space-sm">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 rounded" />
                  ))}
                </div>
              )}

              {filter === 'pending_review' && matterReviewItems.length === 0 && (
                <Empty>No pending review items for this matter.</Empty>
              )}

              {filter === 'pending_review' && matterReviewItems.length > 0 && (
                <div className="flex flex-col divide-y divide-surface-border border border-surface-border rounded-lg overflow-hidden">
                  {matterReviewItems.map((r: any) => {
                    const meta = KIND_DESC[r.kind] ?? KIND_DESC.default;
                    return (
                      <button key={r.id} onClick={() => openReviewItem(r.id)}
                        className="w-full text-left bg-surface-container-lowest hover:bg-surface-container transition-colors p-space-md flex items-start justify-between gap-space-md">
                        <span className="flex flex-col gap-space-2xs min-w-0 flex-1">
                          <span className="font-body-strong text-body-strong text-on-surface">{r.title}</span>
                          {r.matter_ref && <span className="font-code-timestamp text-caption-meta text-on-surface-variant">{r.matter_ref}</span>}
                          <span className="font-caption-meta text-caption-meta text-on-surface-variant">{meta.label}</span>
                        </span>
                        <Icon name="chevron_right" className="text-[20px] text-on-surface-variant shrink-0 mt-space-2xs" />
                      </button>
                    );
                  })}
                </div>
              )}

              {filter !== 'pending_review' && register && shown.length === 0 && (
                <Empty>No documents match this filter.</Empty>
              )}

              {filter !== 'pending_review' && register && shown.length > 0 && (
                <div className="flex flex-col divide-y divide-surface-border border border-surface-border rounded-lg overflow-hidden">
                  {shown.map((it: any, i: number) => {
                    const state = effectiveState(it);
                    return (
                      <FadeUp key={`${filter}-${it.id}`} yOffset={8} duration={0.35} delay={Math.min(i, 12) * 0.03}>
                      <div
                        className="bg-surface-container-lowest hover:bg-surface-container transition-colors flex items-start justify-between gap-space-md p-space-md cursor-pointer"
                        onClick={() => setExpandedId(it.id)}>
                        <span className="flex flex-col min-w-0 flex-1">
                          <span className="font-caption-meta text-caption-meta text-on-surface-variant">
                            ITEM #{String(it.seq).padStart(2, '0')}
                          </span>
                          <button onClick={(e) => { e.stopPropagation(); setExpandedId(it.id); }}
                            className="text-left font-body-strong text-body-strong text-on-surface">{it.description}</button>
                          <span className="font-caption-meta text-caption-meta text-on-surface-variant mt-space-2xs">
                            Requested {fmtDate(it.first_requested_at)}
                            {it.clock?.age_calendar_days ? ` · ${it.clock.age_calendar_days} days` : ''}
                            {it.clock?.followups ? ` · ${it.clock.followups} follow-up(s)` : ''}
                            {it.clock?.packages_received ? ` · ${it.clock.packages_received} package(s)` : ''}
                          </span>
                        </span>
                        <StateTag
                          state={state}
                          onChangeState={(s) => { changeState(it.id, s); }}
                        />
                      </div>
                      </FadeUp>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

