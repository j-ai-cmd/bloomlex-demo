import React from 'react';

export const Icon = ({ name, className = '' }: { name: string; className?: string }) => (
  <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

const TONES: Record<string, string> = {
  satisfied: 'bg-status-satisfied-bg text-status-satisfied-fg border-status-satisfied-border',
  overdue: 'bg-status-overdue-bg text-status-overdue-fg border-status-overdue-border',
  awaiting: 'bg-status-awaiting-bg text-status-awaiting-fg border-status-awaiting-border',
  closed: 'bg-status-closed-bg text-status-closed-fg border-status-closed-border',
  neutral: 'bg-surface-container text-on-surface-variant border-surface-border',
  accent: 'bg-secondary-container text-primary border-surface-border',
};

export const Pill = ({ tone = 'neutral', children, className = '' }: {
  tone?: keyof typeof TONES | string; children: React.ReactNode; className?: string;
}) => (
  <span className={`px-space-xs py-space-2xs rounded border font-code-timestamp text-caption-meta font-bold whitespace-nowrap ${TONES[tone] ?? TONES.neutral} ${className}`}>
    {children}
  </span>
);

/** One place decides how a request-item state is coloured, so the vocabulary stays fixed. */
export const stateTone = (s: string) =>
  s === 'Satisfied' ? 'satisfied'
  : s === 'Partially Received' ? 'awaiting'
  : s === 'Refused' ? 'closed'
  : s === 'Needs Review' ? 'awaiting'
  : 'overdue';

export const Button = ({ variant = 'ghost', className = '', ...p }: any) => {
  const v = variant === 'primary'
    ? 'bg-accent text-accent-ink border-accent font-bold hover:brightness-95'
    : variant === 'dark'
    ? 'bg-primary text-on-primary border-primary hover:bg-primary-container'
    : 'bg-surface-container text-on-surface border-surface-border hover:bg-surface-container-high';
  return <button {...p} className={`px-space-md py-space-xs rounded border font-body-strong text-body-strong transition-colors flex items-center gap-space-xs ${v} ${className}`} />;
};

export const Card = ({ className = '', children }: any) => (
  <div className={`bg-surface-container-lowest border border-surface-border rounded shadow-sm ${className}`}>{children}</div>
);

export const SectionTitle = ({ children, icon }: { children: React.ReactNode; icon?: string }) => (
  <div className="flex items-center gap-space-xs">
    {icon && <Icon name={icon} className="text-[18px] text-primary" />}
    <h3 className="font-subhead-lead text-subhead-lead text-on-surface font-bold">{children}</h3>
  </div>
);

export const Empty = ({ children }: any) => (
  <div className="p-space-lg text-on-surface-variant font-body-compact text-body-compact border border-dashed border-surface-border rounded">{children}</div>
);

/** Provenance is never optional in this product, so it gets a component of its own. */
export const Provenance = ({ verbatim, channel, occurred_at, confidence, model, prompt_version }: any) => (
  <div className="p-space-md bg-surface-container border border-surface-border rounded flex flex-col gap-space-xs">
    <span className="font-caption-meta text-caption-meta text-on-surface-variant uppercase tracking-wider">Source — verbatim</span>
    <p className="font-body-default text-body-default text-on-surface italic leading-relaxed">“{verbatim}”</p>
    <div className="flex flex-wrap items-center justify-between gap-space-xs pt-space-xs border-t border-surface-border/60 font-code-timestamp text-caption-meta text-on-surface-variant">
      <span>{channel ?? 'unknown channel'} · {occurred_at ? new Date(occurred_at).toISOString().slice(0, 16).replace('T', ' ') : '—'}</span>
      <span>conf {Number(confidence ?? 0).toFixed(2)} · {model ?? '—'} · {prompt_version ?? '—'}</span>
    </div>
  </div>
);

/**
 * Origin badge — the demo must never imply that fixture output came from Kimi.
 * Three visually distinct origins: deterministic code, a real model, or the fixture.
 */
export function Origin({ model, confidence, at, approvedBy, deterministic }: {
  model?: string | null; confidence?: number | string | null; at?: string | null;
  approvedBy?: string | null; deterministic?: boolean;
}) {
  const isFixture = model === 'fixture-v1';
  const kind = deterministic || model === 'n/a' ? 'deterministic' : isFixture ? 'fixture' : 'model';
  const style = kind === 'deterministic'
    ? 'bg-status-satisfied-bg text-status-satisfied-fg border-status-satisfied-border'
    : kind === 'fixture'
    ? 'bg-status-awaiting-bg text-status-awaiting-fg border-status-awaiting-border'
    : 'bg-secondary-container text-primary border-surface-border';
  const label = kind === 'deterministic' ? 'DETERMINISTIC' : kind === 'fixture' ? 'FIXTURE — NOT A MODEL' : `MODEL · ${model}`;
  return (
    <span className="flex flex-wrap items-center gap-space-2xs font-code-timestamp text-caption-meta text-on-surface-variant">
      <span className={`px-space-xs py-space-2xs rounded border font-bold ${style}`}>{label}</span>
      {confidence != null && kind !== 'deterministic' && <span>conf {Number(confidence).toFixed(2)}</span>}
      {at && <span>· {String(at).slice(0, 16).replace('T', ' ')}</span>}
      <span className={`px-space-xs py-space-2xs rounded border ${
        approvedBy ? 'bg-status-satisfied-bg text-status-satisfied-fg border-status-satisfied-border'
                   : 'bg-surface-container text-on-surface-variant border-surface-border'}`}>
        {approvedBy ? `approved by ${approvedBy}` : 'not human-approved'}
      </span>
    </span>
  );
}
