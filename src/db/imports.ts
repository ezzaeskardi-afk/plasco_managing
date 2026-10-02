import { db as defaultDb, type PlascoDb } from './dexie';
import { undoMovement } from './movements';
import { softDelete, softDeleteProduct, updateProduct } from './repos';
import type { ID, ImportBatch, ImportEntry } from './types';

/**
 * Every commit writes a journal (`imports` + `importEntries`) in the same
 * transaction as the data it touched, so a wrong file can be reverted as one
 * batch. Same reasoning as the stock-take apply in `stocktake.ts`: a partial
 * undo would leave the shelf in a state nobody can reproduce by hand.
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

/** A shelf the undo would push below zero, because the stock was used since. */
export interface ImportUndoBlocker {
  productId: ID;
  productName?: string;
  locationId: ID;
  /** Level that would remain after the undo. */
  level: number;
}

export class ImportUndoBlockedError extends Error {
  constructor(readonly blockers: ImportUndoBlocker[]) {
    super(`ImportUndoBlocked:${blockers.length}`);
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
  created: number;
  updated: number;
  movements: number;
  brands: number;
  blockers: ImportUndoBlocker[];
}

interface PendingMovement {
  movementId: ID;
  productId: ID;
  locationId: ID;
  qty: number;
}

/** Movements of this batch that still can be undone, plus the shelves that would go negative. */
async function inspectMovements(
  entries: readonly ImportEntry[],
  target: PlascoDb,
): Promise<{ pending: PendingMovement[]; blockers: ImportUndoBlocker[] }> {
  const pending: PendingMovement[] = [];
  const movementEntries = entries.filter((entry) => entry.kind === 'movement');
  if (movementEntries.length > 0) {
    // One pass over the movement log instead of one scan per row (`undoOf` has no
    // index): a 500-row import against a long log would otherwise crawl.
    const compensated = new Set<ID>();
    await target.movements.each((movement) => {
      if (movement.undoOf) compensated.add(movement.undoOf);
    });
    for (const entry of movementEntries) {
      const movement = await target.movements.get(entry.movementId);
      if (!movement || movement.undoOf) continue;
      if (compensated.has(entry.movementId)) continue;
      pending.push({
        movementId: entry.movementId,
        productId: movement.productId,
        locationId: movement.locationId,
        qty: movement.qty,
      });
    }
  }

  // Two rows can hit the same shelf; check the combined effect.
  const shelves = new Map<string, { productId: ID; locationId: ID; delta: number }>();
  for (const row of pending) {
    const key = `${row.productId}\u0000${row.locationId}`;
    const shelf = shelves.get(key) ?? { productId: row.productId, locationId: row.locationId, delta: 0 };
    shelf.delta -= row.qty;
    shelves.set(key, shelf);
  }

  const blockers: ImportUndoBlocker[] = [];
  for (const shelf of shelves.values()) {
    const level = await target.stockLevels.get([shelf.productId, shelf.locationId]);
    const after = (level?.qty ?? 0) + shelf.delta;
    if (after < 0) {
      blockers.push({
        productId: shelf.productId,
        productName: (await target.products.get(shelf.productId))?.name,
        locationId: shelf.locationId,
        level: after,
      });
    }
  }
  return { pending, blockers };
}

/** Read-only dry run for the confirmation dialog. */
export async function previewImportUndo(
  batchId: ID,
  target: PlascoDb = defaultDb,
): Promise<ImportUndoPreview> {
  const batch = await target.imports.get(batchId);
  if (!batch) throw new ImportBatchNotFoundError(batchId);

  const entries = await target.importEntries.where('batchId').equals(batchId).toArray();
  const { pending, blockers } = await inspectMovements(entries, target);
  return {
    batch,
    entries: entries.length,
    created: entries.filter((entry) => entry.kind === 'product-created').length,
    updated: entries.filter((entry) => entry.kind === 'product-updated').length,
    movements: pending.length,
    brands: entries.filter((entry) => entry.kind === 'brand-created').length,
    blockers,
  };
}

export interface UndoImportResult {
  batchId: ID;
  movementsUndone: number;
  movementsSkipped: number;
  productsDeleted: number;
  productsRestored: number;
  brandsDeleted: number;
}

/**
 * All-or-nothing revert of one import: compensating movements, restored field
 * values, created products and brands soft-deleted, then the journal is cleared.
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

      const { pending, blockers } = await inspectMovements(entries, target);
      if (blockers.length > 0) throw new ImportUndoBlockedError(blockers);

      for (const row of pending) await undoMovement(row.movementId, target);

      let productsRestored = 0;
      for (const entry of entries) {
        if (entry.kind !== 'product-updated') continue;
        await updateProduct(entry.productId, { ...entry.before }, { reason: IMPORT_UNDO_REASON }, target);
        productsRestored += 1;
      }

      let productsDeleted = 0;
      for (const entry of entries) {
        if (entry.kind !== 'product-created') continue;
        const product = await target.products.get(entry.productId);
        if (!product || product.deletedAt) continue;
        await softDeleteProduct(entry.productId, target);
        productsDeleted += 1;
      }

      let brandsDeleted = 0;
      for (const entry of entries) {
        if (entry.kind !== 'brand-created') continue;
        const brand = await target.brands.get(entry.brandId);
        if (!brand || brand.deletedAt) continue;
        const stillUsed = await target.products
          .filter((product) => product.brandId === entry.brandId && !product.deletedAt)
          .count();
        if (stillUsed > 0) continue;
        await softDelete('brands', entry.brandId, target);
        brandsDeleted += 1;
      }

      await target.importEntries.where('batchId').equals(batchId).delete();
      const at = Date.now();
      await target.imports.update(batchId, { undoneAt: at, updatedAt: at });

      return {
        batchId,
        movementsUndone: pending.length,
        movementsSkipped: Math.max(0, batch.movements - pending.length),
        productsDeleted,
        productsRestored,
        brandsDeleted,
      };
    },
  );
}
