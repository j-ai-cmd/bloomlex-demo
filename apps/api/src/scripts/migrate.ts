import { readFile } from 'node:fs/promises';
import { pool } from '../db.js';
import { fileURLToPath } from 'node:url';
const sql = await readFile(fileURLToPath(new URL('../../../../packages/db/schema.sql', import.meta.url)), 'utf8');
await pool.query(sql);
console.log('migrated');
await pool.end();
