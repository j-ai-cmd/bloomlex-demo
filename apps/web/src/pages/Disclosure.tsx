import React, { useEffect, useRef, useState } from 'react';
import { api, fmtDate } from '../lib/api';
import { Icon, Pill, Card, Empty, stateTone } from '../lib/ui';
import type { Page } from '../components/Shell';

const KIND_DESC: Record<string, { label: string; description: string }> = {
  ambiguous_date:          { label: 'Unclear date — needs clarification',  description: 'Ava detected a date reference in this document but could not determine the exact date. Confirm the correct date before the file moves forward.' },
  low_confidence_extraction: { label: 'Details could not be extracted',   description: 'Ava was unable to reliably read the key details from this document. Manually review and confirm the relevant information.' },
  low_confidence_match:    { label: 'Match uncertain — please confirm',    description: 'Ava found a possible match to a disclosure request but is not confident enough to confirm it automatically. Verify whether it satisfies the outstanding request.' },
  missing_item:            { label: 'Potentially missing from disclosure', description: 'This item appears to be absent from the disclosure package received. Check whether it was served separately or is still outstanding.' },
  unmatched_document:      { label: 'Document not matched to a request',   description: 'This document arrived in the disclosure package but could not be linked to any outstanding request on file.' },
  default:                 { label: 'Flagged for your attention',          description: 'Ava flagged this item because it could not be resolved automatically. Review the details and decide how to proceed.' },
};

// State machine: which states a user can transition TO from each current state
const NEXT_STATES: Record<string, string[]> = {
  'Requested':             ['Acknowledged', 'Partially Received', 'Satisfied', 'Refused', 'Needs Review'],
  'Acknowledged':          ['Partially Received', 'Satisfied', 'Refused', 'Needs Review'],
  'Partially Received':    ['Satisfied', 'Refused', 'Needs Review'],
  'Satisfied':             ['Partially Received', 'Needs Review'],
  'Refused':               ['Needs Review', 'Partially Received', 'Satisfied'],
  'Needs Review':          ['Partially Received', 'Satisfied', 'Refused'],
  'Follow-up Recommended': ['Acknowledged', 'Partially Received', 'Satisfied', 'Refused', 'Needs Review'],
};

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
    case 'matched':   return state === 'Satisfied';
    case 'partial':   return state === 'Partially Received';
    case 'requested': return ['Requested', 'Acknowledged', 'Follow-up Recommended', 'Refused', 'Needs Review'].includes(state);
    default:          return true;
  }
}

// ─── State tag with inline dropdown ──────────────────────────────────────────
function StateTag({ state, onChangeState }: { state: string; onChangeState: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const options = NEXT_STATES[state] ?? [];

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setOpen((o) => !o);
  }

  return (
    <div className="relative shrink-0">
      <button ref={btnRef} onClick={toggle} className="flex items-center gap-space-2xs group">
        <Pill tone={stateTone(state)}>{state === 'Satisfied' ? 'Verified' : state}</Pill>
        {options.length > 0 && (
          <Icon name="expand_more" className={`text-[14px] text-on-surface-variant transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>
      {open && options.length > 0 && (
        <div ref={ref}
          style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999 }}
          className="bg-surface-container-lowest border border-surface-border rounded shadow-lg min-w-[180px] flex flex-col py-space-xs">
          <span className="px-space-md py-space-xs font-caption-meta text-caption-meta text-on-surface-variant uppercase tracking-wider">
            Change status to
          </span>
          {options.map((s) => (
            <button key={s} onClick={(e) => { e.stopPropagation(); onChangeState(s); setOpen(false); }}
              className="px-space-md py-space-xs text-left font-body-compact text-body-compact text-on-surface hover:bg-surface-container transition-colors flex items-center gap-space-sm">
              <span className={`w-2 h-2 rounded-full ${
                s === 'Satisfied'          ? 'bg-status-satisfied-fg'
                : s === 'Partially Received' ? 'bg-status-awaiting-fg'
                : s === 'Refused'            ? 'bg-status-closed-fg'
                : s === 'Needs Review'       ? 'bg-status-awaiting-fg'
                : 'bg-on-surface-variant'}`} />
              {s === 'Satisfied' ? 'Verified' : s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Expanded item view ───────────────────────────────────────────────────────
function ExpandedItem({ item, state, onBack, onChangeState }: {
  item: any; state: string; onBack: () => void; onChangeState: (s: string) => void;
}) {
  return (
    <div className="flex flex-col gap-space-lg p-space-xl">
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
    </div>
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
            {matter?.matter_ref ?? '—'}
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

      <div className="grid grid-cols-12 w-full min-h-[calc(100vh-9rem)]">
        {/* ── left: matter list ── */}
        <section className="col-span-12 lg:col-span-3 bg-surface-container-low border-r border-surface-border flex flex-col">
          <div className="p-space-md border-b border-surface-border">
            <span className="font-headline-matter text-[13px] font-bold uppercase tracking-wider">
              Matters ({matters.length})
            </span>
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
              <div className="flex flex-wrap gap-space-xs">
                {FILTERS.map(({ key, label }) => (
                  <button key={key} onClick={() => setFilter(key)}
                    className={`px-space-md py-space-xs rounded-full border font-body-compact text-body-compact transition-colors flex items-center gap-space-xs ${
                      filter === key
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-surface-container border-surface-border text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                    }`}>
                    {label}
                    <span className={`text-[11px] font-bold ${filter === key ? 'text-on-primary/70' : 'text-on-surface-variant'}`}>
                      {counts[key]}
                    </span>
                  </button>
                ))}
              </div>

              {/* document list */}
              {!register && (
                <div className="flex flex-col gap-space-sm">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 bg-surface-container animate-pulse rounded" />
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
                  {shown.map((it: any) => {
                    const state = effectiveState(it);
                    return (
                      <div key={it.id}
                        className="bg-surface-container-lowest hover:bg-surface-container transition-colors flex items-start justify-between gap-space-md p-space-md cursor-pointer"
                        onClick={() => setExpandedId(it.id)}>
                        <span className="flex flex-col min-w-0 flex-1">
                          <span className="font-caption-meta text-caption-meta text-on-surface-variant">
                            ITEM #{String(it.seq).padStart(2, '0')}
                          </span>
                          <span className="font-body-strong text-body-strong text-on-surface">{it.description}</span>
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

