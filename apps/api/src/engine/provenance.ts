/** Nothing may exist in either surface without provenance. This is the only way to make it. */
import { q } from '../db.js';
import { id } from '../ids.js';

export async function recordProvenance(p: {
  event_id: string;
  channel: string;
  occurred_at: string | Date;
  verbatim_text: string;
  model: string;
  prompt_version: string;
  confidence: number;
  extractor: 'llm' | 'rule';
  rule_id?: string | null;
}): Promise<string> {
  const pid = id('prov');
  await q(
    `INSERT INTO provenance (id,event_id,channel,occurred_at,verbatim_text,model,prompt_version,confidence,extractor,rule_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [pid, p.event_id, p.channel, p.occurred_at, p.verbatim_text, p.model, p.prompt_version,
     p.confidence, p.extractor, p.rule_id ?? null],
  );
  return pid;
}
