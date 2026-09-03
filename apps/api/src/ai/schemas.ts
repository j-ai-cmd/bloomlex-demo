import { z } from 'zod';

export const ExtractedCommitment = z.object({
  person_name: z.string().nullable(),
  matter_ref: z.string().nullable(),
  action_text: z.string(),
  date_phrase: z.string().nullable(),
  category: z.enum(['court', 'client_commitment', 'deadline', 'follow_up', 'consultation', 'other']),
  direction: z.enum(['firm_owes', 'client_owes', 'court_imposed', 'third_party_owes', 'unknown']),
  verbatim: z.string(),
  confidence: z.number().min(0).max(1),
});
export const ExtractionResult = z.object({ commitments: z.array(ExtractedCommitment) });
export type TExtractedCommitment = z.infer<typeof ExtractedCommitment>;

export const FileClassification = z.object({
  doc_type: z.string(),
  author_or_officer: z.string().nullable(),
  occurrence_no: z.string().nullable(),
  event_date: z.string().nullable(),
  pages: z.number().nullable(),
  duration_s: z.number().nullable(),
  description: z.string(),
  confidence: z.number().min(0).max(1),
});
export type TFileClassification = z.infer<typeof FileClassification>;

export const MatchProposal = z.object({
  request_item_id: z.string(),
  file_id: z.string(),
  confidence: z.number().min(0).max(1),
  evidence: z.string(),
});
export const MatchResult = z.object({ matches: z.array(MatchProposal) });
export type TMatchProposal = z.infer<typeof MatchProposal>;

export const DraftResult = z.object({ body: z.string() });
