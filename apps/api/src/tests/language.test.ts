import test from 'node:test';
import assert from 'node:assert/strict';
import { findViolations, assertObservational, LanguageRuleViolation, FORBIDDEN } from '../ai/guard.js';
import { diffFingerprints } from '../core/diff.js';
import { fixtureDraft, fixtureClassify, fixtureExtract, fixtureMatches } from '../ai/fixtures.js';
import type { Fingerprint } from '../core/fingerprint.js';

test('the guard catches legal conclusions', () => {
  assert.deepEqual(findViolations('Page 4 is absent from the June package.'), []);
  assert.ok(findViolations('the Crown improperly removed page 4').length);
  assert.ok(findViolations('This is legally significant.').length);
  assert.ok(findViolations('We should escalate to a stay application.').length);
  assert.throws(() => assertObservational('wilful non-disclosure'), LanguageRuleViolation);
});

test('every observation the diff engine can emit is free of forbidden phrasing', () => {
  const base: Fingerprint = {
    sha256: 'a'.repeat(64), bytes: 1, page_count: 3, duration_s: 10, producer: 'Scanner',
    embedded_timestamp: '2026-03-12T14:02:00.000Z',
    pages: [{ page: 1, text: 'a', redactions: [] }, { page: 2, text: 'b', redactions: [] }, { page: 3, text: 'c', redactions: [] }],
    out_of_scope: [],
  };
  const other: Fingerprint = {
    ...base, sha256: 'b'.repeat(64), page_count: 4, duration_s: 20, producer: 'Acrobat',
    embedded_timestamp: '2026-06-10T09:15:00.000Z',
    pages: [{ page: 1, text: 'a', redactions: [[1, 2, 3, 4]] }, { page: 2, text: 'b', redactions: [] },
            { page: 3, text: 'z', redactions: [] }, { page: 4, text: 'd', redactions: [] }],
  };
  const obs = [...diffFingerprints(base, other), ...diffFingerprints(other, base)];
  assert.ok(obs.length >= 6);
  for (const o of obs) assert.deepEqual(findViolations(o.statement), [], `forbidden phrasing in: ${o.statement}`);
});

test('generated follow-up prose is observational', () => {
  const d = fixtureDraft('ITEM: Body-worn camera footage\nFIRST REQUESTED: 2026-06-01\nAGE_DAYS: 94\nFOLLOWUPS: 3\nRECEIVED: none recorded');
  assert.deepEqual(findViolations(d.body), []);
  assert.ok(!/stay|application|remedy|jordan|charter/i.test(d.body), 'draft must not reach for remedies');
});

test('generated classifications and match evidence are observational', () => {
  for (const name of ['SCAN_0091.pdf', 'IMG_0042.pdf', 'aud_0417.mp3', 'unknown_blob.bin']) {
    assert.deepEqual(findViolations(fixtureClassify(name, 'officer notebook memorandum').description), []);
  }
  const m = fixtureMatches(
    [{ file_id: 'f1', doc_type: 'officer_notes', description: 'Officer notebook and memorandum book entries', author_or_officer: null }],
    [{ request_item_id: 'i1', description: 'Arresting officer notebook entries', category: 'officer_notes' }]);
  for (const x of m.matches) assert.deepEqual(findViolations(x.evidence), []);
});

test('extracted commitment text is passed through the guard unchanged', () => {
  const r = fixtureExtract("Sarah said I'll send the signed affidavit by Friday.", ['R. v. Miller'], 'R. v. Miller');
  assert.ok(r.commitments.length);
  for (const c of r.commitments) assert.deepEqual(findViolations(c.action_text), []);
});

test('the forbidden list actually covers the phrasings the brief names', () => {
  for (const phrase of ['improperly', 'legally significant']) {
    assert.ok(FORBIDDEN.some((f) => phrase.includes(f) || f.includes(phrase.slice(0, 8))), phrase);
  }
});
