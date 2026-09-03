const base = '';

export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}
export const post = <T = any>(path: string, body?: any) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });

/** Live run steps over SSE, so the room watches the AI work. */
export function streamRun(runId: string, onStep: (step: any) => void): () => void {
  const es = new EventSource(`/v1/runs/${runId}/stream`);
  es.onmessage = (e) => { try { const d = JSON.parse(e.data); if (d.type === 'step') onStep(d.step); } catch {} };
  return () => es.close();
}

export const iso = (d: any) => (d ? String(d).slice(0, 10) : null);
export const fmtDate = (d: any) =>
  d ? new Date(`${iso(d)}T12:00:00Z`).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '—';
export const fmtLong = (d: any) =>
  d ? new Date(`${iso(d)}T12:00:00Z`).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—';
export const fmtTime = (d: any) => (d ? new Date(d).toISOString().slice(11, 16) : '');
