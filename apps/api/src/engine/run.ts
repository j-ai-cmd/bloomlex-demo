/**
 * The workflow engine's run + trace + live stream.
 * Every step is recorded with its kind (deterministic | llm | io) so the boundary is
 * visible in the trace itself, not only in the docs.
 */
import { EventEmitter } from 'node:events';
import { q, one } from '../db.js';
import { id } from '../ids.js';

export const bus = new EventEmitter();
bus.setMaxListeners(200);

export class Run {
  seq = 0;
  constructor(public readonly runId: string) {}

  async step<T>(opts: {
    kind: 'deterministic' | 'llm' | 'io';
    name: string;
    input?: any;
    model?: string;
    prompt_version?: string;
    rule_id?: string;
    confidence?: number;
    decision?: string;
  }, fn: () => Promise<T> | T): Promise<T> {
    const started = Date.now();
    const seq = ++this.seq;
    let output: any = null;
    let error: string | null = null;
    try {
      const r = await fn();
      output = r === undefined ? null : r;
      return r;
    } catch (e: any) {
      error = e?.message ?? String(e);
      output = { error };
      throw e;
    } finally {
      const row = {
        id: id('step'), run_id: this.runId, seq, kind: opts.kind, name: opts.name,
        input: opts.input ?? null, output: safe(output), model: opts.model ?? null,
        prompt_version: opts.prompt_version ?? null, rule_id: opts.rule_id ?? null,
        confidence: opts.confidence ?? null, decision: error ? `FAILED: ${error}` : opts.decision ?? null,
        latency_ms: Date.now() - started,
      };
      await q(
        `INSERT INTO run_step (id,run_id,seq,kind,name,input,output,model,prompt_version,rule_id,confidence,decision,latency_ms)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [row.id, row.run_id, row.seq, row.kind, row.name, JSON.stringify(row.input),
         JSON.stringify(row.output), row.model, row.prompt_version, row.rule_id,
         row.confidence, row.decision, row.latency_ms],
      );
      bus.emit(this.runId, { type: 'step', step: row });
    }
  }
}

function safe(v: any) {
  try { JSON.stringify(v); return v; } catch { return { unserialisable: true }; }
}

export async function startRun(eventId: string, workflow: string): Promise<Run> {
  const runId = id('run');
  await q(`INSERT INTO run (id, event_id, workflow, status) VALUES ($1,$2,$3,'running')`, [runId, eventId, workflow]);
  bus.emit(runId, { type: 'run', status: 'running', workflow });
  return new Run(runId);
}

export async function finishRun(run: Run, status: 'succeeded' | 'failed', error?: string) {
  await q(`UPDATE run SET status=$1, finished_at=now(), error=$2 WHERE id=$3`, [status, error ?? null, run.runId]);
  bus.emit(run.runId, { type: 'run', status, error: error ?? null });
}

export async function trace(runId: string) {
  const run = await one(`SELECT * FROM run WHERE id=$1`, [runId]);
  if (!run) return null;
  const steps = await q(`SELECT * FROM run_step WHERE run_id=$1 ORDER BY seq`, [runId]);
  const event = await one(`SELECT * FROM event WHERE id=$1`, [run.event_id]);
  return { run, event, steps };
}
