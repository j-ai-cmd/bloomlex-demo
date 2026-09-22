import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../lib/ui';
import { Logo } from './Logo';
import NotificationBadge from './smoothui/notification-badge';

export type Page = 'calendar' | 'intake' | 'disclosure' | 'review';

export function Shell({ page, setPage, meta, counts, children }: {
  page: Page; setPage: (p: Page) => void; meta: any;
  counts: { disclosure: number; review: number }; children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const drawerHidden = !isDesktop && !drawerOpen;
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (drawerOpen) asideRef.current?.querySelector<HTMLElement>('nav button')?.focus();
  }, [drawerOpen]);
  const pingReview = usePingOnIncrease(counts.review);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const go = (p: Page) => { setPage(p); setDrawerOpen(false); };

  const Item = ({ id, icon, label, badge, badgeTone, ping, badgeHint }: any) => {
    const active = page === id;
    return (
      <button onClick={() => go(id)} aria-current={active ? 'page' : undefined}
        aria-label={badge ? `${label}, ${badge} ${badgeHint}` : undefined}
        className={`w-full flex items-center justify-between px-space-md py-space-sm rounded transition-colors ${
          active ? 'bg-primary text-on-primary font-body-strong shadow-sm border-l-[3px] border-accent'
                 : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'}`}>
        <span className="flex items-center gap-space-md">
          <Icon name={icon} className="text-[18px]" />
          <span className="font-body-compact text-body-compact">{label}</span>
        </span>
        <NotificationBadge variant="count" count={badge ?? 0} ping={ping} children={<></>}
          className={`static h-auto w-auto min-w-0 px-space-xs py-space-2xs rounded font-code-timestamp text-caption-meta font-bold ${badgeTone}`} />
      </button>
    );
  };

  return (
    <>
      {/* phone/tablet top bar: the sidebar becomes a drawer below md */}
      <header className="md:hidden sticky top-0 z-40 flex items-center justify-between gap-space-sm px-space-lg py-space-sm bg-surface-container-low border-b border-surface-border">
        <button onClick={() => setDrawerOpen(true)} aria-label="Open menu" aria-expanded={drawerOpen} aria-controls="app-sidebar"
          className="w-10 h-10 -ml-space-xs rounded flex items-center justify-center text-on-surface hover:bg-surface-container">
          <Icon name="menu" className="text-[22px]" />
        </button>
        <span className="scale-90 origin-center"><Logo /></span>
        <span className="w-10" />
      </header>
      {drawerOpen && (
        <div onClick={() => setDrawerOpen(false)} aria-hidden="true"
          className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
      )}

      <aside id="app-sidebar" ref={asideRef} {...(drawerHidden ? { inert: '' as any, 'aria-hidden': true } : {})}
        {...(!isDesktop && drawerOpen ? { role: 'dialog', 'aria-modal': true, 'aria-label': 'Menu' } : {})}
        className={`fixed left-0 top-0 h-full w-sidebar-width max-w-[85vw] bg-surface-container-low border-r border-surface-border z-50 flex flex-col justify-between select-none transition-transform duration-200 ease-out motion-reduce:transition-none md:translate-x-0 ${
        drawerOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full'}`}>
        <div className="flex flex-col">
          <div className="relative p-space-lg flex flex-col items-center gap-space-sm border-b border-surface-border/60">
            <button onClick={() => setDrawerOpen(false)} aria-label="Close menu"
              className="md:hidden absolute right-space-sm top-space-sm w-10 h-10 rounded flex items-center justify-center text-on-surface-variant hover:bg-surface-container">
              <Icon name="close" className="text-[20px]" />
            </button>
            <Logo />
            <span className="font-caption-meta text-caption-meta text-on-surface-variant uppercase tracking-wider text-center w-full">
              {meta?.firm ?? '—'}
            </span>
          </div>
          <div className="px-space-lg py-space-xs">
            <nav aria-label="Main" className="flex flex-col gap-space-2xs pt-space-xs">
              <Item id="calendar"    icon="calendar_today" label="Deadline Calendar" />
              <Item id="intake"      icon="cloud_upload"   label="Upload Disclosure" />
              <Item id="disclosure"  icon="security"       label="Matters"
                    badge={counts.disclosure || null} badgeTone="bg-secondary-fixed text-on-secondary-fixed" badgeHint="outstanding" />
              <Item id="review"      icon="fact_check"     label="Pending Review"
                    badge={counts.review || null} badgeTone="bg-accent text-accent-ink" badgeHint="waiting for review" ping={pingReview} />
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

      <div className="md:pl-sidebar-width">
        <main className="bg-surface min-h-screen">{children}</main>
      </div>
    </>
  );
}

/** Pulse for a few seconds when the count goes up, instead of pulsing forever. */
function usePingOnIncrease(count: number) {
  const prev = useRef(count);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const rose = count > prev.current && prev.current !== 0;
    prev.current = count;
    if (!rose) return;
    setOn(true);
    const t = setTimeout(() => setOn(false), 3000);
    return () => clearTimeout(t);
  }, [count]);
  return on;
}

function useMediaQuery(query: string) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on(); mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}
