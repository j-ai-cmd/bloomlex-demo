/**
 * THE WORKFLOW ENGINE.
 *
 * ONE code path. A simulated event today and a real BloomLex Ava webhook later enter
 * here identically — the only difference is event.source. There is no public BloomLex
 * API, webhook or developer documentation at the time of writing; the event contract is
 * a PROPOSAL designed so that the webhook can replace the simulator without touching any
 * workflow code below this line.
 */
import { q, one } from '../db.js';
import { id } from '../ids.js';
import { Run } from './run.js';
import { recordProvenance } from './provenance.js';
import * as AI from '../ai/index.js';
import { LanguageRuleViolation } from '../ai/guard.js';
import { band, decisionText } from '../config/confidence.js';
import { resolveDate } from '../core/dates/rules.js';
import { todayInTz, ISODate } from '../core/time.js';
import { dedupKey, changedFields, subjectTokens, isSupersession } from '../core/dedup.js';
import { transition } from '../core/states.js';
import { fingerprintFile } from '../core/fingerprint.js';
import { diffFingerprints } from '../core/diff.js';

const asDate = (v: any): ISODate | null => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

// ------------------------------------------------------------------ matter.opened
export async function matterOpened(run: Run, ev: any) {
  const p = ev.payload;
  await run.step({ kind: 'deterministic', name: 'upsert_matter', input: { matter_ref: p.matter_ref } }, async () => {
    let client = await one(`SELECT * FROM client WHERE name=$1`, [p.client?.name]);
    if (!client && p.client?.name) {
      const cid = id('cli');
      await q(`INSERT INTO client (id,name,phone,email) VALUES ($1,$2,$3,$4)`,
        [cid, p.client.name, p.client.phone ?? null, p.client.email ?? null]);
      client = { id: cid };
    }
    const mid = id('mat');
    await q(
      `INSERT INTO matter (id,matter_ref,client_id,charges,next_court_date,key_dates,crown_contact)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (matter_ref) DO NOTHING`,
      [mid, p.matter_ref, client?.id ?? null, p.charges ?? [], p.key_dates?.next_court_date ?? null,
       JSON.stringify(p.key_dates ?? {}), p.crown_contact ?? null],
    );
    if (client?.id && p.client?.name) {
      const m = await one(`SELECT id FROM matter WHERE matter_ref=$1`, [p.matter_ref]);
      await q(`INSERT INTO person (id,name,role,matter_id) VALUES ($1,$2,'client',$3) ON CONFLICT DO NOTHING`,
        [id('per'), p.client.name, m!.id]);
    }
    return { matter_ref: p.matter_ref };
  });
}

// -------------------------------------------------- ava.conversation.completed
export async function avaConversationCompleted(run: Run, ev: any) {
  const transcript: string = ev.payload.transcript;
  const channel: string = ev.channel ?? ev.payload.channel ?? 'phone';
  const today = todayInTz(new Date(ev.occurred_at));

  const matters = await q(`SELECT id, matter_ref, next_court_date FROM matter`);
  const refs = matters.map((m) => m.matter_ref);

  const extraction = await run.step(
    { kind: 'llm', name: 'extract_commitments', input: { transcript_chars: transcript.length },
      prompt_version: AI.PROMPT_VERSIONS.extract_commitments, model: AI.modelName() },
    () => AI.extractCommitments(transcript, refs, ev.payload.matter_ref ?? null),
  );

  const results: any[] = [];
  for (const c of extraction.value.commitments) {
    results.push(await ingestCommitment(run, ev, c, { today, channel, matters, extractionModel: extraction.model }));
  }
  return results;
}

async function ingestCommitment(run: Run, ev: any, c: any, ctx: {
  today: ISODate; channel: string; matters: any[]; extractionModel: string;
}) {
  const b = band('extraction', c.confidence);

  // ---- matter resolution (deterministic; a miss is flagged, never guessed)
  const matter = await run.step(
    { kind: 'deterministic', name: 'resolve_matter', input: { matter_ref: c.matter_ref, verbatim: c.verbatim } },
    async () => {
      if (c.matter_ref) {
        const m = ctx.matters.find((m) => m.matter_ref.toLowerCase() === String(c.matter_ref).toLowerCase());
        if (m) return m;
      }
      const nameHit = c.person_name
        ? await one(`SELECT m.* FROM matter m JOIN person p ON p.matter_id=m.id
                     WHERE lower(p.name) = lower($1) LIMIT 1`, [c.person_name])
        : null;
      return nameHit ?? null;
    },
  );

  const provId = await recordProvenance({
    event_id: ev.id, channel: ctx.channel, occurred_at: ev.occurred_at,
    verbatim_text: c.verbatim, model: ctx.extractionModel,
    prompt_version: AI.PROMPT_VERSIONS.extract_commitments,
    confidence: c.confidence, extractor: 'llm',
  });

  // ---- LOW CONFIDENCE: create nothing. Raise a review item.
  if (b === 'low') {
    const ri = id('rev');
    await run.step(
      { kind: 'deterministic', name: 'confidence_policy', confidence: c.confidence,
        decision: decisionText('extraction', c.confidence) + ' -> create nothing, raise review item' },
      () => q(`INSERT INTO review_item (id,kind,matter_id,title,payload,provenance_id)
               VALUES ($1,'low_confidence_extraction',$2,$3,$4,$5)`,
        [ri, matter?.id ?? null, c.action_text.slice(0, 120),
         JSON.stringify({ extracted: c }), provId]),
    );
    return { outcome: 'review_item', review_item_id: ri };
  }

  // ---- DETERMINISTIC DATE RESOLUTION. The LLM never computes a date.
  const resolution = await run.step(
    { kind: 'deterministic', name: 'resolve_date', input: { date_phrase: c.date_phrase } },
    () => c.date_phrase
      ? resolveDate(c.date_phrase, { today: ctx.today, nextCourtDate: asDate(matter?.next_court_date) })
      : { kind: 'unresolved' as const, rule_id: 'no_date_phrase', phrase: '', reason: 'no date phrase was spoken' },
  );

  let due_date: ISODate | null = null;
  let precision = 'unresolved';
  let status: string = 'active';
  let candidates: { date: string; label: string }[] = [];

  if (resolution.kind === 'point') {
    due_date = resolution.date; precision = resolution.precision;
    status = b === 'medium' ? 'needs_confirmation' : 'active';
  } else if (resolution.kind === 'range') {
    // A RANGE IS NEVER COLLAPSED TO A GUESS.
    candidates = resolution.candidates; precision = 'unresolved'; status = 'needs_confirmation';
  } else {
    precision = 'unresolved'; status = 'needs_confirmation';
  }
  if (!matter) status = 'needs_confirmation';

  // ---- dedup / supersession (deterministic)
  const key = dedupKey(matter?.id ?? null, c.action_text, due_date);
  let existing = await one(
    `SELECT * FROM commitment WHERE dedup_key=$1 AND status NOT IN ('superseded','cancelled') ORDER BY created_at DESC LIMIT 1`,
    [key],
  );
  // No exact hash hit: look for the SAME obligation restated with different information.
  if (!existing) {
    const tokens = subjectTokens(c.action_text, c.date_phrase);
    const siblings = await q(
      `SELECT c.*, p.verbatim_text FROM commitment c JOIN provenance p ON p.id=c.provenance_id
       WHERE c.status NOT IN ('superseded','cancelled')
         AND ($1::text IS NULL OR c.matter_id = $1)
         AND ($1::text IS NOT NULL OR c.matter_id IS NULL)
       ORDER BY c.created_at DESC`, [matter?.id ?? null]);
    for (const s of siblings) {
      if (isSupersession(tokens, subjectTokens(s.action_text, null))) { existing = s; break; }
    }
  }

  const cid = id('cmt');
  const insert = async () => {
    await q(
      `INSERT INTO commitment (id,matter_id,person_id,person_name,action_text,category,direction,
        due_date,time_precision,status,dedup_key,date_rule_id,provenance_id)
       VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [cid, matter?.id ?? null, c.person_name, c.action_text, c.category, c.direction,
       due_date, precision, status, key, (resolution as any).rule_id, provId],
    );
    for (const [i, cand] of candidates.entries()) {
      await q(`INSERT INTO commitment_date_candidate (id,commitment_id,candidate_date,label,rule_id,rank)
               VALUES ($1,$2,$3,$4,$5,$6)`,
        [id('cdc'), cid, cand.date, cand.label, (resolution as any).rule_id, i]);
    }
  };

  if (existing) {
    const diff = changedFields(existing, { due_date, category: c.category, action_text: c.action_text },
      ['due_date', 'category', 'action_text']);
    if (Object.keys(diff).length === 0) {
      await run.step({ kind: 'deterministic', name: 'dedup_merge', decision: `identical to ${existing.id}; merged, no new record` },
        () => Promise.resolve({ merged_into: existing.id }));
      return { outcome: 'merged', commitment_id: existing.id };
    }
    // SUPERSESSION: later information never silently overwrites earlier information.
    await run.step({ kind: 'deterministic', name: 'supersede', decision: `changed: ${Object.keys(diff).join(', ')}` }, async () => {
      await insert();
      await transition({ entity: 'commitment', entityId: existing.id, to: 'superseded',
        trigger: 'superseded_by_later_information', actorKind: 'system', evidence: { by: cid, changed: diff } });
      await q(`INSERT INTO supersession (id,entity_type,superseded_id,superseding_id,changed_fields,reason)
               VALUES ($1,'commitment',$2,$3,$4,$5)`,
        [id('sup'), existing.id, cid, JSON.stringify(diff), 'later information received on the same obligation']);
      return { superseded: existing.id, by: cid, changed: diff };
    });
    return { outcome: 'superseded', commitment_id: cid, superseded: existing.id };
  }

  await run.step(
    { kind: 'deterministic', name: 'create_commitment', confidence: c.confidence,
      rule_id: (resolution as any).rule_id,
      decision: `${decisionText('extraction', c.confidence)}; date ${resolution.kind} via ${(resolution as any).rule_id} -> status ${status}` },
    insert,
  );

  if (status === 'needs_confirmation' && resolution.kind !== 'point') {
    await q(`INSERT INTO review_item (id,kind,matter_id,title,payload,candidates,provenance_id)
             VALUES ($1,'ambiguous_date',$2,$3,$4,$5,$6)`,
      [id('rev'), matter?.id ?? null, c.action_text.slice(0, 120),
       JSON.stringify({ commitment_id: cid, phrase: (resolution as any).phrase, reason: (resolution as any).reason }),
       JSON.stringify(candidates), provId]);
  }
  if (!matter) {
    await q(`INSERT INTO review_item (id,kind,title,payload,provenance_id)
             VALUES ($1,'unresolved_matter',$2,$3,$4)`,
      [id('rev'), c.action_text.slice(0, 120), JSON.stringify({ commitment_id: cid, hint: c.matter_ref ?? c.person_name }), provId]);
  }
  return { outcome: 'created', commitment_id: cid, status, due_date };
}

// ------------------------------------------------- disclosure.request.sent
export async function disclosureRequestSent(run: Run, ev: any) {
  const p = ev.payload;
  const matter = await one(`SELECT * FROM matter WHERE matter_ref=$1`, [p.matter_ref]);
  if (!matter) throw new Error(`unknown matter_ref ${p.matter_ref}`);

  const provId = await recordProvenance({
    event_id: ev.id, channel: p.channel, occurred_at: p.sent_at,
    verbatim_text: `Disclosure request letter ${p.letter_ref ?? ''} listing ${p.items.length} items`,
    model: 'n/a', prompt_version: 'n/a', confidence: 1, extractor: 'rule', rule_id: 'request_register_ingest',
  });

  return run.step({ kind: 'deterministic', name: 'create_request_register', input: { items: p.items.length } }, async () => {
    const rid = id('reg');
    await q(`INSERT INTO request_register (id,matter_id,sent_at,channel,letter_ref) VALUES ($1,$2,$3,$4,$5)`,
      [rid, matter.id, p.sent_at, p.channel, p.letter_ref ?? 'REQ-1']);
    const ids: string[] = [];
    for (const [i, item] of p.items.entries()) {
      const iid = id('itm');
      ids.push(iid);
      await q(`INSERT INTO request_item (id,register_id,matter_id,seq,description,category,state,first_requested_at,provenance_id)
               VALUES ($1,$2,$3,$4,$5,$6,'Requested',$7,$8)`,
        [iid, rid, matter.id, i + 1, item.description, item.category ?? 'other', p.sent_at, provId]);
      await q(`INSERT INTO state_transition (id,entity_type,entity_id,from_state,to_state,trigger,actor_kind)
               VALUES ($1,'request_item',$2,NULL,'Requested','disclosure.request.sent','system')`, [id('st'), iid]);
    }
    return { register_id: rid, items: ids.length };
  });
}

// --------------------------------------------- disclosure.package.received
export async function disclosurePackageReceived(run: Run, ev: any) {
  const p = ev.payload;
  const matter = await one(`SELECT * FROM matter WHERE matter_ref=$1`, [p.matter_ref]);
  if (!matter) throw new Error(`unknown matter_ref ${p.matter_ref}`);

  const provId = await recordProvenance({
    event_id: ev.id, channel: p.source, occurred_at: p.received_at,
    verbatim_text: `Package "${p.label ?? 'unlabelled'}" received via ${p.source} containing ${p.files.length} files`,
    model: 'n/a', prompt_version: 'n/a', confidence: 1, extractor: 'rule', rule_id: 'package_ingest',
  });

  // 1. RECEIVED
  const pkgId = await run.step({ kind: 'deterministic', name: 'create_package', input: { source: p.source, files: p.files.length } }, async () => {
    const pid = id('pkg');
    await q(`INSERT INTO package (id,matter_id,source,received_at,label,state,provenance_id)
             VALUES ($1,$2,$3,$4,$5,'Received',$6)`,
      [pid, matter.id, p.source, p.received_at, p.label ?? 'Package', provId]);
    await q(`INSERT INTO state_transition (id,entity_type,entity_id,from_state,to_state,trigger,actor_kind)
             VALUES ($1,'package',$2,NULL,'Received','disclosure.package.received','system')`, [id('st'), pid]);
    return pid;
  });

  // 2. INDEXED — hashes, page counts, fingerprints. Deterministic.
  const files = await run.step({ kind: 'io', name: 'index_files' }, async () => {
    const out: any[] = [];
    for (const f of p.files) {
      const fp = f.path ? await fingerprintFile(f.path, f.sidecar) : {
        sha256: f.sha256 ?? 'unknown', bytes: f.bytes ?? 0, page_count: f.page_count ?? null,
        duration_s: f.duration_s ?? null, producer: null, embedded_timestamp: null,
        pages: f.sidecar?.pages ?? null, out_of_scope: [],
      };
      const fid = id('file');
      await q(`INSERT INTO dfile (id,package_id,matter_id,original_filename,mime,bytes,sha256,page_count,duration_s,logical_key,storage_path,fingerprint)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [fid, pkgId, matter.id, f.filename, f.mime ?? 'application/octet-stream', fp.bytes, fp.sha256,
         fp.page_count, fp.duration_s, f.logical_key ?? null, f.path ?? null, JSON.stringify(fp)]);
      out.push({ id: fid, filename: f.filename, fingerprint: fp, logical_key: f.logical_key ?? null, hint: f.hint ?? '' });
    }
    return out;
  });
  await transition({ entity: 'package', entityId: pkgId, to: 'Indexed', trigger: 'files_indexed', actorKind: 'system' });

  // 3. CLASSIFIED — LLM per file, confidence policy applied deterministically.
  const classified: any[] = [];
  for (const f of files) {
    const hint = `${f.hint} pages=${f.fingerprint.page_count ?? ''} duration=${f.fingerprint.duration_s ?? ''}`;
    const r = await run.step(
      { kind: 'llm', name: `classify:${f.filename}`, model: AI.modelName(), prompt_version: AI.PROMPT_VERSIONS.classify_file },
      () => AI.classifyFile(f.filename, hint),
    );
    const c = r.value;
    const b = band('classification', c.confidence);
    const cprov = await recordProvenance({
      event_id: ev.id, channel: p.source, occurred_at: p.received_at,
      verbatim_text: `Filename as served: "${f.filename}"`, model: r.model,
      prompt_version: AI.PROMPT_VERSIONS.classify_file, confidence: c.confidence, extractor: 'llm',
    });
    await run.step({ kind: 'deterministic', name: `classification_policy:${f.filename}`, confidence: c.confidence,
      decision: decisionText('classification', c.confidence) }, async () => {
      if (b === 'low') {
        await q(`INSERT INTO review_item (id,kind,matter_id,title,payload,provenance_id)
                 VALUES ($1,'low_confidence_extraction',$2,$3,$4,$5)`,
          [id('rev'), matter.id, `Unclassified file: ${f.filename}`, JSON.stringify({ file_id: f.id, proposed: c }), cprov]);
        return { stored: false };
      }
      await q(`INSERT INTO classification (id,file_id,doc_type,author_or_officer,occurrence_no,event_date,pages,duration_s,description,confidence,provenance_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [id('cls'), f.id, c.doc_type, c.author_or_officer, c.occurrence_no, c.event_date,
         c.pages ?? f.fingerprint.page_count, c.duration_s ?? f.fingerprint.duration_s, c.description, c.confidence, cprov]);
      classified.push({ file_id: f.id, doc_type: c.doc_type, description: c.description, author_or_officer: c.author_or_officer });
      return { stored: true };
    });
  }
  await transition({ entity: 'package', entityId: pkgId, to: 'Classified', trigger: 'files_classified', actorKind: 'ai' });

  // 4. RECONCILED — LLM proposes, deterministic code decides.
  const items = await q(`SELECT id, description, category, state FROM request_item WHERE matter_id=$1 ORDER BY seq`, [matter.id]);
  if (classified.length && items.length) {
    const proposal = await run.step(
      { kind: 'llm', name: 'propose_matches', model: AI.modelName(), prompt_version: AI.PROMPT_VERSIONS.propose_matches },
      () => AI.proposeMatches(classified, items.map((i) => ({ request_item_id: i.id, description: i.description, category: i.category }))),
    );
    for (const m of proposal.value.matches) {
      const b = band('match', m.confidence);
      const mprov = await recordProvenance({
        event_id: ev.id, channel: p.source, occurred_at: p.received_at,
        verbatim_text: m.evidence, model: proposal.model,
        prompt_version: AI.PROMPT_VERSIONS.propose_matches, confidence: m.confidence, extractor: 'llm',
      });
      await run.step({ kind: 'deterministic', name: 'match_policy', confidence: m.confidence,
        decision: decisionText('match', m.confidence) }, async () => {
        if (b === 'low') {
          // LOW-CONFIDENCE MATCHES NEVER AUTO-ALTER MATTER STATE.
          await q(`INSERT INTO review_item (id,kind,matter_id,title,payload,provenance_id)
                   VALUES ($1,'low_confidence_match',$2,$3,$4,$5)`,
            [id('rev'), matter.id, 'Possible match requires lawyer review',
             JSON.stringify({ ...m }), mprov]);
          return { applied: false };
        }
        await q(`INSERT INTO match (id,request_item_id,file_id,confidence,evidence,state,provenance_id)
                 VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (request_item_id,file_id) DO NOTHING`,
          [id('mch'), m.request_item_id, m.file_id, m.confidence, JSON.stringify({ evidence: m.evidence }),
           b === 'high' ? 'confirmed' : 'proposed', mprov]);
        return { applied: true, state: b === 'high' ? 'confirmed' : 'proposed' };
      });
    }
    // Deterministic state resolution per request item.
    for (const it of items) {
      const st = await resolveItemState(it.id);
      if (st && st !== it.state) {
        await run.step({ kind: 'deterministic', name: `request_item_state:${it.id}`, decision: `${it.state} -> ${st}` },
          async () => {
            await transition({ entity: 'request_item', entityId: it.id, to: st, trigger: 'reconciliation', actorKind: 'system',
              evidence: { package_id: pkgId } });
            // The clock stops only while an item is actually satisfied. Leaving that state
            // restarts the age from the original request date, never from the reversal.
            if (st === 'Satisfied') {
              await q(`UPDATE request_item SET satisfied_at=$1 WHERE id=$2 AND satisfied_at IS NULL`, [p.received_at, it.id]);
            } else {
              await q(`UPDATE request_item SET satisfied_at=NULL WHERE id=$1`, [it.id]);
            }
          });
      }
    }
  }
  await transition({ entity: 'package', entityId: pkgId, to: 'Reconciled', trigger: 'reconciled', actorKind: 'system' });

  // 5. DIFF re-served material — deterministic, observable facts only.
  let anomalies = 0;
  for (const f of files) {
    if (!f.logical_key) continue;
    const prior = await q(
      `SELECT fv.*, d.fingerprint, pk.label FROM file_version fv
       JOIN dfile d ON d.id = fv.file_id JOIN package pk ON pk.id = fv.package_id
       WHERE fv.logical_key=$1 AND fv.matter_id=$2 ORDER BY fv.seq DESC`,
      [f.logical_key, matter.id]);
    const seq = prior.length + 1;
    const vid = id('ver');
    await q(`INSERT INTO file_version (id,logical_key,matter_id,file_id,package_id,seq,received_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`, [vid, f.logical_key, matter.id, f.id, pkgId, seq, p.received_at]);
    if (!prior.length) continue;
    const prev = prior[0];
    const obs = await run.step(
      { kind: 'deterministic', name: `diff:${f.logical_key}`, input: { from_seq: prev.seq, to_seq: seq } },
      () => diffFingerprints(prev.fingerprint, f.fingerprint, prev.label, p.label ?? 'this package'),
    );
    if (obs.length) {
      anomalies += obs.length;
      await q(`INSERT INTO diff (id,matter_id,from_version_id,to_version_id,observations) VALUES ($1,$2,$3,$4,$5)`,
        [id('dif'), matter.id, prev.id, vid, JSON.stringify(obs)]);
      const dprov = await recordProvenance({
        event_id: ev.id, channel: p.source, occurred_at: p.received_at,
        verbatim_text: obs.map((o: any) => o.statement).join(' '),
        model: 'n/a', prompt_version: 'n/a', confidence: 1, extractor: 'rule', rule_id: 'diff_engine',
      });
      await q(`INSERT INTO review_item (id,kind,matter_id,title,payload,provenance_id)
               VALUES ($1,'anomaly_review',$2,$3,$4,$5)`,
        [id('rev'), matter.id, `Version differences observed in ${f.filename}`,
         JSON.stringify({ file_id: f.id, observations: obs }), dprov]);
    }
  }
  if (anomalies) {
    const affected = await q(
      `SELECT DISTINCT m.request_item_id AS id, ri.state FROM match m
       JOIN request_item ri ON ri.id = m.request_item_id
       WHERE ri.matter_id = $1 AND m.state = 'confirmed'`, [matter.id]);
    for (const it of affected) {
      const st = await resolveItemState(it.id);
      if (st && st !== it.state) {
        await run.step({ kind: 'deterministic', name: `request_item_state_after_diff:${it.id}`, decision: `${it.state} -> ${st}` },
          async () => {
            await transition({ entity: 'request_item', entityId: it.id, to: st, trigger: 'diff_observations',
              actorKind: 'system', evidence: { package_id: pkgId } });
            if (st !== 'Satisfied') await q(`UPDATE request_item SET satisfied_at=NULL WHERE id=$1`, [it.id]);
          });
      }
    }
  }

  await transition({ entity: 'package', entityId: pkgId,
    to: anomalies ? 'Anomalies Detected' : 'Human Reviewed',
    trigger: anomalies ? 'diff_observations_present' : 'no_observations',
    actorKind: 'system', evidence: { observations: anomalies } });

  return { package_id: pkgId, files: files.length, anomalies };
}

/**
 * DETERMINISTIC request-item state resolution.
 * Only confirmed matches count. Satisfied requires at least one confirmed match and no
 * outstanding proposed match on the same item.
 */
export async function resolveItemState(itemId: string): Promise<string | null> {
  const r = await one(
    `SELECT
       count(*) FILTER (WHERE state='confirmed') AS confirmed,
       count(*) FILTER (WHERE state='proposed')  AS proposed
     FROM match WHERE request_item_id=$1`, [itemId]);
  const confirmed = Number(r?.confirmed ?? 0);
  const proposed = Number(r?.proposed ?? 0);
  if (confirmed === 0 && proposed === 0) return null;

  // An item whose material arrived with pages observed absent is PARTIALLY RECEIVED, not
  // Satisfied. This is an observation about page presence, not an assessment of whether
  // what arrived is legally sufficient — that judgement is the lawyer's alone.
  if (confirmed > 0) {
    const gap = await one(
      `SELECT 1 AS hit FROM diff df
       JOIN file_version fv ON fv.id = df.to_version_id OR fv.id = df.from_version_id
       JOIN match m ON m.file_id = fv.file_id
       WHERE m.request_item_id = $1 AND m.state = 'confirmed'
         AND df.observations::text LIKE '%page_missing%' LIMIT 1`, [itemId]);
    if (gap) return 'Partially Received';
  }
  if (confirmed > 0 && proposed === 0) return 'Satisfied';
  if (confirmed > 0 && proposed > 0) return 'Partially Received';
  return 'Needs Review';
}

export const HANDLERS: Record<string, (run: Run, ev: any) => Promise<any>> = {
  'matter.opened': matterOpened,
  'ava.conversation.completed': avaConversationCompleted,
  'disclosure.request.sent': disclosureRequestSent,
  'disclosure.package.received': disclosurePackageReceived,
};
