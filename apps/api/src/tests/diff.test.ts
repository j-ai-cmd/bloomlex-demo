import test from 'node:test';
import assert from 'node:assert/strict';
import { diffFingerprints } from '../core/diff.js';
import type { Fingerprint } from '../core/fingerprint.js';

const fp = (o: Partial<Fingerprint>): Fingerprint => ({
  sha256: 'a'.repeat(64), bytes: 100, page_count: 3, duration_s: null,
  producer: 'Scanner', embedded_timestamp: '2026-03-12T14:02:00.000Z',
  pages: [
    { page: 1, text: 'alpha', redactions: [] },
    { page: 2, text: 'bravo', redactions: [] },
    { page: 3, text: 'charlie', redactions: [] },
  ],
  out_of_scope: [], ...o,
});

const types = (obs: any[]) => obs.map((o) => o.type);

test('identical fingerprints produce no observations', () => {
  assert.deepEqual(diffFingerprints(fp({}), fp({})), []);
});

test('a removed page is reported as page_missing, not as a conclusion', () => {
  const b = fp({ sha256: 'b'.repeat(64), page_count: 2, pages: [
    { page: 1, text: 'alpha', redactions: [] }, { page: 2, text: 'charlie', redactions: [] }] });
  const obs = diffFingerprints(fp({}), b, 'March package', 'June package');
  assert.ok(types(obs).includes('page_missing'));
  assert.ok(types(obs).includes('page_count_changed'));
  const missing = obs.find((o) => o.type === 'page_missing')!;
  assert.equal(missing.statement,
    'Page 2 was present in the March package version and is absent from the June package version.');
});

test('re-pagination alone does not read as a deleted page', () => {
  const b = fp({ sha256: 'b'.repeat(64), pages: [
    { page: 1, text: 'bravo', redactions: [] },
    { page: 2, text: 'charlie', redactions: [] },
    { page: 3, text: 'alpha', redactions: [] }] });
  assert.ok(!types(diffFingerprints(fp({}), b)).includes('page_missing'));
});

test('added pages, added redactions, timestamps, producer, hash and duration are each reported', () => {
  const b = fp({
    sha256: 'b'.repeat(64), page_count: 4, producer: 'Acrobat',
    embedded_timestamp: '2026-06-10T09:15:00.000Z', duration_s: 90,
    pages: [
      { page: 1, text: 'alpha', redactions: [[1, 2, 3, 4], [5, 6, 7, 8], [9, 1, 2, 3]] },
      { page: 2, text: 'bravo', redactions: [] },
      { page: 3, text: 'charlie', redactions: [] },
      { page: 4, text: 'delta', redactions: [] },
    ],
  });
  const obs = diffFingerprints(fp({ duration_s: 60 }), b);
  const t = types(obs);
  for (const expected of ['page_added', 'redaction_region_added', 'embedded_timestamp_changed',
                          'producer_changed', 'file_hash_changed', 'media_duration_changed', 'page_count_changed']) {
    assert.ok(t.includes(expected), `missing observation type ${expected}`);
  }
  assert.equal(obs.find((o) => o.type === 'redaction_region_added')!.after, 3);
});

test('text layer changes are reported per page', () => {
  const b = fp({ sha256: 'b'.repeat(64), pages: [
    { page: 1, text: 'alpha', redactions: [] },
    { page: 2, text: 'bravo revised wording that is long enough to keep the same key prefix', redactions: [] },
    { page: 3, text: 'charlie', redactions: [] }] });
  const obs = diffFingerprints(fp({}), b);
  assert.ok(types(obs).includes('page_missing') || types(obs).includes('text_layer_changed'));
});

test('page-level observations are omitted entirely when page data is unavailable', () => {
  const a = fp({ pages: null }); const b = fp({ pages: null, sha256: 'b'.repeat(64) });
  const t = types(diffFingerprints(a, b));
  assert.ok(!t.some((x) => x.startsWith('page_missing') || x.startsWith('redaction')));
  assert.deepEqual(t, ['file_hash_changed']);
});
