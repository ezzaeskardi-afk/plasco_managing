// Packs dist/ into one ZIP you can upload to any host, and prints a short
// pre-publish checklist first: service worker, manifest, header files, icons,
// lazy chunks and the total download size. Nothing is written unless every
// critical item is present, so a broken build cannot go out.
//
// Usage:
//   node scripts/pack-dist.mjs                  # checklist + plasco-managing-dist.zip
//   node scripts/pack-dist.mjs --check          # checklist only, no zip
//   node scripts/pack-dist.mjs --with-preview   # keep dist/preview.html in the zip
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const zipPath = join(root, 'plasco-managing-dist.zip');

const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');
const withPreview = args.has('--with-preview');

/** Persian digits, like the app itself. */
function fa(value) {
  return String(value).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

function kb(bytes) {
  // Same decimal mark the app uses (٫), so the numbers read the same way.
  if (bytes >= 1024 * 1024) return `${fa((bytes / (1024 * 1024)).toFixed(1).replace('.', '٫'))} مگابایت`;
  return `${fa(Math.round(bytes / 1024))} کیلوبایت`;
}

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.isFile()) files.push(full);
  }
  return files.sort();
}

/** name -> relative path (posix) of every file inside dist/. */
function indexDist() {
  const index = new Map();
  for (const full of walk(dist)) index.set(relative(dist, full).split(sep).join('/'), full);
  return index;
}

const problems = [];
const warnings = [];

function row(ok, text, level = 'critical') {
  const mark = ok ? '✓' : level === 'critical' ? '✗' : '⚠';
  console.log(`${mark}  ${text}`);
  if (!ok) (level === 'critical' ? problems : warnings).push(text);
}

/** A decision we made for you, not a problem. */
function info(text) {
  console.log(`•  ${text}`);
}

if (!existsSync(dist)) {
  console.error('✗  پوشهٔ dist پیدا نشد. اول این را بزن:  npm run build');
  process.exit(1);
}

const index = indexDist();
const sizes = new Map();
let downloadBytes = 0;
for (const [name, full] of index) {
  const size = statSync(full).size;
  sizes.set(name, size);
  if (name !== 'preview.html') downloadBytes += size;
}

const has = (name) => index.has(name);
const assets = [...index.keys()].filter((name) => name.startsWith('assets/'));
const assetJs = assets.filter((name) => name.endsWith('.js'));
const assetCss = assets.filter((name) => name.endsWith('.css'));
const fonts = assets.filter((name) => name.endsWith('.woff2'));

console.log('— چک‌لیست انتشار —');

// 1. The pieces a PWA cannot live without.
row(has('index.html'), 'index.html');
row(has('sw.js'), 'sw.js (سرویس‌ورکر: کار آفلاین و نصب)');
row(assetCss.length > 0 && assetJs.some((n) => /index-.*\.js$/.test(n)), 'جاوااسکریپت و CSS اصلی');

// 2. Manifest, with the relative paths that make one build work everywhere.
if (has('manifest.webmanifest')) {
  try {
    const manifest = JSON.parse(readFileSync(index.get('manifest.webmanifest'), 'utf8'));
    const relativeBase = manifest.start_url === './' && manifest.scope === './';
    const icons = Array.isArray(manifest.icons) ? manifest.icons.length : 0;
    row(
      relativeBase && icons >= 3,
      `manifest.webmanifest — «${manifest.name}» · ${fa(icons)} آیکون · start_url ${relativeBase ? 'نسبی (./)' : 'مطلق (به زیرپوشه دقت کن)'}`,
      relativeBase && icons >= 3 ? 'critical' : 'warn',
    );
  } catch (error) {
    row(false, `manifest.webmanifest خوانده نشد: ${error instanceof Error ? error.message : error}`);
  }
} else {
  row(false, 'manifest.webmanifest');
}

// 3. Header/MIME files: without them Chrome may refuse to install, and a cached
//    sw.js freezes users on the old version.
row(
  has('.htaccess') || has('_headers'),
  `هدرهای هاست (${['.htaccess', '_headers'].filter(has).join(' + ') || 'هیچ‌کدام'})`,
  'warn',
);
row(has('robots.txt'), 'robots.txt', 'warn');

// 4. Icons and the font: missing ones break install or the Persian type.
const icons = ['favicon.svg', 'pwa-192.png', 'pwa-512.png', 'pwa-maskable-512.png', 'apple-touch-icon.png'];
row(
  icons.every(has),
  `آیکون‌ها (${fa(icons.filter(has).length)}/${fa(icons.length)}: فاوآیکون، ۱۹۲، ۵۱۲، ماسکبل، اپل)`,
);
row(fonts.length > 0, `فونت وزیرمتن (${fa(fonts.length)} فایل woff2)`, 'warn');

// 5. The lazy exceljs chunk is pre-cached; without it Excel import/export fails offline.
row(
  assetJs.some((name) => /exceljs/.test(name)),
  'chunk اکسل (exceljs) برای ایمپورت/اکسپورت آفلاین',
  'warn',
);

// 6. Size: this is what the shop's phone downloads once.
const budget = 5 * 1024 * 1024;
row(
  downloadBytes <= budget,
  `حجم دانلود (بدون preview.html): ${kb(downloadBytes)} — سقف ${kb(budget)}`,
  'warn',
);
if (has('preview.html')) {
  info(
    withPreview
      ? 'preview.html داخل زیپ می‌ماند (برای باز کردن با دابل‌کلیک روی ویندوز)'
      : 'preview.html از زیپ بیرون گذاشته شد؛ برای نگه‌داشتنش: --with-preview',
  );
}

// 7. How fresh is the build? Zipping yesterday's dist is the classic slip.
const ageMinutes = Math.round((Date.now() - statSync(index.get('index.html')).mtimeMs) / 60000);
const ageText =
  ageMinutes < 1
    ? 'همین حالا'
    : ageMinutes < 60
      ? `${fa(ageMinutes)} دقیقه پیش`
      : ageMinutes < 60 * 48
        ? `${fa(Math.round(ageMinutes / 60))} ساعت پیش`
        : `${fa(Math.round(ageMinutes / (60 * 24)))} روز پیش`;
row(ageMinutes <= 60 * 12, `آخرین بیلد: ${ageText}`, 'warn');

if (problems.length > 0) {
  console.error(`\n✗  انتشار متوقف شد: ${fa(problems.length)} مورد حیاتی ناقص است. اول «npm run verify» را بزن.`);
  if (existsSync(zipPath)) {
    const minutes = Math.round((Date.now() - statSync(zipPath).mtimeMs) / 60000);
    console.error(`   زیپ جدیدی ساخته نشد؛ زیپ قبلی دست‌نخورده مانده (${minutes < 60 ? `${fa(minutes)} دقیقه پیش` : `${fa(Math.round(minutes / 60))} ساعت پیش`}).`);
  }
  process.exit(1);
}
if (warnings.length > 0) {
  console.log(`\n⚠  ${fa(warnings.length)} هشدار (بدون توقف) — با موردهای بالا تصمیم بگیر.`);
}

if (checkOnly) {
  console.log('\n✓  چک‌لیست تمام. زیپ ساخته نشد (--check). برای ساخت زیپ:  npm run dist:zip');
  process.exit(0);
}

const entries = {};
for (const [name, full] of index) {
  if (name === 'preview.html' && !withPreview) continue;
  entries[name] = new Uint8Array(readFileSync(full));
}
const zipped = zipSync(entries, { level: 6 });
writeFileSync(zipPath, zipped);

const biggest = [...sizes.entries()]
  .filter(([name]) => name.startsWith('assets/'))
  .sort((a, b) => b[1] - a[1])
  .slice(0, 3)
  .map(([name, size]) => `${name.split('/').pop()} ${kb(size)}`);

console.log(`\n✓  زیپ ساخته شد: plasco-managing-dist.zip`);
console.log(`   ${fa(Object.keys(entries).length)} فایل · ${kb(zipped.length)} (فشرده) · ${kb(downloadBytes)} (بازشده)`);
console.log(`   سنگین‌ترین فایل‌ها: ${biggest.join(' · ')}`);
console.log('\nآپلود: محتوای زیپ را در پوشهٔ سایت (public_html) باز کنید — خودِ زیپ را آپلود و Extract کنید.');
console.log('Netlify/Cloudflare Pages: پوشهٔ dist را بکشید و رها کنید (یا همین زیپ را).');
console.log('راهنمای کامل: docs/DEPLOY.md — و یادت باشد نسخهٔ قبلی را نگه داری تا در صورت مشکل برگردی.');
