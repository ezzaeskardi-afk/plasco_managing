// Builds dist/preview.html: the whole app inlined into one file, so a plain
// static file server can open it with no sibling asset requests.
// Everything local works (IndexedDB, photos, exports via CSV); the service
// worker is skipped and the lazy exceljs chunk (Excel import/export) is not
// available in this preview.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const dist = fileURLToPath(new URL('../dist', import.meta.url));
const assetsDir = join(dist, 'assets');

const OPEN_TAG = '<' + 'script';
const CLOSE_TAG = '<' + '/' + 'script>';
// Inside an inlined script a literal closing tag must be escaped.
const SAFE_CLOSE_TAG = '<' + '\\/' + 'script>';

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const assets = readdirSync(assetsDir);

const jsFile = assets.find((name) => /^index-.*\.js$/.test(name));
const cssFile = assets.find((name) => /^index-.*\.css$/.test(name));
if (!jsFile || !cssFile) {
  console.error('preview build failed: run `npm run build` first');
  process.exit(1);
}

const js = readFileSync(join(assetsDir, jsFile), 'utf8').split(CLOSE_TAG).join(SAFE_CLOSE_TAG);

// Fonts referenced by the CSS become data URLs so the preview stays one file.
const css = readFileSync(join(assetsDir, cssFile), 'utf8').replace(
  /url\((\.\/)?([A-Za-z0-9._-]+\.woff2)\)/g,
  (match, _prefix, filename) => {
    const path = join(assetsDir, filename);
    try {
      return `url(data:font/woff2;base64,${readFileSync(path).toString('base64')})`;
    } catch {
      return match;
    }
  },
);

const out = html
  .replace(/<link rel="manifest"[^>]*>/, '')
  // preview.html is the file you *do* open from file://, so the "open me from a
  // server" notice must not appear there.
  .replace(/<!-- file-open-notice:start -->[\s\S]*?<!-- file-open-notice:end -->/, '')
  .replace(/<link rel="modulepreload"[^>]*>/g, '')
  // Function replacers: `$` sequences inside the bundle would otherwise be
  // interpreted as replace patterns ($&, $', ...) and corrupt the output.
  .replace(/<link rel="stylesheet"[^>]*>/, () => `<style>${css}</style>`)
  .replace(
    /<script type="module"[^>]*src="\.\/assets\/[^"]+"[^>]*><\/script>/,
    () =>
      `<script>window.__PLASCO_PREVIEW__ = true;</script><script type="module">${js}</script>`,
  )
  .replace(/<link rel="icon"[^>]*>/, '')
  .replace(/<link rel="apple-touch-icon"[^>]*>/, '');

// The file:// notice must not survive into preview.html (that is the one file you
// are supposed to open from the file system) — a missing marker pair would leave it.
if (out.includes('file-open-notice')) {
  console.error('preview build failed: file-open notice block was not stripped');
  process.exit(1);
}

// Exactly two inline scripts (the preview flag and the bundle) must exist: an
// unescaped closing tag inside the bundle would split the script in the browser.
const closingTags = out.split(CLOSE_TAG).length - 1;
if (closingTags !== 2) {
  console.error(`preview build failed: expected 2 inline script tags, found ${closingTags}`);
  process.exit(1);
}

// Check the markup with the script bodies removed: the inlined bundle may
// legitimately contain `<script src=...>` strings from React internals.
const markupOnly = out.replace(/<script[\s\S]*?<\/script>/g, '');
if (/<script[^>]*src=/.test(markupOnly) || /<link rel="stylesheet"/.test(markupOnly)) {
  console.error('preview build failed: external asset references remain in the markup');
  process.exit(1);
}

writeFileSync(join(dist, 'preview.html'), out);
console.log(`wrote dist/preview.html (${Math.round(out.length / 1024)} KB, single file)`);
