/**
 * DETERMINISTIC STATE MACHINES. The LLM never advances a state.
 * Every transition persists timestamp, trigger and actor kind.
 * There is NO automatic escalation state anywhere in this file — escalation is legal
 * strategy. The strongest thing the system may say is "Follow-up Recommended" or
 * "Needs Review".
 */
import { q } from '../db.js';
import { id } from '../ids.js';

export type ActorKind = 'system' | 'ai' | 'human';

export type Machine = { initial: string; states: Record<string, string[]> };

export const MACHINES: Record<string, Machine> = {
  request_item: {
    initial: 'Requested',
    states: {
      'Requested': ['Acknowledged', 'Partially Received', 'Satisfied', 'Refused', 'Needs Review', 'Follow-up Recommended'],
      'Acknowledged': ['Partially Received', 'Satisfied', 'Refused', 'Needs Review', 'Follow-up Recommended'],
      'Partially Received': ['Satisfied', 'Refused', 'Needs Review', 'Follow-up Recommended', 'Partially Received'],
      'Satisfied': ['Partially Received', 'Needs Review'],
      'Refused': ['Needs Review', 'Partially Received', 'Satisfied'],
      'Needs Review': ['Partially Received', 'Satisfied', 'Refused', 'Follow-up Recommended'],
      'Follow-up Recommended': ['Acknowledged', 'Partially Received', 'Satisfied', 'Refused', 'Needs Review'],
    },
  },
  package: {
    initial: 'Received',
    states: {
      'Received': ['Indexed'],
      'Indexed': ['Classified'],
      'Classified': ['Reconciled'],
      'Reconciled': ['Anomalies Detected', 'Human Reviewed'],
      'Anomalies Detected': ['Human Reviewed'],
      'Human Reviewed': [],
    },
  },
  commitment: {
    initial: 'needs_confirmation',
    states: {
      'needs_confirmation': ['active', 'cancelled', 'superseded'],
      'active': ['fulfilled', 'missed', 'superseded', 'cancelled'],
      'missed': ['fulfilled', 'superseded', 'cancelled'],
      'fulfilled': ['superseded'],
      'superseded': [],
      'cancelled': [],
    },
  },
  action_proposal: {
    initial: 'pending',
    states: {
      'pending': ['approved', 'rejected'],
      'approved': ['executed', 'rejected'],
      'executed': [],
      'rejected': [],
    },
  },
};

/** Escalation is not a state this system can reach. Asserted by test. */
export const FORBIDDEN_STATES = ['Escalated', 'escalate', 'Escalation'];

export class IllegalTransition extends Error {
  constructor(entity: string, from: string, to: string) {
    super(`illegal ${entity} transition: ${from} -> ${to}`);
  }
}

export function canTransition(entity: keyof typeof MACHINES, from: string, to: string): boolean {
  const m = MACHINES[entity];
  if (!m) throw new Error(`unknown machine ${entity}`);
  return (m.states[from] ?? []).includes(to);
}

export function assertTransition(entity: keyof typeof MACHINES, from: string, to: string) {
  if (!canTransition(entity, from, to)) throw new IllegalTransition(entity, from, to);
}

const TABLE: Record<string, { table: string; col: string }> = {
  request_item: { table: 'request_item', col: 'state' },
  package: { table: 'package', col: 'state' },
  commitment: { table: 'commitment', col: 'status' },
  action_proposal: { table: 'action_proposal', col: 'status' },
};

export async function transition(opts: {
  entity: keyof typeof MACHINES;
  entityId: string;
  to: string;
  trigger: string;
  actorKind: ActorKind;
  actorId?: string | null;
  evidence?: any;
}) {
  const t = TABLE[opts.entity];
  const rows = await q(`SELECT ${t.col} AS s FROM ${t.table} WHERE id = $1`, [opts.entityId]);
  if (!rows.length) throw new Error(`${opts.entity} ${opts.entityId} not found`);
  const from = rows[0].s as string;
  if (from === opts.to) return from;
  assertTransition(opts.entity, from, opts.to);
  await q(`UPDATE ${t.table} SET ${t.col} = $1 WHERE id = $2`, [opts.to, opts.entityId]);
  await q(
    `INSERT INTO state_transition (id, entity_type, entity_id, from_state, to_state, trigger, actor_kind, actor_id, evidence)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id('st'), opts.entity, opts.entityId, from, opts.to, opts.trigger, opts.actorKind, opts.actorId ?? null,
     JSON.stringify(opts.evidence ?? {})],
  );
  return opts.to;
}
