import { db, type PlascoDb } from '@/db/dexie';
import { recordImportBatch } from '@/db/imports';
import { applyMovement } from '@/db/movements';
import {
  DuplicateCodeError,
  buildNameN,
  createBrand,
  createProduct,
  listBrands,
  listLocations,
  listProducts,
  updateProduct,
  type ProductDraft,
} from '@/db/repos';
import type { Brand, ID, ImportEntry, ImportedProductFields, Location, Product } from '@/db/types';
import { normalizeFa } from '@/domain/normalizeFa';
import { parseIntegerInput } from '@/domain/numbers';
import { newId } from '@/lib/id';

export const IMPORT_FIELDS = [
  'name',
  'brand',
  'code',
  'barcode',
  'buy',
  'retail',
  'wholesale',
  'packSize',
  'packLabel',
  'quantity',
  'location',
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];
export type ColumnMap = Partial<Record<ImportField, string>>;

export const FIELD_LABELS: Record<ImportField, string> = {
  name: 'نام کالا',
  brand: 'برند',
  code: 'کد',
  barcode: 'بارکد',
  buy: 'قیمت خرید',
  retail: 'قیمت خرده',
  wholesale: 'قیمت عمده',
  packSize: 'تعداد در بسته',
  packLabel: 'واحد بسته',
  quantity: 'موجودی',
  location: 'مکان',
};

const GUESSES: Record<ImportField, readonly string[]> = {
  name: ['name', 'نام', 'کالا', 'شرح'],
  brand: ['brand', 'برند', 'شرکت'],
  code: ['code', 'کد'],
  barcode: ['barcode', 'بارکد'],
  buy: ['buy', 'خرید'],
  retail: ['retail', 'خرده', 'فروش'],
  wholesale: ['wholesale', 'عمده'],
  packSize: ['pack', 'بسته'],
  packLabel: ['packlabel', 'واحد'],
  quantity: ['quantity', 'qty', 'موجودی', 'تعداد'],
  location: ['location', 'مکان', 'انبار'],
};

/**
 * Specific fields claim their header first, so a company list whose name column is
 * «شرح کالا» does not hand the name field to «کد کالا» (which also contains «کالا»).
 */
const GUESS_PRIORITY: readonly ImportField[] = [
  // Barcode before code: «Barcode» contains «code».
  'barcode',
  'code',
  'buy',
  'retail',
  'wholesale',
  'packSize',
  'packLabel',
  'quantity',
  'location',
  'brand',
  'name',
];

export function guessMap(headers: readonly string[]): ColumnMap {
  const map: ColumnMap = {};
  const claimed = new Set<string>();
  for (const field of GUESS_PRIORITY) {
    const keys = GUESSES[field];
    const hit = headers.find((header) => {
      if (claimed.has(header)) return false;
      const h = normalizeFa(header);
      return keys.some((key) => h.includes(normalizeFa(key)));
    });
    if (hit) {
      map[field] = hit;
      claimed.add(hit);
    }
  }
  return map;
}

/**
 * `prices` updates the three prices of products that already exist and never
 * creates or renames anything - the way a company price list is applied.
 */
export type ImportMode = 'full' | 'prices';
export type RowAction = 'new' | 'update' | 'missing' | 'error';

export interface PreparedRow {
  rowNumber: number;
  action: RowAction;
  reason?: string;
  name?: string;
  productId?: ID;
  /** Only the fields the file actually carries, so an update never wipes data. */
  draft?: Partial<ProductDraft>;
  /** Brand name from the file when no matching brand exists yet. */
  newBrandName?: string;
  /** Target quantity for the location, in pieces. */
  quantity?: number;
  locationId?: ID;
  /** A quantity was given but no location could be resolved for the row. */
  quantitySkipped?: boolean;
}

export interface PrepareOptions {
  /** Defaults to `full`. */
  mode?: ImportMode;
}

/** Order-insensitive identity of a header row, used to recall a saved mapping. */
export function importSignature(headers: readonly string[]): string {
  return headers
    .map((header) => normalizeFa(header))
    .filter(Boolean)
    .sort()
    .join('\u0000');
}

export interface ImportContext {
  products: Product[];
  brands: Brand[];
  locations: Location[];
  defaultLocationId?: ID;
}

export function readCell(row: Record<string, string>, column: string | undefined): string {
  if (!column) return '';
  return (row[column] ?? '').toString().trim();
}

export async function buildContext(target: PlascoDb = db): Promise<ImportContext> {
  const [products, brands, locations] = await Promise.all([
    listProducts(target),
    listBrands(target),
    listLocations(target),
  ]);
  return { products, brands, locations };
}

/** Matching order: barcode > code > normalized name + brand. */
export function matchProduct(
  context: ImportContext,
  input: { barcode?: string; code?: string; nameN?: string; brandId?: ID },
): Product | undefined {
  if (input.barcode) {
    const barcode = normalizeFa(input.barcode);
    const hit = context.products.find((product) =>
      product.barcodes.some((value) => normalizeFa(value) === barcode),
    );
    if (hit) return hit;
  }
  if (input.code) {
    const code = input.code.trim();
    const hit = context.products.find((product) => product.code === code);
    if (hit) return hit;
  }
  if (input.nameN) {
    const hit = context.products.find(
      (product) =>
        product.nameN === input.nameN && (product.brandId ?? undefined) === input.brandId,
    );
    if (hit) return hit;
  }
  return undefined;
}

/** Dry run: decides what would happen for every row, without writing anything. */
export function prepareRows(
  rows: readonly Record<string, string>[],
  map: ColumnMap,
  context: ImportContext,
  options: PrepareOptions = {},
): PreparedRow[] {
  const mode = options.mode ?? 'full';
  const brandByName = new Map(context.brands.map((brand) => [brand.nameN, brand.id]));
  const locationByName = new Map(
    context.locations.map((location) => [normalizeFa(location.name), location.id]),
  );
  const seen = new Set<string>();

  return rows.map((row, index) => {
    const rowNumber = index + 2; // the header occupies row 1
    const name = readCell(row, map.name);
    const barcode = readCell(row, map.barcode);
    const code = readCell(row, map.code);
    // A company price list may carry only codes and prices; a full import needs
    // the name because it creates the product.
    const identified = mode === 'prices' ? Boolean(name || barcode || code) : Boolean(name);
    if (!identified) {
      return {
        rowNumber,
        action: 'error',
        reason: mode === 'prices' ? 'این ردیف نه کد دارد نه نام.' : 'نام کالا خالی است.',
      };
    }

    const brandName = readCell(row, map.brand);
    const brandN = brandName ? normalizeFa(brandName) : '';
    const brandId = brandN ? brandByName.get(brandN) : undefined;
    const nameN = name ? buildNameN({ name }) : '';

    const existing = matchProduct(context, { barcode, code, nameN, brandId });
    const dedupeKey = barcode || code || `${nameN}\u0000${brandId ?? ''}`;
    if (seen.has(dedupeKey)) {
      return { rowNumber, action: 'error', reason: 'این ردیف تکراری است.' };
    }
    seen.add(dedupeKey);

    const buy = parseIntegerInput(readCell(row, map.buy));
    const retail = parseIntegerInput(readCell(row, map.retail));
    const wholesale = parseIntegerInput(readCell(row, map.wholesale));

    if (mode === 'prices') {
      // Only prices travel: the sheet must not rename products, resize packs or add brands.
      if (!existing) {
        return {
          rowNumber,
          action: 'missing',
          name: name || undefined,
          reason: 'در لیست کالاهای مغازه پیدا نشد.',
        };
      }
      if (buy == null && retail == null && wholesale == null) {
        return { rowNumber, action: 'error', reason: 'این ردیف قیمتی ندارد.' };
      }
      const priceDraft: Partial<ProductDraft> = {};
      if (buy != null) priceDraft.buyPrice = Math.max(0, buy);
      if (retail != null) priceDraft.retailPrice = Math.max(0, retail);
      if (wholesale != null) priceDraft.wholesalePrice = Math.max(0, wholesale);
      return {
        rowNumber,
        action: 'update',
        name: name || existing.name,
        productId: existing.id,
        draft: priceDraft,
      };
    }

    const draft: Partial<ProductDraft> = { name };
    if (brandId) draft.brandId = brandId;
    if (code) draft.code = code;
    if (barcode) draft.barcodes = barcode.split(/[\s,،]+/).filter(Boolean);
    const packLabel = readCell(row, map.packLabel);
    if (packLabel) draft.packLabel = packLabel;
    const packSize = parseIntegerInput(readCell(row, map.packSize));
    if (packSize != null) draft.packSize = Math.max(1, packSize);
    if (buy != null) draft.buyPrice = Math.max(0, buy);
    if (retail != null) draft.retailPrice = Math.max(0, retail);
    if (wholesale != null) draft.wholesalePrice = Math.max(0, wholesale);

    const quantityRaw = readCell(row, map.quantity);
    const quantity = quantityRaw ? parseIntegerInput(quantityRaw) : null;
    const locationName = readCell(row, map.location);
    const locationId = locationName
      ? locationByName.get(normalizeFa(locationName))
      : context.defaultLocationId;

    return {
      rowNumber,
      action: existing ? 'update' : 'new',
      name,
      productId: existing?.id,
      draft,
      newBrandName: !brandId && brandName ? brandName : undefined,
      quantity: quantity ?? undefined,
      locationId,
      quantitySkipped: quantity != null && !locationId,
    };
  });
}

/** A new product needs concrete values; only the present fields survive. */
function withDefaults(partial: Partial<ProductDraft>): ProductDraft {
  return {
    name: partial.name ?? '',
    buyPrice: 0,
    retailPrice: 0,
    packSize: 1,
    barcodes: [],
    ...partial,
  };
}

export interface CommitOptions {
  /** Also update the quantity of products that already exist (default: new only). */
  updateExistingStock?: boolean;
  /** Rows per transaction (AGENTS.md: ≤ 500). */
  chunkSize?: number;
  /** Shown in the import history so a wrong file is recognizable. */
  fileName?: string;
  onProgress?: (done: number, total: number) => void;
}

export interface CommitResult {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  /** Journal id for the batch undo; null when the commit wrote nothing. */
  batchId: ID | null;
}

/** Only the fields the file carries, with the values they had before the import. */
function beforeValues(existing: Product, draft: Partial<ProductDraft>): ImportedProductFields {
  const before: ImportedProductFields = {};
  if ('name' in draft) before.name = existing.name;
  if ('brandId' in draft) before.brandId = existing.brandId;
  if ('code' in draft) before.code = existing.code;
  if ('barcodes' in draft) before.barcodes = [...existing.barcodes];
  if ('packLabel' in draft) before.packLabel = existing.packLabel;
  if ('packSize' in draft) before.packSize = existing.packSize;
  if ('buyPrice' in draft) before.buyPrice = existing.buyPrice;
  if ('retailPrice' in draft) before.retailPrice = existing.retailPrice;
  if ('wholesalePrice' in draft) before.wholesalePrice = existing.wholesalePrice;
  return before;
}

export async function commitRows(
  rows: readonly PreparedRow[],
  options: CommitOptions = {},
  target: PlascoDb = db,
): Promise<CommitResult> {
  const { updateExistingStock = false, chunkSize = 500, onProgress, fileName } = options;
  const result: CommitResult = { created: 0, updated: 0, skipped: 0, failed: 0, batchId: null };
  const usable = rows.filter((row) => row.action === 'new' || row.action === 'update');
  const batchId = newId();
  let movementsWritten = 0;

  for (let offset = 0; offset < usable.length; offset += chunkSize) {
    const chunk = usable.slice(offset, offset + chunkSize);
    // Every table a nested repo call may touch must be listed here, otherwise
    // Dexie raises SubTransactionError (priceChanges was the missing one).
    await target.transaction(
      'rw',
      [
        target.products,
        target.brands,
        target.settings,
        target.movements,
        target.stockLevels,
        target.priceChanges,
        target.importEntries,
      ],
      async () => {
        // The journal is written with the data, so a rolled-back chunk leaves no trace.
        const journal: ImportEntry[] = [];
        for (const row of chunk) {
          if (!row.draft) {
            result.skipped += 1;
            continue;
          }
          try {
            const partial = { ...row.draft };
            if (row.action === 'new' && !partial.brandId && row.newBrandName) {
              const brand = await createBrand({ name: row.newBrandName }, target);
              partial.brandId = brand.id;
              journal.push({ id: newId(), batchId, kind: 'brand-created', brandId: brand.id });
            }

            let productId: ID;
            const isNew = row.action === 'new';
            if (isNew) {
              productId = (await createProduct(withDefaults(partial), target)).id;
              result.created += 1;
              journal.push({ id: newId(), batchId, kind: 'product-created', productId });
            } else if (row.productId) {
              const existing = await target.products.get(row.productId);
              await updateProduct(row.productId, partial, { reason: 'import' }, target);
              productId = row.productId;
              result.updated += 1;
              if (existing) {
                journal.push({
                  id: newId(),
                  batchId,
                  kind: 'product-updated',
                  productId,
                  before: beforeValues(existing, partial),
                });
              }
            } else {
              result.skipped += 1;
              continue;
            }

            if (row.quantity != null && row.locationId && (isNew || updateExistingStock)) {
              const level = await target.stockLevels.get([productId, row.locationId]);
              const delta = row.quantity - (level?.qty ?? 0);
              if (delta !== 0) {
                const movement = await applyMovement(
                  {
                    productId,
                    locationId: row.locationId,
                    type: isNew ? 'initial' : 'adjust',
                    qty: delta,
                    unitCost: partial.buyPrice,
                    note: 'import',
                  },
                  target,
                );
                movementsWritten += 1;
                journal.push({
                  id: newId(),
                  batchId,
                  kind: 'movement',
                  movementId: movement.id,
                  productId,
                });
              }
            }
          } catch (error) {
            if (error instanceof DuplicateCodeError) {
              result.failed += 1;
              continue;
            }
            throw error;
          }
        }
        if (journal.length > 0) await target.importEntries.bulkAdd(journal);
      },
    );
    onProgress?.(Math.min(offset + chunkSize, usable.length), usable.length);
  }

  // The batch row is written last: a commit that failed midway leaves no batch to undo.
  if (result.created + result.updated > 0) {
    const batch = await recordImportBatch(
      {
        id: batchId,
        fileName,
        created: result.created,
        updated: result.updated,
        movements: movementsWritten,
      },
      target,
    );
    result.batchId = batch.id;
  }

  return result;
}
