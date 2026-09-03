/**
 * The seed runs in FIXTURE MODE by default, even when a Kimi key is present.
 *
 * Stage data must be fast and byte-reproducible: the seed makes ~50 model calls, and a
 * sampled model would give a different demo every run. The real model belongs on the live
 * moments — Simulate Ava, and a package dragged in during the demo — where the room is
 * watching it work. Set SEED_USE_MODEL=1 to seed with the real model anyway.
 */
// Setting it empty rather than deleting it: a later `import 'dotenv/config'` would
// repopulate a deleted variable from .env, but never overrides one that is already set.
import 'dotenv/config';
if (!process.env.SEED_USE_MODEL) process.env.KIMI_API_KEY = '';

const { runSeed } = await import('../seed.js');
const { pool } = await import('../db.js');
const { modelName } = await import('../ai/provider.js');

console.log(`seeding with model: ${modelName()}${process.env.SEED_USE_MODEL ? '' : '  (fixture pinned; SEED_USE_MODEL=1 to use the real model)'}`);
console.log('seeded', await runSeed());
await pool.end();
