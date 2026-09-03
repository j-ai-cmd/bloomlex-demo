/**
 * Confidence policy lives HERE and nowhere else.
 * high   -> apply automatically
 * medium -> create the record in NEEDS CONFIRMATION
 * low    -> create nothing; raise a review item
 * Thresholds are per fact type. Every branch taken is echoed into run_step.decision.
 */
export type Band = 'high' | 'medium' | 'low';
export type FactType = 'extraction' | 'classification' | 'match';

export const THRESHOLDS: Record<FactType, { high: number; medium: number }> = {
  extraction: { high: 0.85, medium: 0.6 },
  classification: { high: 0.8, medium: 0.55 },
  match: { high: 0.85, medium: 0.6 },
};

export function band(fact: FactType, confidence: number): Band {
  const t = THRESHOLDS[fact];
  if (confidence >= t.high) return 'high';
  if (confidence >= t.medium) return 'medium';
  return 'low';
}

export function decisionText(fact: FactType, confidence: number): string {
  const t = THRESHOLDS[fact];
  const b = band(fact, confidence);
  return `${fact} confidence ${confidence.toFixed(2)} -> ${b} (high>=${t.high}, medium>=${t.medium})`;
}
