import React, { useState } from 'react';
import { post, streamRun } from '../lib/api';
import { Icon, Button } from '../lib/ui';

const EXAMPLES = [
  "Sarah Miller called about R. v. Miller. She said I'll send the signed affidavit by Friday.",
  'Luc Tremblay asked me to call the lead investigator next week.',
  'Court office called about R. v. Okafor. The client needs to file the form by 2026-09-14.',
  'He said he would send the receipts soon.',
];

/**
 * The stage button. Raw text in, the whole pipeline runs, and the trace streams back
 * live so the room watches the deterministic and LLM steps interleave.
 */
export function SimulateAva({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState(EXAMPLES[0]);
  const [steps, setSteps] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function run() {
    setBusy(true); setSteps([]); setResult(null);
    const r = await post('/v1/simulate/ava', { text, channel: 'phone' });
    setSteps(r.trace?.steps ?? []);
    setResult(r);
    setBusy(false);
    onDone();
    // Keep streaming in case anything lands after the response (real webhooks will).
    const stop = streamRun(r.run_id, (s) => setSteps((prev) => (prev.some((p) => p.seq === s.seq) ? prev : [...prev, s])));
    setTimeout(stop, 4000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-space-lg">
      <div className="bg-surface-container-lowest w-full max-w-5xl max-h-[88vh] overflow-auto rounded-xl shadow-xl border border-surface-border flex flex-col">
        <div className="flex items-center justify-between px-space-xl py-space-md bg-surface-container-low border-b border-surface-border sticky top-0">
          <span className="flex items-center gap-space-sm">
            <Icon name="electric_bolt" className="text-[18px] text-primary" />
            <span className="font-headline-matter font-bold text-sm tracking-wider uppercase">Simulate Ava</span>
            <span className="px-space-xs py-space-2xs bg-primary-fixed text-on-primary-fixed font-code-timestamp text-caption-meta rounded">
              same code path a webhook would take
            </span>
          </span>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface"><Icon name="close" className="text-[20px]" /></button>
        </div>

        <div className="p-space-xl flex flex-col gap-space-lg">
          <div className="flex flex-col gap-space-xs">
            <label className="font-caption-meta text-caption-meta text-on-surface-variant uppercase tracking-wider">
              Free text, as Ava would hand it over
            </label>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3}
              className="w-full bg-surface-container-low border border-surface-border px-space-md py-space-sm rounded font-body-default text-body-default text-on-surface outline-none focus:border-primary" />
            <div className="flex flex-wrap gap-space-xs">
              {EXAMPLES.map((e, i) => (
                <button key={i} onClick={() => setText(e)}
                  className="px-space-sm py-space-2xs bg-surface-container border border-surface-border rounded font-caption-meta text-caption-meta text-on-surface-variant hover:text-on-surface text-left max-w-[22rem] truncate">
                  {e}
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <Button variant="primary" onClick={run} disabled={busy}>
                <Icon name="psychology" className="text-[16px]" />{busy ? 'Running…' : 'Run pipeline'}
              </Button>
            </div>
          </div>

          {steps.length > 0 && (
            <div className="flex flex-col gap-space-sm">
              <span className="font-section-title text-section-title uppercase text-primary font-bold">Run trace</span>
              <div className="border border-surface-border rounded overflow-hidden">
                {steps.map((s) => (
                  <div key={s.seq} className="grid grid-cols-[3rem_7rem_1fr_auto] gap-space-md items-start px-space-md py-space-sm border-b border-surface-border last:border-0 bg-surface-container-lowest">
                    <span className="font-code-timestamp text-caption-meta text-outline">#{s.seq}</span>
                    <span className={`font-code-timestamp text-caption-meta font-bold uppercase ${
                      s.kind === 'llm' ? 'text-secondary' : s.kind === 'io' ? 'text-on-surface-variant' : 'text-status-satisfied-fg'}`}>
                      {s.kind}
                    </span>
                    <span className="flex flex-col">
                      <span className="font-body-strong text-body-strong text-on-surface">{s.name}</span>
                      {s.decision && <span className="font-caption-meta text-caption-meta text-on-surface-variant">{s.decision}</span>}
                      {s.rule_id && <span className="font-code-timestamp text-caption-meta text-outline">rule: {s.rule_id}</span>}
                    </span>
                    <span className="font-code-timestamp text-caption-meta text-outline">{s.latency_ms}ms</span>
                  </div>
                ))}
              </div>
              <p className="font-caption-meta text-caption-meta text-on-surface-variant">
                Green steps are deterministic code. Blue steps are the model. Dates, states and every
                number come only from the green ones.
              </p>
            </div>
          )}

          {result?.result && (
            <pre className="p-space-md bg-surface-container border border-surface-border rounded font-code-citation text-code-citation overflow-auto max-h-56">
              {JSON.stringify(result.result, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
