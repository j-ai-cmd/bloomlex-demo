/**
 * Typed LLM call sites. Each one validates against a schema, runs the language guard over
 * every generated string, and returns the model name + prompt version for provenance.
 */
import { callModel, modelName } from './provider.js';
import * as P from './prompts.js';
import * as S from './schemas.js';
import * as F from './fixtures.js';
import { assertObservational } from './guard.js';

export { PROMPT_VERSIONS } from './prompts.js';
export { modelName, HAS_KEY } from './provider.js';

export async function extractCommitments(transcript: string, matterRefs: string[], defaultRef?: string | null) {
  const r = await callModel({
    prompt: P.EXTRACT_COMMITMENTS(transcript, matterRefs),
    schema: S.ExtractionResult,
    fixture: () => F.fixtureExtract(transcript, matterRefs, defaultRef),
  });
  for (const c of r.value.commitments) assertObservational(c.action_text);
  return r;
}

export async function classifyFile(filename: string, hint: string) {
  const r = await callModel({
    prompt: P.CLASSIFY_FILE(filename, hint),
    schema: S.FileClassification,
    fixture: () => F.fixtureClassify(filename, hint),
  });
  assertObservational(r.value.description);
  return r;
}

export async function proposeMatches(
  files: Parameters<typeof F.fixtureMatches>[0],
  items: Parameters<typeof F.fixtureMatches>[1],
) {
  const fmt = (o: any) => JSON.stringify(o, null, 1);
  const r = await callModel({
    prompt: P.PROPOSE_MATCHES(fmt(files), fmt(items)),
    schema: S.MatchResult,
    fixture: () => F.fixtureMatches(files, items),
  });
  for (const m of r.value.matches) assertObservational(m.evidence);
  return r;
}

export async function draftFollowup(context: string) {
  const r = await callModel({
    prompt: P.DRAFT_FOLLOWUP(context),
    schema: S.DraftResult,
    fixture: () => F.fixtureDraft(context),
  });
  assertObservational(r.value.body);
  return r;
}
