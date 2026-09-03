/**
 * WRITE-BACK. This is what makes the calendar a component of the workforce rather than
 * a viewer.
 *
 * Deterministic triggers decide WHETHER to propose. The LLM drafts only prose, and only
 * for disclosure follow-ups. Every proposal lands in the review queue as `pending`.
 * NOTHING IS EVER SENT.
 */
import { q, one } from '../db.js';
import { id } from '../ids.js';
import { createHash } from 'node:crypto';
import { todayInTz, addBusinessDays, businessDaysBetween, calendarDaysBetween } from './time.js';
import { COMMITMENT_LOOKAHEAD_BUSINESS_DAYS, REQUEST_ITEM_FOLLOWUP_AGE_BUSINESS_DAYS } from '../config/firm.js';
import { itemClocks } from './clock.js';
import * as AI from '../ai/index.js';

const asDate = (v: any) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : null);
const dk = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 32);

async function propose(p: {
  type: string; matter_id: string | null; subject_type: string; subject_id: string;
  rationale: string; payload: any; evidence: any[]; provenance_id?: string | null; dedup_key: string;
}) {
  const existing = await one(`SELECT id FROM action_proposal WHERE dedup_key=$1`, [p.dedup_key]);
  if (existing) return { proposal_id: existing.id, created: false };
  const pid = id('act');
  await q(
    `INSERT INTO action_proposal (id,type,matter_id,subject_type,subject_id,rationale,payload,evidence,status,proposed_by,dedup_key,provenance_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending','system',$9,$10)`,
    [pid, p.type, p.matter_id, p.subject_type, p.subject_id, p.rationale,
     JSON.stringify(p.payload), JSON.stringify(p.evidence), p.dedup_key, p.provenance_id ?? null],
  );
  await q(`INSERT INTO state_transition (id,entity_type,entity_id,from_state,to_state,trigger,actor_kind)
           VALUES ($1,'action_proposal',$2,NULL,'pending','sweeper','system')`, [id('st'), pid]);
  return { proposal_id: pid, created: true };
}

export async function sweep(now = new Date()) {
  const today = todayInTz(now);
  const created: any[] = [];

  // ---- commitments approaching or passed
  const horizon = addBusinessDays(today, COMMITMENT_LOOKAHEAD_BUSINESS_DAYS);
  const commitments = await q(
    `SELECT c.*, m.matter_ref FROM commitment c LEFT JOIN matter m ON m.id=c.matter_id
     WHERE c.status IN ('active','missed') AND c.due_date IS NOT NULL AND c.due_date <= $1`,
    [horizon],
  );
  for (const c of commitments) {
    const due = asDate(c.due_date)!;
    const overdue = due < today;
    if (overdue && c.status === 'active') {
      await q(`UPDATE commitment SET status='missed' WHERE id=$1`, [c.id]);
      await q(`INSERT INTO state_transition (id,entity_type,entity_id,from_state,to_state,trigger,actor_kind)
               VALUES ($1,'commitment',$2,'active','missed','due_date_passed','system')`, [id('st'), c.id]);
    }
    const type = c.direction === 'client_owes'
      ? (overdue ? 'ava.call_client' : 'ava.send_reminder')
      : 'pms.create_task';
    const days = Math.abs(calendarDaysBetween(due, today));
    const r = await propose({
      type,
      matter_id: c.matter_id,
      subject_type: 'commitment',
      subject_id: c.id,
      rationale: overdue
        ? `Commitment due ${due} has passed; ${days} day(s) elapsed and no fulfilment recorded.`
        : `Commitment due ${due}, within ${COMMITMENT_LOOKAHEAD_BUSINESS_DAYS} business days.`,
      payload: {
        matter_ref: c.matter_ref, person: c.person_name, action: c.action_text, due_date: due,
        suggested_message: overdue
          ? `Checking in about: ${c.action_text}. Our record shows this was due ${due}.`
          : `Reminder about: ${c.action_text}, due ${due}.`,
      },
      evidence: [{ commitment_id: c.id, provenance_id: c.provenance_id }],
      provenance_id: c.provenance_id,
      dedup_key: dk(`commitment:${c.id}:${overdue ? 'overdue' : 'upcoming'}:${due}`),
    });
    if (r.created) created.push({ ...r, type, subject: c.id });
  }

  // ---- request items ageing without a package since the last follow-up
  const clocks = await itemClocks();
  for (const it of clocks) {
    if (['Satisfied', 'Refused'].includes(it.state)) continue;
    if (it.age_business_days < REQUEST_ITEM_FOLLOWUP_AGE_BUSINESS_DAYS) continue;
    const since = it.last_followed_up_at
      ? businessDaysBetween(it.last_followed_up_at, today)
      : it.age_business_days;
    if (since < REQUEST_ITEM_FOLLOWUP_AGE_BUSINESS_DAYS) continue;

    const item = await one(`SELECT ri.*, m.matter_ref FROM request_item ri JOIN matter m ON m.id=ri.matter_id WHERE ri.id=$1`, [it.request_item_id]);
    const received = await q(
      `SELECT d.original_filename FROM match mm JOIN dfile d ON d.id=mm.file_id
       WHERE mm.request_item_id=$1 AND mm.state='confirmed'`, [it.request_item_id]);

    // Only the PROSE is generated. Every figure below is computed deterministically.
    const context = [
      `ITEM: ${it.description}`,
      `FIRST REQUESTED: ${it.first_requested_at}`,
      `AGE_DAYS: ${it.age_calendar_days}`,
      `AGE_BUSINESS_DAYS: ${it.age_business_days}`,
      `FOLLOWUPS: ${it.followups}`,
      `RECEIVED: ${received.length ? received.map((r) => r.original_filename).join(', ') : 'none recorded'}`,
    ].join('\n');
    const draft = await AI.draftFollowup(context);

    const r = await propose({
      type: 'crown.follow_up_letter',
      matter_id: item.matter_id,
      subject_type: 'request_item',
      subject_id: it.request_item_id,
      // The system's strongest possible phrasing. No escalation state exists.
      rationale: `Follow-up recommended: requested ${it.first_requested_at}, ${it.age_calendar_days} days elapsed, ${it.followups} prior follow-up(s), current state ${it.state}.`,
      payload: { matter_ref: item.matter_ref, item: it.description, draft_body: draft.value.body, channel: 'email' },
      evidence: [{ request_item_id: it.request_item_id, age_calendar_days: it.age_calendar_days, followups: it.followups }],
      provenance_id: item.provenance_id,
      dedup_key: dk(`request_item:${it.request_item_id}:followup:${it.followups}`),
    });
    if (r.created) {
      created.push({ ...r, type: 'crown.follow_up_letter', subject: it.request_item_id });
      // 'Partially Received' and 'Refused' carry information a follow-up recommendation
      // would erase, so the sweeper never overwrites them. The proposal still gets made.
      if (['Requested', 'Acknowledged', 'Needs Review'].includes(item.state)) {
        const { transition } = await import('./states.js');
        await transition({ entity: 'request_item', entityId: it.request_item_id, to: 'Follow-up Recommended',
          trigger: 'sweeper_age_threshold', actorKind: 'system', evidence: { age_days: it.age_calendar_days } });
      }
    }
  }

  return { today, proposals_created: created.length, created };
}
