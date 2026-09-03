/**
 * FIXTURE MODE heuristics — used only while KIMI_API_KEY is absent.
 * Deterministic, so the demo, the seed and the tests all run with no key.
 * Everything produced here is labelled model = "fixture-v1".
 */
import type { TExtractedCommitment, TFileClassification, TMatchProposal } from './schemas.js';

const DATE_PHRASE_PATTERNS = [
  /\b\d{4}-\d{2}-\d{2}\b/i,
  /\b(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+\d{1,2}(?:st|nd|rd|th)?\b/i,
  /\btomorrow(?:\s+(?:morning|afternoon|evening))?\b/i,
  /\b(?:today|this (?:morning|afternoon|evening)|tonight)\b/i,
  /\bnext\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i,
  /\b(?:\d+|one|two|three|four|five)\s+(?:business\s+)?days?\s+before\s+(?:court|the hearing|trial)\b/i,
  /\bbefore (?:court|the hearing|the appearance|trial)\b/i,
  /\bnext week\b/i,
  /\b(?:early|mid|middle of|end of|late)\s+next month\b/i,
  /\bin\s+(?:\d+|a|one|two|three|four|five|six)\s+(?:business\s+)?(?:day|week)s?\b/i,
  /\b(?:end of (?:the )?week|by friday)\b/i,
  /\b(?:sometime\s+|on\s+|this\s+|by\s+)?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i,
  /\b(?:soon|shortly|in due course|asap|at some point|later)\b/i,
];

const CUES: { re: RegExp; category: TExtractedCommitment['category']; direction: TExtractedCommitment['direction']; conf: number }[] = [
  { re: /\b(court|hearing|appearance|trial|docket|listed for)\b/i, category: 'court', direction: 'court_imposed', conf: 0.93 },
  { re: /\b(needs? to|must|has to|have to)\s+(file|serve|submit|produce|deliver)/i, category: 'deadline', direction: 'client_owes', conf: 0.88 },
  { re: /\bconsultation\b|\bconsult\b|\bmeeting\b|\bappointment\b|\bcome in\b|\bsit down\b/i, category: 'consultation', direction: 'firm_owes', conf: 0.86 },
  // "<someone> will send/bring/..." covers both "I'll send" and "Okafor will bring".
  { re: /\b(?:i'?ll|he'?ll|she'?ll|they'?ll|we'?ll|\w+\s+will|going to)\s+(send|bring|drop|get|sign|return|email|upload|provide|deliver)/i, category: 'client_commitment', direction: 'client_owes', conf: 0.9 },
  { re: /\b(call|ring|phone|follow up|follow-up|check in|get back|reach out)\b/i, category: 'follow_up', direction: 'firm_owes', conf: 0.86 },
];

const NAME = /\b([A-Z][a-z]{2,})\s+([A-Z][a-z]{2,})\b/;

export function fixtureExtract(transcript: string, matterRefs: string[], defaultRef?: string | null): { commitments: TExtractedCommitment[] } {
  const sentences = transcript
    // Protect legal citation style ("R. v. Okafor") and initials from the sentence splitter.
    .replace(/\b([A-Z])\.\s+v\.\s+/g, '$1<DOT> v<DOT> ')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/<DOT>/g, '.'))
    .map((s) => s.trim())
    .filter(Boolean);

  const commitments: TExtractedCommitment[] = [];
  for (const s of sentences) {
    const cue = CUES.find((c) => c.re.test(s));
    const phraseMatch = DATE_PHRASE_PATTERNS.map((p) => s.match(p)).find(Boolean);
    if (!cue && !phraseMatch) continue;

    const nameM = s.match(NAME);
    const matter = matterRefs.find((r) => s.toLowerCase().includes(r.toLowerCase().replace('r. v. ', ''))) ?? defaultRef ?? null;

    // Confidence degrades when signals are missing, which is what drives the
    // high / medium / low policy downstream.
    let confidence = cue ? cue.conf : 0.62;
    if (!phraseMatch) confidence -= 0.18;
    if (!matter) confidence -= 0.06;
    confidence = Math.max(0.3, Math.min(0.97, Number(confidence.toFixed(2))));

    commitments.push({
      person_name: nameM ? nameM[0] : null,
      matter_ref: matter ?? null,
      action_text: s.replace(/^["“]|["”]$/g, '').slice(0, 200),
      date_phrase: phraseMatch ? phraseMatch[0] : null,
      category: cue?.category ?? 'other',
      direction: cue?.direction ?? 'unknown',
      verbatim: s,
      confidence,
    });
  }
  return { commitments };
}

const DOC_RULES: { re: RegExp; doc_type: string; description: string; conf: number }[] = [
  { re: /\bbwc\b|bodycam|body.?worn|\baxon\b/i, doc_type: 'body_worn_camera', description: 'Body-worn camera recording', conf: 0.9 },
  { re: /\b911\b|\bcad\b|\bdispatch/i, doc_type: '911_audio', description: '911 call audio or dispatch log', conf: 0.88 },
  { re: /\bnotebook\b|memo.?book|officer.?notes|duty.?book|memorandum/i, doc_type: 'officer_notes', description: 'Officer notebook and memorandum book entries', conf: 0.87 },
  { re: /\bstatement\b|will.?say|\bwitness\b/i, doc_type: 'witness_statement', description: 'Witness statement', conf: 0.85 },
  { re: /\bcalib\w*|\bintoxilyzer\b|\bbreath\w*|\bmaint\w*/i, doc_type: 'calibration_certificate', description: 'Breath-test instrument calibration or maintenance record', conf: 0.88 },
  { re: /\btox\w*|\bblood\b|\bcfs\b/i, doc_type: 'toxicology', description: 'Toxicology or forensic analysis report', conf: 0.86 },
  { re: /\bwarrant\b|\bito\b/i, doc_type: 'warrant_ito', description: 'Search warrant information to obtain', conf: 0.84 },
  { re: /\bprop\w*|\bseiz\w*|\blocker\b|custody.?log/i, doc_type: 'property_log', description: 'Property seizure or custody log', conf: 0.82 },
  { re: /\bchat\b|\bmessage\w*|\bsms\b|\bextraction\b/i, doc_type: 'chat_logs', description: 'Chat or message extraction', conf: 0.8 },
  { re: /\bphoto\w*|\bimg\b|\bjpe?g\b|\bpng\b/i, doc_type: 'photographs', description: 'Photograph', conf: 0.78 },
  { re: /\bcctv\b|surveill\w*/i, doc_type: 'cctv', description: 'CCTV footage', conf: 0.83 },
  { re: /\bscreening\b|\bcrown\b/i, doc_type: 'crown_memo', description: 'Crown screening memorandum', conf: 0.8 },
  { re: /production.?order/i, doc_type: 'production_order', description: 'Production order', conf: 0.84 },
];

export function fixtureClassify(filename: string, hint: string): TFileClassification {
  const hay = `${filename} ${hint}`;
  const rule = DOC_RULES.find((r) => r.re.test(hay));
  const officer = hay.match(/\b(reyes|patel|murray|okonkwo|lang|rao|dubois|hall)\b/i);
  const occ = hay.match(/\b(?:occ|occurrence|file)[-_ ]?(\d{2,}-?\d*)\b/i);
  const date = hay.match(/\b(20\d{2})[-_]?(\d{2})[-_]?(\d{2})\b/);
  const pages = hint.match(/pages?[:= ]+(\d+)/i);
  const dur = hint.match(/duration[:= ]+([\d.]+)/i);
  return {
    doc_type: rule?.doc_type ?? 'other',
    author_or_officer: officer ? `Cst. ${officer[1][0].toUpperCase()}${officer[1].slice(1).toLowerCase()}` : null,
    occurrence_no: occ ? occ[1] : null,
    event_date: date ? `${date[1]}-${date[2]}-${date[3]}` : null,
    pages: pages ? Number(pages[1]) : null,
    duration_s: dur ? Number(dur[1]) : null,
    description: rule?.description ?? 'Unidentified material; filename carries no usable indication of contents',
    // An unmatched filename is genuinely low confidence — that is the point of the seed.
    confidence: rule ? rule.conf : 0.35,
  };
}

const STOP = new Set(['the', 'a', 'of', 'and', 'for', 'to', 'in', 'or', 'records', 'record', 'log', 'logs']);
const toks = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));

export function fixtureMatches(
  files: { file_id: string; doc_type: string; description: string; author_or_officer: string | null }[],
  items: { request_item_id: string; description: string; category: string }[],
): { matches: TMatchProposal[] } {
  const matches: TMatchProposal[] = [];
  for (const f of files) {
    const fTok = toks(`${f.doc_type} ${f.description} ${f.author_or_officer ?? ''}`);
    let best: { item: typeof items[0]; score: number; shared: string[] } | null = null;
    for (const it of items) {
      const iTok = toks(`${it.description} ${it.category}`);
      const shared = [...fTok].filter((t) => iTok.has(t));
      const score = shared.length / Math.max(3, Math.min(fTok.size, iTok.size));
      if (!best || score > best.score) best = { item: it, score, shared };
    }
    if (!best || best.score === 0) continue;
    const confidence = Number(Math.min(0.97, best.score * 0.95 + 0.15).toFixed(2));
    matches.push({
      request_item_id: best.item.request_item_id,
      file_id: f.file_id,
      confidence,
      evidence: best.shared.length
        ? `Shared descriptors: ${best.shared.slice(0, 6).join(', ')}`
        : 'Weak descriptor overlap only',
    });
  }
  return { matches };
}

export function fixtureDraft(context: string): { body: string } {
  const item = context.match(/ITEM: (.+)/)?.[1] ?? 'the outstanding material';
  const first = context.match(/FIRST REQUESTED: (.+)/)?.[1] ?? '';
  const days = context.match(/AGE_DAYS: (\d+)/)?.[1] ?? '';
  const fu = context.match(/FOLLOWUPS: (\d+)/)?.[1] ?? '0';
  const received = context.match(/RECEIVED: (.+)/)?.[1] ?? 'none recorded';
  return {
    body: [
      `We write further to our disclosure request of ${first} concerning ${item}.`,
      `Our records show ${days} days have passed since that request, and ${fu} prior follow-up(s).`,
      `Material received to date in relation to this item: ${received}.`,
      `We would be grateful if you could confirm the status of the outstanding material, or advise if it is not in the Crown's possession.`,
    ].join('\n\n'),
  };
}
