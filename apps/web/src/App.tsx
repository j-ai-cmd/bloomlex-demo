import React, { useCallback, useEffect, useState } from 'react';
import { api } from './lib/api';
import { Shell, Page } from './components/Shell';
import { Calendar } from './pages/Calendar';
import { Intake } from './pages/Intake';
import { Disclosure } from './pages/Disclosure';
import { Review } from './pages/Review';

const SLUG: Record<Page, string> = { calendar: 'calendar', intake: 'upload', disclosure: 'matters', review: 'review' };

function pageFromHash(): Page {
  const slug = window.location.hash.replace(/^#\/?/, '');
  return (Object.keys(SLUG) as Page[]).find((p) => SLUG[p] === slug) ?? 'calendar';
}

export default function App() {
  const [page, setPageState] = useState<Page>(pageFromHash);

  // Each page gets a URL (#/matters etc.) so the browser Back button and links work.
  const setPage = useCallback((p: Page) => {
    setPageState(p);
    if (pageFromHash() !== p) history.pushState(null, '', `#/${SLUG[p]}`);
  }, []);
  useEffect(() => {
    const onPop = () => setPageState(pageFromHash());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const [meta, setMeta] = useState<any>(null);
  const [counts, setCounts] = useState({ disclosure: 0, review: 0 });
  const [tick, setTick] = useState(0);

  const refresh = useCallback(async () => {
    const [m, roll, queue] = await Promise.all([
      api('/v1/meta'), api('/v1/obligations/rollup'), api('/v1/review-queue'),
    ]);
    setMeta(m);
    setCounts({
      disclosure: roll.still_outstanding + roll.needs_review + roll.partially_received,
      review: queue.review_items?.length ?? 0,
    });
  }, []);

  useEffect(() => { refresh(); }, [refresh, tick]);
  const bump = () => setTick((t) => t + 1);

  return (
    <Shell page={page} setPage={setPage} meta={meta} counts={counts}>
      {page === 'calendar' && <Calendar onChanged={bump} meta={meta} />}
      {page === 'intake' && <Intake onChanged={bump} setPage={setPage} />}
      {page === 'disclosure' && <Disclosure setPage={setPage} />}
      {page === 'review' && <Review onChanged={bump} />}
    </Shell>
  );
}
