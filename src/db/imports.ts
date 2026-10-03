import { db as defaultDb, type PlascoDb } from './dexie';
import { undoMovement } from './movements';
import { softDelete, softDeleteProduct, updateProduct } from './repos';
import type { Brand, ID, ImportBatch, ImportedProductFields, ImportEntry, Product } from './types';

/**
 * Every commit writes a journal (`imports` + `importEntries`) in the same
 * transaction as the data it touched, so a wrong file can be reverted as one
 * batch. The undo reverts every row it safely can and names the ones it cannot:
 * a row whose stock was already sold stays behind, and the batch stays undoable
 * so a later delivery (or stock correction) can still clear it.
 */

/** How many recent imports stay undoable; older batches are pruned away. */
const HISTORY_LIMIT = 20;
export const IMPORT_UNDO_REASON = 'undo-import';

export class ImportBatchNotFoundError extends Error {
  constructor(id: ID) {
    super(`ImportBatchNotFound:${id}`);
    this.name = 'ImportBatchNotFoundError';
  }
}

export class ImportAlreadyUndoneError extends Error {
  constructor(id: ID) {
    super(`ImportAlreadyUndone:${id}`);
    this.name = 'ImportAlreadyUndoneError';
  }
}

export class ImportNothingToUndoError extends Error {
  constructor(id: ID) {
    super(`ImportNothingToUndo:${id}`);
    this.name = 'ImportNothingToUndoError';
  }
}

/** Why one journal row has to stay behind. */
export type ImportUndoBlockReason = 'stock-used' | 'holds-stock' | 'in-use';

/** One row of the import that cannot be reverted right now. */
export interface ImportUndoBlockedRow {
  entryId: ID;
  kind: ImportEntry['kind'];
  /** Product the row belongs to; a brand row keeps the brand id here. */
  targetId: ID;
  /** Product (or brand) name, for the message the shopkeeper reads. */
  name?: string;
  /** Shelf of the movement that does not fit (movement rows only). */
  locationId?: ID;
  locationName?: string;
  reason: ImportUndoBlockReason;
  /**
   * `stock-used`: pieces the shelf is short of; `holds-stock`: pieces still on
   * the shelves; `in-use`: 0.
   */
  qty: number;
}

export class ImportUndoBlockedError extends Error {
  constructor(readonly rows: ImportUndoBlockedRow[]) {
    super(`ImportUndoBlocked:${rows.length}`);
    this.name = 'ImportUndoBlockedError';
  }
}

export interface RecordImportBatchInput {
  /** Id the journal entries were written with, so the batch can find them. */
  id: ID;
  fileName?: string;
  created: number;
  updated: number;
  movements: number;
}

/** Journal row for a finished commit; also prunes batches that fell out of the window. */
export async function recordImportBatch(
  input: RecordImportBatchInput,
  target: PlascoDb = defaultDb,
): Promise<ImportBatch> {
  return target.transaction('rw', target.imports, target.importEntries, async () => {
    const at = Date.now();
    const batch: ImportBatch = {
      id: input.id,
      fileName: input.fileName,
      created: input.created,
      updated: input.updated,
      movements: input.movements,
      createdAt: at,
      updatedAt: at,
    };
    await target.imports.add(batch);

    const stale = (await target.imports.orderBy('createdAt').reverse().toArray()).slice(HISTORY_LIMIT);
    for (const old of stale) {
      await target.importEntries.where('batchId').equals(old.id).delete();
      await target.imports.delete(old.id);
    }
    return batch;
  });
}

export async function listImportBatches(limit = 5, target: PlascoDb = defaultDb): Promise<ImportBatch[]> {
  return target.imports.orderBy('createdAt').reverse().limit(limit).toArray();
}

export interface ImportUndoPreview {
  batch: ImportBatch;
  entries: number;
  /** Rows the undo would revert right now. */
  created: number;
  updated: number;
  movements: number;
  brands: number;
  undoableRows: number;
  /** The rows the undo would revert right now, named for the message. */
  plannedRows: ImportUndoPlannedRow[];
  /** Rows that would stay behind, named so the user knows which ones. */
  blockedRows: ImportUndoBlockedRow[];
}

/** One row the undo will revert right now, carried so the UI can name it. */
export interface ImportUndoPlannedRow {
  entryId: ID;
  kind: ImportEntry['kind'];
  name?: string;
  /** Movement rows only: the shelf the pieces go back to. */
  locationName?: string;
  /** Pieces involved; 0 for rows that carry no stock. */
  qty: number;
}

interface PendingMovement {
  entryId: ID;
  movementId: ID;
  productId: ID;
  locationId: ID;
  /** Signed pieces of the imported movement; the compensation writes `-qty`. */
  qty: number;
}

interface PlannedRestore {
  entryId: ID;
  productId: ID;
  before: ImportedProductFields;
}

interface PlannedDelete {
  entryId: ID;
  productId: ID;
}

interface PlannedBrandDelete {
  entryId: ID;
  brandId: ID;
}

interface UndoPlan {
  pending: PendingMovement[];
  restores: PlannedRestore[];
  productDeletes: PlannedDelete[];
  brandDeletes: PlannedBrandDelete[];
  /** Journal rows with nothing left to revert (already compensated or gone). */
  resolved: ID[];
  planned: ImportUndoPlannedRow[];
  blocked: ImportUndoBlockedRow[];
}

function shelfKey(productId: ID, locationId: ID): string {
  return `${productId}\u0000${locationId}`;
}

/** Pieces left on a product's shelves once the planned compensations are written. */
async function remainingQty(productId: ID, plannedDelta: number, target: PlascoDb): Promise<number> {
  const levels = await target.stockLevels.where('productId').equals(productId).toArray();
  return levels.reduce((sum, level) => sum + level.qty, 0) - plannedDelta;
}

/**
 * Read-only plan: which journal rows revert now, which stay behind and why.
 * Movement rows are matched against the live shelf levels, so two rows on the
 * same shelf are judged together.
 */
async function planImportUndo(entries: readonly ImportEntry[], target: PlascoDb): Promise<UndoPlan> {
  const plan: UndoPlan = {
    pending: [],
    restores: [],
    productDeletes: [],
    brandDeletes: [],
    resolved: [],
    planned: [],
    blocked: [],
  };
  const locationNames = new Map((await target.locations.toArray()).map((row) => [row.id, row.name]));

  // Names up front: one bulk read instead of a lookup per row, and both lists the
  // dialog prints (what reverts, what stays) can name every row.
  const productIds = new Set<ID>();
  const brandIds = new Set<ID>();
  for (const entry of entries) {
    if (entry.kind === 'brand-created') brandIds.add(entry.brandId);
    else productIds.add(entry.productId);
  }
  const products = new Map<ID, Product>();
  for (const product of await target.products.bulkGet([...productIds])) {
    if (product) products.set(product.id, product);
  }
  const brands = new Map<ID, Brand>();
  for (const brand of await target.brands.bulkGet([...brandIds])) {
    if (brand) brands.set(brand.id, brand);
  }

  const movementEntries = entries.filter((entry) => entry.kind === 'movement');
  const compensated = new Set<ID>();
  if (movementEntries.length > 0) {
    // One pass over the movement log instead of one scan per row (`undoOf` has no
    // index): a 500-row import against a long log would otherwise crawl.
    await target.movements.each((movement) => {
      if (movement.undoOf) compensated.add(movement.undoOf);
    });
  }

  const candidates: Array<PendingMovement & { at: number }> = [];
  for (const entry of movementEntries) {
    const movement = await target.movements.get(entry.movementId);
    if (!movement || movement.undoOf || compensated.has(entry.movementId)) {
      plan.resolved.push(entry.id);
      continue;
    }
    candidates.push({
      entryId: entry.id,
      movementId: entry.movementId,
      productId: entry.productId,
      locationId: movement.locationId,
      qty: movement.qty,
      at: movement.at,
    });
  }

  // Rows that add pieces back always fit; for the rest the largest deduction
  // goes first, which returns the most stock for the rows that stay behind.
  candidates.sort((a, b) => (a.qty <= 0 ? 0 : 1) - (b.qty <= 0 ? 0 : 1) || b.qty - a.qty || a.at - b.at);

  const levels = new Map<string, number>();
  for (const row of candidates) {
    const key = shelfKey(row.productId, row.locationId);
    if (!levels.has(key)) {
      levels.set(key, (await target.stockLevels.get([row.productId, row.locationId]))?.qty ?? 0);
    }
    const level = levels.get(key) ?? 0;
    if (level - row.qty < 0) {
      plan.blocked.push({
        entryId: row.entryId,
        kind: 'movement',
        targetId: row.productId,
        name: products.get(row.productId)?.name,
        locationId: row.locationId,
        locationName: locationNames.get(row.locationId),
        reason: 'stock-used',
        qty: row.qty - level,
      });
      continue;
    }
    levels.set(key, level - row.qty);
    plan.pending.push(row);
  }

  // A created product only goes when the compensations above leave nothing on
  // its shelves, and no movement row of this import stays behind pointing at it
  // (a zero level can still hide a row that was received and sold again).
  const plannedDelta = new Map<ID, number>();
  for (const row of plan.pending) {
    plannedDelta.set(row.productId, (plannedDelta.get(row.productId) ?? 0) + row.qty);
  }
  const heldByMovement = new Set(
    plan.blocked.filter((row) => row.kind === 'movement').map((row) => row.targetId),
  );

  for (const entry of entries) {
    if (entry.kind !== 'product-created') continue;
    const product = products.get(entry.productId);
    if (!product || product.deletedAt) {
      plan.resolved.push(entry.id);
      continue;
    }
    const qty = await remainingQty(entry.productId, plannedDelta.get(entry.productId) ?? 0, target);
    if (qty !== 0 || heldByMovement.has(entry.productId)) {
      plan.blocked.push({
        entryId: entry.id,
        kind: 'product-created',
        targetId: entry.productId,
        name: product.name,
        reason: 'holds-stock',
        qty,
      });
      continue;
    }
    plan.productDeletes.push({ entryId: entry.id, productId: entry.productId });
  }

  // Field restores are independent of stock, so they always revert.
  for (const entry of entries) {
    if (entry.kind !== 'product-updated') continue;
    plan.restores.push({ entryId: entry.id, productId: entry.productId, before: entry.before });
  }

  const deletedProducts = new Set(plan.productDeletes.map((row) => row.productId));
  for (const entry of entries) {
    if (entry.kind !== 'brand-created') continue;
    const brand = brands.get(entry.brandId);
    if (!brand || brand.deletedAt) {
      plan.resolved.push(entry.id);
      continue;
    }
    const users = await target.products
      .filter((product) => product.brandId === entry.brandId && !product.deletedAt)
      .toArray();
    if (users.some((product) => !deletedProducts.has(product.id))) {
      plan.blocked.push({
        entryId: entry.id,
        kind: 'brand-created',
        targetId: entry.brandId,
        name: brand.name,
        reason: 'in-use',
        qty: 0,
      });
      continue;
    }
    plan.brandDeletes.push({ entryId: entry.id, brandId: entry.brandId });
  }

  // Same product's rows next to each other, so the dialog reads them as one story.
  for (const row of plan.pending) {
    plan.planned.push({
      entryId: row.entryId,
      kind: 'movement',
      name: products.get(row.productId)?.name,
      locationName: locationNames.get(row.locationId),
      qty: row.qty,
    });
  }
  for (const row of plan.productDeletes) {
    plan.planned.push({
      entryId: row.entryId,
      kind: 'product-created',
      name: products.get(row.productId)?.name,
      qty: 0,
    });
  }
  for (const row of plan.restores) {
    plan.planned.push({
      entryId: row.entryId,
      kind: 'product-updated',
      name: products.get(row.productId)?.name,
      qty: 0,
    });
  }
  for (const row of plan.brandDeletes) {
    plan.planned.push({
      entryId: row.entryId,
      kind: 'brand-created',
      name: brands.get(row.brandId)?.name,
      qty: 0,
    });
  }
  plan.planned.sort(
    (a, b) =>
      (a.name ?? '').localeCompare(b.name ?? '', 'fa') ||
      a.kind.localeCompare(b.kind) ||
      a.entryId.localeCompare(b.entryId),
  );

  return plan;
}

function revertibleRows(plan: UndoPlan): number {
  return plan.pending.length + plan.restores.length + plan.productDeletes.length + plan.brandDeletes.length;
}

/** Read-only dry run for the confirmation dialog. */
export async function previewImportUndo(
  batchId: ID,
  target: PlascoDb = defaultDb,
): Promise<ImportUndoPreview> {
  const batch = await target.imports.get(batchId);
  if (!batch) throw new ImportBatchNotFoundError(batchId);

  const entries = await target.importEntries.where('batchId').equals(batchId).toArray();
  const plan = await planImportUndo(entries, target);
  return {
    batch,
    entries: entries.length,
    created: plan.productDeletes.length,
    updated: plan.restores.length,
    movements: plan.pending.length,
    brands: plan.brandDeletes.length,
    undoableRows: revertibleRows(plan),
    plannedRows: plan.planned,
    blockedRows: plan.blocked,
  };
}

export interface UndoImportResult {
  batchId: ID;
  /** True when some rows had to stay behind; the batch stays undoable. */
  partial: boolean;
  movementsUndone: number;
  productsDeleted: number;
  productsRestored: number;
  brandsDeleted: number;
  /** Journal rows that stayed behind. */
  rowsLeft: number;
  blocked: ImportUndoBlockedRow[];
}

/**
 * Reverts one import: compensating movements, restored field values, soft-deleted
 * created products and brands. Rows whose stock was used since stay in the
 * journal and are reported back; only a batch with nothing at all to revert is
 * refused outright.
 */
export async function undoImportBatch(
  batchId: ID,
  target: PlascoDb = defaultDb,
): Promise<UndoImportResult> {
  return target.transaction(
    'rw',
    [
      target.imports,
      target.importEntries,
      target.products,
      target.brands,
      target.locations,
      target.movements,
      target.stockLevels,
      target.priceChanges,
    ],
    async () => {
      const batch = await target.imports.get(batchId);
      if (!batch) throw new ImportBatchNotFoundError(batchId);
      if (batch.undoneAt) throw new ImportAlreadyUndoneError(batchId);

      const entries = await target.importEntries.where('batchId').equals(batchId).toArray();
      if (entries.length === 0) throw new ImportNothingToUndoError(batchId);

      const plan = await planImportUndo(entries, target);
      // Nothing can be reverted at all: refuse and name every stuck row, as before.
      if (revertibleRows(plan) === 0) throw new ImportUndoBlockedError(plan.blocked);

      for (const row of plan.pending) await undoMovement(row.movementId, target);

      let productsRestored = 0;
      for (const row of plan.restores) {
        await updateProduct(row.productId, { ...row.before }, { reason: IMPORT_UNDO_REASON }, target);
        productsRestored += 1;
      }

      let productsDeleted = 0;
      for (const row of plan.productDeletes) {
        await softDeleteProduct(row.productId, target);
        productsDeleted += 1;
      }

      let brandsDeleted = 0;
      for (const row of plan.brandDeletes) {
        await softDelete('brands', row.brandId, target);
        brandsDeleted += 1;
      }

      const cleared = [
        ...plan.pending.map((row) => row.entryId),
        ...plan.restores.map((row) => row.entryId),
        ...plan.productDeletes.map((row) => row.entryId),
        ...plan.brandDeletes.map((row) => row.entryId),
        ...plan.resolved,
      ];
      if (cleared.length > 0) await target.importEntries.bulkDelete(cleared);

      const at = Date.now();
      if (plan.blocked.length === 0) {
        await target.imports.update(batchId, { undoneAt: at, updatedAt: at });
      } else {
        await target.imports.update(batchId, {
          partialUndoAt: at,
          partialRows: plan.blocked.length,
          updatedAt: at,
        });
      }

      return {
        batchId,
        partial: plan.blocked.length > 0,
        movementsUndone: plan.pending.length,
        productsDeleted,
        productsRestored,
        brandsDeleted,
        rowsLeft: plan.blocked.length,
        blocked: plan.blocked,
      };
    },
  );
}
