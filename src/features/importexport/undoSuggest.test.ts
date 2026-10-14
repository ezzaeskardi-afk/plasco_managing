import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlascoDb } from '@/db/dexie';
import { undoImportBatch } from '@/db/imports';
import { applyMovement } from '@/db/movements';
import { listLocations } from '@/db/repos';
import type { ID } from '@/db/types';
import { fa } from '@/i18n/fa';
import { toastAction, toastSuccess } from '@/lib/toast';
import { buildContext, commitRows, prepareRows } from './importer';
import { suggestImportUndoRemainder } from './undoImport';

/**
 * The suggestion is the only part of the import undo that speaks first, so the
 * message it uses is checked here: which file, how many rows, and the very same
 * action label the history list carries («برگرداندن بقیه»).
 */
vi.mock('@/lib/toast', () => ({
  toastAction: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

let db: PlascoDb;
let dbIndex = 0;

beforeEach(async () => {
  dbIndex += 1;
  db = new PlascoDb(`test-undo-suggest-${dbIndex}`);
  await db.open();
  vi.clearAllMocks();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await db.delete();
});

/** An import of ten buckets plus five baskets, four buckets sold, then the partial undo. */
async function halfUndoneImport(): Promise<{ batchId: ID; bucketId: ID; locationId: ID }> {
  const locations = await listLocations(db);
  const locationId = locations[0]?.id;
  if (!locationId) throw new Error('expected a seeded location');
  const context = await buildContext(db);
  const prepared = prepareRows(
    [
      { نام: 'سطل', تعداد: '۱۰' },
      { نام: 'سبد', تعداد: '۵' },
    ],
    { name: 'نام', quantity: 'تعداد' },
    { ...context, defaultLocationId: locationId },
  );
  const commit = await commitRows(prepared, { fileName: 'انبار.xlsx' }, db);
  if (!commit.batchId) throw new Error('expected the commit to record a batch');

  const bucket = (await db.products.toArray()).find((product) => product.name === 'سطل');
  if (!bucket) throw new Error('expected the imported bucket');
  await applyMovement({ productId: bucket.id, locationId, type: 'sale', qty: -4 }, db);
  await undoImportBatch(commit.batchId, db);
  return { batchId: commit.batchId, bucketId: bucket.id, locationId };
}

describe('suggestImportUndoRemainder', () => {
  it('stays quiet while the remainder is still blocked', async () => {
    await halfUndoneImport();
    await suggestImportUndoRemainder(db);
    expect(toastAction).not.toHaveBeenCalled();
  });

  it('offers the file and the row count after the delivery unblocks it', async () => {
    const { bucketId, locationId } = await halfUndoneImport();
    await applyMovement({ productId: bucketId, locationId, type: 'receive', qty: 4 }, db);

    await suggestImportUndoRemainder(db);

    expect(toastAction).toHaveBeenCalledTimes(1);
    const call = vi.mocked(toastAction).mock.calls[0];
    expect(call?.[0]).toBe(fa.importexport.undoSuggestTitle);
    expect(call?.[1]).toContain('انبار.xlsx');
    expect(call?.[1]).toContain('۲');
    // Same wording as the history button, so the action keeps one name (§8).
    expect(call?.[2]).toBe(fa.importexport.undoRemaining);
  });

  it('says nothing once the remainder has gone back', async () => {
    const { bucketId, locationId } = await halfUndoneImport();
    await applyMovement({ productId: bucketId, locationId, type: 'receive', qty: 4 }, db);
    await undoImportBatch((await db.imports.toArray())[0]!.id, db);

    await suggestImportUndoRemainder(db);
    expect(toastAction).not.toHaveBeenCalled();
  });

  it('finishes the remainder in one tap, without a dialog to answer', async () => {
    const { batchId, bucketId, locationId } = await halfUndoneImport();
    await applyMovement({ productId: bucketId, locationId, type: 'receive', qty: 4 }, db);
    await suggestImportUndoRemainder(db);

    const onAction = vi.mocked(toastAction).mock.calls[0]?.[3];
    expect(typeof onAction).toBe('function');
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmSpy);

    await onAction?.();

    // One tap on the offer is the whole interaction: the journal empties, the
    // batch closes, and nothing asked for a dialog along the way.
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(await db.importEntries.count()).toBe(0);
    expect((await db.imports.get(batchId))?.undoneAt).toBeTruthy();
    expect(toastSuccess).toHaveBeenCalledWith(fa.importexport.undoDone, expect.any(String));
    // And the offer stops appearing with it.
    await suggestImportUndoRemainder(db);
    expect(toastAction).toHaveBeenCalledTimes(1);
  });
});
