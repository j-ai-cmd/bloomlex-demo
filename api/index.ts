/**
 * Vercel serverless entry point.
 *
 * Vercel routes every /v1/* request here (see vercel.json). The Fastify app is a
 * module-level singleton — one cold start initialises it, subsequent invocations reuse it.
 *
 * DATABASE_URL must be set to a real Postgres URL in Vercel's env vars (Neon free tier
 * works). PGlite is in-process and stateless across invocations — unusable in serverless.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

let appPromise: Promise<any> | null = null;

function getApp() {
  if (!appPromise) {
    // Dynamic import so the cold-start cost is paid once.
    appPromise = import('../apps/api/src/app.js').then((m) => m.buildApp());
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp();
  app.server.emit('request', req, res);
}
