/**
 * LANGUAGE RULE, ENFORCED IN CODE.
 *
 * Outputs state observations, never legal conclusions. The prompt templates say so; this
 * guard is the belt to that pair of braces. Every generated string is checked before it
 * is persisted. A hit FAILS the step loudly and raises a review item — it is never
 * silently rewritten, because on stage a loud failure is the honest one.
 */
export const FORBIDDEN = [
  'improper', 'improperly', 'legally significant', 'materially significant',
  'wilful', 'willful', 'wilfully', 'willfully', 'deliberately withheld', 'concealed',
  'violation', 'violated', 'breach of', 'misconduct', 'bad faith',
  'should escalate', 'must escalate', 'escalate to', 'failed to comply',
  'non-compliance', 'noncompliance', 'prejudicial', 'prejudice to the accused',
  'abuse of process', 'unlawful', 'illegal', 'sanction', 'contempt',
  'we conclude', 'this proves', 'clearly shows', 'demonstrates that the crown',
];

export class LanguageRuleViolation extends Error {
  constructor(public readonly hits: string[], public readonly text: string) {
    super(`language rule violation: generated text contains forbidden phrasing [${hits.join(', ')}]`);
  }
}

export function findViolations(text: string): string[] {
  const lower = text.toLowerCase();
  return FORBIDDEN.filter((f) => lower.includes(f));
}

/** Throws on any hit. Call on EVERY generated string before persisting it. */
export function assertObservational(text: string): string {
  const hits = findViolations(text);
  if (hits.length) throw new LanguageRuleViolation(hits, text);
  return text;
}
