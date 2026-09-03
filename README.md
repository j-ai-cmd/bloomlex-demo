# Spine

**Ava is the mouth and the hands. This is the spine.**

A durable store of obligations extracted from what an AI receptionist hears, held over time
with full provenance, which proposes actions back and never acts alone. One engine, two
surfaces:

- **Ava Calendar** — the horizontal surface. Every commitment Ava hears, especially the
  incidental ones spoken in passing that die inside call summaries today.
- **Disclosure Desk** — the deep vertical. One niche workflow (Crown disclosure tracking for
  criminal defence) done properly.

## There is no BloomLex integration

There is no public BloomLex API, webhook or developer documentation. The event contract in
this repo is a **proposal**. The simulator and a future real Ava webhook enter
`engine/ingress.ts` on an identical code path — the only difference is `event.source`. When
the webhook exists, no workflow code changes. `GET /v1/meta` says this out loud, and so does
the UI.

## Run it

```bash
docker compose up
```

API on `:8080`, UI on `:5173`. Without Docker:

```bash
npm install && npm run reset && npm run dev   # uses in-process Postgres (PGlite)
cd apps/web && npm run dev
```

`DATABASE_URL=postgres://…` uses real Postgres; `DATABASE_URL=pglite:./.pgdata` runs an
in-process Postgres so the whole system, seed and test suite work with no daemon.

**The Kimi API key is optional.** Without `KIMI_API_KEY` the AI layer runs in fixture mode —
same call sites, same schemas, same validation, deterministic heuristics instead of a model,
labelled `model = "fixture-v1"` on every provenance row. Drop the key into `.env` and the
same code path goes live. Never put the key in the frontend: the browser only ever talks to
this API, and this API talks to Kimi.

Three things the UI makes unmissable, because a demo must never imply fixture output came
from a model: the header states the active provider, and every classification, match and
diff row carries an origin badge — `FIXTURE — NOT A MODEL`, `MODEL · kimi-k2.6`, or
`DETERMINISTIC` — alongside its confidence, timestamp and whether a human has approved it.

### Kimi configuration, and why

- **Model `kimi-k2.6`**, base `https://api.moonshot.ai/v1`.
- **Extended thinking is disabled** (`thinking: {type: "disabled"}`, temperature `0.6`).
  With thinking on, a single extraction burned ~870 reasoning tokens and took **47s**; with
  it off the same call returns byte-identical JSON in **1.6s**. Every job here is
  extraction, classification or short prose — none of it needs deliberation, and 47s of
  silence kills a live demo. `KIMI_THINKING=1` turns it back on (the model then requires
  temperature `1`; the provider handles the switch).
- **Seeding is pinned to fixture mode even when a key is present.** The seed makes ~50 model
  calls; a sampled model would produce a different demo every run and take minutes instead
  of 1.8s. Stage data must be reproducible. `SEED_USE_MODEL=1` overrides this. The live
  moments — Simulate Ava, and a package dragged in — do use the real model.
- **The test suite is pinned to fixture mode too.** It asserts deterministic invariants and
  must never depend on a network call.

```bash
npm test        # 59 tests
npm run reset   # rebuild schema + fixtures + seed
```

## The five-minute walkthrough

1. **Calendar → today.** Commitments Ava heard. Click one: the verbatim sentence, the
   channel, the timestamp, the model, the prompt version, the confidence. Nothing exists
   here without that.
2. **A card marked CHANGED.** The client said Wednesday, then said Friday. Both records
   survive, linked, with the changed field recorded. Nothing was overwritten.
3. **Needs confirmation.** "next week" named a window, not a day. No date was invented —
   candidate dates are offered for one click. Alongside it, a mid-confidence extraction that
   *does* have a date, waiting for a nod. Two different reasons, never conflated.
4. **Simulate Ava.** Type a sentence, watch the trace: blue steps are the model, green steps
   are deterministic code. The model returns the phrase "by Friday"; a rules table resolves
   the date. The model never computes one.
5. **Disclosure Desk → R. v. Okafor.** 14 items. One outstanding 94 days with three prior
   follow-ups. One *partially received* — because a page observed absent is not the same as
   satisfied. Every number computed, none generated.
6. **Document diff.** A re-served notebook: page 4 present in March and absent in June,
   three new redaction regions, a changed embedded timestamp, a changed producer string.
   Observations only. Never a conclusion.
7. **Unmatched material.** One file nobody asked for. Kept, because extras can reveal items
   the firm never knew to ask for.
8. **Review queue.** Every proposal, with its evidence and provenance. Approving writes an
   audit row. **Actually sent: 0.** There is no outbound transport in the system at all.
9. **Drag a PDF in.** `POST /v1/files` writes it to disk and hands it to the *same*
   `disclosure.package.received` handler a portal delivery uses — no side door. It is
   hashed, page-counted, classified and reconciled live, and returns its run trace.

## Design decisions worth defending

**Provenance is a foreign key, not a convention.** Every derived table has
`provenance_id NOT NULL REFERENCES provenance(id)`. A fact without a source cannot be
inserted. A test asserts zero orphans.

**The deterministic/LLM boundary is provable.** The LLM extracts, classifies, proposes
matches and drafts prose. Deterministic code owns date arithmetic, business days, state
transitions, dedup, diffing, ageing, thresholds and every number the UI shows. A test walks
`core/` and fails if anything there imports the AI layer; the single exception, the
sweeper, may call exactly one function, and only for prose.

**A range is never collapsed into a guess.** The date resolver
(`core/dates/rules.ts`) is an inspectable table — 13 rules, each with an id, a description
and an example, exposed at `GET /v1/meta`. Rules that yield a range produce candidates and a
NEEDS CONFIRMATION item. A test asserts no range-yielding rule can ever return a point.

**The confidence policy lives in one file.** High applies automatically, medium creates the
record in NEEDS CONFIRMATION, low creates nothing and raises a review item. Every branch
taken is echoed into `run_step.decision`, so the reason is visible in the trace on stage.

**Later information never overwrites earlier information.** Exact-hash dedup catches
literal repeats; an overlap coefficient over subject tokens (with the date phrase stripped,
because the date is what changed) catches the same obligation restated. Both records
survive, linked, with a changed-field diff.

**There is no escalation state.** Escalation is legal strategy. The strongest thing the
system can say is "Follow-up recommended" or "Needs review". A test walks every state
machine and fails if an escalation-shaped state exists anywhere.

**The language rule is enforced twice.** The prompt templates forbid legal conclusions, and
a deny-list guard runs over every generated string before it is persisted. A hit fails the
step loudly and raises a review item rather than silently rewriting. Tests assert that no
diff observation, no draft, no classification and nothing persisted in the database contains
a forbidden phrasing.

**Approval is a distinct, logged human act.** `POST /v1/review-queue/:id/approve` refuses
without a known human actor. Execution is an audit row. Nothing is ever sent.

## Layout

```
apps/api/src/
  config/      confidence thresholds, firm constants (timezone, lookaheads)
  core/        DETERMINISTIC ONLY — time, dates/rules, states, dedup, diff,
               fingerprint, clock, sweeper.  No AI imports (enforced by test).
  ai/          the LLM boundary — provider (Kimi), versioned prompts, zod schemas,
               language guard, fixture-mode heuristics
  engine/      ingress (the one door), run traces + SSE, workflows, provenance
  routes/      REST + SSE
  tests/       dates, diff, states, language, boundary, api, pipeline
apps/web/      React + Vite, Google Stitch design tokens, consumes the API only
packages/db/   schema.sql
fixtures/      generated mock PDFs and media stubs, draggable during the demo
```

## Event contract (proposal)

```
POST /v1/events           Idempotency-Key header
  matter.opened               { matter_ref, client, charges[], key_dates }
  ava.conversation.completed  { matter_ref?, channel, occurred_at, transcript }
  disclosure.request.sent     { matter_ref, items[], channel, sent_at }
  disclosure.package.received { matter_ref, source, received_at, files[] }

outbound: action.proposed { type, matter_ref, rationale, payload, evidence[] }
```

Every call returns a `run_id`. `GET /v1/runs/:id` returns the step-by-step trace;
`GET /v1/runs/:id/stream` streams it over SSE.

## Not attempted, and said so in the UI

Semantic video comparison, semantic audio comparison, handwriting OCR. The diff engine
reports only what it can actually observe; where page fingerprints are unavailable it emits
fewer observations rather than inventing any.
