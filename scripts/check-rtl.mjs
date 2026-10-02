#!/usr/bin/env node
// Fails when physical (LTR) direction utilities are used in src/.
// AGENTS.md section 7: layout must use logical utilities only.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const srcDir = join(root, 'src');

const DELIM = `[\\s"'\`}),;]`;
const CLASS_START = `(?:^|[\\s"'\`:{(])`;

/**
 * Tier A: a class token that always carries a value (ml-2, ps-... no: ms- is fine).
 * Anything after the prefix makes it a physical utility.
 */
const TIER_A = [
  'ml-',
  'mr-',
  'pl-',
  'pr-',
  'left-',
  'right-',
  'text-left',
  'text-right',
  'float-left',
  'float-right',
  'space-x-',
  'divide-x-',
  'origin-left',
  'origin-right',
];

/**
 * Tier B: `border-l` / `rounded-l` style prefixes that can collide with logical
 * utilities (`border-line`, `rounded-lg`). They only count when followed by a
 * value separator, a bracket or the end of the token.
 */
const TIER_B = ['border-l', 'border-r', 'rounded-l', 'rounded-r'];

const TIER_A_RE = new RegExp(`${CLASS_START}((?:[a-z0-9-]+:)*(?:${TIER_A.join('|')})[a-zA-Z0-9._/[\\]%-]*)`, 'g');
const TIER_B_RE = new RegExp(`${CLASS_START}((?:[a-z0-9-]+:)*(?:${TIER_B.join('|')})(?:[-[][a-zA-Z0-9._/[\\]%-]*)?)(?=${DELIM}|$)`, 'g');

// Lines that opt out explicitly.
const ALLOW = /rtl-ok/;

const hits = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(ts|tsx|css)$/.test(entry)) continue;
    // Test files may contain banned strings intentionally.
    if (/\.test\.(ts|tsx)$/.test(entry)) continue;
    const text = readFileSync(full, 'utf8');
    text.split(/\r?\n/).forEach((line, i) => {
      if (ALLOW.test(line)) return;
      for (const re of [TIER_A_RE, TIER_B_RE]) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(line)) !== null) {
          hits.push(`${relative(root, full).split(sep).join('/')}:${i + 1}: ${m[1]}`);
        }
      }
    });
  }
}

walk(srcDir);

if (hits.length > 0) {
  console.error(
    'Physical direction utilities found (use logical ms-/me-/ps-/pe-/start-/end-/border-s/border-e/rounded-s/rounded-e instead):',
  );
  for (const h of hits) console.error('  ' + h);
  process.exit(1);
}
console.log('check:rtl ok — no physical direction utilities in src/');
