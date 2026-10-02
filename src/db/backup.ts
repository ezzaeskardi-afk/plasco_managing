import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { z } from 'zod';
import { SCHEMA_VERSION } from '@/app/version';
import { formatProductCode } from '@/domain/codes';
import { db, type PlascoDb } from './dexie';
import type { Product } from './types';
import { rebuildStockLevels } from './rebuild';
import { getSettings, setSettings } from './repos';
import type { ID } from './types';

export class BackupInvalidError extends Error {
  constructor(readonly detail?: string) {
    super('BackupInvalid');
    this.name = 'BackupInvalidError';
  }
}

const base = {
  id: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().optional(),
};

const brandSchema = z.object({
  ...base,
  name: z.string(),
  nameN: z.string(),
  phone: z.string().optional(),
  repName: z.string().optional(),
  note: z.string().optional(),
});

const categorySchema = z.object({ ...base, name: z.string(), nameN: z.string(), sort: z.number() });
const locationSchema = z.object({ ...base, name: z.string(), sort: z.number() });

const productSchema = z.object({
  ...base,
  code: z.string(),
  name: z.string(),
  variant: z.string().optional(),
  family: z.string().optional(),
  nameN: z.string(),
  brandId: z.string().optional(),
  categoryId: z.string().optional(),
  barcodes: z.array(z.string()),
  packLabel: z.string(),
  packSize: z.number(),
  buyPrice: z.number(),
  retailPrice: z.number(),
  wholesalePrice: z.number().optional(),
  minStock: z.number().optional(),
  note: z.string().optional(),
  active: z.boolean(),
});

const movementSchema = z.object({
  ...base,
  productId: z.string(),
  locationId: z.string(),
  type: z.enum([
    'initial',
    'receive',
    'sale',
    'return_in',
    'return_out',
    'adjust',
    'count',
    'transfer_out',
    'transfer_in',
    'damage',
  ]),
  qty: z.number(),
  unitCost: z.number().optional(),
  unitPrice: z.number().optional(),
  refId: z.string().optional(),
  undoOf: z.string().optional(),
  note: z.string().optional(),
  at: z.number(),
});

const stockLevelSchema = z.object({
  productId: z.string(),
  locationId: z.string(),
  qty: z.number(),
  bin: z.string().optional(),
  updatedAt: z.number(),
});

const priceChangeSchema = z.object({
  id: z.string(),
  productId: z.string(),
  field: z.enum(['buy', 'retail', 'wholesale']),
  oldValue: z.number(),
  newValue: z.number(),
  at: z.number(),
  reason: z.string().optional(),
});

const stockTakeSchema = z.object({
  ...base,
  locationId: z.string(),
  status: z.enum(['open', 'applied', 'cancelled']),
  appliedAt: z.number().optional(),
  note: z.string().optional(),
});

const stockTakeItemSchema = z.object({
  id: z.string(),
  stockTakeId: z.string(),
  productId: z.string(),
  counted: z.number(),
  systemQtyAtCount: z.number(),
  at: z.number(),
});

const settingsSchema = z.object({ key: z.string(), value: z.unknown() });

export const backupSchema = z.object({
  schemaVersion: z.number(),
  exportedAt: z.number(),
  tables: z.object({
    brands: z.array(brandSchema),
    categories: z.array(categorySchema),
    locations: z.array(locationSchema),
    products: z.array(productSchema),
    stockLevels: z.array(stockLevelSchema),
    movements: z.array(movementSchema),
    priceChanges: z.array(priceChangeSchema),
    stockTakes: z.array(stockTakeSchema),
    stockTakeItems: z.array(stockTakeItemSchema),
    settings: z.array(settingsSchema),
  }),
});

export type BackupData = z.infer<typeof backupSchema>;

export interface BackupSummary {
  products: number;
  movements: number;
  photos: number;
  bytes: number;
}

function isPhotoEntry(name: string): boolean {
  return name.startsWith('photos/');
}

/**
 * Photos are stored as Blobs, but a stored value is not guaranteed to be one
 * (another implementation, an older row, a restore from elsewhere), so accept
 * every binary shape and fail with a readable error otherwise.
 */
async function toBytes(value: unknown): Promise<Uint8Array> {
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return new Uint8Array(await value.arrayBuffer());
  }
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new BackupInvalidError('photo-unreadable');
}

/** ZIP containing data.json plus photos/<productId>-thumb.jpg / -full.jpg. */
export async function createBackup(target: PlascoDb = db): Promise<{ blob: Blob; summary: BackupSummary }> {
  const [
    brands,
    categories,
    locations,
    products,
    stockLevels,
    movements,
    priceChanges,
    stockTakes,
    stockTakeItems,
    settings,
    photos,
  ] = await Promise.all([
    target.brands.toArray(),
    target.categories.toArray(),
    target.locations.toArray(),
    target.products.toArray(),
    target.stockLevels.toArray(),
    target.movements.toArray(),
    target.priceChanges.toArray(),
    target.stockTakes.toArray(),
    target.stockTakeItems.toArray(),
    target.settings.toArray(),
    target.photos.toArray(),
  ]);

  const data: BackupData = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    tables: {
      brands,
      categories,
      locations,
      products,
      stockLevels,
      movements,
      priceChanges,
      stockTakes,
      stockTakeItems,
      settings,
    },
  };

  const files: Record<string, Uint8Array> = {
    'data.json': strToU8(JSON.stringify(data)),
  };
  for (const photo of photos) {
    files[`photos/${photo.productId}-thumb.jpg`] = await toBytes(photo.thumb);
    files[`photos/${photo.productId}-full.jpg`] = await toBytes(photo.full);
  }

  const zipped = zipSync(files, { level: 6 });
  const blob = new Blob([zipped as unknown as BlobPart], { type: 'application/zip' });
  await setSettings({ lastBackupAt: Date.now() }, target);

  return {
    blob,
    summary: {
      products: products.length,
      movements: movements.length,
      photos: photos.length,
      bytes: blob.size,
    },
  };
}

/** Blob.arrayBuffer() is missing in some environments (older WebKit, jsdom). */
async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(new BackupInvalidError('read-failed'));
    reader.readAsArrayBuffer(blob);
  });
}

export async function readBackup(file: Blob): Promise<{
  data: BackupData;
  photos: Map<ID, { thumb?: Uint8Array; full?: Uint8Array }>;
}> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(await blobToBytes(file));
  } catch (error) {
    throw new BackupInvalidError(error instanceof Error ? error.message : 'unzip failed');
  }
  const dataEntry = entries['data.json'];
  if (!dataEntry) throw new BackupInvalidError('data.json missing');

  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(dataEntry));
  } catch (error) {
    throw new BackupInvalidError(error instanceof Error ? error.message : 'bad json');
  }

  const result = backupSchema.safeParse(parsed);
  if (!result.success) throw new BackupInvalidError(result.error.issues[0]?.message);

  const photos = new Map<ID, { thumb?: Uint8Array; full?: Uint8Array }>();
  for (const [name, bytes] of Object.entries(entries)) {
    if (!isPhotoEntry(name)) continue;
    const match = /^photos\/(.+)-(thumb|full)\.jpg$/.exec(name);
    if (!match) continue;
    const [, productId, kind] = match as unknown as [string, string, 'thumb' | 'full'];
    const entry = photos.get(productId) ?? {};
    entry[kind] = bytes;
    photos.set(productId, entry);
  }

  return { data: result.data, photos };
}

/** Merge keeps the newer row per id; movements are keyed by id too. */
async function mergeTable<T extends { id: string; updatedAt?: number }>(
  table: { get: (id: string) => Promise<T | undefined>; put: (row: T) => Promise<unknown> },
  rows: readonly T[],
): Promise<number> {
  let written = 0;
  for (const row of rows) {
    const existing = await table.get(row.id);
    if (!existing || (existing.updatedAt ?? 0) < (row.updatedAt ?? 0)) {
      await table.put(row);
      written += 1;
    }
  }
  return written;
}

export interface RestoreResult {
  mode: 'replace' | 'merge';
  products: number;
  movements: number;
  /** Incoming products whose code was already taken by another id. */
  renumbered: number;
}

/**
 * Merges products while protecting the unique `&code` index.
 * Two devices assign `P-00001` independently, so a merge must renumber the
 * incoming row instead of failing the whole transaction.
 */
async function mergeProductsRenumbering(
  target: PlascoDb,
  incoming: readonly Product[],
): Promise<number> {
  const byCode = new Map((await target.products.toArray()).map((row) => [row.code, row.id]));
  let nextNo = (await getSettings(target)).nextProductNo;
  let renumbered = 0;

  for (const row of incoming) {
    const clash = byCode.get(row.code);
    let code = row.code;
    if (clash && clash !== row.id) {
      code = formatProductCode(nextNo);
      nextNo += 1;
      renumbered += 1;
    }
    byCode.set(code, row.id);

    const existing = await target.products.get(row.id);
    if (!existing) {
      await target.products.add({ ...row, code });
      continue;
    }
    if (row.updatedAt > existing.updatedAt) {
      await target.products.put({ ...row, code: code === existing.code ? existing.code : code });
    }
  }

  if (renumbered > 0) await setSettings({ nextProductNo: nextNo }, target);
  return renumbered;
}

export async function restoreBackup(
  file: Blob,
  mode: 'replace' | 'merge',
  target: PlascoDb = db,
): Promise<RestoreResult> {
  const { data, photos } = await readBackup(file);
  const t = data.tables;
  let renumbered = 0;

  if (mode === 'replace') {
    await target.transaction(
      'rw',
      [
        target.brands,
        target.categories,
        target.locations,
        target.products,
        target.stockLevels,
        target.movements,
        target.priceChanges,
        target.stockTakes,
        target.stockTakeItems,
        target.photos,
      ],
      async () => {
        await Promise.all([
          target.brands.clear(),
          target.categories.clear(),
          target.locations.clear(),
          target.products.clear(),
          target.stockLevels.clear(),
          target.movements.clear(),
          target.priceChanges.clear(),
          target.stockTakes.clear(),
          target.stockTakeItems.clear(),
          target.photos.clear(),
        ]);
        await target.brands.bulkPut(t.brands);
        await target.categories.bulkPut(t.categories);
        await target.locations.bulkPut(t.locations);
        await target.products.bulkPut(t.products);
        await target.stockLevels.bulkPut(t.stockLevels);
        await target.movements.bulkPut(t.movements);
        await target.priceChanges.bulkPut(t.priceChanges);
        await target.stockTakes.bulkPut(t.stockTakes);
        await target.stockTakeItems.bulkPut(t.stockTakeItems);
      },
    );
    // Settings keep the current device identity; everything else comes from the file.
    const current = await getSettings(target);
    const merged = new Map(t.settings.map((row) => [row.key, row.value]));
    merged.set('deviceName', current.deviceName);
    merged.set('devicePrefix', current.devicePrefix);
    await target.settings.bulkPut(
      Array.from(merged.entries()).map(([key, value]) => ({ key, value })),
    );
  } else {
    await target.transaction(
      'rw',
      [
        target.brands,
        target.categories,
        target.locations,
        target.products,
        target.stockLevels,
        target.movements,
        target.priceChanges,
        target.stockTakes,
        target.stockTakeItems,
        // Renumbering a conflicting code reads and writes settings.nextProductNo.
        target.settings,
      ],
      async () => {
        await mergeTable(target.brands, t.brands);
        await mergeTable(target.categories, t.categories);
        await mergeTable(target.locations, t.locations);
        renumbered = await mergeProductsRenumbering(target, t.products);
        await mergeTable(target.movements, t.movements);
        await mergeTable(target.priceChanges, t.priceChanges);
        await mergeTable(target.stockTakes, t.stockTakes);
        await mergeTable(target.stockTakeItems, t.stockTakeItems);
        // Levels are a cache: they are recomputed from movements below.
      },
    );
  }

  for (const [productId, kinds] of photos) {
    const thumb = kinds.thumb;
    const full = kinds.full;
    if (!thumb || !full) continue;
    const existing = await target.photos.get(productId);
    if (mode === 'merge' && existing && existing.updatedAt > data.exportedAt) continue;
    await target.photos.put({
      productId,
      thumb: new Blob([thumb as unknown as BlobPart]),
      full: new Blob([full as unknown as BlobPart]),
      updatedAt: data.exportedAt,
    });
  }

  await rebuildStockLevels(target);

  return { mode, products: t.products.length, movements: t.movements.length, renumbered };
}
