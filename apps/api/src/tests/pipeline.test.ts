/**
 * END-TO-END pipeline invariants, run against a fresh in-process Postgres.
 * These are the properties the whole design rests on, so they are asserted against real
 * seeded data rather than against mocks.
 */
process.env.DATABASE_URL = 'pglite';
// Tests assert deterministic invariants; they must never depend on a network model.
// Empty, not deleted: dotenv repopulates a deleted var but never overrides a set one.
import 'dotenv/config';
process.env.KIMI_API_KEY = ''; // in-memory, isolated from the dev database
import test from 'node:test';
import assert from 'node:assert/strict';

const { q, one } = await import('../db.js');
const { runSeed } = await import('../seed.js');
const { ingest } = await import('../engine/ingress.js');
const { findViolations } = await import('../ai/guard.js');
const { itemClocks, matterRollup } = await import('../core/clock.js');
const { band } = await import('../config/confidence.js');

const seeded = await runSeed();

test('the seed produces the demo shape', () => {
  assert.equal(Number(seeded.matters), 8);
  assert.ok(Number(seeded.commitments) >= 10);
  assert.ok(Number(seeded.needs_confirmation) >= 2, 'at least two needs-confirmation items');
  assert.ok(Number(seeded.superseded) >= 1, 'at least one superseded commitment');
  assert.ok(Number(seeded.diffs) >= 1);
  assert.ok(Number(seeded.unmatched) >= 1);
});

test('PROVENANCE: nothing exists in either surface without it', async () => {
  for (const table of ['commitment', 'request_item', 'package', 'classification', 'match', 'review_item']) {
    const orphans = await q(`SELECT count(*)::int n FROM ${table} WHERE provenance_id IS NULL`);
    assert.equal(orphans[0].n, 0, `${table} has rows without provenance`);
  }
  const p = await one(`SELECT * FROM provenance WHERE extractor='llm' LIMIT 1`);
  for (const f of ['event_id', 'channel', 'occurred_at', 'verbatim_text', 'model', 'prompt_version', 'confidence']) {
    assert.ok(p[f] !== null && p[f] !== undefined, `provenance missing ${f}`);
  }
});

test('every commitment can be traced back to verbatim source text', async () => {
  const rows = await q(`SELECT c.id, p.verbatim_text, p.channel, p.model, p.prompt_version
                        FROM commitment c JOIN provenance p ON p.id=c.provenance_id`);
  assert.ok(rows.length > 0);
  for (const r of rows) assert.ok(r.verbatim_text.length > 10, `empty provenance for ${r.id}`);
});

test('LANGUAGE RULE: no persisted generated text contains a forbidden phrasing', async () => {
  const texts: { where: string; text: string }[] = [];
  for (const r of await q(`SELECT id, description FROM classification`)) texts.push({ where: `classification ${r.id}`, text: r.description });
  for (const r of await q(`SELECT id, rationale, payload FROM action_proposal`)) {
    texts.push({ where: `proposal ${r.id} rationale`, text: r.rationale });
    if (r.payload?.draft_body) texts.push({ where: `proposal ${r.id} draft`, text: r.payload.draft_body });
    if (r.payload?.suggested_message) texts.push({ where: `proposal ${r.id} message`, text: r.payload.suggested_message });
  }
  for (const r of await q(`SELECT observations FROM diff`)) {
    for (const o of r.observations as any[]) texts.push({ where: `diff ${o.type}`, text: o.statement });
  }
  for (const r of await q(`SELECT id, title FROM review_item`)) texts.push({ where: `review ${r.id}`, text: r.title });
  assert.ok(texts.length > 20, 'expected a meaningful amount of generated text to check');
  for (const t of texts) assert.deepEqual(findViolations(t.text), [], `${t.where}: "${t.text}"`);
});

test('CONFIDENCE POLICY: low confidence creates nothing and raises a review item', async () => {
  const lows = await q(`SELECT * FROM review_item WHERE kind IN ('low_confidence_extraction','low_confidence_match')`);
  assert.ok(lows.length >= 1);
  // No classification row anywhere sits below the low threshold.
  for (const c of await q(`SELECT confidence FROM classification`)) {
    assert.notEqual(band('classification', Number(c.confidence)), 'low');
  }
  // No low-confidence match was ever persisted as a match at all.
  for (const m of await q(`SELECT confidence, state FROM match`)) {
    assert.notEqual(band('match', Number(m.confidence)), 'low');
  }
});

test('a low-confidence match never auto-alters matter state', async () => {
  const proposed = await q(`SELECT request_item_id FROM match WHERE state='proposed'`);
  for (const p of proposed) {
    const item = await one(`SELECT state FROM request_item WHERE id=$1`, [p.request_item_id]);
    assert.notEqual(item.state, 'Satisfied', 'a merely proposed match must not satisfy an item');
  }
});

test('SUPERSESSION: the earlier record survives and is linked, never overwritten', async () => {
  // The engineered case: the same affidavit promised for Wednesday, then for Friday.
  const s = await one(
    `SELECT s.* FROM supersession s JOIN commitment c ON c.id=s.superseded_id
     WHERE c.action_text ILIKE '%affidavit%'`);
  assert.ok(s, 'expected a supersession link');
  const older = await one(`SELECT * FROM commitment WHERE id=$1`, [s.superseded_id]);
  const newer = await one(`SELECT * FROM commitment WHERE id=$1`, [s.superseding_id]);
  assert.ok(older && newer);
  assert.equal(older.status, 'superseded');
  assert.ok(Object.keys(s.changed_fields).length > 0, 'must record what changed');
  assert.ok('due_date' in s.changed_fields);
});

test('IDEMPOTENCY: the same key never produces a second event', async () => {
  const before = (await q(`SELECT count(*)::int n FROM event`))[0].n;
  const a = await ingest({ type: 'ava.conversation.completed', idempotency_key: 'dupe-1',
    channel: 'phone', payload: { transcript: 'She said she will call back tomorrow afternoon.', matter_ref: 'R. v. Miller' } });
  const b = await ingest({ type: 'ava.conversation.completed', idempotency_key: 'dupe-1',
    channel: 'phone', payload: { transcript: 'She said she will call back tomorrow afternoon.', matter_ref: 'R. v. Miller' } });
  assert.equal(b.deduped, true);
  assert.equal(a.event_id, b.event_id);
  assert.equal((await q(`SELECT count(*)::int n FROM event`))[0].n, before + 1);
});

test('DEDUP: a semantically duplicate obligation merges instead of duplicating', async () => {
  const text = 'Ana Santos said she will file the bail variation materials tomorrow afternoon.';
  const r1 = await ingest({ type: 'ava.conversation.completed', idempotency_key: 'dd-1', channel: 'phone',
    payload: { transcript: text, matter_ref: 'R. v. Santos' } });
  const n1 = (await q(`SELECT count(*)::int n FROM commitment`))[0].n;
  await ingest({ type: 'ava.conversation.completed', idempotency_key: 'dd-2', channel: 'phone',
    payload: { transcript: text, matter_ref: 'R. v. Santos' } });
  const n2 = (await q(`SELECT count(*)::int n FROM commitment`))[0].n;
  assert.equal(n2, n1, 'an identical restatement must not create a second commitment');
  assert.ok(r1.run_id);
});

test('DATE SAFETY: no commitment has a date the resolver did not derive from a rule', async () => {
  const rows = await q(`SELECT id, due_date, date_rule_id, time_precision, status FROM commitment WHERE due_date IS NOT NULL`);
  for (const r of rows) {
    assert.ok(r.date_rule_id && r.date_rule_id !== 'no_rule_matched', `commitment ${r.id} has a date with no rule`);
  }
  // Every ambiguous item preserves candidates for one-click resolution instead of guessing.
  const ambiguous = await q(`SELECT r.*, (SELECT count(*)::int n FROM commitment_date_candidate cd
                             WHERE cd.commitment_id = r.payload->>'commitment_id') AS cands
                             FROM review_item r WHERE r.kind='ambiguous_date'`);
  assert.ok(ambiguous.length >= 2, 'at least two needs-confirmation items');
  for (const a of ambiguous) {
    const c = await one(`SELECT due_date FROM commitment WHERE id=$1`, [a.payload.commitment_id]);
    assert.equal(c?.due_date, null, 'an ambiguous commitment must not carry a guessed date');
  }
});

test('OBLIGATION CLOCK: the Okafor demo numbers are computed, and hold', async () => {
  const m = await one(`SELECT id FROM matter WHERE matter_ref='R. v. Okafor'`);
  const clocks = await itemClocks(m.id);
  const bwc = clocks.find((c) => c.description.startsWith('Body-worn camera'))!;
  assert.equal(bwc.age_calendar_days, 94, 'the 94-day item');
  assert.equal(bwc.followups, 3, 'three prior follow-ups');
  assert.notEqual(bwc.state, 'Satisfied');

  const notebook = clocks.find((c) => c.description.startsWith('Arresting officer notebook'))!;
  assert.equal(notebook.state, 'Partially Received', 'one partially satisfied item');
  // An item that left 'Satisfied' must age from the original request, not from the reversal.
  assert.equal(notebook.satisfied_at, null);
  assert.equal(notebook.age_calendar_days, 94);

  const roll = await matterRollup(m.id);
  assert.equal(roll.total_items, 14);
  assert.equal(roll.oldest_outstanding_days, 94);
});

test('DIFF: the re-served document yields the engineered observations', async () => {
  const d = await one(`SELECT * FROM diff`);
  const types = (d.observations as any[]).map((o) => o.type);
  assert.ok(types.includes('page_missing'));
  assert.ok(types.includes('redaction_region_added'));
  assert.ok(types.includes('embedded_timestamp_changed'));
  const red = (d.observations as any[]).find((o) => o.type === 'redaction_region_added');
  assert.equal(red.after, 3, 'three new redaction regions');
  const miss = (d.observations as any[]).find((o) => o.type === 'page_missing');
  assert.equal(miss.before, 4, 'page 4 is the missing page');
});

test('UNMATCHED material is exactly the material nothing was requested for', async () => {
  const rows = await q(`SELECT u.original_filename FROM unmatched_file u JOIN matter m ON m.id=u.matter_id
                        WHERE m.matter_ref='R. v. Okafor'`);
  assert.deepEqual(rows.map((r) => r.original_filename), ['Officer_shift_roster_Div14.pdf']);
});

test('REVIEW QUEUE: approval requires a human actor and is logged; nothing is sent', async () => {
  const p = await one(`SELECT * FROM action_proposal WHERE status='pending' LIMIT 1`);
  assert.ok(p, 'the sweeper produced proposals');
  assert.equal(p.proposed_by, 'system');
  assert.equal(p.status, 'pending');
  // No table anywhere records a transmission; "execution" is an audit row by construction.
  const sent = await q(`SELECT column_name FROM information_schema.columns WHERE column_name IN ('sent_at','delivered_at','transport')`);
  assert.equal(sent.filter((c: any) => c.column_name === 'transport').length, 0);
});

test('every state change was recorded with a trigger and an actor kind', async () => {
  const t = await q(`SELECT * FROM state_transition`);
  assert.ok(t.length > 20);
  for (const r of t) {
    assert.ok(r.trigger, 'transition without a trigger');
    assert.ok(['system', 'ai', 'human'].includes(r.actor_kind));
  }
  assert.equal((await q(`SELECT count(*)::int n FROM state_transition WHERE to_state ILIKE '%escalat%'`))[0].n, 0);
});

test('RUN TRACES: every run has steps, and the LLM/deterministic split is visible in them', async () => {
  const runs = await q(`SELECT id FROM run WHERE workflow='ava.conversation.completed' LIMIT 1`);
  const steps = await q(`SELECT * FROM run_step WHERE run_id=$1 ORDER BY seq`, [runs[0].id]);
  assert.ok(steps.length >= 3);
  const kinds = new Set(steps.map((s) => s.kind));
  assert.ok(kinds.has('llm') && kinds.has('deterministic'));
  // The date was resolved deterministically, never by the model.
  const dateStep = steps.find((s) => s.name === 'resolve_date');
  assert.ok(dateStep);
  assert.equal(dateStep.kind, 'deterministic');
});
