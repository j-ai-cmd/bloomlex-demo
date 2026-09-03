import test from 'node:test';
import assert from 'node:assert/strict';
import { MACHINES, canTransition, assertTransition, IllegalTransition, FORBIDDEN_STATES } from '../core/states.js';
import { band, THRESHOLDS } from '../config/confidence.js';

test('request_item follows the documented lifecycle', () => {
  assert.ok(canTransition('request_item', 'Requested', 'Acknowledged'));
  assert.ok(canTransition('request_item', 'Acknowledged', 'Partially Received'));
  assert.ok(canTransition('request_item', 'Partially Received', 'Satisfied'));
  assert.ok(canTransition('request_item', 'Requested', 'Refused'));
  assert.ok(canTransition('request_item', 'Requested', 'Needs Review'));
});

test('package follows Received -> Indexed -> Classified -> Reconciled -> ... -> Human Reviewed', () => {
  const chain = ['Received', 'Indexed', 'Classified', 'Reconciled', 'Anomalies Detected', 'Human Reviewed'];
  for (let i = 0; i < chain.length - 1; i++) assert.ok(canTransition('package', chain[i], chain[i + 1]), `${chain[i]} -> ${chain[i+1]}`);
  assert.ok(!canTransition('package', 'Received', 'Classified'), 'must not skip indexing');
  assert.ok(!canTransition('package', 'Human Reviewed', 'Received'), 'terminal state must be terminal');
});

test('illegal transitions throw rather than silently succeed', () => {
  assert.throws(() => assertTransition('package', 'Received', 'Reconciled'), IllegalTransition);
  assert.throws(() => assertTransition('action_proposal', 'pending', 'executed'), IllegalTransition);
  assert.throws(() => assertTransition('commitment', 'superseded', 'active'), IllegalTransition);
});

test('a proposal can only be executed after a distinct approval step', () => {
  assert.ok(!canTransition('action_proposal', 'pending', 'executed'));
  assert.ok(canTransition('action_proposal', 'pending', 'approved'));
  assert.ok(canTransition('action_proposal', 'approved', 'executed'));
});

test('NO escalation state exists in any machine, and none is reachable', () => {
  for (const [name, machine] of Object.entries(MACHINES)) {
    const all = new Set([...Object.keys(machine.states), ...Object.values(machine.states).flat()]);
    for (const state of all) {
      for (const forbidden of FORBIDDEN_STATES) {
        assert.ok(!state.toLowerCase().includes(forbidden.toLowerCase()),
          `machine ${name} exposes an escalation state: ${state}`);
      }
    }
  }
  // The strongest thing the system may say.
  assert.ok(Object.keys(MACHINES.request_item.states).includes('Follow-up Recommended'));
});

test('confidence bands come from config and nowhere else', () => {
  assert.equal(band('extraction', 0.9), 'high');
  assert.equal(band('extraction', THRESHOLDS.extraction.high), 'high');
  assert.equal(band('extraction', THRESHOLDS.extraction.high - 0.01), 'medium');
  assert.equal(band('extraction', THRESHOLDS.extraction.medium - 0.01), 'low');
  assert.equal(band('match', 0.5), 'low');
});
