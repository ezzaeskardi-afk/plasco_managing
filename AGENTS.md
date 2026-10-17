# AGENTS.md — پلاسکو منیجینگ (Plasco Managing)

Offline-first inventory PWA for a plastic-goods shop (retail + wholesale). Persian UI, RTL.
Read this file fully before every task. If a step prompt conflicts with this file, say so in one line and follow the step prompt.

## 0. Status

**Phase 1 is complete** (steps 0–8). Phase 2 and 3 are planned in `docs/ROADMAP.md`; do not build them from here without an explicit STEP prompt.
Deviations from the original brief, chosen while building, are listed in §11.

## 1. Context

- Shop: 1,000–5,000 plastic household products, 3 physical locations (shop floor, warehouse, basement), retail and wholesale.
- Runs as an installed PWA on iOS Safari, Android Chrome, Windows Edge/Chrome. All data stays on the device (IndexedDB). Phase 1 has no backend and no network calls at runtime.
- Users: owner (older, wants big numbers and simple forms), admin (developer), warehouse helper (counts and moves stock; must not see cost prices when cost-lock is on).
- Defaults: currency label "تومان", Jalali calendar, Persian digits in display. All configurable in Settings.

## 2. Working rules (non-negotiable)

1. Scope: do only the STEP you are given. No extra features, no speculative abstractions, no unrelated refactors. If something is ambiguous, choose the simplest option consistent with this file and state the choice in one line.
2. Read before you edit: open the current content of every file you will touch. Do not rely on your memory of earlier turns.
3. Dependencies: only those already in `package.json`. Need anything else → stop and ask.
4. TypeScript strict. No `any`, no `@ts-ignore`, no non-null assertions added casually. Validate external data (forms, imports, backups) with Zod.
5. Output: complete new/changed files only (never "rest unchanged"), then a summary of at most 5 lines and the verification commands. No tutorials, no restating the task, no alternatives.
6. Money = integer in the unit the user types (default Toman). Quantity = integer pieces. Never floats for money or quantity. Format only at the UI edge (`src/domain/format.ts`).
7. Stock changes go ONLY through `applyMovement()` / `applyTransfer()` / `undoMovement()` in `src/db/movements.ts`. Nothing else writes `stockLevels.qty` except `rebuildStockLevels()`. Movements are append-only; corrections are new compensating movements. (`setBin()` may write the `bin` field only.)
8. Every record has `id` (`crypto.randomUUID()`), `createdAt`, `updatedAt` (epoch ms). Deletes are soft (`deletedAt`). Repo helpers filter soft-deleted rows; UI code never queries tables directly, except `stockTakes` / `stockTakeItems` which are read through `db` in the stock-take feature.
9. Never edit an existing `db.version(n)`. Schema changes = new `db.version(n+1)` with an upgrade function.
10. No runtime network: no CDN, analytics, remote fonts or images. Everything is bundled.
11. Persian UI strings live in `src/i18n/fa.ts`. Identifiers and comments are English; commit messages are Persian (matching the existing log).
12. Keep files under ~300 lines; split by feature.
13. Every stock-changing or destructive action gives an Undo toast (preferred) or a confirm dialog.

## 3. Stack (fixed)

- Vite + React 19 + TypeScript strict. Package manager: npm. Scripts: `dev`, `build`, `typecheck`, `lint`, `check:rtl`, `test`, `verify` (runs all five).
- Tailwind CSS v4 via `@tailwindcss/vite`, shadcn/ui-style components hand-written in `src/components/ui/` (Radix primitives + `cva` + `tailwind-merge`). Logical utilities only.
- Radix `DirectionProvider dir="rtl"`; `<html lang="fa" dir="rtl">`.
- lucide-react icons. Mirror directional icons with `rtl:rotate-180` when needed.
- Dexie + dexie-react-hooks (`useLiveQuery`). Note: the installed typings only accept 1–2 arguments — pass `useLiveQuery<T>(querier, deps)` and handle `undefined` (no third default argument).
- react-router with `HashRouter`.
- react-hook-form + zod + `@hookform/resolvers`.
- @tanstack/react-virtual for long lists.
- sonner (toasts) + a Radix Dialog based bottom sheet (`src/components/ui/sheet.tsx`).
- vite-plugin-pwa (Workbox), `registerType: 'prompt'`; `base: './'` so the build works from any sub-path.
- Font: `@fontsource-variable/vazirmatn` (bundled, no CDN).
- Spreadsheets: **exceljs** loaded with dynamic `import()` (legacy `.xls` cannot be read); CSV: papaparse. SheetJS was not used because the npm remote tarball is blocked here.
- fflate for ZIP backups.
- Tests: Vitest + fake-indexeddb + jsdom (+ @testing-library/react for critical screens only).
- Phase 2 only, not before: `barcode-detector` (ponyfill, WASM hosted locally), `jsbarcode`, Recharts (lazy-loaded).

## 4. Structure

```
src/
  app/          router, providers, AppShell, version, install, errorLog, ErrorBoundary, PwaUpdate, settings-context
  db/           dexie, types, repos, movements, priceHistory, rebuild, backup, seed
  domain/       pure TS: normalizeFa, numbers, format, units, valuation, search, codes (+ domain.test.ts)
  features/     products/ stock/ stocktake/ dashboard/ importexport/ settings/
  components/   ui/ (shadcn style)   common/ (StockStack, QuantityInput, NumberField, Kpi)
  i18n/fa.ts
  lib/          utils (cn, date helpers), toast
  styles/tokens.css, styles/index.css
scripts/        check-rtl.mjs, gen-icons.mjs
docs/           ROADMAP.md (Phase 2 and 3)
```

## 5. Data model (Dexie schema v2)

See `src/db/types.ts` and `src/db/dexie.ts`. Summary:

```ts
export type ID = string;
export interface Base { id: ID; createdAt: number; updatedAt: number; deletedAt?: number }

export interface Brand extends Base { name: string; nameN: string; phone?: string; repName?: string; note?: string }
export interface Category extends Base { name: string; nameN: string; sort: number }
export interface Location extends Base { name: string; sort: number }

export interface Product extends Base {
  code: string;                 // unique, auto "P-00001", never reused, user-editable
  name: string;
  variant?: string; family?: string;
  nameN: string;                // normalizeFa(name + ' ' + variant + ' ' + family)
  brandId?: ID; categoryId?: ID;
  barcodes: string[];
  packLabel: string; packSize: number;
  buyPrice: number; retailPrice: number; wholesalePrice?: number;
  minStock?: number; note?: string; active: boolean;
}

export interface Photo { productId: ID; thumb: Blob; full: Blob; updatedAt: number }
export interface StockLevel { productId: ID; locationId: ID; qty: number; bin?: string; updatedAt: number }

export type MovementType =
  'initial' | 'receive' | 'sale' | 'return_in' | 'return_out' |
  'adjust' | 'count' | 'transfer_out' | 'transfer_in' | 'damage';

export interface Movement extends Base {
  productId: ID; locationId: ID; type: MovementType; qty: number;
  unitCost?: number; unitPrice?: number; refId?: ID; undoOf?: ID; note?: string; at: number;
}

export interface PriceChange { id: ID; productId: ID; field: 'buy' | 'retail' | 'wholesale'; oldValue: number; newValue: number; at: number; reason?: string }
export interface StockTake extends Base { locationId: ID; status: 'open' | 'applied' | 'cancelled'; appliedAt?: number; note?: string }
export interface StockTakeItem { id: ID; stockTakeId: ID; productId: ID; counted: number; systemQtyAtCount: number; at: number }
export interface ImportBatch extends Base { fileName?: string; created: number; updated: number; movements: number; undoneAt?: number; partialUndoAt?: number; partialRows?: number }
export interface ImportedProductFields { name?: string; brandId?: ID; code?: string; barcodes?: string[]; packLabel?: string; packSize?: number; buyPrice?: number; retailPrice?: number; wholesalePrice?: number }
export type ImportEntry =
  | { id: ID; batchId: ID; kind: 'product-created'; productId: ID }
  | { id: ID; batchId: ID; kind: 'product-updated'; productId: ID; before: ImportedProductFields }
  | { id: ID; batchId: ID; kind: 'movement'; movementId: ID; productId: ID }
  | { id: ID; batchId: ID; kind: 'brand-created'; brandId: ID };
export interface Setting { key: string; value: unknown }
export interface Settings {
  shopName: string; currencyLabel: string; textScale: number; theme: 'system' | 'light' | 'dark';
  nextProductNo: number; lastBackupAt?: number; costLockPinHash?: string; costLockEnabled: boolean;
  deviceName: string; devicePrefix: string;
}
```

```ts
db.version(1).stores({
  brands:         'id, nameN, updatedAt',
  categories:     'id, nameN, sort',
  locations:      'id, sort',
  products:       'id, &code, nameN, brandId, categoryId, family, *barcodes, updatedAt',
  photos:         'productId',
  stockLevels:    '[productId+locationId], productId, locationId',
  movements:      'id, productId, locationId, type, at, refId, [productId+at]',
  priceChanges:   'id, productId, at',
  stockTakes:     'id, locationId, status, updatedAt',
  stockTakeItems: 'id, stockTakeId, [stockTakeId+productId]',
  settings:       'key',
});
```

`db.version(2)` (the first schema change; version 1 stays untouched) repeats the block above and adds the import
journal, so a whole import can be undone as one batch:

```ts
imports:        'id, createdAt, undoneAt',
importEntries:  'id, batchId',
```

Indexing notes: never index booleans or possibly-undefined fields. Filter `deletedAt` and `active` in JS inside repo helpers.
`db.on('populate')` seeds three locations (مغازه، انبار، زیرزمین) and the default settings; `ensureDefaults()` is idempotent and runs on boot and after a restore.

## 6. Domain rules

- Product total = sum of `stockLevels.qty` over locations. `stockLevels` is a cache of the sum of `movements`; `rebuildStockLevels()` recomputes it (preserving `bin`) and runs after restore, merge and import.
- `applyMovement`: one read-write transaction over `movements` + `stockLevels`; new qty = old + qty; if result < 0 throw `InsufficientStockError`. Returns the appended `Movement`. Zero-quantity movements throw `MovementQtyMustBeNonZero`.
- `applyTransfer(productId, from, to, qty)`: two movements (`transfer_out`, `transfer_in`) sharing one `refId`, in one transaction; refuses the same location.
- `undoMovement(id)`: adds a compensating movement with `undoOf = id`. Cannot run twice (`AlreadyUndoneError`), and an undo cannot itself be undone. Undoing one leg of a transfer undoes both legs.
- Product update: when buy/retail/wholesale price changes, insert `PriceChange` rows in the same transaction (`diffPrices()` is the pure rule).
- Valuation: cost = Σ(total × buyPrice); retail = Σ(total × retailPrice); potential profit = retail − cost. Skip inactive/deleted products; totals ≤ 0 contribute 0.
- Stock state: `out` if total ≤ 0; `low` if `minStock` is set and total ≤ minStock; otherwise `ok`. `stackLevel()` maps that to 0–4 bars.
- Quantity entry: the user types packs + pieces; store pieces only (`packs × packSize + pieces`).
- Product code: `P-` + zero-padded `settings.nextProductNo`, incremented in the same transaction as the insert. A user-supplied code does not advance the sequence.
- Stock-take apply: for each counted item read the current qty at apply time, `delta = counted − current`; if delta ≠ 0 write a `count` movement via `applyMovement`. Uncounted products are untouched unless the user explicitly turns on "treat uncounted as zero" (confirm dialog). An applied session is locked.
- Import matching order: barcode > code > normalizeFa(name) + brandId. Always dry-run first; commit in chunks of ≤ 500 rows per transaction. Unknown brand names are created during commit.
- Search: normalize query → split on spaces → AND over tokens. Index entry text = normalizeFa(name, variant, family, code, brand name, category name) + barcodes, built in memory and rebuilt on product changes. Rank: exact barcode/code > name prefix > token match, ties broken with `Intl.Collator('fa')`. Debounce input 100 ms; cap results.
- Backup: ZIP containing `data.json` (`{ schemaVersion, exportedAt, tables }`) and `photos/<productId>-thumb.jpg` / `-full.jpg`. Restore validates with Zod; modes: Replace (wipe then load; device identity is kept) and Merge (by id, newer `updatedAt` wins), then `rebuildStockLevels()`.

## 7. Persian / RTL rules

- `normalizeFa()`: ي→ی, ك→ک, strip diacritics and tatweel, ZWNJ→space, Persian and Arabic digits→Latin, lowercase Latin, collapse whitespace, trim. Use it for search, dedupe and matching.
- `parseNumberInput()`: accept Persian/Arabic/Latin digits and the separators `,` `٬` `٫`; return `number | null`. Number inputs use `inputmode="numeric"` (or `decimal`) and are never `type="number"`.
- Display numbers with `Intl.NumberFormat('fa-IR')`. KPI numbers use a compact form (هزار / میلیون / میلیارد, one decimal); tapping shows the full value.
- Dates: store epoch ms; display Jalali via `Intl.DateTimeFormat('fa-IR-u-ca-persian')`; week starts Saturday. Date filters use the quick ranges (today / 7 days / 30 days / all) plus native date inputs annotated with their Jalali equivalent.
- Sort Persian text with `Intl.Collator('fa')`.
- Layout uses logical utilities only: `ms-* me-* ps-* pe-* start-* end-* text-start text-end border-s border-e rounded-s-* rounded-e-*`. Never `ml-* mr-* pl-* pr-* left-* right-* text-left text-right rounded-l-* rounded-r-* border-l border-r`.
- `scripts/check-rtl.mjs` (Node, no deps) scans `src/**/*.{ts,tsx,css}` for those physical classes, prints file:line, exits 1 on any hit. Wired as `npm run check:rtl`. Add `rtl-ok` in a comment to opt a line out.
- Wrap LTR tokens (phone numbers, product codes, barcodes, URLs, Latin model names) in an element with `dir="ltr"`.
- Mirror directional icons; do not mirror logos, photos or numerals.

## 8. Design system

Concept: quiet when everything is fine, loud only when attention is needed. One accent colour, one signature element (the stock stack).

**Tokens** (`src/styles/tokens.css`; mapped to shadcn variable names in `src/styles/index.css` via `@theme inline`):

```css
:root {
  --frost: #F1F5F6; --paper: #FFFFFF; --line: #DCE4E7; --ink: #12202A; --crate: #51626E;
  --basin: #0B7285; --basin-ink: #FFFFFF;
  --ok: #1F7A4D; --low: #B45309; --out: #C0262D;
  --radius-input: 10px; --radius-sheet: 20px; --radius-thumb: 12px; --text-scale: 1;
}
.dark { --frost: #0E161B; --paper: #151F26; --line: #26343D; --ink: #E7EEF1; --crate: #9DB0BB;
        --basin: #4DB6C8; --basin-ink: #06222A; --ok: #4CC38A; --low: #F0A04B; --out: #F2777C; }
html { font-size: calc(17px * var(--text-scale)); }
```

Tailwind utilities come from those tokens: `bg-frost`, `bg-paper`, `text-ink`, `text-crate`, `border-line`, `bg-basin`, `text-out`, `rounded-input`, `rounded-sheet`, `rounded-thumb`.

**Type:** Vazirmatn variable, one family. Line-height 1.7. Caption 0.8rem (minimum), small 0.9rem, body 1rem, title 1.2rem, heading 1.55rem, KPI numerals 2rem at weight 800. Weights: body/labels 500, headings 700, numerals 800.

**Signature — StockStack** (`src/components/common/StockStack.tsx`): up to 4 stacked rounded bars next to the quantity.
- Bars: total ≤ 0 → 0 filled (dashed outline); with `minStock`: ratio = total / minStock → ≤1: 1 bar, ≤2: 2, ≤4: 3, >4: 4; without `minStock`: 1–9: 1, 10–49: 2, 50–199: 3, ≥200: 4.
- Colour: ok → `--crate` (neutral), low → `--low`, out → `--out`. Never colour alone: the number is always shown.

**Layout:**
- Under 768 px: bottom nav `خانه | کالاها | ＋ | حرکات | بیشتر` — no page carries a title bar above its content (§11.23). The central "+" opens a bottom sheet: کالای جدید / ثبت ورود / ثبت خروج / انتقال / تعدیل / شمارش. Those entries navigate to full pages (no stacked modals).
- From 1024 px: navigation rail on the right (icons + labels), content max-width 1200 px, plus a floating "+" button.
- Page-level actions on a phone stick above the bottom nav: `sticky bottom-[calc(4rem+env(safe-area-inset-bottom)+0.5rem)]`, released at `lg`. The stock-take count bar (بازبینی اختلافها / لغو شمارش) is the reference.

**Patterns:**
- List row: min height 64 px, hairline divider, no card chrome. Content: 48 px thumb (radius 12), name (one line, ellipsis), "brand · code" in crate 0.9rem, total quantity + StockStack.
- Dashboard top: ONE surface with a 2×2 grid of numerals (pieces, SKU count, value at cost, value at retail), potential profit below. Not four separate cards.
- Forms: four core fields first; the rest under a "بیشتر" accordion. Labels above inputs. Input height ≥ 48 px, font-size ≥ 16 px.
- Filters: horizontally scrolling chips.
- Empty state: one sentence + one button. Error: what happened + what to do next. No apologies.
- Motion only in response to a user action. No entrance animations, no hover transitions on every element. Respect `prefers-reduced-motion`.
- Accessibility: contrast ≥ 4.5:1, visible focus ring (2 px basin, offset 2 px), Persian aria-labels, icons never the only carrier of meaning, touch targets ≥ 48 px.
- iOS: `viewport-fit=cover`, safe-area paddings via `env(safe-area-inset-*)` (`safe-b` / `safe-t` utilities), `100dvh` not `100vh`, `-webkit-tap-highlight-color: transparent`, `overscroll-behavior: contain` inside sheets.

**Copy glossary:** کالا، برند، دسته، مکان، قفسه، موجودی، ثبت ورود، ثبت خروج، انتقال، تعدیل، خرابی، شمارش، انبارگردانی، واگرد، ارزش خرید، ارزش فروش، سود بالقوه. An action keeps the same name through the flow (button "ثبت ورود" → toast "ورود ثبت شد" + "واگرد"). Sentence case, plain verbs.

## 9. PWA & data safety

- Manifest: name "پلاسکو منیجینگ", short_name "پلاسکو", `lang: "fa"`, `dir: "rtl"`, `display: "standalone"`, `start_url: "./"`, `scope: "./"`, `theme_color: "#0B7285"`, `background_color: "#F1F5F6"`; icons 192 and 512, a maskable 512, apple-touch-icon 180 (generated by `npm run icons`, no image libraries).
- Service worker precaches the build only (no runtime caching, no network calls). `registerType: 'prompt'`: an "update available" toast with a refresh action. The toast is pinned at the top of the screen, so it must stay dismissible (close button with a thumb-sized hit area) and carry a stable `id` — a phone user must never lose the top of the page (or the search field) to it.
- After the first product is saved the app calls `navigator.storage.persist?.()`; Settings/Data show `navigator.storage.estimate()` and `storage.persisted()`.
- Install UX: on Android/Windows capture `beforeinstallprompt` (see `src/app/install.ts`) and offer an install button; on iOS Safari (not standalone) show the Share ← Add to Home Screen instruction.
- Backups: a banner appears on the dashboard when `lastBackupAt` is older than 7 days. Sharing uses `navigator.share({ files })` when supported, otherwise a download.
- Photos: resized in a canvas to 800 px on the long side, JPEG quality 0.75 plus a 160 px thumbnail. Thumbnails load lazily with a cached object URL.
- The app is wrapped in an error boundary; the last 50 errors are kept in `localStorage` and copied from Settings.
- No telemetry, no third-party scripts.

## 10. Definition of done (every step)

- `npm run verify` passes: typecheck, lint, check:rtl, test, build.
- Works offline after the first load (verify with DevTools offline mode).
- No console errors or warnings.
- Checked at 360 px, 768 px and 1280 px in RTL, light and dark.
- New domain logic has Vitest tests including edge cases (Persian digits, ي/ك, ZWNJ, negative stock, rollback on failure).
- No unused code or dependencies; no files over ~300 lines.

## 11. Recorded deviations from the original brief

1. **UI source**: shadcn/ui-style components are written by hand under `src/components/ui/` instead of running `npx shadcn@latest init --rtl`, which needs an interactive network CLI. Same Radix + cva + logical-utility result, and `check:rtl` enforces direction safety. "UI UX Pro Max" is used as a *method* (its design rules are baked into §8); Open UI is unrelated to this project and was not used.
2. **Spreadsheets**: SheetJS from its tarball could not be fetched (npm remote fetching is disabled in this environment), so the documented fallback **exceljs** is used. Legacy `.xls` files cannot be read; `.xlsx` and `.csv` are supported. `exceljs` is loaded with dynamic `import()` (its own chunk).
3. **App name**: "پلاسکو منیجینگ" (configurable in Settings) instead of "انبارک".
4. **Jalali date filtering**: quick ranges plus native date inputs with a Jalali caption instead of a custom calendar component; a full bisectable Jalali picker is deferred to Phase 2 (`docs/ROADMAP.md`).
5. **`src/lib/`** was added for `cn`/date helpers and toast helpers; the rest of the structure matches §4.
6. **Stock-take tables** are read directly through `db` inside the stock-take feature (no repo layer for them yet).
7. **Stock-take apply** is centralized in `src/db/stocktake.ts` (`applyStockTake` / `revertStockTake`), runs in a single transaction (all-or-nothing), asks for confirmation with the number of products it will change, and offers Undo in the toast; an applied session also has a "بازگردانی اعمال" button. Reason: a review pass found sessions flipped to `applied` with nothing counted — silent, irreversible, and impossible to redo.
8. **Import undo is a journal, not a rollback.** `commitRows` writes `imports` / `importEntries` in the same transaction as the data (created products and brands, the before-value of every field the file carried, every movement id); `undoImportBatch` then reverts the batch in one transaction — compensating movements, restored field values (each price change logged with reason `undo-import`), soft-deleted created rows, unused brands soft-deleted, and only the journal rows it reverted are cleared. It is **per-row**: `planImportUndo` judges every row against the live shelves (movement rows that fit are compensated largest-first, a created product only goes when the compensations leave nothing on its shelves *and* no movement row stays behind pointing at it, brands stay while any live product uses them). Rows whose stock was sold since cannot compensate without pushing a shelf below zero: they stay in the journal, `ImportUndoBlockedError` (carrying the named rows) is only thrown when *nothing at all* can be reverted, and a partial undo marks the batch `partialUndoAt` / `partialRows` so the history offers «واگرد باقی‌مانده» — a later delivery lifts the block. The app watches for that: after any stock operation that adds pieces, `suggestImportUndoRemainder` asks `revertibleImportRemainders` whether a waiting remainder now reverts **whole**, and if so offers it right there — a toast naming the file and the row count whose «برگرداندن بقیه» chip finishes the batch in **one tap** with no confirmation dialog (the offer only exists when the plan has zero blocked rows, so the dialog added nothing but a second tap). It is best-effort by design: nothing to offer, or a journal that cannot be read, stays silent instead of raising an error over a suggestion. The dry run and the per-row warnings stay the first line of defense, and only the 20 newest imports stay undoable.
9. **Variant / family merged into the name**: the product form no longer has «نسخه / رنگ / سایز» and «گروه مدل» — the shop types "ظرف غذا قرمز ۱۰ لیتری" in the name instead. Existing rows keep their stored values (price-only or partial updates never clear them), and search still matches them.
10. **Quick price entry**: `PriceEditSheet` writes only the three prices through `updateProduct` (which logs the price history and keeps every other field), reachable from every product row and the product card. Full-form editing still exists for everything else.
11. **Photo bytes in a backup** can only be verified in a browser: `fake-indexeddb` returns `{}` for a stored `Blob`, so the unit test asserts the readable error path instead.
12. **Opening the build from the file system** (`file://`) is impossible: the browser refuses to run a `<script type="module">` from an opaque origin, so `dist/index.html` would just stay blank. `index.html` therefore ships a small inline notice (stripped from `preview.html`) explaining that it needs a server, and `npm run preview:file` (= `build` + `preview:build`) produces `dist/preview.html` — the whole app inlined in one file for double-clicking on a PC. It has no service worker and no install; only `localhost`/https gives those. If the browser refuses IndexedDB at startup (private mode, blocked storage, some `file://` cases) `main.tsx` renders `StartupError` with a Persian explanation instead of leaving the page blank.
13. **Deployment settings ship inside `dist/`**: `base: './'` plus relative `id` / `start_url` / `scope` in the manifest let one build run at a domain root, in a sub-folder and on localhost. `public/.htaccess` (Apache/cPanel) and `public/_headers` (Netlify/Cloudflare Pages) declare the `webmanifest` / `woff2` MIME types and `no-cache` for `index.html`, `sw.js` and `manifest.webmanifest` — without them Chrome will not offer install and a cached `sw.js` freezes users on the old version. Full upload/install/offline checklist: `docs/DEPLOY.md`. Publishing is one command: `npm run dist:zip` re-builds, prints the pre-publish checklist (`sw.js`, manifest, header files, icons, exceljs chunk, download size, build age) and writes `plasco-managing-dist.zip` with the *contents* of `dist/` at the zip root — the checklist refuses to write a zip when a critical piece is missing.
14. **Price-only import mode with remembered column mappings**: `Settings.importMappings` keeps up to 20 saved shapes (`{signature, headers, map, mode, label, usedAt}`); the signature is the normalized, sorted header list joined with `\u0000`, so the same company file matches even when its columns are reordered. The wizard restores map + mode as soon as the file is picked, and saves the mapping at dry-run time (not at commit) so the first stage of a two-stage price list is enough to teach it. In `prices` mode a row with no match is skipped as `missing` («در لیست کالاهای مغازه پیدا نشد.») instead of being created, a row with no price column filled is an error, and only the price fields the file carries are written — name, brand, code and stock stay untouched. A price list may carry only codes and prices (no name column): matching then uses barcode/code alone and the review shows the shop's own product name. The review screen lists at most 200 rows and says so when there are more, while the summary counts stay complete. Stage flow: stage one = full import (creates/updates), stage two = the new price list in prices mode.
15. **Persistent-storage request on the first run, not after the first product**: §9 of the brief said the app asks for `navigator.storage.persist()` after the first product is saved; instead `main.tsx` asks once on first launch (`askPersistOnFirstRun`, after `ensureDefaults`, flag in `settings.persistAskedAt`) — the data matters from the first import, and asking once at boot keeps Firefox from prompting on every start. A live query was tried first and caused a request loop (defaults are returned before the settings row loads), so the flag is read from the table directly. The state (`granted` / `best-effort` / `unsupported`) and a manual request button are shown in «بیشتر ← ماندگاری داده».
16. **«وضعیت اپ» page** (`#/more/status`, `src/features/settings/StatusPage.tsx`): version + schema generation, service-worker state (preview / unsupported / none / installing / waiting / active), offline cache buckets and file count, storage estimate, last backup, and install state — read-only, with a refresh button. Everything is read through `src/app/appStatus.ts`, where each reader degrades to a plain state instead of throwing: a status screen that itself fails is worse than one that says it cannot tell. The waiting-update state lives in `src/app/updateStore.ts` so the update toast and this page offer the same «به‌روزرسانی و راه‌اندازی مجدد» action instead of disagreeing.
17. **Toasts label their own buttons**: sonner 1.7.1 hard-codes the close circle's `aria-label` to the English "Close toast" — it reads `closeButtonAriaLabel` inside its `Toast` component but the `Toaster` never forwards it, and the `ToastOptions` type it *is* typed with is not exported (so it cannot be augmented). The app therefore never renders that close button: the update toast carries its own Persian `cancel` chip («بستن»), which dismisses the toast and picks up the same 44 px thumb rule as the action chip. Persian labels win over a library default (§8).
18. **A native Android app lives in `android/`** (Kotlin + Jetpack Compose + SQLite), built on request as a separate tree: it is not part of the PWA build, `npm run verify` does not touch it, and it shares the domain rules, the token colours and the Persian glossary — not code. Same table names and the same movement invariants (`stockLevels` is written only by the movement engine and `rebuildLevels()`); each device keeps its own data, so the two apps are not synced. Setup, what works and what is still missing: `android/README.md`. Barcode reading (`android/app/src/main/java/ir/plasco/managing/ui/scan/`) uses CameraX plus ML Kit's **bundled** `barcode-scanning`, whose model ships inside the APK — the play-services variant that downloads it at runtime is deliberately not used, so the app stays offline. Camera is the only permission the app asks for, and it is requested on the first scan. That library also pulls `com.google.android.datatransport:transport-backend-cct`, whose only contribution is the `INTERNET` permission plus diagnostic uploads to Google; it is excluded in `app/build.gradle.kts` (the bundled model still lives in the APK, and `INTERNET` is absent from the final manifest), so §2.10/§9's no-network and no-telemetry rules hold on Android too. Matching reuses §6's rule in Kotlin (`domain/Barcode.kt`): barcode first, then product code, with UPC-A ↔ EAN-13 leading-zero equivalence. Product photos (`data/PhotoCodec.kt`, `data/PhotoStore.kt`, `ui/components/PhotoSection.kt`) follow §9's numbers — longest side 800 px for the full image and 160 px for the thumb, both JPEG quality 75, EXIF rotation read in Kotlin (`domain/ExifOrientation.kt`) — live in a `photos` table (SQLite schema 2, created in `onUpgrade` so phones that had the app before photos get it too), are written only when the form is saved (gallery or camera via `FileProvider`), and show as the same 48 dp thumb in the list. The backup file is the same ZIP as here — `data.json` (schema generation 2) plus `photos/<productId>-thumb.jpg` / `-full.jpg` — so photos travel in both directions, and the two-way restore is verified rather than assumed: `src/db/backup.android.test.ts` validates and restores a real file produced by the app (fixture `src/db/fixtures/android-backup.zip`, which now carries a real phone photo; regenerate it by copying a fresh app backup over that path) and checks the JPEG headers plus the photo row landing in this app's `photos` table, and a real web backup with photos was restored inside the app on the emulator — the stored `photos` bytes were compared with `sha256` against the ZIP members and matched exactly (Blob contents are unreadable under jsdom, the same limitation `src/db/backup.test.ts` documents). Android's *merge* keeps this device's display settings (shop name, currency, theme, text scale, last-backup date) and only raises `nextProductNo`, matching the web's merge; *replace* takes the file's settings but keeps the device identity. The release build packages only the two phone ABIs (`arm64-v8a`, `armeabi-v7a`), since ML Kit's native engine is ~5 MB per architecture, and runs R8 (`isMinifyEnabled` with `isShrinkResources`), which took the artifact from ~34 MB to ~11 MB (one 3.7 MB dex instead of three); `debug` keeps `x86_64` so the emulator still installs, `proguard-rules.pro` documents both of its rules (`-dontwarn` for the one missing class, `com.google.android.datatransport.cct.CCTDestination`, absent because that telemetry module is excluded on purpose, and a `-keep` for ML Kit's reflectively-instantiated `ComponentRegistrar`s — without it R8 strips their no-arg constructors and barcode scanning dies silently behind the scanner's own `runCatching`, which an emulator round caught), and `bundleRelease` yields the AAB whose per-device download Play splits by ABI.
19. **The cost lock covers every cost surface, not just the numbers on screen** (a post-review hardening pass): `MoneyText` masks cost amounts, and with the lock on the places that would leak the same number indirectly switch off too — buy-price rows in the product price history show a lock chip, the quick price sheet hides the buy field (the unchanged value is resubmitted, so no price change is logged), the product form hides it only when editing an existing row (creating starts blank, so there it stays), the Excel/CSV product sheet drops the «قیمت خرید» and «ارزش خرید» columns, the products page falls back from the «ارزش» sort to name order (the option hides too), and the stock-take review orders its difference list by piece count instead of financial impact. In the same pass: replace-restore and «reset data» clear the import undo journal (a surviving `product-updated` row could otherwise rewrite prices after a wipe), `readBackup` refuses a file whose `schemaVersion` is newer than `SCHEMA_VERSION` with a readable Persian reason instead of half-loading it, and `listMovements` reads through the `at` and `[productId+at]` indexes (newest-first limit and date window run in the database; a pending type filter still runs in JS before the limit).
20. **Android backup timestamps were 32-bit truncated** (found by a code review of `android/` and fixed in 1.2.1): every epoch-ms column (`createdAt`, `updatedAt`, `deletedAt`, `at`, `appliedAt`) was read with `getInt` on export and `optInt` on import (`data/Backup.kt`), so a 2024 backup carried 2001 dates — the merging rule («newer `updatedAt` wins») compared garbage, and importing a backup overwrote real timestamps with truncated ones. Both sides now use `getLong`/`optLong`. The Android fixture `src/db/fixtures/android-backup.zip` was produced by the broken build and was repaired by adding a single `417×2^32` — the unique wrap count that lands every one of its 58 timestamps in the same working session as `exportedAt` — and `backup.android.test.ts` asserts every timestamp stays within two days of `exportedAt` so the regression cannot come back silently. In the same pass the Android side moved backup/restore and the whole restore path to `Dispatchers.IO` (they ran on Main and could ANR), the dashboard KPIs/per-location sums match this app's `valuate` exactly («چند نوع کالا» = `productCount`), product delete got a confirm dialog, restore errors surface their real cause (including the schema-newer message), an empty stock-take can no longer be applied (UI guard plus a `StockTakeEmpty` guard in the repo), duplicate product codes are checked on update too, tone colours follow the app theme, movement rows colour by the quantity's sign like `labels.ts` (return-out and initial were colourless before), stock-take rebuild keeps bin-only rows like `rebuild.ts`, and `allowBackup` is off so the shop database never rides Google's cloud backup.
21. **Android navigation and search performance** (a second review pass, shipped as 1.2.2): `navigation-compose` 2.10's default 700 ms fade made every tab switch feel slow — the NavHost now uses 150 ms `fadeIn`/`fadeOut`, and bottom-bar tabs navigate with the standard `popUpTo(findStartDestination()) { saveState } + launchSingleTop + restoreState` so each tab keeps its scroll position and search text instead of being rebuilt (the old `popUpTo(Home)` recreated every screen and stacked duplicate entries). Form routes now light up their tab (`products/new`, `products/{id}` → کالاها; `movements/new…` → ＋; `more/data` → بیشتر) instead of no tab at all. The products list silently capped its unfiltered view at 200 rows (`searchProducts`'s default `limit`) — a shop with more SKUs never saw the rest and the subtitle reported «۲۰۰ کالا»; the blank query now returns everything. Search itself no longer rebuilds `normalizeFa` text for every product on every keystroke: `domain/Search.kt` gained `ProductSearchIndex` (precomputed entry texts + a name-sorted list) which `searchProducts` delegates to, so the DomainTest contract is unchanged while typing stays flat on several thousand products. `PhotoStore` no longer caches full 800 px bitmaps in its LRU (only thumbs — a few dozen full bitmaps could hold hundreds of MB), `DataHub` exposes a `movementCount` read straight from SQLite so the backup screen shows the true total instead of the 400-row in-memory page, and the low-stock section's «بیشتر» button (which led to the movements list, an unrelated destination the web app never had) was removed.
22. **Android cost lock, destructive-action confirms and lint hygiene** (a third review pass, shipped as 1.2.3): the cost lock existed in the Android schema, settings repo and backup reader/writer but was dead weight — a web backup could carry `costLockEnabled: true` and the phone still showed every cost. It now mirrors §19's surface where one applies on a phone: the home money KPIs (cost, retail, profit) render «•••» and the product form's buy field disappears **only when editing an existing row** (the unchanged value is resubmitted, so no price change is logged; creating a new product keeps the field because it starts blank — the same rule as the web). The toggle lives in «بیشتر ← تنظیمات» and saves immediately. In the same pass: stock-take apply and revert ask «مطمئنی؟» (`applyConfirm` carries the changing-product count, matching the web dialog's wording), and label deletion gets a confirm dialog standing in for the web's undo toast. Lint went from 8 warnings to 3: `dataExtractionRules` now excludes cloud backup *and* device-to-device transfer on Android 12+ (`allowBackup=false` only covers cloud there), the launcher icon moved to `mipmap-anydpi` and gained a `<monochrome>` layer for themed icons, two unused color resources were dropped, and a dead `findProduct` helper was deleted. The three remaining warnings are deliberate: the release ships only the two phone ABIs (ML Kit's native engine is ~5 MB per architecture) and the two KTX suggestions would swap working raw SQLite/Bitmap calls for dependency sugar.
23. **No titles at the top of any page** (a user request, shipped straight to the PWA): the sticky bar that every page except «خانه» carried — printing the page's own name at the top («کالاها»، «ورود و خروج»، …) — is gone, and the sidebar rail no longer prints the shop name next to its mark (the icon stays). The user reads any name written at the top of a page as noise: the rail, the bottom nav and the content itself already say where you are, and «خانه» had lost its bar for the same reason earlier. The bar's `safe-t` padding moved to `<main>`, so content still clears a phone notch; the shop name still lives in Settings and as the hint on the More row.

24. **Grouped money fields and carton entry** (a user request, built for web and Android together; shipped as Android 1.2.4): **grouped money fields** — `NumberField` gained `group` (web, `src/components/common/NumberField.tsx`) and `groupThousands` (Android, `ui/components/Fields.kt`, split out of `Bits.kt`): while typing, the value shows fa-IR separators (`۲٬۱۰۰٬۰۰۰`) and a suffix label (the currency, `settings.currencyLabel.trim() || 'تومان'` on the web) inside the field; the caret survives regrouping by counting the digits right of it and re-placing it after the same count in the formatted text (`digitsRightOf`/`caretFromRight` in `src/domain/numbers.ts` and `domain/Numbers.kt`; the fallback is a caret at position 0, not end-of-text). Initial price values in the form/sheet are pre-formatted with `formatNumber` (prices only — `minStock`/`packSize` stay plain). **Carton entry** — «ثبت ورود/خروج» takes «تعداد کارتن» × «تعداد در کارتن» + «عدد» (web `CartonInput.tsx`, reusing the `StepButton` exported from `QuantityInput`; Android inside `MovementScreen`), with a live «جمع» line, ± steppers and a hint when per-carton is empty; the store rule is unchanged: `cartons × perCarton + pieces` through `cartonPieces()` (`src/domain/units.ts` / `domain/Units.kt`). A per-carton count typed there is saved onto the product (`packSize`, and `packLabel: 'عدد'` → «کارتن») only when it differs, is ≥ 2 and the op is not adjust; changing the selected product resets the entry (web: `key={product?.id}` remount plus an `entryPackSize` reset effect; Android: `LaunchedEffect(selected?.id)`). **An Android update check was built and then removed on the user's word**: `UpdateClient`/`UpdateDialog`/`isNewerVersion` read GitHub's `releases/latest` and offered a download dialog, but the user chose to keep the app permission-free, so the manifest is back to `CAMERA` alone and the PWA remains the only update channel for phones too (the web `PwaUpdate.tsx` still re-checks the service worker on `online`, on visibility and hourly, with the existing confirm/dismiss toast). **Do not re-add `INTERNET`/the update check to Android unless the user asks again** — the removal is deliberate, not an oversight.
