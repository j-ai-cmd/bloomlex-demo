/** End-to-end API smoke: boots nothing, asserts a running API answers correctly. */
const base = process.env.API ?? 'http://localhost:8080';
const get = async (p) => { const r = await fetch(base + p); if (!r.ok) throw new Error(`${p} -> ${r.status}`); return r.json(); };
const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };

const meta = await get('/v1/meta');
if (meta.demo_data !== true) fail('demo flag missing');
if (meta.bloomlex_integration !== false) fail('must not claim a BloomLex integration');
if (!meta.date_rules?.length) fail('date rules not exposed');

const roll = await get('/v1/obligations/rollup');
if (roll.oldest_outstanding_days !== 94) fail(`oldest outstanding is ${roll.oldest_outstanding_days}, expected 94`);

const matters = await get('/v1/matters');
if (matters.length !== 8) fail(`expected 8 matters, got ${matters.length}`);
const okafor = matters.find((m) => m.matter_ref === 'R. v. Okafor');

const reg = await get(`/v1/matters/${okafor.id}/register`);
if (reg.items.length !== 14) fail('Okafor register should have 14 items');
if (!reg.items.some((i) => i.state === 'Partially Received')) fail('no partially received item');

const diffs = await get(`/v1/diffs?matter_id=${okafor.id}`);
const types = diffs.flatMap((d) => d.observations.map((o) => o.type));
for (const t of ['page_missing', 'redaction_region_added', 'embedded_timestamp_changed']) {
  if (!types.includes(t)) fail(`diff missing observation ${t}`);
}
const unmatched = await get(`/v1/unmatched?matter_id=${okafor.id}`);
if (unmatched.length !== 1) fail(`expected 1 unmatched file, got ${unmatched.length}`);

const sim = await fetch(base + '/v1/simulate/ava', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ text: 'He said he will send the medical records next week.', matter_ref: 'R. v. Kelly', channel: 'phone' }),
}).then((r) => r.json());
if (!sim.run_id) fail('simulate returned no run_id');
const dateStep = sim.trace.steps.find((s) => s.name === 'resolve_date');
if (!dateStep || dateStep.kind !== 'deterministic') fail('date resolution was not a deterministic step');
// The obligation may be newly created or merged into an identical earlier one (dedup);
// either way the invariant is the same — "next week" must never become a guessed date.
const outcome = sim.result?.[0];
if (!outcome?.commitment_id) fail('simulate produced no commitment');
const all = await get('/v1/commitments');
const c = all.find((x) => x.id === outcome.commitment_id);
if (!c) fail('created commitment not retrievable');
else {
  if (c.due_date !== null) fail(`"next week" was collapsed to ${c.due_date}`);
  if (c.status !== 'needs_confirmation') fail(`expected needs_confirmation, got ${c.status}`);
  if (!c.candidates?.length) fail('no candidate dates offered for one-click resolution');
  if (c.date_rule_id !== 'next_week') fail(`expected rule next_week, got ${c.date_rule_id}`);
}

const trace = await get(`/v1/runs/${sim.run_id}`);
if (!trace.steps.length) fail('run trace empty');

const queue = await get('/v1/review-queue');
if (!queue.proposals.length) fail('review queue empty');
if (queue.proposals.some((p) => p.status !== 'pending')) fail('non-pending proposal in the pending queue');

if (!process.exitCode) console.log('API smoke: all checks passed');
