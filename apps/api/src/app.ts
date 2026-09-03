/**
 * App factory — separate from the server entry point so Vercel serverless can import
 * the app without calling listen(). The singleton is initialised once per cold start.
 */
import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool, q } from './db.js';
import { runSeed } from './seed.js';

let ready: Promise<ReturnType<typeof Fastify>> | null = null;

async function migrate() {
  const sqlPath = fileURLToPath(new URL('../../../packages/db/schema.sql', import.meta.url));
  const sql = await readFile(sqlPath, 'utf8');
  await pool.query(sql);
}

async function ensureBootstrapped() {
  // On Vercel (or any cold-start environment) the external Postgres starts empty.
  // Migrate + seed if the matters table doesn't exist yet.
  try {
    await q(`SELECT 1 FROM matter LIMIT 1`);
  } catch {
    console.log('[spine] bootstrapping schema + seed data…');
    await migrate();
    await runSeed();
    console.log('[spine] bootstrap complete');
  }
}

export async function buildApp() {
  if (ready) return ready;
  ready = (async () => {
    await ensureBootstrapped();
    const { default: routes } = await import('./routes/index.js');
    const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'warn' } });
    await app.register(cors, { origin: true });
    await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024, files: 20 } });
    await app.register(routes);
    await app.ready();
    return app;
  })();
  return ready;
}
