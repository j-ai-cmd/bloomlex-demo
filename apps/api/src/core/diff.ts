/**
 * DETERMINISTIC DIFF ENGINE.
 *
 * Reports OBSERVABLE FACTS ONLY. Every observation is a struct rendered through a fixed
 * template, never free prose, so no legal conclusion can enter here.
 *
 * "Page 4 was present in the March package and is absent from the June package."
 * NOT "the Crown improperly removed page 4."
 */
import type { Fingerprint } from './fingerprint.js';

export type ObservationType =
  | 'page_count_changed' | 'page_missing' | 'page_added' | 'text_layer_changed'
  | 'redaction_region_added' | 'redaction_region_removed'
  | 'embedded_timestamp_changed' | 'producer_changed'
  | 'file_hash_changed' | 'media_duration_changed';

export type Observation = {
  type: ObservationType;
  locator: string;
  before: string | number | null;
  after: string | number | null;
  statement: string;
};

const TEMPLATES: Record<ObservationType, (o: Omit<Observation, 'statement'>, a: string, b: string) => string> = {
  page_count_changed: (o, a, b) => `The ${a} version contains ${o.before} pages; the ${b} version contains ${o.after} pages.`,
  page_missing: (o, a, b) => `Page ${o.before} was present in the ${a} version and is absent from the ${b} version.`,
  page_added: (o, a, b) => `Page ${o.after} is present in the ${b} version and was not present in the ${a} version.`,
  text_layer_changed: (o, a, b) => `The text layer of ${o.locator} differs between the ${a} version and the ${b} version.`,
  redaction_region_added: (o, a, b) => `${o.after} redaction region(s) are present on ${o.locator} in the ${b} version that were not present in the ${a} version.`,
  redaction_region_removed: (o, a, b) => `${o.before} redaction region(s) present on ${o.locator} in the ${a} version are not present in the ${b} version.`,
  embedded_timestamp_changed: (o, a, b) => `The embedded document timestamp is ${o.before} in the ${a} version and ${o.after} in the ${b} version.`,
  producer_changed: (o, a, b) => `The embedded producer string is "${o.before}" in the ${a} version and "${o.after}" in the ${b} version.`,
  file_hash_changed: (o, a, b) => `The file hash differs: ${String(o.before).slice(0, 12)}… in the ${a} version, ${String(o.after).slice(0, 12)}… in the ${b} version.`,
  media_duration_changed: (o, a, b) => `The recorded media duration is ${o.before}s in the ${a} version and ${o.after}s in the ${b} version.`,
};

function obs(type: ObservationType, locator: string, before: any, after: any, aLabel: string, bLabel: string): Observation {
  const partial = { type, locator, before, after };
  return { ...partial, statement: TEMPLATES[type](partial, aLabel, bLabel) };
}

export function diffFingerprints(
  a: Fingerprint, b: Fingerprint, aLabel = 'earlier', bLabel = 'later',
): Observation[] {
  const out: Observation[] = [];

  if (a.sha256 !== b.sha256) out.push(obs('file_hash_changed', 'file', a.sha256, b.sha256, aLabel, bLabel));
  if (a.page_count !== null && b.page_count !== null && a.page_count !== b.page_count) {
    out.push(obs('page_count_changed', 'document', a.page_count, b.page_count, aLabel, bLabel));
  }
  if (a.embedded_timestamp && b.embedded_timestamp && a.embedded_timestamp !== b.embedded_timestamp) {
    out.push(obs('embedded_timestamp_changed', 'document', a.embedded_timestamp, b.embedded_timestamp, aLabel, bLabel));
  }
  if (a.producer && b.producer && a.producer !== b.producer) {
    out.push(obs('producer_changed', 'document', a.producer, b.producer, aLabel, bLabel));
  }
  if (a.duration_s != null && b.duration_s != null && a.duration_s !== b.duration_s) {
    out.push(obs('media_duration_changed', 'media', a.duration_s, b.duration_s, aLabel, bLabel));
  }

  // Page-level observations require page fingerprints on BOTH sides.
  if (a.pages && b.pages) {
    // Pages are identified by their content key so re-pagination does not read as deletion.
    const key = (p: { text: string | null; page: number }) =>
      (p.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) || `#${p.page}`;
    const aKeys = new Map(a.pages.map((p) => [key(p), p]));
    const bKeys = new Map(b.pages.map((p) => [key(p), p]));

    for (const [k, p] of aKeys) {
      if (!bKeys.has(k)) out.push(obs('page_missing', `page ${p.page}`, p.page, null, aLabel, bLabel));
    }
    for (const [k, p] of bKeys) {
      if (!aKeys.has(k)) out.push(obs('page_added', `page ${p.page}`, null, p.page, aLabel, bLabel));
    }
    for (const [k, ap] of aKeys) {
      const bp = bKeys.get(k);
      if (!bp) continue;
      if (ap.text !== null && bp.text !== null && ap.text !== bp.text) {
        out.push(obs('text_layer_changed', `page ${bp.page}`, null, null, aLabel, bLabel));
      }
      const ar = ap.redactions?.length ?? 0;
      const br = bp.redactions?.length ?? 0;
      if (br > ar) out.push(obs('redaction_region_added', `page ${bp.page}`, ar, br - ar, aLabel, bLabel));
      if (ar > br) out.push(obs('redaction_region_removed', `page ${bp.page}`, ar - br, br, aLabel, bLabel));
    }
  }

  return out;
}
