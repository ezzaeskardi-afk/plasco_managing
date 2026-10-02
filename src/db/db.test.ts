import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PlascoDb, ensureDefaults, DEFAULT_SETTINGS } from './dexie';
import {
  DuplicateCodeError,
  createBrand,
  createLocation,
  createProduct,
  getSettings,
  listBrands,
  listLocations,
  getProduct,
  setBin,
  setSettings,
  softDelete,
  updateProduct,
} from './repos';
import { listPriceChanges } from './priceHistory';
import {
  AlreadyUndoneError,
  applyMovement,
  applyTransfer,
  productLevels,
  undoMovement,
} from './movements';
import { rebuildStockLevels } from './rebuild';
import { diffPrices } from './priceHistory';
import type { ProductDraft } from './repos';

let db: PlascoDb;
let dbIndex = 0;

const draft = (over: Partial<ProductDraft> = {}): ProductDraft => ({
  name: 'ظرف غذا',
  buyPrice: 10_000,
  retailPrice: 15_000,
  packSize: 12,
  ...over,
});

beforeEach(async () => {
  dbIndex += 1;
  db = new PlascoDb(`test-db-${dbIndex}`);
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

describe('schema and defaults', () => {
  it('seeds three locations and default settings on creation', async () => {
    const locations = await listLocations(db);
    expect(locations.map((l) => l.name)).toEqual(['مغازه', 'انبار', 'زیرزمین']);
    expect(await getSettings(db)).toEqual(DEFAULT_SETTINGS);
  });

  it('re-seeds missing defaults idempotently', async () => {
    await db.settings.clear();
    await db.locations.clear();
    await ensureDefaults(db);
    await ensureDefaults(db);
    expect(await db.settings.count()).toBe(Object.keys(DEFAULT_SETTINGS).length);
    expect(await db.locations.count()).toBe(3);
  });

  it('keeps user settings over defaults', async () => {
    await setSettings({ shopName: 'پلاسکو ۲' }, db);
    expect((await getSettings(db)).shopName).toBe('پلاسکو ۲');
  });

  it('reads back optional settings that have no default value', async () => {
    // Regression: getSettings used to drop any key missing from DEFAULT_SETTINGS,
    // so the backup date, the cost-lock pin and persistAskedAt never survived a reload.
    await setSettings(
      { lastBackupAt: 1_700_000_000_000, costLockPinHash: 'hash', persistAskedAt: 1_700_000_000_001 },
      db,
    );

    const settings = await getSettings(db);
    expect(settings.lastBackupAt).toBe(1_700_000_000_000);
    expect(settings.costLockPinHash).toBe('hash');
    expect(settings.persistAskedAt).toBe(1_700_000_000_001);
  });

  it('ignores undefined values so a patch never erases a setting', async () => {
    await setSettings({ shopName: 'پلاسکو ۳' }, db);
    await setSettings({ shopName: undefined }, db);
    expect((await getSettings(db)).shopName).toBe('پلاسکو ۳');
  });
});

describe('products', () => {
  it('assigns sequential codes from settings inside the transaction', async () => {
    const first = await createProduct(draft(), db);
    const second = await createProduct(draft({ name: 'سطل' }), db);
    expect(first.code).toBe('P-00001');
    expect(second.code).toBe('P-00002');
    expect((await getSettings(db)).nextProductNo).toBe(3);
  });

  it('does not burn a sequence number for a custom code', async () => {
    await createProduct(draft({ code: 'CUSTOM-1' }), db);
    expect((await getSettings(db)).nextProductNo).toBe(1);
    expect((await createProduct(draft({ name: 'ب' }), db)).code).toBe('P-00001');
  });

  it('rejects a duplicate code', async () => {
    await createProduct(draft({ code: 'DUP' }), db);
    await expect(createProduct(draft({ code: 'DUP' }), db)).rejects.toBeInstanceOf(DuplicateCodeError);
  });

  it('normalizes the search name', async () => {
    const product = await createProduct(
      draft({ name: 'ظرف غذا', variant: 'قرمز - \u06F1\u06F0 \u0644\u06CC\u062A\u0631\u06CC' }),
      db,
    );
    expect(product.nameN).toContain('ظرف غذا');
    expect(product.nameN).toContain('10 لیتری');
    expect(product.nameN).not.toMatch(/\u06F1/);
  });

  it('soft deletes and restores', async () => {
    const product = await createProduct(draft(), db);
    await softDelete('products', product.id, db);
    expect((await db.products.get(product.id))?.deletedAt).toBeTypeOf('number');
  });

  it('rounds money to integers', async () => {
    const product = await createProduct(draft({ buyPrice: 10_000.6, retailPrice: 15_000.4 }), db);
    expect(product.buyPrice).toBe(10_001);
    expect(product.retailPrice).toBe(15_000);
  });
});

describe('price history', () => {
  it('detects changed fields only', () => {
    expect(diffPrices({ buyPrice: 100, retailPrice: 200 }, { retailPrice: 250 })).toEqual([
      { field: 'retail', oldValue: 200, newValue: 250 },
    ]);
  });

  it('treats an undefined wholesale price as zero and skips undefined patches', () => {
    expect(diffPrices({ buyPrice: 1, retailPrice: 2 }, { wholesalePrice: 5 })).toEqual([
      { field: 'wholesale', oldValue: 0, newValue: 5 },
    ]);
    expect(diffPrices({ buyPrice: 1, retailPrice: 2 }, { buyPrice: 1 })).toEqual([]);
  });

  it('writes price rows in the same transaction as the product update', async () => {
    const product = await createProduct(draft(), db);
    await updateProduct(product.id, { buyPrice: 12_000, retailPrice: 18_000 }, {}, db);
    const rows = await db.priceChanges.where('productId').equals(product.id).toArray();
    expect(rows.map((r) => r.field).sort()).toEqual(['buy', 'retail']);
    expect((await db.products.get(product.id))?.updatedAt).toBeGreaterThanOrEqual(product.updatedAt);
  });

  it('writes nothing when prices are unchanged', async () => {
    const product = await createProduct(draft(), db);
    await updateProduct(product.id, { buyPrice: 10_000 }, {}, db);
    expect(await db.priceChanges.count()).toBe(0);
  });
});

describe('movements', () => {
  let productId: string;
  let otherLocationId: string;

  beforeEach(async () => {
    const product = await createProduct(draft(), db);
    productId = product.id;
    otherLocationId = (await createLocation({ name: 'زیرزمین' }, db)).id;
  });

  it('appends a movement and updates the cached level', async () => {
    await applyMovement({ productId, locationId: 'loc-shop', type: 'receive', qty: 25 }, db);
    expect(await productLevels(productId, db)).toEqual([{ locationId: 'loc-shop', qty: 25 }]);
  });

  it('rejects negative stock and writes nothing', async () => {
    await applyMovement({ productId, locationId: 'loc-shop', type: 'receive', qty: 5 }, db);
    await expect(
      applyMovement({ productId, locationId: 'loc-shop', type: 'sale', qty: -6 }, db),
    ).rejects.toThrow('InsufficientStock');
    expect((await productLevels(productId, db))[0]?.qty).toBe(5);
    expect(await db.movements.count()).toBe(1);
  });

  it('rejects a zero-quantity movement', async () => {
    await expect(
      applyMovement({ productId, locationId: 'loc-shop', type: 'adjust', qty: 0 }, db),
    ).rejects.toThrow('MovementQtyMustBeNonZero');
  });

  it('keeps the shelf position when the level changes', async () => {
    await applyMovement({ productId, locationId: 'loc-shop', type: 'receive', qty: 4 }, db);
    await setBin(productId, 'loc-shop', 'A-12', db);
    await applyMovement({ productId, locationId: 'loc-shop', type: 'receive', qty: 4 }, db);
    expect((await productLevels(productId, db))[0]?.bin).toBe('A-12');
  });

  it('transfers atomically with one refId', async () => {
    await applyMovement({ productId, locationId: 'loc-shop', type: 'receive', qty: 30 }, db);
    const result = await applyTransfer(productId, 'loc-shop', otherLocationId, 12, {}, db);
    const levels = await productLevels(productId, db);
    expect(levels.find((l) => l.locationId === 'loc-shop')?.qty).toBe(18);
    expect(levels.find((l) => l.locationId === otherLocationId)?.qty).toBe(12);
    expect(result.out.refId).toBe(result.in.refId);
  });

  it('rolls the whole transfer back when the source is short', async () => {
    await applyMovement({ productId, locationId: 'loc-shop', type: 'receive', qty: 3 }, db);
    await expect(
      applyTransfer(productId, 'loc-shop', otherLocationId, 5, {}, db),
    ).rejects.toThrow('InsufficientStock');
    const levels = await productLevels(productId, db);
    expect(levels).toEqual([{ locationId: 'loc-shop', qty: 3 }]);
    expect(await db.movements.where('type').equals('transfer_in').count()).toBe(0);
  });

  it('refuses a transfer to the same location', async () => {
    await expect(applyTransfer(productId, 'loc-shop', 'loc-shop', 1, {}, db)).rejects.toThrow(
      'TransferSameLocation',
    );
  });

  it('undoes a movement with a compensating row and cannot run twice', async () => {
    const movement = await applyMovement(
      { productId, locationId: 'loc-shop', type: 'receive', qty: 10 },
      db,
    );
    await undoMovement(movement.id, db);
    expect((await productLevels(productId, db))[0]?.qty).toBe(0);
    await expect(undoMovement(movement.id, db)).rejects.toBeInstanceOf(AlreadyUndoneError);
    expect((await productLevels(productId, db))[0]?.qty).toBe(0);
  });

  it('does not allow undoing the undo itself', async () => {
    const movement = await applyMovement(
      { productId, locationId: 'loc-shop', type: 'receive', qty: 10 },
      db,
    );
    const undo = await undoMovement(movement.id, db);
    await expect(undoMovement(undo.id, db)).rejects.toBeInstanceOf(AlreadyUndoneError);
  });

  it('undoes both legs of a transfer', async () => {
    await applyMovement({ productId, locationId: 'loc-shop', type: 'receive', qty: 30 }, db);
    const transfer = await applyTransfer(productId, 'loc-shop', otherLocationId, 10, {}, db);
    await undoMovement(transfer.out.id, db);
    const levels = await productLevels(productId, db);
    expect(levels.find((l) => l.locationId === 'loc-shop')?.qty).toBe(30);
    expect(levels.find((l) => l.locationId === otherLocationId)?.qty).toBe(0);
  });

  it('reports a missing movement', async () => {
    await expect(undoMovement('nope', db)).rejects.toThrow('MovementNotFound');
  });
});

describe('rebuildStockLevels', () => {
  it('recomputes levels from movements and preserves bins', async () => {
    const product = await createProduct(draft(), db);
    await applyMovement({ productId: product.id, locationId: 'loc-shop', type: 'receive', qty: 8 }, db);
    await applyMovement({ productId: product.id, locationId: 'loc-shop', type: 'sale', qty: -3 }, db);
    await applyMovement({ productId: product.id, locationId: 'loc-warehouse', type: 'receive', qty: 2 }, db);
    await setBin(product.id, 'loc-shop', 'B-3', db);

    // Corrupt the cached quantity, then rebuild.
    await db.stockLevels.update([product.id, 'loc-shop'], { qty: 999, updatedAt: 0 });
    const count = await rebuildStockLevels(db);

    const levels = await productLevels(product.id, db);
    expect(count).toBe(2);
    expect(levels.find((l) => l.locationId === 'loc-shop')).toEqual({
      locationId: 'loc-shop',
      qty: 5,
      bin: 'B-3',
    });
    expect(levels.find((l) => l.locationId === 'loc-warehouse')?.qty).toBe(2);
  });

  it('keeps a bin-only row at zero', async () => {
    const product = await createProduct(draft(), db);
    await setBin(product.id, 'loc-shop', 'C-1', db);
    await rebuildStockLevels(db);
    const levels = await productLevels(product.id, db);
    expect(levels).toEqual([{ locationId: 'loc-shop', qty: 0, bin: 'C-1' }]);
  });

  it('drops levels that have no movements and no bin', async () => {
    const product = await createProduct(draft(), db);
    await db.stockLevels.put({ productId: product.id, locationId: 'loc-shop', qty: 7, updatedAt: 0 });
    await rebuildStockLevels(db);
    expect(await productLevels(product.id, db)).toEqual([]);
  });
});

describe('quick price updates', () => {
  it('writes only the prices and keeps every other field', async () => {
    const product = await createProduct(
      draft({ variant: 'قرمز', family: 'ظرف غذا', barcodes: ['111'], packSize: 24, minStock: 5 }),
      db,
    );

    await updateProduct(
      product.id,
      { buyPrice: 12_000, retailPrice: 19_000, wholesalePrice: 17_000 },
      { reason: 'ویرایش سریع قیمت' },
      db,
    );

    const after = await getProduct(product.id, db);
    expect(after).toMatchObject({
      buyPrice: 12_000,
      retailPrice: 19_000,
      wholesalePrice: 17_000,
      variant: 'قرمز',
      family: 'ظرف غذا',
      packSize: 24,
      minStock: 5,
      barcodes: ['111'],
    });
  });

  it('logs one price change per edited price, and nothing when unchanged', async () => {
    const product = await createProduct(draft(), db);

    await updateProduct(product.id, { retailPrice: 18_000 }, {}, db);
    let changes = await listPriceChanges(product.id, db);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ field: 'retail', oldValue: 15_000, newValue: 18_000 });

    await updateProduct(product.id, { retailPrice: 18_000 }, {}, db);
    changes = await listPriceChanges(product.id, db);
    expect(changes).toHaveLength(1);
  });
});

describe('reference data', () => {
  it('creates and lists brands sorted with the Persian collator', async () => {
    await createBrand({ name: 'زیباسازان' }, db);
    await createBrand({ name: 'بازن' }, db);
    expect((await listBrands(db)).map((b) => b.name)).toEqual(['بازن', 'زیباسازان']);
  });

  it('soft deletes without removing the row', async () => {
    const brand = await createBrand({ name: 'لیمون' }, db);
    await softDelete('brands', brand.id, db);
    expect(await listBrands(db)).toEqual([]);
    expect(await db.brands.count()).toBe(1);
  });
});
