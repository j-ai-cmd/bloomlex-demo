/**
 * The single LLM boundary. Kimi via its OpenAI-compatible chat-completions endpoint.
 *
 * KIMI_API_KEY is supplied later. Until it is, the provider runs in FIXTURE MODE: the
 * same call sites, the same schemas, the same validation, deterministic heuristics
 * instead of a model. Fixture output is labelled model = "fixture-v1" everywhere it is
 * persisted, so nothing on stage can silently pass off a heuristic as a model result.
 */
import 'dotenv/config';
import { z } from 'zod';

export const HAS_KEY = () => Boolean(process.env.KIMI_API_KEY);
export const modelName = () => (HAS_KEY() ? (process.env.KIMI_MODEL ?? 'kimi-k2.6') : 'fixture-v1');

export class ModelOutputInvalid extends Error {}

export async function callModel<T>(opts: {
  prompt: string;
  schema: z.ZodType<T>;
  fixture: () => T;
}): Promise<{ value: T; model: string; latency_ms: number }> {
  const started = Date.now();
  if (!HAS_KEY()) {
    const value = opts.schema.parse(opts.fixture());
    return { value, model: 'fixture-v1', latency_ms: Date.now() - started };
  }
  const base = process.env.KIMI_BASE_URL ?? 'https://api.moonshot.ai/v1';
  const model = process.env.KIMI_MODEL ?? 'kimi-k2.6';

  // Extended thinking is OFF by default. Every job we give the model is extraction,
  // classification or short prose. On kimi-k2.6, thinking cost ~870 reasoning tokens and
  // ~47s per call for byte-identical output — unusable on stage, where the whole point is
  // watching the pipeline run. Set KIMI_THINKING=1 to turn it back on.
  // The model constrains temperature per mode: 0.6 without thinking, 1 with it.
  const thinking = process.env.KIMI_THINKING === '1';

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.KIMI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      temperature: thinking ? 1 : 0.6,
      ...(thinking ? {} : { thinking: { type: 'disabled' } }),
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You return only valid JSON matching the requested shape. No prose, no markdown fences.' },
        { role: 'user', content: opts.prompt },
      ],
    }),
  });
  if (!res.ok) throw new ModelOutputInvalid(`model HTTP ${res.status}: ${await res.text()}`);
  const body: any = await res.json();
  const raw = body?.choices?.[0]?.message?.content ?? '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/^```(?:json)?|```$/g, '').trim());
  } catch {
    throw new ModelOutputInvalid(`model returned non-JSON: ${raw.slice(0, 300)}`);
  }
  // Non-conforming model output is a FAILED STEP, never a silent default.
  const value = opts.schema.parse(parsed);
  return { value, model, latency_ms: Date.now() - started };
}
