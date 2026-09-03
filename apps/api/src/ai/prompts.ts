/**
 * Versioned prompt templates. The version string is stored on every provenance row, so a
 * fact on screen can always be traced back to the exact prompt that produced it.
 */
export const PROMPT_VERSIONS = {
  extract_commitments: 'extract_commitments@3',
  classify_file: 'classify_file@2',
  propose_matches: 'propose_matches@2',
  draft_followup: 'draft_followup@2',
} as const;

const OBSERVATION_RULE = `
LANGUAGE RULE — ABSOLUTE:
State observations, never legal conclusions. You describe what is present, absent,
changed or requested. You never characterise conduct, never assess materiality,
sufficiency or significance, never recommend escalation, and never use words such as
improper, wilful, concealed, violation, breach, misconduct, prejudicial, non-compliance
or sanction. Correct: "Page 4 was present in the March package and is absent from the
June package." Incorrect: "the Crown improperly removed page 4."
You do not decide anything. You propose, and a human approves.`.trim();

export const EXTRACT_COMMITMENTS = (transcript: string, matters: string[]) => `
You extract COMMITMENTS from a legal assistant's call transcript for a criminal defence
firm. A commitment is something a person said they would do, or something that must
happen by a time — especially the incidental ones spoken in passing, which are the whole
point ("I'll send the signed affidavit by Friday", "call me back next Wednesday").

${OBSERVATION_RULE}

CRITICAL: you must NOT compute a date. Return the DATE PHRASE exactly as spoken
("next Wednesday", "tomorrow afternoon", "before court"). A deterministic resolver owns
all date arithmetic. If you output a calculated date you have broken the system.

Known matters: ${matters.join(', ') || '(none)'}

Return JSON: { "commitments": [ {
  "person_name": string|null, "matter_ref": string|null, "action_text": string,
  "date_phrase": string|null,
  "category": "court"|"client_commitment"|"deadline"|"follow_up"|"consultation"|"other",
  "direction": "firm_owes"|"client_owes"|"court_imposed"|"third_party_owes"|"unknown",
  "verbatim": string,  // the exact sentence from the transcript, quoted
  "confidence": number  // 0..1
} ] }

TRANSCRIPT:
"""${transcript}"""`.trim();

export const CLASSIFY_FILE = (filename: string, hint: string) => `
Classify one file from a Crown disclosure package for a criminal defence firm.
Filenames are unhelpful; use every clue available.

${OBSERVATION_RULE}

Return JSON: { "doc_type": string, "author_or_officer": string|null,
"occurrence_no": string|null, "event_date": string|null, "pages": number|null,
"duration_s": number|null, "description": string, "confidence": number }

doc_type is one of: officer_notes, witness_statement, 911_audio, body_worn_camera,
cctv, breath_test_record, lab_report, toxicology, production_order, chat_logs,
photographs, property_log, crown_memo, warrant_ito, calibration_certificate, other.

FILENAME: ${filename}
EXTRACTED HINTS: ${hint}`.trim();

export const PROPOSE_MATCHES = (files: string, items: string) => `
Propose which classified disclosure files satisfy which items on the firm's request
register. A file may match no item — that is a normal and important outcome, because
unrequested material can reveal items the firm never knew to ask for.

${OBSERVATION_RULE}

You propose only. You never change the status of a request item; deterministic code does
that from your confidences and a threshold policy you cannot see.

Return JSON: { "matches": [ { "request_item_id": string, "file_id": string,
"confidence": number, "evidence": string } ] }

REQUEST ITEMS:
${items}

CLASSIFIED FILES:
${files}`.trim();

export const DRAFT_FOLLOWUP = (context: string) => `
Draft the body of a short follow-up letter from a defence firm to the Crown about
outstanding disclosure. Plain, factual, courteous.

${OBSERVATION_RULE}
Additionally: do not threaten, do not cite consequences, do not mention applications,
stays or remedies. State what was requested, when, what has been received, and ask for
the outstanding material. Nothing more. This draft will NOT be sent — it goes to a
lawyer's review queue.

Return JSON: { "body": string }

CONTEXT (all figures below are computed deterministically; reuse them verbatim):
${context}`.trim();
