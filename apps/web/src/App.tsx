import React, { useCallback, useEffect, useState } from 'react';
import { api } from './lib/api';
import { Shell, Page } from './components/Shell';
import { Calendar } from './pages/Calendar';
import { Intake } from './pages/Intake';
import { Disclosure } from './pages/Disclosure';
import { Review } from './pages/Review';

export default function App() {
  const [page, setPage] = useState<Page>('calendar');
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
      {page === 'calendar' && <Calendar onChanged={bump} />}
      {page === 'intake' && <Intake onChanged={bump} setPage={setPage} />}
      {page === 'disclosure' && <Disclosure />}
      {page === 'review' && <Review onChanged={bump} />}
    </Shell>
  );
}
