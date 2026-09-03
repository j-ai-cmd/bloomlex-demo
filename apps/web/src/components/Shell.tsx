import React from 'react';
import { Icon } from '../lib/ui';
import { Logo } from './Logo';

export type Page = 'calendar' | 'intake' | 'disclosure' | 'review';

export function Shell({ page, setPage, meta, counts, children }: {
  page: Page; setPage: (p: Page) => void; meta: any;
  counts: { disclosure: number; review: number }; children: React.ReactNode;
}) {
  const now = new Date();
  const stamp = now.toLocaleDateString('en-CA', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase()
    + ' · ' + now.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false });

  const Item = ({ id, icon, label, badge, badgeTone }: any) => {
    const active = page === id;
    return (
      <button onClick={() => setPage(id)}
        className={`w-full flex items-center justify-between px-space-md py-space-sm rounded transition-colors ${
          active ? 'bg-primary text-on-primary font-body-strong shadow-sm border-l-[3px] border-accent'
                 : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'}`}>
        <span className="flex items-center gap-space-md">
          <Icon name={icon} className="text-[18px]" />
          <span className="font-body-compact text-body-compact">{label}</span>
        </span>
        {badge != null && (
          <span className={`px-space-xs py-space-2xs rounded font-code-timestamp text-caption-meta font-bold ${badgeTone}`}>{badge}</span>
        )}
      </button>
    );
  };

  return (
    <>
      <aside className="fixed left-0 top-0 h-full w-sidebar-width bg-surface-container-low border-r border-surface-border z-50 flex flex-col justify-between select-none">
        <div className="flex flex-col">
          <div className="p-space-lg flex flex-col gap-space-sm border-b border-surface-border/60">
            <div className="flex items-start justify-between">
              <Logo />
              <span className="px-space-xs py-space-2xs bg-surface-container font-code-timestamp text-caption-meta text-on-surface-variant rounded border border-surface-border">v1</span>
            </div>
            <span className="font-caption-meta text-caption-meta text-on-surface-variant uppercase tracking-wider">
              {meta?.firm ?? '—'} · Criminal
            </span>
          </div>
          <div className="px-space-lg py-space-xs">
            <span className="font-section-title text-section-title text-on-surface-variant uppercase tracking-wider block mb-space-xs">Surfaces</span>
            <nav className="flex flex-col gap-space-2xs">
              <Item id="calendar" icon="calendar_today" label="Ava Calendar" badge="Today"
                    badgeTone="bg-surface-container text-on-surface-variant" />
              <Item id="intake" icon="cloud_upload" label="Disclosure Intake" badge="Live"
                    badgeTone="bg-surface-container text-on-surface-variant" />
              <Item id="disclosure" icon="security" label="Disclosure Desk" badge={counts.disclosure}
                    badgeTone="bg-secondary-fixed text-on-secondary-fixed" />
              <Item id="review" icon="fact_check" label="Review Queue" badge={counts.review}
                    badgeTone="bg-accent text-accent-ink" />
            </nav>
          </div>
        </div>
        <div className="flex flex-col gap-space-sm p-space-lg border-t border-surface-border/60">
          <div className="p-space-sm bg-surface-container rounded border border-surface-border flex items-center justify-between text-on-surface-variant">
            <span className="flex items-center gap-space-xs">
              <Icon name="lock" className="text-[15px] text-primary" />
              <span className="font-code-timestamp text-caption-meta">DATA STATE</span>
            </span>
            <span className="font-caption-meta text-caption-meta font-bold text-primary">ISOLATED</span>
          </div>
          <div className="p-space-sm bg-surface-container-lowest rounded border border-surface-border flex items-center gap-space-md">
            <span className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center">
              <Icon name="person" className="text-[18px]" />
            </span>
            <span className="flex flex-col truncate">
              <span className="font-body-strong text-body-strong truncate text-on-surface">Marcus Vance</span>
              <span className="font-caption-meta text-caption-meta text-on-surface-variant truncate">Lawyer · approves everything</span>
            </span>
          </div>
        </div>
      </aside>

      <div className="pl-sidebar-width">
        <header className="fixed top-0 left-sidebar-width right-0 h-16 bg-surface/95 backdrop-blur-xl z-40 flex items-center justify-between px-space-xl border-b border-surface-border">
          <div className="flex items-center gap-space-xs">
            <span className="font-caption-meta text-caption-meta uppercase tracking-widest text-on-surface-variant font-semibold">SPINE CONSOLE</span>
            <span className="text-outline text-[10px]">/</span>
            <span className="font-code-timestamp text-caption-meta text-on-surface">{stamp} · {meta?.timezone ?? ''}</span>
          </div>
          <div className="flex items-center gap-space-lg">
            <span className="flex items-center gap-space-xs px-space-md py-space-xs bg-surface-container-low border border-surface-border rounded">
              <Icon name="science" className="text-[14px] text-on-surface-variant" />
              <span className="font-code-timestamp text-caption-meta text-on-surface-variant">
                {meta?.ai?.configured ? `AI: ${meta.ai.model}` : 'AI: fixture mode (no key)'}
              </span>
            </span>
            <span className="flex items-center gap-space-xs px-space-md py-space-xs bg-surface-container-low border border-surface-border rounded">
              <Icon name="security" className="text-[14px] text-on-surface-variant" />
              <span className="font-code-timestamp text-caption-meta text-on-surface-variant uppercase">
                {meta?.demo_notice ?? 'Demo data'}
              </span>
            </span>
          </div>
        </header>
        <main className="relative pt-16 bg-surface min-h-screen">{children}</main>
      </div>

      <div className="fixed bottom-3 right-4 z-50 pointer-events-none">
        <span className="flex items-center gap-space-xs px-space-md py-1 bg-surface-container-lowest/95 border border-surface-border rounded shadow-md font-code-timestamp text-caption-meta text-on-surface-variant">
          <Icon name="lock" className="text-[13px] text-error" />
          No BloomLex integration exists · event contract is a proposal
        </span>
      </div>
    </>
  );
}
