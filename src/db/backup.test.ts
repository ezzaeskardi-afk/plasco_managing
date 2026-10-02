import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBackup, readBackup, restoreBackup, BackupInvalidError } from './backup';
import { PlascoDb } from './dexie';
import { applyMovement } from './movements';
import { rebuildStockLevels } from './rebuild';
import { createProduct, listProducts, updateProduct } from './repos';

let db: PlascoDb;
let dbIndex = 0;

beforeEach(async () => {
  dbIndex += 1;
  db = new PlascoDb(`test-backup-${dbIndex}`);
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

async function seedCatalogue(target: PlascoDb) {
  const product = await createProduct(
    { name: 'ظرف غذا', buyPrice: 10_000, retailPrice: 15_000, packSize: 12, barcodes: ['111'] },
    target,
  );
  await applyMovement({ productId: product.id, locationId: 'loc-shop', type: 'receive', qty: 20 }, target);
  await applyMovement({ productId: product.id, locationId: 'loc-shop', type: 'sale', qty: -5 }, target);
  await updateProduct(product.id, { retailPrice: 18_000 }, {}, target);
  return product;
}

/**
 * jsdom + fake-indexeddb cannot persist a Blob (it comes back as `{}`), so the
 * photo bytes are only exercised in the browser. The row itself is written here
 * to prove that an unreadable photo yields a readable error instead of a crash.
 */
async function seedUnreadablePhoto(productId: string, target: PlascoDb) {
  await target.photos.put({
    productId,
    thumb: {} as Blob,
    full: {} as Blob,
    updatedAt: Date.now(),
  });
}

describe('backup and restore', () => {
  it('round-trips every table through replace mode', async () => {
    const product = await seedCatalogue(db);
    const { blob, summary } = await createBackup(db);
    expect(blob.size).toBeGreaterThan(0);
    expect(summary.products).toBe(1);
    expect(summary.movements).toBe(2);
    expect((await db.settings.get('lastBackupAt'))?.value).toBeTypeOf('number');

    const { data } = await readBackup(blob);
    expect(data.schemaVersion).toBe(1);
    expect(data.tables.products).toHaveLength(1);

    // Wipe, then restore.
    await db.products.clear();
    await db.movements.clear();
    await db.stockLevels.clear();
    await db.photos.clear();
    await db.priceChanges.clear();

    const result = await restoreBackup(blob, 'replace', db);
    expect(result.products).toBe(1);
    expect(result.movements).toBe(2);

    const restored = await db.products.get(product.id);
    expect(restored?.retailPrice).toBe(18_000);
    expect((await db.stockLevels.get([product.id, 'loc-shop']))?.qty).toBe(15);
    expect(await db.priceChanges.count()).toBe(1);
  });

  it('fails with a readable error when a stored photo cannot be read', async () => {
    const product = await seedCatalogue(db);
    await seedUnreadablePhoto(product.id, db);
    await expect(createBackup(db)).rejects.toBeInstanceOf(BackupInvalidError);
  });

  it('keeps levels equal to the movement ledger after a restore', async () => {
    const product = await seedCatalogue(db);
    const { blob } = await createBackup(db);
    await db.stockLevels.clear();
    await restoreBackup(blob, 'replace', db);

    const movements = await db.movements.where('productId').equals(product.id).toArray();
    const sum = movements.reduce((total, movement) => total + movement.qty, 0);
    expect((await db.stockLevels.get([product.id, 'loc-shop']))?.qty).toBe(sum);
    expect(sum).toBe(15);
  });

  it('merge keeps the newer row and does not duplicate ids', async () => {
    const product = await seedCatalogue(db);
    const { blob } = await createBackup(db);

    // The live row becomes newer than the backup file.
    await updateProduct(product.id, { retailPrice: 25_000 }, {}, db);

    await restoreBackup(blob, 'merge', db);

    expect(await db.products.count()).toBe(1);
    expect((await db.products.get(product.id))?.retailPrice).toBe(25_000);
    expect(await db.movements.count()).toBe(2);
    expect((await listProducts(db)).length).toBe(1);
    expect((await listProducts(db))[0]?.code).toBe(product.code);
  });

  it('accepts a merge of a second device catalogue without losing rows', async () => {
    await seedCatalogue(db);

    const other = new PlascoDb(`test-backup-other-${dbIndex}`);
    await other.open();
    try {
      await createProduct({ name: 'سطل', buyPrice: 5_000, retailPrice: 9_000 }, other);
      const moved = await createBackup(other);
      const result = await restoreBackup(moved.blob, 'merge', db);
      expect(await db.products.count()).toBe(2);
      // Both devices start at P-00001, so the incoming code had to be renumbered.
      expect(result.renumbered).toBe(1);
      const codes = (await listProducts(db)).map((row) => row.code).sort();
      expect(new Set(codes).size).toBe(2);
    } finally {
      await other.delete();
    }
  });

  it('rejects a file that is not a backup and leaves data untouched', async () => {
    await seedCatalogue(db);
    const junk = new Blob([new Uint8Array([1, 2, 3, 4])]);

    await expect(restoreBackup(junk, 'replace', db)).rejects.toBeInstanceOf(BackupInvalidError);
    expect(await db.products.count()).toBe(1);
    expect(await db.movements.count()).toBe(2);
  });

  it('rebuilds the cache when a restored file carries stale levels', async () => {
    const product = await seedCatalogue(db);
    await db.stockLevels.update([product.id, 'loc-shop'], { qty: 999 });

    await rebuildStockLevels(db);
    expect((await db.stockLevels.get([product.id, 'loc-shop']))?.qty).toBe(15);
  });
});
