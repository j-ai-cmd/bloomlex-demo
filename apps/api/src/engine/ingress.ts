/**
 * EVENT INGRESS. The one door.
 *
 * A simulated event today and a real BloomLex Ava webhook later take an IDENTICAL code
 * path from this function down. When BloomLex publishes a webhook, the only change is
 * that the HTTP route calls this with source='webhook'. No workflow code changes.
 */
import { q, one } from '../db.js';
import { id } from '../ids.js';
import { startRun, finishRun } from './run.js';
import { HANDLERS } from './workflows.js';

export type Ingress = {
  type: string;
  idempotency_key?: string;
  matter_ref?: string;
  channel?: string;
  occurred_at?: string;
  payload: any;
  source?: 'simulator' | 'webhook';
  /** Return the run_id immediately and process in the background. */
  detached?: boolean;
};

export async function ingest(e: Ingress) {
  if (!HANDLERS[e.type]) throw Object.assign(new Error(`unknown event type ${e.type}`), { statusCode: 400 });

  const key = e.idempotency_key ?? id('idem');
  const existing = await one(`SELECT e.id, r.id AS run_id FROM event e LEFT JOIN run r ON r.event_id=e.id WHERE e.idempotency_key=$1`, [key]);
  if (existing) return { event_id: existing.id, run_id: existing.run_id, deduped: true };

  const eventId = id('evt');
  const occurred = e.occurred_at ?? new Date().toISOString();
  await q(
    `INSERT INTO event (id,type,idempotency_key,matter_ref,channel,occurred_at,payload,source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [eventId, e.type, key, e.matter_ref ?? e.payload?.matter_ref ?? null, e.channel ?? e.payload?.channel ?? null,
     occurred, JSON.stringify(e.payload), e.source ?? 'simulator'],
  );

  const run = await startRun(eventId, e.type);
  const ev = { id: eventId, type: e.type, occurred_at: occurred, channel: e.channel ?? e.payload?.channel, payload: e.payload };

  const execute = async () => {
    try {
      const result = await HANDLERS[e.type](run, ev);
      await finishRun(run, 'succeeded');
      return { result };
    } catch (err: any) {
      await finishRun(run, 'failed', err?.message ?? String(err));
      return { error: err?.message ?? String(err) };
    }
  };

  // detached: return the run_id at once so a client can watch the steps arrive over SSE.
  // Used by the demo surfaces. Everything else awaits, so the trace is complete on return.
  if (e.detached) {
    void execute();
    return { event_id: eventId, run_id: run.runId, deduped: false, detached: true };
  }
  return { event_id: eventId, run_id: run.runId, deduped: false, ...(await execute()) };
}
