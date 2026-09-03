/**
 * The deterministic/LLM boundary is provable, not merely documented:
 * nothing under core/ may import the AI layer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const coreDir = fileURLToPath(new URL('../core/', import.meta.url));

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = `${dir}${e.name}`;
    if (e.isDirectory()) out.push(...await walk(`${p}/`));
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

test('no module under core/ imports the AI layer', async () => {
  const files = await walk(coreDir);
  assert.ok(files.length >= 6);
  for (const f of files) {
    const src = await readFile(f, 'utf8');
    const offenders = [...src.matchAll(/from\s+'([^']+)'/g)]
      .map((m) => m[1])
      .filter((spec) => /(^|\/)ai\//.test(spec) && !f.endsWith('sweeper.ts'));
    assert.deepEqual(offenders, [], `${f} imports the AI layer: ${offenders.join(', ')}`);
  }
});

test('the one permitted exception is the sweeper, and only for drafting prose', async () => {
  const src = await readFile(`${coreDir}sweeper.ts`, 'utf8');
  const aiCalls = [...src.matchAll(/AI\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(aiCalls)], ['draftFollowup'],
    'the sweeper may only ask the model for prose; every figure is computed deterministically');
});

test('no date arithmetic lives outside core/time and core/dates', async () => {
  const files = await walk(fileURLToPath(new URL('../', import.meta.url)));
  for (const f of files) {
    if (f.includes('/core/') || f.includes('/tests/') || f.includes('/scripts/')) continue;
    const src = await readFile(f, 'utf8');
    assert.ok(!/setUTCDate|setDate\(|\* 86400000/.test(src), `${f} performs raw date arithmetic outside core/`);
  }
});
