-- Spine schema. Single firm, single timezone (America/Toronto), no auth, no tenancy.
-- PROVENANCE IS NOT NULL ON EVERY DERIVED FACT. That is enforced here, not by convention.

DROP SCHEMA public CASCADE; CREATE SCHEMA public;

-- ---------------------------------------------------------------- actors / firm
CREATE TABLE actor (
  id text PRIMARY KEY,
  name text NOT NULL,
  role text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('system','ai','human'))
);

CREATE TABLE client (
  id text PRIMARY KEY,
  name text NOT NULL,
  phone text,
  email text
);

CREATE TABLE matter (
  id text PRIMARY KEY,
  matter_ref text UNIQUE NOT NULL,
  client_id text REFERENCES client(id),
  practice_area text NOT NULL DEFAULT 'criminal',
  charges text[] NOT NULL DEFAULT '{}',
  stage text NOT NULL DEFAULT 'open',
  next_court_date date,
  key_dates jsonb NOT NULL DEFAULT '{}',
  crown_contact text,
  opened_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE person (
  id text PRIMARY KEY,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('client','lawyer','crown','officer','witness','other')),
  matter_id text REFERENCES matter(id),
  aliases text[] NOT NULL DEFAULT '{}'
);

-- ---------------------------------------------------------------- ingress / runs
-- One ingress for simulated events today and a real Ava webhook later.
CREATE TABLE event (
  id text PRIMARY KEY,
  type text NOT NULL,
  idempotency_key text UNIQUE NOT NULL,
  matter_ref text,
  channel text,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL,
  source text NOT NULL CHECK (source IN ('simulator','webhook'))
);

CREATE TABLE run (
  id text PRIMARY KEY,
  event_id text NOT NULL REFERENCES event(id),
  workflow text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued','running','succeeded','failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error text
);

CREATE TABLE run_step (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES run(id) ON DELETE CASCADE,
  seq int NOT NULL,
  kind text NOT NULL CHECK (kind IN ('deterministic','llm','io')),
  name text NOT NULL,
  input jsonb,
  output jsonb,
  model text,
  prompt_version text,
  rule_id text,
  confidence numeric(4,3),
  decision text,
  latency_ms int,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, seq)
);

-- ---------------------------------------------------------------- provenance
CREATE TABLE provenance (
  id text PRIMARY KEY,
  event_id text NOT NULL REFERENCES event(id),
  channel text NOT NULL,
  occurred_at timestamptz NOT NULL,
  verbatim_text text NOT NULL,
  model text NOT NULL,
  prompt_version text NOT NULL,
  confidence numeric(4,3) NOT NULL,
  extractor text NOT NULL CHECK (extractor IN ('llm','rule')),
  rule_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE supersession (
  id text PRIMARY KEY,
  entity_type text NOT NULL,
  superseded_id text NOT NULL,
  superseding_id text NOT NULL,
  changed_fields jsonb NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE state_transition (
  id text PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  from_state text,
  to_state text NOT NULL,
  trigger text NOT NULL,
  actor_kind text NOT NULL CHECK (actor_kind IN ('system','ai','human')),
  actor_id text REFERENCES actor(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  evidence jsonb NOT NULL DEFAULT '{}'
);

-- The boundary IS the product. Nothing here is ever sent.
CREATE TABLE action_proposal (
  id text PRIMARY KEY,
  type text NOT NULL,
  matter_id text REFERENCES matter(id),
  subject_type text,
  subject_id text,
  rationale text NOT NULL,
  payload jsonb NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL CHECK (status IN ('pending','approved','executed','rejected')),
  proposed_by text NOT NULL CHECK (proposed_by IN ('ai','system')),
  proposed_at timestamptz NOT NULL DEFAULT now(),
  dedup_key text UNIQUE,
  decided_by_actor text REFERENCES actor(id),
  decided_at timestamptz,
  decision_note text,
  executed_at timestamptz,
  provenance_id text REFERENCES provenance(id)
);

CREATE TABLE review_item (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN (
    'ambiguous_date','unresolved_matter','low_confidence_extraction',
    'low_confidence_match','anomaly_review','language_guard_violation')),
  matter_id text REFERENCES matter(id),
  title text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  candidates jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL CHECK (status IN ('open','resolved','dismissed')) DEFAULT 'open',
  provenance_id text NOT NULL REFERENCES provenance(id),
  resolved_by_actor text REFERENCES actor(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- surface 1: calendar
CREATE TABLE commitment (
  id text PRIMARY KEY,
  matter_id text REFERENCES matter(id),
  person_id text REFERENCES person(id),
  person_name text,
  action_text text NOT NULL,
  category text NOT NULL CHECK (category IN
    ('court','client_commitment','deadline','follow_up','consultation','other')),
  direction text NOT NULL CHECK (direction IN
    ('firm_owes','client_owes','court_imposed','third_party_owes','unknown')),
  due_date date,
  due_time time,
  time_precision text NOT NULL CHECK (time_precision IN
    ('exact','morning','afternoon','evening','allday','unresolved')),
  status text NOT NULL CHECK (status IN
    ('needs_confirmation','active','fulfilled','missed','superseded','cancelled')),
  dedup_key text,
  date_rule_id text,
  provenance_id text NOT NULL REFERENCES provenance(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE commitment_date_candidate (
  id text PRIMARY KEY,
  commitment_id text NOT NULL REFERENCES commitment(id) ON DELETE CASCADE,
  candidate_date date NOT NULL,
  label text NOT NULL,
  rule_id text NOT NULL,
  rank int NOT NULL
);

-- ---------------------------------------------------------------- surface 2: disclosure
CREATE TABLE request_register (
  id text PRIMARY KEY,
  matter_id text NOT NULL REFERENCES matter(id),
  sent_at timestamptz NOT NULL,
  channel text NOT NULL,
  letter_ref text NOT NULL
);

CREATE TABLE request_item (
  id text PRIMARY KEY,
  register_id text NOT NULL REFERENCES request_register(id),
  matter_id text NOT NULL REFERENCES matter(id),
  seq int NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  state text NOT NULL CHECK (state IN
    ('Requested','Acknowledged','Partially Received','Satisfied',
     'Refused','Needs Review','Follow-up Recommended')),
  first_requested_at timestamptz NOT NULL,
  satisfied_at timestamptz,
  last_followed_up_at timestamptz,
  provenance_id text NOT NULL REFERENCES provenance(id)
);

CREATE TABLE package (
  id text PRIMARY KEY,
  matter_id text NOT NULL REFERENCES matter(id),
  source text NOT NULL CHECK (source IN ('portal','email','usb','paper')),
  received_at timestamptz NOT NULL,
  label text NOT NULL,
  state text NOT NULL CHECK (state IN
    ('Received','Indexed','Classified','Reconciled','Anomalies Detected','Human Reviewed')),
  provenance_id text NOT NULL REFERENCES provenance(id)
);

CREATE TABLE dfile (
  id text PRIMARY KEY,
  package_id text NOT NULL REFERENCES package(id),
  matter_id text NOT NULL REFERENCES matter(id),
  original_filename text NOT NULL,
  mime text NOT NULL,
  bytes bigint NOT NULL,
  sha256 text NOT NULL,
  page_count int,
  duration_s numeric,
  logical_key text,
  storage_path text,
  fingerprint jsonb
);

CREATE TABLE classification (
  id text PRIMARY KEY,
  file_id text NOT NULL REFERENCES dfile(id),
  doc_type text NOT NULL,
  author_or_officer text,
  occurrence_no text,
  event_date date,
  pages int,
  duration_s numeric,
  description text NOT NULL,
  confidence numeric(4,3) NOT NULL,
  provenance_id text NOT NULL REFERENCES provenance(id)
);

CREATE TABLE match (
  id text PRIMARY KEY,
  request_item_id text NOT NULL REFERENCES request_item(id),
  file_id text NOT NULL REFERENCES dfile(id),
  confidence numeric(4,3) NOT NULL,
  evidence jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('proposed','confirmed','rejected')),
  decided_by_actor text REFERENCES actor(id),
  provenance_id text NOT NULL REFERENCES provenance(id),
  UNIQUE (request_item_id, file_id)
);

CREATE TABLE file_version (
  id text PRIMARY KEY,
  logical_key text NOT NULL,
  matter_id text NOT NULL REFERENCES matter(id),
  file_id text NOT NULL REFERENCES dfile(id),
  package_id text NOT NULL REFERENCES package(id),
  seq int NOT NULL,
  received_at timestamptz NOT NULL
);

CREATE TABLE diff (
  id text PRIMARY KEY,
  matter_id text NOT NULL REFERENCES matter(id),
  from_version_id text NOT NULL REFERENCES file_version(id),
  to_version_id text NOT NULL REFERENCES file_version(id),
  observations jsonb NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE followup (
  id text PRIMARY KEY,
  request_item_id text NOT NULL REFERENCES request_item(id),
  channel text NOT NULL,
  sent_at timestamptz NOT NULL,
  actor_id text REFERENCES actor(id),
  note text
);

CREATE INDEX ON commitment (due_date);
CREATE INDEX ON commitment (dedup_key);
CREATE INDEX ON request_item (matter_id);
CREATE INDEX ON dfile (matter_id);
CREATE INDEX ON match (file_id);
CREATE INDEX ON run_step (run_id);
CREATE INDEX ON file_version (logical_key);

-- UNMATCHED / UNREQUESTED MATERIAL is a view, never a status column, so it cannot drift.
CREATE VIEW unmatched_file AS
  SELECT f.*, c.doc_type, c.description, c.confidence AS classification_confidence
  FROM dfile f
  LEFT JOIN classification c ON c.file_id = f.id
  WHERE NOT EXISTS (
    SELECT 1 FROM match m WHERE m.file_id = f.id AND m.state IN ('confirmed','proposed')
  );
