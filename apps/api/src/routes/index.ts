import type { FastifyInstance } from 'fastify';
import { q, one } from '../db.js';
import { id } from '../ids.js';
import { ingest } from '../engine/ingress.js';
import { bus, trace } from '../engine/run.js';
import { sweep } from '../core/sweeper.js';
import { itemClocks, matterRollup, firmRollup } from '../core/clock.js';
import { rulesTable } from '../core/dates/rules.js';
import { THRESHOLDS } from '../config/confidence.js';
import { MACHINES } from '../core/states.js';
import { TZ, FIRM_NAME, DEMO_NOTICE } from '../config/firm.js';
import { OUT_OF_SCOPE } from '../core/fingerprint.js';
import { transition } from '../core/states.js';
import { HAS_KEY, modelName } from '../ai/index.js';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { makeZip } from '../core/zip.js';
import { fileURLToPath } from 'node:url';

export default async function routes(app: FastifyInstance) {
  // ---------------------------------------------------------------- meta
  app.get('/v1/meta', async () => ({
    firm: FIRM_NAME,
    timezone: TZ,
    demo_data: true,
    demo_notice: DEMO_NOTICE,
    ai: { provider: 'kimi', configured: HAS_KEY(), model: modelName() },
    bloomlex_integration: false,
    bloomlex_note:
      'No BloomLex integration exists. There is no public BloomLex API, webhook or developer ' +
      'documentation. The event contract is a proposal; the simulator and a future Ava webhook ' +
      'take an identical code path.',
    confidence_policy: THRESHOLDS,
    date_rules: rulesTable(),
    state_machines: MACHINES,
    diff_out_of_scope: OUT_OF_SCOPE,
  }));

  // ---------------------------------------------------------------- ingress
  app.post('/v1/events', async (req: any, reply) => {
    const key = req.headers['idempotency-key'] ?? req.body?.idempotency_key;
    const r = await ingest({ ...req.body, idempotency_key: key, source: req.body?.source ?? 'simulator' });
    reply.code((r as any).error ? 207 : 200);
    return r;
  });

  /** The stage button: raw text in, whole pipeline runs, trace returned. */
  app.post('/v1/simulate/ava', async (req: any) => {
    const r = await ingest({
      type: 'ava.conversation.completed',
      channel: req.body.channel ?? 'phone',
      occurred_at: req.body.occurred_at,
      payload: { transcript: req.body.text ?? req.body.transcript, matter_ref: req.body.matter_ref, channel: req.body.channel ?? 'phone' },
      source: 'simulator',
    });
    return { ...r, trace: await trace(r.run_id!) };
  });

  app.post('/v1/simulate/:type', async (req: any) => {
    const r = await ingest({ type: req.params.type, payload: req.body, source: 'simulator' });
    return { ...r, trace: await trace(r.run_id!) };
  });

  app.post('/v1/sweep', async () => sweep());

  // ---------------------------------------------------------------- runs + SSE
  app.get('/v1/runs/:id', async (req: any, reply) => {
    const t = await trace(req.params.id);
    if (!t) return reply.code(404).send({ error: 'not found' });
    return t;
  });

  app.get('/v1/runs/:id/stream', async (req: any, reply) => {
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'access-control-allow-origin': '*',
    });
    const send = (d: any) => reply.raw.write(`data: ${JSON.stringify(d)}\n\n`);
    const existing = await trace(req.params.id);
    if (existing) for (const s of existing.steps) send({ type: 'step', step: s });
    const listener = (d: any) => send(d);
    bus.on(req.params.id, listener);
    const ka = setInterval(() => reply.raw.write(': keepalive\n\n'), 15000);
    req.raw.on('close', () => { bus.off(req.params.id, listener); clearInterval(ka); });
  });

  // ---------------------------------------------------------------- matters
  app.get('/v1/matters', async () => q(
    `SELECT m.*, c.name AS client_name,
      (SELECT count(*) FROM request_item ri WHERE ri.matter_id=m.id AND ri.state NOT IN ('Satisfied','Refused')) AS outstanding_items,
      (SELECT count(*) FROM review_item r WHERE r.matter_id=m.id AND r.status='open') AS open_reviews
     FROM matter m LEFT JOIN client c ON c.id=m.client_id ORDER BY m.matter_ref`));

  app.get('/v1/matters/:id', async (req: any, reply) => {
    const m = await one(`SELECT m.*, c.name AS client_name, c.phone, c.email
                         FROM matter m LEFT JOIN client c ON c.id=m.client_id
                         WHERE m.id=$1 OR m.matter_ref=$1`, [req.params.id]);
    if (!m) return reply.code(404).send({ error: 'not found' });
    return { ...m, rollup: await matterRollup(m.id) };
  });

  // ---------------------------------------------------------------- calendar
  app.get('/v1/commitments', async (req: any) => {
    const { from, to, status, matter_id } = req.query;
    return q(
      `SELECT c.*, m.matter_ref, p.verbatim_text, p.channel, p.occurred_at AS source_occurred_at,
              p.confidence, p.model, p.prompt_version,
              (SELECT json_agg(json_build_object('date',cd.candidate_date,'label',cd.label) ORDER BY cd.rank)
                 FROM commitment_date_candidate cd WHERE cd.commitment_id=c.id) AS candidates,
              (SELECT json_build_object('superseded_id',s.superseded_id,'changed',s.changed_fields)
                 FROM supersession s WHERE s.superseding_id=c.id LIMIT 1) AS supersedes
       FROM commitment c
       LEFT JOIN matter m ON m.id=c.matter_id
       JOIN provenance p ON p.id=c.provenance_id
       WHERE ($1::date IS NULL OR c.due_date >= $1)
         AND ($2::date IS NULL OR c.due_date <= $2)
         AND ($3::text IS NULL OR c.status = $3)
         AND ($4::text IS NULL OR c.matter_id = $4)
       ORDER BY c.due_date NULLS LAST, c.created_at`,
      [from ?? null, to ?? null, status ?? null, matter_id ?? null]);
  });

  app.get('/v1/calendar', async (req: any) => {
    const { from, to } = req.query;
    const rows = await q(
      `SELECT c.*, m.matter_ref, p.verbatim_text, p.channel, p.confidence
       FROM commitment c LEFT JOIN matter m ON m.id=c.matter_id JOIN provenance p ON p.id=c.provenance_id
       WHERE c.status IN ('active','missed','fulfilled') AND c.due_date BETWEEN $1 AND $2
       ORDER BY c.due_date, c.time_precision`, [from, to]);
    const days: Record<string, any[]> = {};
    for (const r of rows) {
      const d = r.due_date.toISOString ? r.due_date.toISOString().slice(0, 10) : String(r.due_date).slice(0, 10);
      (days[d] ??= []).push(r);
    }
    return { from, to, days };
  });

  app.get('/v1/commitments/:id/history', async (req: any) => {
    const chain = await q(
      `WITH RECURSIVE back AS (
         SELECT c.* FROM commitment c WHERE c.id=$1
         UNION ALL
         SELECT c2.* FROM commitment c2 JOIN supersession s ON s.superseded_id=c2.id
         JOIN back b ON s.superseding_id=b.id
       ) SELECT b.*, p.verbatim_text, p.channel, p.occurred_at AS source_occurred_at, p.confidence
         FROM back b JOIN provenance p ON p.id=b.provenance_id`, [req.params.id]);
    const links = await q(`SELECT * FROM supersession WHERE superseding_id=$1 OR superseded_id=$1`, [req.params.id]);
    const transitions = await q(`SELECT * FROM state_transition WHERE entity_type='commitment' AND entity_id=$1 ORDER BY occurred_at`, [req.params.id]);
    return { chain, links, transitions };
  });

  app.post('/v1/commitments/:id/confirm', async (req: any, reply) => {
    const { date, actor_id } = req.body ?? {};
    const c = await one(`SELECT * FROM commitment WHERE id=$1`, [req.params.id]);
    if (!c) return reply.code(404).send({ error: 'not found' });
    await q(`UPDATE commitment SET due_date=$1, time_precision='allday' WHERE id=$2`, [date, req.params.id]);
    await transition({ entity: 'commitment', entityId: req.params.id, to: 'active',
      trigger: 'human_confirmed_date', actorKind: 'human', actorId: actor_id ?? null, evidence: { date } });
    await q(`UPDATE review_item SET status='resolved', resolved_by_actor=$2, resolved_at=now()
             WHERE kind='ambiguous_date' AND payload->>'commitment_id'=$1`, [req.params.id, actor_id ?? null]);
    return one(`SELECT * FROM commitment WHERE id=$1`, [req.params.id]);
  });

  // ---------------------------------------------------------------- disclosure
  app.get('/v1/matters/:id/register', async (req: any) => {
    const m = await one(`SELECT id FROM matter WHERE id=$1 OR matter_ref=$1`, [req.params.id]);
    const items = await q(
      `SELECT ri.*, p.verbatim_text, p.channel FROM request_item ri
       JOIN provenance p ON p.id=ri.provenance_id WHERE ri.matter_id=$1 ORDER BY ri.seq`, [m!.id]);
    const clocks = await itemClocks(m!.id);
    const byId = new Map(clocks.map((c) => [c.request_item_id, c]));
    return { items: items.map((i) => ({ ...i, clock: byId.get(i.id) })), rollup: await matterRollup(m!.id) };
  });

  app.get('/v1/packages', async (req: any) => q(
    `SELECT pk.*, (SELECT count(*) FROM dfile d WHERE d.package_id=pk.id) AS file_count
     FROM package pk ${req.query.matter_id ? 'WHERE pk.matter_id=$1' : ''} ORDER BY pk.received_at`,
    req.query.matter_id ? [req.query.matter_id] : []));

  app.get('/v1/packages/:id', async (req: any) => {
    const pkg = await one(`SELECT * FROM package WHERE id=$1`, [req.params.id]);
    const files = await q(
      `SELECT d.*, c.doc_type, c.description, c.author_or_officer, c.confidence AS classification_confidence
       FROM dfile d LEFT JOIN classification c ON c.file_id=d.id WHERE d.package_id=$1`, [req.params.id]);
    const transitions = await q(`SELECT * FROM state_transition WHERE entity_type='package' AND entity_id=$1 ORDER BY occurred_at`, [req.params.id]);
    return { package: pkg, files, transitions };
  });

  app.get('/v1/files/:id', async (req: any) => {
    const f = await one(`SELECT * FROM dfile WHERE id=$1`, [req.params.id]);
    const c = await one(`SELECT * FROM classification WHERE file_id=$1`, [req.params.id]);
    const matches = await q(
      `SELECT m.*, ri.description FROM match m JOIN request_item ri ON ri.id=m.request_item_id WHERE m.file_id=$1`, [req.params.id]);
    const versions = await q(`SELECT * FROM file_version WHERE file_id=$1`, [req.params.id]);
    return { file: f, classification: c, matches, versions };
  });

  app.get('/v1/reconciliation', async (req: any) => {
    // Every AI-derived row carries its own provenance: source text, model or fixture,
    // confidence, timestamp, and whether a human has approved it.
    const items = await q(
      `SELECT ri.*, json_agg(json_build_object(
          'match_id', m.id, 'file_id', d.id, 'filename', d.original_filename,
          'confidence', m.confidence, 'state', m.state, 'evidence', m.evidence,
          'doc_type', c.doc_type, 'description', c.description,
          'match_model', mp.model, 'match_prompt_version', mp.prompt_version,
          'match_recorded_at', mp.occurred_at, 'match_source', mp.verbatim_text,
          'classification_model', cp.model, 'classification_confidence', c.confidence,
          'classification_recorded_at', cp.occurred_at, 'classification_source', cp.verbatim_text,
          'approved_by', a.name, 'human_approved', (m.decided_by_actor IS NOT NULL)
        )) FILTER (WHERE m.id IS NOT NULL) AS matches
       FROM request_item ri
       LEFT JOIN match m ON m.request_item_id=ri.id
       LEFT JOIN dfile d ON d.id=m.file_id
       LEFT JOIN classification c ON c.file_id=d.id
       LEFT JOIN provenance mp ON mp.id=m.provenance_id
       LEFT JOIN provenance cp ON cp.id=c.provenance_id
       LEFT JOIN actor a ON a.id=m.decided_by_actor
       WHERE ri.matter_id=$1 GROUP BY ri.id ORDER BY ri.seq`, [req.query.matter_id]);
    return { items, clocks: await itemClocks(req.query.matter_id) };
  });

  /** UNMATCHED / UNREQUESTED MATERIAL — extras can reveal items the firm never knew to ask for. */
  app.get('/v1/unmatched', async (req: any) => q(
    `SELECT * FROM unmatched_file ${req.query.matter_id ? 'WHERE matter_id=$1' : ''}`,
    req.query.matter_id ? [req.query.matter_id] : []));

  app.get('/v1/diffs', async (req: any) => q(
    `SELECT df.*, 'deterministic' AS produced_by, 'diff_engine' AS rule_id, fa.seq AS from_seq, fb.seq AS to_seq,
            da.original_filename AS from_filename, db2.original_filename AS to_filename,
            pa.label AS from_package, pb.label AS to_package
     FROM diff df
     JOIN file_version fa ON fa.id=df.from_version_id JOIN file_version fb ON fb.id=df.to_version_id
     JOIN dfile da ON da.id=fa.file_id JOIN dfile db2 ON db2.id=fb.file_id
     JOIN package pa ON pa.id=fa.package_id JOIN package pb ON pb.id=fb.package_id
     ${req.query.matter_id ? 'WHERE df.matter_id=$1' : ''} ORDER BY df.computed_at DESC`,
    req.query.matter_id ? [req.query.matter_id] : []));

  app.get('/v1/diffs/:id', async (req: any) => {
    const d = await one(`SELECT * FROM diff WHERE id=$1`, [req.params.id]);
    return { ...d, out_of_scope: OUT_OF_SCOPE };
  });

  app.get('/v1/obligations/rollup', async (req: any) =>
    req.query.matter_id ? matterRollup(req.query.matter_id) : firmRollup());

  /** EVIDENCE INDEX: request -> item -> files -> packages -> versions -> received -> source. */
  app.get('/v1/request-items/:id/evidence', async (req: any) => {
    const item = await one(
      `SELECT ri.*, rr.letter_ref, rr.sent_at, rr.channel, m.matter_ref
       FROM request_item ri JOIN request_register rr ON rr.id=ri.register_id
       JOIN matter m ON m.id=ri.matter_id WHERE ri.id=$1`, [req.params.id]);
    const files = await q(
      `SELECT d.*, m.confidence AS match_confidence, m.state AS match_state, m.evidence AS match_evidence,
              c.doc_type, c.description, pk.label AS package_label, pk.source, pk.received_at
       FROM match m JOIN dfile d ON d.id=m.file_id JOIN package pk ON pk.id=d.package_id
       LEFT JOIN classification c ON c.file_id=d.id
       WHERE m.request_item_id=$1 ORDER BY pk.received_at`, [req.params.id]);
    const versions = await q(
      `SELECT fv.*, pk.label, pk.source FROM file_version fv JOIN package pk ON pk.id=fv.package_id
       WHERE fv.file_id = ANY($1::text[]) ORDER BY fv.seq`, [files.map((f) => f.id)]);
    const diffs = await q(
      `SELECT * FROM diff WHERE to_version_id = ANY($1::text[]) OR from_version_id = ANY($1::text[])`,
      [versions.map((v) => v.id)]);
    const followups = await q(`SELECT * FROM followup WHERE request_item_id=$1 ORDER BY sent_at`, [req.params.id]);
    const transitions = await q(
      `SELECT * FROM state_transition WHERE entity_type='request_item' AND entity_id=$1 ORDER BY occurred_at`, [req.params.id]);
    const clocks = (await itemClocks(item!.matter_id)).find((c) => c.request_item_id === req.params.id);
    return { item, clock: clocks, files, versions, diffs, followups, transitions };
  });

  /**
   * Drag a file in during the demo. It is written to disk and then handed to the SAME
   * disclosure.package.received event handler a portal delivery would use — no side door.
   */
  app.post('/v1/files', async (req: any, reply) => {
    const dir = fileURLToPath(new URL('../../../../fixtures/uploads/', import.meta.url));
    await mkdir(dir, { recursive: true });
    let matterRef: string | undefined;
    let source = 'usb';
    let label = 'Dragged in during demo';
    const files: any[] = [];
    for await (const part of req.parts()) {
      if (part.type === 'field') {
        if (part.fieldname === 'matter_ref') matterRef = String(part.value);
        if (part.fieldname === 'source') source = String(part.value);
        if (part.fieldname === 'label') label = String(part.value);
        if (part.fieldname === 'logical_key') files.forEach((f) => (f.logical_key = String(part.value)));
      } else {
        const buf = await part.toBuffer();
        const safe = part.filename.replace(/[^\w.\-]/g, '_');
        const path = `${dir}${Date.now()}_${safe}`;
        await writeFile(path, buf);
        files.push({ filename: part.filename, mime: part.mimetype, path, hint: '' });
      }
    }
    if (!matterRef) return reply.code(400).send({ error: 'matter_ref is required' });
    if (!files.length) return reply.code(400).send({ error: 'no files supplied' });
    const detached = req.query?.stream === '1';
    const r = await ingest({
      type: 'disclosure.package.received', source: 'simulator', detached,
      payload: { matter_ref: matterRef, source, received_at: new Date().toISOString(), label, files },
    });
    return detached ? r : { ...r, trace: await trace(r.run_id!) };
  });

  /**
   * "Try a demo package" — the second demo mode. No file to hand, no upload: a prepared
   * package of the fixture documents is pushed through the SAME pipeline as a real one, so
   * the room watches ingest -> classify -> reconcile -> diff -> propose happen live.
   * Nothing here is pre-computed; the run trace it returns was produced by this call.
   */
  app.post('/v1/demo/package', async (req: any, reply) => {
    const matterRef = req.body?.matter_ref ?? 'R. v. Okafor';
    const m = await one(`SELECT id FROM matter WHERE matter_ref=$1`, [matterRef]);
    if (!m) return reply.code(404).send({ error: `unknown matter ${matterRef}` });

    const dir = fixtureDir();
    const manifest = await readManifest();
    const pick = (k: string, extra: any = {}) => ({
      ...manifest[k], path: `${dir}${manifest[k].filename}`, ...extra,
    });

    // A supplementary package: one re-served document (drives the diff engine), one
    // document that satisfies an outstanding item, and one nobody asked for.
    const detached = req.query?.stream === '1';
    const r = await ingest({
      type: 'disclosure.package.received',
      source: 'simulator',
      detached,
      payload: {
        matter_ref: matterRef, source: 'portal', received_at: new Date().toISOString(),
        label: `Supplementary package (demo ${new Date().toISOString().slice(11, 16)})`,
        files: [
          pick('okafor_notebook_v3', { logical_key: 'okafor_notebook', hint: 'officer notebook memorandum book entries' }),
          pick('okafor_witness', { hint: 'will-say witness statement transcription' }),
          pick('okafor_roster', { hint: 'divisional shift roster listing units and hours' }),
        ],
      },
    });
    return { ...r, trace: await trace(r.run_id!) };
  });

  /**
   * The demo disclosure package, as a folder you can actually download.
   *
   * Without this, nobody watching can try the upload path — they have no Crown disclosure
   * on their laptop. Download it, drag it back in, and the identical pipeline runs on files
   * that came from outside the system.
   */
  const DEMO_PACKAGE = [
    { key: 'okafor_notebook_v3', as: 'supp_pkg_scan.pdf',
      note: 'Officer notebook, served again. Compared against what was served before.' },
    { key: 'okafor_witness', as: 'DOC_0031.pdf',
      note: 'Witness statement transcription.' },
    { key: 'okafor_roster', as: 'Officer_shift_roster_Div14.pdf',
      note: 'Never requested on the register — surfaced as unrequested material.' },
  ];
  const fixtureDir = () => fileURLToPath(new URL('../../../../fixtures/generated/', import.meta.url));
  const readManifest = async () => JSON.parse(await readFile(`${fixtureDir()}manifest.json`, 'utf8'));

  app.get('/v1/demo/package', async () => ({
    matter_ref: 'R. v. Okafor',
    filename: 'demo-disclosure-package.zip',
    note: 'Deliberately unhelpful filenames, as served. Download it and drag it back in.',
    files: DEMO_PACKAGE.map((f) => ({ filename: f.as, note: f.note })),
  }));

  app.get('/v1/demo/package.zip', async (req: any, reply) => {
    const manifest = await readManifest();
    const entries = [] as { name: string; data: Buffer }[];
    for (const f of DEMO_PACKAGE) {
      entries.push({ name: f.as, data: Buffer.from(await readFile(`${fixtureDir()}${manifest[f.key].filename}`)) });
    }
    entries.push({ name: 'README.txt', data: Buffer.from(
      [
        'Demo disclosure package — no real client information.',
        '',
        'Three documents as a Crown office might serve them, with the unhelpful filenames',
        'that make this problem hard. Drag this folder into Disclosure Intake.',
        '',
        ...DEMO_PACKAGE.map((f) => `  ${f.as}\n      ${f.note}`),
        '',
        'Nothing about the result is pre-computed.',
      ].join('\n'), 'utf8') });
    reply.header('content-type', 'application/zip');
    reply.header('content-disposition', 'attachment; filename="demo-disclosure-package.zip"');
    return reply.send(makeZip(entries));
  });

  // ---------------------------------------------------------------- review queue
  app.get('/v1/review-queue', async (req: any) => {
    const proposals = await q(
      `SELECT ap.*, m.matter_ref, p.verbatim_text, p.channel, p.confidence AS provenance_confidence
       FROM action_proposal ap LEFT JOIN matter m ON m.id=ap.matter_id
       LEFT JOIN provenance p ON p.id=ap.provenance_id
       WHERE ($1::text IS NULL OR ap.status=$1) ORDER BY ap.proposed_at DESC`,
      [req.query.status ?? 'pending']);
    const reviews = await q(
      `SELECT r.*, m.matter_ref, p.verbatim_text, p.channel, p.confidence
       FROM review_item r LEFT JOIN matter m ON m.id=r.matter_id JOIN provenance p ON p.id=r.provenance_id
       WHERE r.status='open' ORDER BY r.created_at DESC`);
    return { proposals, review_items: reviews, note: 'Nothing here has been sent. Approval is a distinct, logged human act.' };
  });

  app.get('/v1/review-queue/:id', async (req: any) => {
    const p = await one(`SELECT * FROM action_proposal WHERE id=$1`, [req.params.id]);
    const t = await q(`SELECT * FROM state_transition WHERE entity_type='action_proposal' AND entity_id=$1 ORDER BY occurred_at`, [req.params.id]);
    return { proposal: p, transitions: t };
  });

  app.post('/v1/review-queue/:id/approve', async (req: any, reply) => {
    const actor = await one(`SELECT * FROM actor WHERE id=$1 AND kind='human'`, [req.body?.actor_id]);
    if (!actor) return reply.code(400).send({ error: 'approval requires a known human actor_id' });
    await transition({ entity: 'action_proposal', entityId: req.params.id, to: 'approved',
      trigger: 'human_approval', actorKind: 'human', actorId: actor.id, evidence: { note: req.body?.note ?? null } });
    await q(`UPDATE action_proposal SET decided_by_actor=$1, decided_at=now(), decision_note=$2 WHERE id=$3`,
      [actor.id, req.body?.note ?? null, req.params.id]);
    // "Execution" writes an audit row and sends nothing. There is no outbound transport.
    await transition({ entity: 'action_proposal', entityId: req.params.id, to: 'executed',
      trigger: 'execute_noop_audit_only', actorKind: 'system',
      evidence: { note: 'no outbound transport exists in this system; nothing was sent' } });
    await q(`UPDATE action_proposal SET executed_at=now() WHERE id=$1`, [req.params.id]);
    const p = await one(`SELECT * FROM action_proposal WHERE id=$1`, [req.params.id]);
    if (p?.subject_type === 'request_item') {
      await q(`INSERT INTO followup (id,request_item_id,channel,sent_at,actor_id,note)
               VALUES ($1,$2,$3,now(),$4,'recorded on approval; nothing was transmitted')`,
        [id('fu'), p.subject_id, p.payload?.channel ?? 'email', actor.id]);
      await q(`UPDATE request_item SET last_followed_up_at=now() WHERE id=$1`, [p.subject_id]);
    }
    return { ...p, sent: false, note: 'Approved and logged. Nothing was sent.' };
  });

  app.post('/v1/review-queue/:id/reject', async (req: any, reply) => {
    const actor = await one(`SELECT * FROM actor WHERE id=$1 AND kind='human'`, [req.body?.actor_id]);
    if (!actor) return reply.code(400).send({ error: 'rejection requires a known human actor_id' });
    await transition({ entity: 'action_proposal', entityId: req.params.id, to: 'rejected',
      trigger: 'human_rejection', actorKind: 'human', actorId: actor.id, evidence: { note: req.body?.note ?? null } });
    await q(`UPDATE action_proposal SET decided_by_actor=$1, decided_at=now(), decision_note=$2 WHERE id=$3`,
      [actor.id, req.body?.note ?? null, req.params.id]);
    return one(`SELECT * FROM action_proposal WHERE id=$1`, [req.params.id]);
  });

  app.post('/v1/review-items/:id/resolve', async (req: any) => {
    await q(`UPDATE review_item SET status=$1, resolved_by_actor=$2, resolved_at=now() WHERE id=$3`,
      [req.body?.status ?? 'resolved', req.body?.actor_id ?? null, req.params.id]);
    return one(`SELECT * FROM review_item WHERE id=$1`, [req.params.id]);
  });

  app.get('/v1/actors', async () => q(`SELECT * FROM actor ORDER BY kind, name`));
  app.get('/v1/review-queue/audit', async () => q(
    `SELECT ap.*, a.name AS actor_name, m.matter_ref FROM action_proposal ap
     LEFT JOIN actor a ON a.id=ap.decided_by_actor LEFT JOIN matter m ON m.id=ap.matter_id
     WHERE ap.status IN ('executed','rejected') ORDER BY ap.decided_at DESC LIMIT 50`));
}
