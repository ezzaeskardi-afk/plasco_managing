import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PlascoDb } from '@/db/dexie';
import {
  IMPORT_UNDO_REASON,
  ImportAlreadyUndoneError,
  ImportUndoBlockedError,
  listImportBatches,
  previewImportUndo,
  recordImportBatch,
  undoImportBatch,
} from '@/db/imports';
import { applyMovement } from '@/db/movements';
import { createProduct, listLocations } from '@/db/repos';
import type { ID } from '@/db/types';
import { newId } from '@/lib/id';
import { buildContext, commitRows, prepareRows, type CommitResult } from '@/features/importexport/importer';

let db: PlascoDb;
let dbIndex = 0;

beforeEach(async () => {
  dbIndex += 1;
  db = new PlascoDb(`test-imports-${dbIndex}`);
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

function requireBatchId(result: CommitResult): ID {
  if (!result.batchId) throw new Error('expected the commit to record a batch');
  return result.batchId;
}

async function firstLocationId(): Promise<ID> {
  const locations = await listLocations(db);
  const id = locations[0]?.id;
  if (!id) throw new Error('expected a seeded location');
  return id;
}

describe('undoImportBatch', () => {
  it('deletes created products, zeroes their opening stock and marks the batch', async () => {
    const locationId = await firstLocationId();
    const context = await buildContext(db);
    const prepared = prepareRows(
      [
        { نام: 'سطل', تعداد: '۳' },
        { نام: 'سبد', تعداد: '۲' },
      ],
      { name: 'نام', quantity: 'تعداد' },
      { ...context, defaultLocationId: locationId },
    );

    const commit = await commitRows(prepared, { fileName: 'list.xlsx' }, db);
    const outcome = await undoImportBatch(requireBatchId(commit), db);

    expect(outcome.productsDeleted).toBe(2);
    expect(outcome.movementsUndone).toBe(2);

    const products = await db.products.toArray();
    expect(products).toHaveLength(2);
    expect(products.every((product) => product.deletedAt != null)).toBe(true);

    // Soft delete only: levels are back to zero through compensating movements.
    const levels = await db.stockLevels.toArray();
    expect(levels).toHaveLength(2);
    expect(levels.every((level) => level.qty === 0)).toBe(true);

    const movements = await db.movements.toArray();
    expect(movements).toHaveLength(4);
    expect(movements.filter((movement) => movement.undoOf != null)).toHaveLength(2);

    expect(await db.importEntries.count()).toBe(0);
    const [batch] = await listImportBatches(5, db);
    expect(batch?.undoneAt).toBeTruthy();
    expect(batch?.fileName).toBe('list.xlsx');
  });

  it('restores the fields the import overwrote and logs the price change', async () => {
    const product = await createProduct(
      { name: 'ظرف غذا', buyPrice: 15_000, retailPrice: 22_000, packSize: 12 },
      db,
    );
    const context = await buildContext(db);
    const prepared = prepareRows([{ نام: 'ظرف غذا', خرده: '۲۵۰۰۰' }], { name: 'نام', retail: 'خرده' }, context);
    const commit = await commitRows(prepared, {}, db);
    expect((await db.products.get(product.id))?.retailPrice).toBe(25_000);

    const outcome = await undoImportBatch(requireBatchId(commit), db);
    expect(outcome.productsRestored).toBe(1);

    const after = await db.products.get(product.id);
    expect(after?.retailPrice).toBe(22_000);
    expect(after?.name).toBe('ظرف غذا');
    expect(after?.packSize).toBe(12);
    expect(after?.deletedAt).toBeUndefined();

    const changes = await db.priceChanges.where('productId').equals(product.id).toArray();
    expect(changes.map((change) => change.newValue).sort()).toEqual([22_000, 25_000]);
    const reverted = changes.find((change) => change.reason === IMPORT_UNDO_REASON);
    expect(reverted?.oldValue).toBe(25_000);
    expect(reverted?.newValue).toBe(22_000);
  });

  it('refuses to undo once the imported stock has been used', async () => {
    const locationId = await firstLocationId();
    const context = await buildContext(db);
    const prepared = prepareRows(
      [{ نام: 'سطل', تعداد: '۱۰' }],
      { name: 'نام', quantity: 'تعداد' },
      { ...context, defaultLocationId: locationId },
    );
    const commit = await commitRows(prepared, {}, db);
    const batchId = requireBatchId(commit);

    const products = await db.products.toArray();
    const product = products[0];
    if (!product) throw new Error('expected the imported product');
    await applyMovement({ productId: product.id, locationId, type: 'sale', qty: -4 }, db);

    const preview = await previewImportUndo(batchId, db);
    expect(preview.blockers).toHaveLength(1);
    expect(preview.blockers[0]?.productName).toBe('سطل');

    await expect(undoImportBatch(batchId, db)).rejects.toBeInstanceOf(ImportUndoBlockedError);

    // All-or-nothing: the sale stays and the batch is still undoable in theory.
    expect((await db.stockLevels.get([product.id, locationId]))?.qty).toBe(6);
    expect((await db.imports.get(batchId))?.undoneAt).toBeUndefined();
    // The created product plus its opening movement both stay in the journal.
    expect(await db.importEntries.count()).toBe(2);
  });

  it('cannot be undone twice', async () => {
    const context = await buildContext(db);
    const prepared = prepareRows([{ نام: 'لیوان' }], { name: 'نام' }, context);
    const commit = await commitRows(prepared, {}, db);
    const batchId = requireBatchId(commit);

    await undoImportBatch(batchId, db);
    await expect(undoImportBatch(batchId, db)).rejects.toBeInstanceOf(ImportAlreadyUndoneError);
  });

  it('soft-deletes a brand the import introduced once nothing points to it', async () => {
    const context = await buildContext(db);
    const prepared = prepareRows([{ نام: 'سبد', برند: 'شرکت تازه' }], { name: 'نام', brand: 'برند' }, context);
    const commit = await commitRows(prepared, {}, db);

    const brands = await db.brands.toArray();
    expect(brands).toHaveLength(1);
    const brand = brands[0];
    if (!brand) throw new Error('expected the imported brand');

    const outcome = await undoImportBatch(requireBatchId(commit), db);
    expect(outcome.brandsDeleted).toBe(1);
    expect((await db.brands.get(brand.id))?.deletedAt).toBeTruthy();
  });

  it('leaves a shared brand alone when another product still uses it', async () => {
    const context = await buildContext(db);
    const prepared = prepareRows([{ نام: 'سبد', برند: 'شرکت تازه' }], { name: 'نام', brand: 'برند' }, context);
    const commit = await commitRows(prepared, {}, db);

    // Something else started using the brand (a later import or a manual edit).
    await createProduct({ name: 'سبد دوم', brandId: (await db.brands.toArray())[0]?.id, buyPrice: 0, retailPrice: 0, packSize: 1 }, db);

    const outcome = await undoImportBatch(requireBatchId(commit), db);
    expect(outcome.brandsDeleted).toBe(0);
  });
});

describe('import history', () => {
  it('lists batches newest first and keeps only the newest 20', async () => {
    for (let i = 1; i <= 22; i += 1) {
      await recordImportBatch(
        { id: newId(), fileName: `file-${i}.xlsx`, created: i, updated: 0, movements: 0 },
        db,
      );
      // Two imports never share a millisecond in real use; keep the order test honest.
      await new Promise((resolve) => setTimeout(resolve, 2));
    }

    expect(await db.imports.count()).toBe(20);
    const [newest, second] = await listImportBatches(5, db);
    expect(newest?.fileName).toBe('file-22.xlsx');
    expect(second?.fileName).toBe('file-21.xlsx');
  });

  it('records no batch when the commit writes nothing', async () => {
    const context = await buildContext(db);
    const prepared = prepareRows([{ نام: '' }], { name: 'نام' }, context);
    const result = await commitRows(prepared, {}, db);

    expect(result.created).toBe(0);
    expect(result.batchId).toBeNull();
    expect(await db.imports.count()).toBe(0);
  });
});
