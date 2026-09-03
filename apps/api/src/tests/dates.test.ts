import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, resolveDate } from '../core/dates/rules.js';
import { addBusinessDays, businessDaysBetween, isBusinessDay, dow } from '../core/time.js';

// A Thursday, so "next Wednesday" and "Friday" land in different weeks.
const ctx = { today: '2026-09-03', nextCourtDate: '2026-09-17' };

test('exact dates resolve to a point', () => {
  assert.equal((resolveDate('by 2026-09-14', ctx) as any).date, '2026-09-14');
  const w = resolveDate('on September 14', ctx) as any;
  assert.equal(w.kind, 'point'); assert.equal(w.date, '2026-09-14');
});

test('a month/day already past rolls to next year rather than into the past', () => {
  const r = resolveDate('on January 5', ctx) as any;
  assert.equal(r.date, '2027-01-05');
});

test('tomorrow carries its part of day', () => {
  const r = resolveDate('tomorrow afternoon', ctx) as any;
  assert.equal(r.date, '2026-09-04');
  assert.equal(r.precision, 'afternoon');
});

test('next <weekday> lands in the following week, not this one', () => {
  const r = resolveDate('next Wednesday', ctx) as any;
  assert.equal(r.kind, 'point');
  assert.equal(r.date, '2026-09-09');
  assert.equal(dow(r.date), 3);
});

test('a bare weekday is the next occurrence, all-day', () => {
  const r = resolveDate('sometime Friday', ctx) as any;
  assert.equal(r.date, '2026-09-04');
  assert.equal(r.precision, 'allday');
});

test('"next week" yields a RANGE and never a guessed date', () => {
  const r = resolveDate('call me next week', ctx) as any;
  assert.equal(r.kind, 'range');
  assert.equal(r.candidates.length, 5);
  assert.ok(!('date' in r), 'a range must not carry a single resolved date');
  assert.equal(r.candidates[0].date, '2026-09-07');
});

test('"early next month" yields a RANGE of business days in the next month', () => {
  const r = resolveDate('early next month', ctx) as any;
  assert.equal(r.kind, 'range');
  assert.ok(r.candidates.length >= 3);
  for (const c of r.candidates) {
    assert.ok(c.date.startsWith('2026-10'));
    assert.ok(isBusinessDay(c.date));
  }
});

test('"before court" anchors to the matter court date, and refuses without one', () => {
  const r = resolveDate('before court', ctx) as any;
  assert.equal(r.kind, 'range');
  for (const c of r.candidates) assert.ok(c.date < ctx.nextCourtDate);

  const none = resolveDate('before court', { today: ctx.today, nextCourtDate: null }) as any;
  assert.equal(none.kind, 'unresolved');
  assert.match(none.reason, /no known next court date/);
});

test('"two business days before court" is deterministic arithmetic', () => {
  const r = resolveDate('two business days before court', ctx) as any;
  assert.equal(r.kind, 'point');
  assert.equal(r.date, addBusinessDays(ctx.nextCourtDate, -2));
});

test('genuinely vague phrasing resolves to nothing at all', () => {
  for (const p of ['soon', 'shortly', 'in due course', 'at some point']) {
    assert.equal(resolveDate(p, ctx).kind, 'unresolved', p);
  }
});

test('an unmatched phrase never invents a date', () => {
  const r = resolveDate('when the stars align', ctx);
  assert.equal(r.kind, 'unresolved');
  assert.equal(r.rule_id, 'no_rule_matched');
});

test('every rule in the table is reachable by its own documented example', () => {
  for (const rule of RULES) {
    const r = resolveDate(rule.example.split(' / ')[0], ctx);
    assert.ok(r.rule_id === rule.id || r.kind !== 'unresolved',
      `rule ${rule.id} did not fire for its example "${rule.example}" (got ${r.rule_id})`);
  }
});

test('NO resolution ever returns a point date for a range-yielding rule', () => {
  for (const rule of RULES.filter((r) => r.yields === 'range')) {
    const r = resolveDate(rule.example.split(' / ')[0], ctx);
    assert.notEqual(r.kind, 'point', `${rule.id} collapsed a range to a guessed date`);
  }
});

test('business day arithmetic skips weekends and Ontario statutory holidays', () => {
  // 2026-09-07 is Labour Day.
  assert.equal(isBusinessDay('2026-09-07'), false);
  assert.equal(addBusinessDays('2026-09-04', 1), '2026-09-08');
  assert.equal(businessDaysBetween('2026-09-04', '2026-09-08'), 1);
  assert.equal(businessDaysBetween('2026-09-03', '2026-09-03'), 0);
});
