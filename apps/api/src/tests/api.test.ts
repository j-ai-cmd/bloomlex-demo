process.env.DATABASE_URL = 'pglite';
// Tests assert deterministic invariants; they must never depend on a network model.
// Empty, not deleted: dotenv repopulates a deleted var but never overrides a set one.
import 'dotenv/config';
process.env.KIMI_API_KEY = '';
import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';

const { runSeed } = await import('../seed.js');
const { q, one } = await import('../db.js');
const routes = (await import('../routes/index.js')).default;

await runSeed();
const app = Fastify();
// The server registers this too; the test app must mirror it for the upload route.
await app.register((await import('@fastify/multipart')).default, { limits: { fileSize: 50 * 1024 * 1024 } });
await app.register(routes);
const get = async (url: string) => { const r = await app.inject({ method: 'GET', url }); return { status: r.statusCode, body: r.json() as any }; };
const post = async (url: string, payload?: any) => { const r = await app.inject({ method: 'POST', url, payload }); return { status: r.statusCode, body: r.json() as any }; };

test('GET /v1/meta carries the demo flag and refuses to claim an integration', async () => {
  const { body } = await get('/v1/meta');
  assert.equal(body.demo_data, true);
  assert.match(body.demo_notice, /Demo data/);
  assert.equal(body.bloomlex_integration, false);
  assert.ok(body.date_rules.length >= 10);
  assert.ok(body.confidence_policy.extraction.high);
  assert.ok(body.diff_out_of_scope.includes('handwriting OCR'));
});

test('POST /v1/simulate/ava drives the whole pipeline and returns the trace', async () => {
  const { body } = await post('/v1/simulate/ava', {
    text: 'Kelechi Okafor called about R. v. Okafor. He said he will bring the surety documents next Tuesday.',
    matter_ref: 'R. v. Okafor', channel: 'phone',
  });
  assert.ok(body.run_id);
  assert.ok(body.trace.steps.length >= 3);
  assert.ok(body.trace.steps.some((s: any) => s.kind === 'llm'));
  assert.ok(body.trace.steps.some((s: any) => s.name === 'resolve_date' && s.kind === 'deterministic'));
  const created = await one(`SELECT * FROM commitment ORDER BY created_at DESC LIMIT 1`);
  assert.ok(created.provenance_id, 'created with provenance');
});

test('GET /v1/runs/:id returns a step-by-step trace', async () => {
  const run = await one(`SELECT id FROM run LIMIT 1`);
  const { body } = await get(`/v1/runs/${run.id}`);
  assert.ok(body.steps.length > 0);
  assert.ok(body.event);
});

test('calendar, register, reconciliation, evidence index and rollups all answer', async () => {
  const m = await one(`SELECT id, matter_ref FROM matter WHERE matter_ref='R. v. Okafor'`);
  assert.equal((await get('/v1/matters')).body.length, 8);
  assert.ok((await get(`/v1/matters/${m.matter_ref}`)).body.rollup.total_items === 14);
  assert.ok((await get('/v1/commitments')).body.length > 5);
  assert.ok((await get('/v1/calendar?from=2026-01-01&to=2027-01-01')).body.days);
  const reg = await get(`/v1/matters/${m.id}/register`);
  assert.equal(reg.body.items.length, 14);
  assert.ok(reg.body.items[0].clock.age_calendar_days === 94);
  assert.ok((await get(`/v1/reconciliation?matter_id=${m.id}`)).body.items.length === 14);
  assert.equal((await get(`/v1/unmatched?matter_id=${m.id}`)).body.length, 1);
  assert.ok((await get(`/v1/diffs?matter_id=${m.id}`)).body.length >= 1);
  assert.equal((await get('/v1/obligations/rollup')).body.total_items, 29);

  const item = await one(`SELECT id FROM request_item WHERE matter_id=$1 AND seq=1`, [m.id]);
  const ev = await get(`/v1/request-items/${item.id}/evidence`);
  assert.equal(ev.body.clock.age_calendar_days, 94);
  assert.equal(ev.body.followups.length, 3);
  assert.ok(ev.body.transitions.length >= 1);
});

test('approval is refused without a human actor, and sends nothing when granted', async () => {
  const p = await one(`SELECT id FROM action_proposal WHERE status='pending' LIMIT 1`);
  const bad = await post(`/v1/review-queue/${p.id}/approve`, { actor_id: 'nobody' });
  assert.equal(bad.status, 400);

  const actor = await one(`SELECT id FROM actor WHERE kind='human'`);
  const ok = await post(`/v1/review-queue/${p.id}/approve`, { actor_id: actor.id, note: 'approved on stage' });
  assert.equal(ok.body.status, 'executed');
  assert.equal(ok.body.sent, false);
  assert.match(ok.body.note, /Nothing was sent/);

  const t = await q(`SELECT * FROM state_transition WHERE entity_type='action_proposal' AND entity_id=$1 ORDER BY occurred_at`, [p.id]);
  assert.deepEqual(t.map((x: any) => x.to_state), ['pending', 'approved', 'executed']);
  assert.equal(t[1].actor_kind, 'human');
  assert.equal(t[1].actor_id, actor.id);
});

test('a needs-confirmation commitment is resolved by a one-click human choice', async () => {
  const c = await one(`SELECT c.id, cd.candidate_date FROM commitment c
                       JOIN commitment_date_candidate cd ON cd.commitment_id=c.id
                       WHERE c.status='needs_confirmation' LIMIT 1`);
  const actor = await one(`SELECT id FROM actor WHERE kind='human'`);
  const r = await post(`/v1/commitments/${c.id}/confirm`, { date: c.candidate_date, actor_id: actor.id });
  assert.equal(r.body.status, 'active');
  const t = await q(`SELECT * FROM state_transition WHERE entity_id=$1 ORDER BY occurred_at DESC LIMIT 1`, [c.id]);
  assert.equal(t[0].actor_kind, 'human');
});

test('the supersession chain is retrievable with what changed and why', async () => {
  const s = await one(`SELECT * FROM supersession LIMIT 1`);
  const { body } = await get(`/v1/commitments/${s.superseding_id}/history`);
  assert.ok(body.chain.length >= 2, 'both records survive');
  assert.ok(body.links.length >= 1);
  assert.ok('due_date' in body.links[0].changed_fields);
});

test('POST /v1/events is the same door the webhook would use', async () => {
  const r = await post('/v1/events', {
    type: 'ava.conversation.completed', idempotency_key: 'api-test-1', source: 'webhook',
    payload: { transcript: 'He said he will call back tomorrow morning.', matter_ref: 'R. v. Kelly', channel: 'phone' },
  });
  assert.ok(r.body.run_id);
  const e = await one(`SELECT source FROM event WHERE idempotency_key='api-test-1'`);
  assert.equal(e.source, 'webhook', 'source is the only difference between simulator and webhook');
});

test('POST /v1/files takes the same ingress a portal delivery would', async () => {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const path = fileURLToPath(new URL('../../../../fixtures/generated/IMG_0042.pdf', import.meta.url));
  const pdf = await readFile(path);
  const boundary = '----spinetest';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="matter_ref"\r\n\r\nR. v. Santos\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="source"\r\n\r\nusb\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="dragged_in.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
    pdf, Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const r = await app.inject({
    method: 'POST', url: '/v1/files',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: body,
  });
  assert.equal(r.statusCode, 200);
  const out = r.json() as any;
  assert.ok(out.run_id, 'an uploaded file produces a run like any other event');
  const ev = await one(`SELECT type FROM event WHERE id=$1`, [out.event_id]);
  assert.equal(ev.type, 'disclosure.package.received', 'no side door: same event type');
  const f = await one(`SELECT d.*, p.state FROM dfile d JOIN package p ON p.id=d.package_id
                       WHERE d.original_filename='dragged_in.pdf'`);
  assert.ok(f, 'the uploaded file was indexed');
  assert.ok(f.sha256?.length === 64, 'hashed on ingest');
  assert.ok(f.page_count >= 1, 'page count read from the real PDF');
});

test('POST /v1/files refuses without a matter', async () => {
  const boundary = '----spinetest2';
  const body = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="source"\r\n\r\nusb\r\n--${boundary}--\r\n`);
  const r = await app.inject({ method: 'POST', url: '/v1/files',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: body });
  assert.equal(r.statusCode, 400);
});

test('every derived desk row exposes its origin, confidence, timestamp and approval state', async () => {
  const m = await one(`SELECT id FROM matter WHERE matter_ref='R. v. Okafor'`);
  const { body } = await get(`/v1/reconciliation?matter_id=${m.id}`);
  const withMatches = body.items.filter((i: any) => i.matches);
  assert.ok(withMatches.length > 0);
  for (const it of withMatches) {
    for (const x of it.matches) {
      for (const f of ['match_model', 'match_recorded_at', 'classification_model',
                       'classification_recorded_at', 'confidence', 'human_approved']) {
        assert.ok(x[f] !== undefined, `match row missing ${f}`);
      }
      // Fixture output must be labelled as such and never as the configured model.
      assert.ok(['fixture-v1', meta().model].includes(x.match_model), `unlabelled origin: ${x.match_model}`);
      assert.equal(typeof x.human_approved, 'boolean');
    }
  }
  const diffs = (await get(`/v1/diffs?matter_id=${m.id}`)).body;
  for (const d of diffs) assert.equal(d.produced_by, 'deterministic');
});

function meta() { return { model: process.env.KIMI_API_KEY ? (process.env.KIMI_MODEL ?? 'kimi-k2.6') : 'fixture-v1' }; }
