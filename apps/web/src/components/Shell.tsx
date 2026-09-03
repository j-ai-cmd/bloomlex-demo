import React from 'react';
import { Icon } from '../lib/ui';
import { Logo } from './Logo';

export type Page = 'calendar' | 'intake' | 'disclosure' | 'review';

export function Shell({ page, setPage, meta, counts, children }: {
  page: Page; setPage: (p: Page) => void; meta: any;
  counts: { disclosure: number; review: number }; children: React.ReactNode;
}) {
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
        {badge != null && badge !== 0 && (
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
            <Logo />
            <span className="font-caption-meta text-caption-meta text-on-surface-variant uppercase tracking-wider">
              {meta?.firm ?? '—'}
            </span>
          </div>
          <div className="px-space-lg py-space-xs">
            <nav className="flex flex-col gap-space-2xs pt-space-xs">
              <Item id="calendar"    icon="calendar_today" label="Deadlines" />
              <Item id="intake"      icon="cloud_upload"   label="Upload Disclosure" />
              <Item id="disclosure"  icon="security"       label="Matters"
                    badge={counts.disclosure || null} badgeTone="bg-secondary-fixed text-on-secondary-fixed" />
              <Item id="review"      icon="fact_check"     label="Pending Review"
                    badge={counts.review || null} badgeTone="bg-accent text-accent-ink" />
            </nav>
          </div>
        </div>
        <div className="flex flex-col gap-space-sm p-space-lg border-t border-surface-border/60">
          <div className="p-space-sm bg-surface-container-lowest rounded border border-surface-border flex items-center gap-space-md">
            <span className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center">
              <Icon name="person" className="text-[18px]" />
            </span>
            <span className="flex flex-col truncate">
              <span className="font-body-strong text-body-strong truncate text-on-surface">Silvio D'Addario</span>
              <span className="font-caption-meta text-caption-meta text-on-surface-variant truncate">Principal</span>
            </span>
          </div>
        </div>
      </aside>

      <div className="pl-sidebar-width">
        <main className="bg-surface min-h-screen">{children}</main>
      </div>
    </>
  );
}
