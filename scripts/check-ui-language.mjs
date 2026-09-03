/**
 * The language rule applies to the UI copy too, not only to generated text.
 * The Stitch mockups shipped phrasings the rule forbids ("wilful non-disclosure",
 * "severe breach", "Charter risk high"); this check keeps them from coming back.
 */
import { readdir, readFile } from 'node:fs/promises';

const FORBIDDEN = [
  'improper', 'improperly', 'legally significant', 'wilful', 'willful', 'concealed',
  'misconduct', 'bad faith', 'severe breach', 'breach flagged', 'charter risk',
  'failed to comply', 'non-compliance', 'noncompliance', 'prejudicial',
  'abuse of process', 'unlawful', 'post-scan manipulation', 'motion to stay',
  'should escalate', 'escalation required', 'sanction protocol',
];

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...await walk(p));
    else if (/\.(tsx?|html)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = await walk('apps/web/src');
files.push('apps/web/index.html');
let hits = 0;
for (const f of files) {
  const src = (await readFile(f, 'utf8')).toLowerCase();
  for (const w of FORBIDDEN) {
    if (src.includes(w)) { console.error(`${f}: forbidden phrasing "${w}"`); hits++; }
  }
}
if (hits) { console.error(`\n${hits} language-rule violation(s) in UI copy`); process.exit(1); }
console.log(`UI language rule: ${files.length} files clean`);
