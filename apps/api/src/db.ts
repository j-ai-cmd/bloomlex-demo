/**
 * One query interface, two drivers.
 *
 *  - DATABASE_URL=postgres://...   real Postgres (docker compose, production path)
 *  - DATABASE_URL=pglite[:path]    in-process Postgres (PGlite) so the whole pipeline,
 *                                  the seed and the tests run with no daemon anywhere.
 *
 * Identical SQL either way; the driver is the only thing that changes.
 */
import 'dotenv/config';

const URL_ = process.env.DATABASE_URL ?? 'pglite';
const usePglite = URL_.startsWith('pglite');

type Driver = {
  query: (text: string, params?: any[]) => Promise<{ rows: any[] }>;
  end: () => Promise<void>;
};

let driverPromise: Promise<Driver> | null = null;

async function driver(): Promise<Driver> {
  if (driverPromise) return driverPromise;
  driverPromise = (async () => {
    if (usePglite) {
      const { PGlite } = await import('@electric-sql/pglite');
      const dataDir = URL_.includes(':') ? URL_.split(':').slice(1).join(':') : undefined;
      const pg = await PGlite.create(dataDir ? { dataDir } : {});
      return {
        query: async (text: string, params: any[] = []) => {
          // PGlite executes one statement per call; scripts send multi-statement SQL.
          if (/;\s*\S/.test(text.replace(/--[^\n]*\n/g, ''))) {
            await pg.exec(text);
            return { rows: [] };
          }
          const r = await pg.query(text, params);
          return { rows: (r as any).rows ?? [] };
        },
        end: async () => pg.close(),
      };
    }
    const pg = (await import('pg')).default;
    const pool = new pg.Pool({ connectionString: URL_ });
    return {
      query: (text: string, params: any[] = []) => pool.query(text, params) as any,
      end: () => pool.end(),
    };
  })();
  return driverPromise;
}

export const DRIVER = usePglite ? 'pglite' : 'postgres';

export async function q<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const d = await driver();
  const r = await d.query(text, params);
  return (r.rows ?? []) as T[];
}
export async function one<T = any>(text: string, params: any[] = []): Promise<T | undefined> {
  return (await q<T>(text, params))[0];
}
export const pool = { query: async (t: string, p: any[] = []) => (await driver()).query(t, p), end: async () => (await driver()).end() };
