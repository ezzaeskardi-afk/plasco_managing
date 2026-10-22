import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PlascoDb } from '@/db/dexie';
import { createProduct, listLocations, softDeleteProduct } from '@/db/repos';
import { undoImportBatch } from '@/db/imports';
import {
  buildContext,
  commitRows,
  guessMap,
  prepareRows,
  type ColumnMap,
  type PreparedRow,
} from './importer';

let db: PlascoDb;
let dbIndex = 0;

beforeEach(async () => {
  dbIndex += 1;
  db = new PlascoDb(`test-import-${dbIndex}`);
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

async function seedProduct() {
  return createProduct(
    { name: 'ظرف غذا', buyPrice: 15_000, retailPrice: 22_000, packSize: 12, barcodes: ['6260001'] },
    db,
  );
}

describe('column guessing', () => {
  it('maps Persian and Latin headers', () => {
    const map = guessMap(['نام کالا', 'قیمت خرید', 'Barcode', 'موجودی']);
    expect(map.name).toBe('نام کالا');
    expect(map.buy).toBe('قیمت خرید');
    expect(map.barcode).toBe('Barcode');
    expect(map.quantity).toBe('موجودی');
  });

  it('gives every header to one field only', () => {
    // «کد کالا» also contains «کالا»; the code field must win and the name go to «شرح کالا».
    const map = guessMap(['کد کالا', 'شرح کالا', 'فی خرید', 'فی خرده']);
    expect(map.code).toBe('کد کالا');
    expect(map.name).toBe('شرح کالا');
    expect(map.buy).toBe('فی خرید');
    expect(map.retail).toBe('فی خرده');
  });
});

describe('prepareRows', () => {
  it('matches an existing product through the normalized name', async () => {
    const product = await seedProduct();
    const context = await buildContext(db);
    const map: ColumnMap = { name: 'نام', quantity: 'موجودی' };
    const rows = [{ نام: 'ظرف غذا', موجودی: '5' }];

    const prepared = prepareRows(rows, map, context);
    expect(prepared).toHaveLength(1);
    expect(prepared[0]?.action).toBe('update');
    expect(prepared[0]?.productId).toBe(product.id);
  });

  it('matches by barcode before code', async () => {
    const product = await seedProduct();
    const context = await buildContext(db);
    const prepared = prepareRows(
      [{ نام: 'نام دیگری', کد: 'WRONG-CODE', بارکد: '6260001' }],
      { name: 'نام', code: 'کد', barcode: 'بارکد' },
      context,
    );
    expect(prepared[0]?.productId).toBe(product.id);
    expect(prepared[0]?.action).toBe('update');
  });

  it('matches a UPC-A file barcode against its stored EAN-13 form', async () => {
    const product = await createProduct(
      { name: 'ظرف غذا', buyPrice: 15_000, retailPrice: 22_000, packSize: 12, barcodes: ['0600123456789'] },
      db,
    );
    const context = await buildContext(db);
    const prepared = prepareRows(
      [{ نام: 'ظرف غذا', بارکد: '600123456789', خرده: '۲۵۰۰۰' }],
      { name: 'نام', barcode: 'بارکد', retail: 'خرده' },
      context,
    );
    expect(prepared[0]?.action).toBe('update');
    expect(prepared[0]?.productId).toBe(product.id);
  });

  it('flags rows without a name and duplicate rows', async () => {
    const context = await buildContext(db);
    const prepared = prepareRows(
      [{ نام: '', کد: 'A' }, { نام: 'سطل', کد: 'B' }, { نام: 'سطل', کد: 'B' }],
      { name: 'نام', code: 'کد' },
      context,
    );
    expect(prepared[0]?.action).toBe('error');
    expect(prepared[1]?.action).toBe('new');
    expect(prepared[2]?.action).toBe('error');
  });

  it('only carries the fields the file provides', async () => {
    await seedProduct();
    const context = await buildContext(db);
    const prepared = prepareRows([{ نام: 'ظرف غذا', موجودی: '5' }], { name: 'نام', quantity: 'موجودی' }, context);
    expect(prepared[0]?.draft).toEqual({ name: 'ظرف غذا' });
  });

  it('rejects negative and non-numeric numbers instead of clamping them away', async () => {
    const context = await buildContext(db);
    const prepared = prepareRows(
      [
        { نام: 'الف', خرید: '-۵۰۰۰', موجودی: '۳' },
        { نام: 'ب', خرده: 'هزار' },
        { نام: 'ج', موجودی: '-۲' },
      ],
      { name: 'نام', buy: 'خرید', retail: 'خرده', quantity: 'موجودی' },
      context,
    );

    expect(prepared.map((row) => row.action)).toEqual(['error', 'error', 'error']);
    expect(prepared[0]?.reason).toContain('منفی');
    expect(prepared[1]?.reason).toContain('عدد نیست');
    expect(prepared[2]?.reason).toContain('منفی');
  });
});

describe('commitRows', () => {
  it('never wipes fields the sheet does not carry', async () => {
    const product = await seedProduct();
    const context = await buildContext(db);
    const prepared = prepareRows([{ نام: 'ظرف غذا', موجودی: '5' }], { name: 'نام', quantity: 'موجودی' }, context);

    const result = await commitRows(prepared, {}, db);
    expect(result.updated).toBe(1);

    const after = await db.products.get(product.id);
    expect(after?.buyPrice).toBe(15_000);
    expect(after?.retailPrice).toBe(22_000);
    expect(after?.packSize).toBe(12);
    expect(after?.barcodes).toEqual(['6260001']);
  });

  it('does not touch stock of existing products unless asked', async () => {
    await seedProduct();
    const context = await buildContext(db);
    const locations = await listLocations(db);
    const prepared = prepareRows(
      [{ نام: 'ظرف غذا', موجودی: '5' }],
      { name: 'نام', quantity: 'موجودی' },
      { ...context, defaultLocationId: locations[0]?.id },
    );

    await commitRows(prepared, {}, db);
    expect(await db.stockLevels.count()).toBe(0);

    await commitRows(prepared, { updateExistingStock: true }, db);
    const levels = await db.stockLevels.toArray();
    expect(levels[0]?.qty).toBe(5);
  });

  it('flags rows whose quantity cannot be applied and writes no level', async () => {
    await seedProduct();
    const context = await buildContext(db);
    const prepared = prepareRows([{ نام: 'ظرف غذا', موجودی: '5' }], { name: 'نام', quantity: 'موجودی' }, context);

    expect(prepared[0]?.quantitySkipped).toBe(true);
    await commitRows(prepared, { updateExistingStock: true }, db);
    expect(await db.stockLevels.count()).toBe(0);
  });

  it('creates new products with defaults and their opening quantity', async () => {
    const locations = await listLocations(db);
    const context = await buildContext(db);
    const prepared = prepareRows(
      [{ نام: 'سطل', خرید: '۱۰,۰۰۰', خرده: '۱۴۰۰۰', تعداد: '۳' }],
      { name: 'نام', buy: 'خرید', retail: 'خرده', quantity: 'تعداد' },
      { ...context, defaultLocationId: locations[0]?.id },
    );

    const result = await commitRows(prepared, {}, db);
    expect(result.created).toBe(1);

    const created = await db.products.toArray();
    expect(created[0]?.buyPrice).toBe(10_000);
    expect(created[0]?.retailPrice).toBe(14_000);
    expect(created[0]?.packSize).toBe(1);
    expect(created[0]?.barcodes).toEqual([]);

    const levels = await db.stockLevels.toArray();
    expect(levels[0]?.qty).toBe(3);
    const movements = await db.movements.toArray();
    expect(movements[0]?.type).toBe('initial');
  });

  it('commits more than one chunk without losing rows', async () => {
    const context = await buildContext(db);
    const rows = Array.from({ length: 12 }, (_, i) => ({ نام: `کالای ${i + 1}` }));
    const prepared = prepareRows(rows, { name: 'نام' }, context);

    const result = await commitRows(prepared, { chunkSize: 5 }, db);
    expect(result.created).toBe(12);
    expect(await db.products.count()).toBe(12);
  });

  it('skips error rows', async () => {
    const context = await buildContext(db);
    const prepared = prepareRows([{ نام: '' }], { name: 'نام' }, context);
    const result = await commitRows(prepared, {}, db);
    expect(result.created).toBe(0);
    expect(await db.products.count()).toBe(0);
  });

  it('fails only the row whose code is taken, not the whole chunk', async () => {
    // A soft-deleted product keeps its code reserved, so the file row looks new
    // and the repos throw mid-chunk; that must fail this row alone.
    const taken = await seedProduct();
    await softDeleteProduct(taken.id, db);
    const context = await buildContext(db);
    const prepared = prepareRows(
      [{ نام: 'کالای تازه' }, { نام: 'دوم', کد: taken.code }],
      { name: 'نام', code: 'کد' },
      context,
    );
    expect(prepared.map((row) => row.action)).toEqual(['new', 'new']);

    const result = await commitRows(prepared, {}, db);
    expect(result.created).toBe(1);
    expect(result.failed).toBe(1);
    // A code clash must not roll back the good row of the same chunk.
    const names = (await db.products.toArray()).map((product) => product.name);
    expect(names).toContain('کالای تازه');
  });

  it('creates the file brand when an update row names a new one', async () => {
    const product = await seedProduct();
    const context = await buildContext(db);
    const prepared = prepareRows(
      [{ نام: 'ظرف غذا', برند: 'شرکت الف', خرده: '۲۵۰۰۰' }],
      { name: 'نام', brand: 'برند', retail: 'خرده' },
      context,
    );
    expect(prepared[0]?.action).toBe('update');

    const result = await commitRows(prepared, {}, db);
    expect(result.updated).toBe(1);
    const brands = await db.brands.toArray();
    expect(brands.map((brand) => brand.name)).toEqual(['شرکت الف']);
    expect((await db.products.get(product.id))?.brandId).toBe(brands[0]?.id);
  });

  it('creates a new file brand once for every row that names it', async () => {
    const context = await buildContext(db);
    const prepared = prepareRows(
      [
        { نام: 'سطل', برند: 'شرکت الف' },
        { نام: 'سبد', برند: 'شرکت الف' },
      ],
      { name: 'نام', brand: 'برند' },
      context,
    );

    const result = await commitRows(prepared, {}, db);
    expect(result.created).toBe(2);
    const brands = await db.brands.toArray();
    expect(brands).toHaveLength(1);
    const products = await db.products.toArray();
    expect(products.map((product) => product.brandId)).toEqual([brands[0]?.id, brands[0]?.id]);
  });

  it('keeps the committed chunks undoable when a later chunk fails', async () => {
    const context = await buildContext(db);
    const prepared = prepareRows(
      [{ نام: 'الف' }, { نام: 'ب' }],
      { name: 'نام' },
      context,
    );
    const broken = { rowNumber: 3, action: 'new' } as PreparedRow;
    Object.defineProperty(broken, 'draft', {
      get() {
        throw new Error('simulated write failure');
      },
    });
    const first = prepared[0];
    if (!first) throw new Error('expected a first row');

    await expect(commitRows([first, broken], { chunkSize: 1 }, db)).rejects.toThrow(
      'simulated write failure',
    );

    const batches = await db.imports.toArray();
    expect(batches).toHaveLength(1);
    const batch = batches[0];
    if (!batch) throw new Error('expected a partial batch');
    expect(batch).toMatchObject({ created: 1, updated: 0 });
    const entries = await db.importEntries.where('batchId').equals(batch.id).toArray();
    expect(entries).toHaveLength(1);
    expect((await db.products.toArray()).map((product) => product.name)).toEqual(['الف']);

    await undoImportBatch(batch.id, db);
    const afterUndo = await db.products.toArray();
    expect(afterUndo[0]?.deletedAt).toBeTypeOf('number');
  });
});

describe('import journal', () => {
  it('restores a product once when two rows of the file touch it', async () => {
    const product = await seedProduct();
    const context = await buildContext(db);
    const prepared = prepareRows(
      [
        { نام: 'ظرف غذا', بارکد: '6260001', خرید: '۲۱۰۰۰' },
        { نام: 'ظرف غذا', خرید: '۱۱۰۰۰' },
      ],
      { name: 'نام', barcode: 'بارکد', buy: 'خرید' },
      context,
    );
    // Both rows match the same product through different keys.
    expect(prepared.map((row) => row.action)).toEqual(['update', 'update']);

    const commit = await commitRows(prepared, {}, db);
    if (!commit.batchId) throw new Error('expected a batch');
    expect((await db.products.get(product.id))?.buyPrice).toBe(11_000);

    // One restore point only: the second row must not record the first row's
    // already-imported value as its «before» (that replay would stick forever).
    const updates = (await db.importEntries.where('batchId').equals(commit.batchId).toArray()).filter(
      (entry) => entry.kind === 'product-updated',
    );
    expect(updates).toHaveLength(1);

    await undoImportBatch(commit.batchId, db);
    expect((await db.products.get(product.id))?.buyPrice).toBe(15_000);
  });

  it('restores fields imported by later rows in separate chunks', async () => {
    const product = await seedProduct();
    const context = await buildContext(db);
    const prepared = prepareRows(
      [
        { نام: 'ظرف غذا', خرده: '۲۵۰۰۰' },
        { نام: 'ظرف غذا', بارکد: '6260001', خرید: '۱۱۰۰۰' },
      ],
      { name: 'نام', barcode: 'بارکد', buy: 'خرید', retail: 'خرده' },
      context,
    );
    expect(prepared.map((row) => row.action)).toEqual(['update', 'update']);

    const commit = await commitRows(prepared, { chunkSize: 1 }, db);
    if (!commit.batchId) throw new Error('expected a batch');
    expect(await db.products.get(product.id)).toMatchObject({
      buyPrice: 11_000,
      retailPrice: 25_000,
    });

    await undoImportBatch(commit.batchId, db);
    expect(await db.products.get(product.id)).toMatchObject({
      buyPrice: 15_000,
      retailPrice: 22_000,
    });
  });
});

describe('price-only mode', () => {
  it('changes the prices of a matching product and leaves everything else alone', async () => {
    const product = await seedProduct();
    const context = await buildContext(db);
    const locations = await listLocations(db);
    const prepared = prepareRows(
      [{ نام: 'ظرف غذا', بارکد: '6260001', خرید: '۱۱۰۰۰', خرده: '۲۵۰۰۰', موجودی: '۹' }],
      { name: 'نام', barcode: 'بارکد', buy: 'خرید', retail: 'خرده', quantity: 'موجودی' },
      { ...context, defaultLocationId: locations[0]?.id },
      { mode: 'prices' },
    );

    expect(prepared[0]?.action).toBe('update');
    const result = await commitRows(prepared, { updateExistingStock: true }, db);
    expect(result.updated).toBe(1);
    expect(result.created).toBe(0);

    const after = await db.products.get(product.id);
    expect(after?.buyPrice).toBe(11_000);
    expect(after?.retailPrice).toBe(25_000);
    expect(after?.name).toBe('ظرف غذا');
    expect(after?.packSize).toBe(12);
    expect(after?.barcodes).toEqual(['6260001']);

    // The stock toggle must not leak into this mode.
    expect(await db.stockLevels.count()).toBe(0);
    expect(await db.movements.count()).toBe(0);
  });

  it('reports products the shop does not carry yet instead of creating them', async () => {
    const context = await buildContext(db);
    const prepared = prepareRows(
      [{ نام: 'کالای تازه شرکت', خرید: '۵۰۰۰' }],
      { name: 'نام', buy: 'خرید' },
      context,
      { mode: 'prices' },
    );

    expect(prepared[0]?.action).toBe('missing');
    expect(prepared[0]?.productId).toBeUndefined();

    const result = await commitRows(prepared, {}, db);
    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.batchId).toBeNull();
    expect(await db.products.count()).toBe(0);
  });

  it('flags a row that carries no price at all', async () => {
    await seedProduct();
    const context = await buildContext(db);
    const prepared = prepareRows([{ نام: 'ظرف غذا' }], { name: 'نام' }, context, { mode: 'prices' });
    expect(prepared[0]?.action).toBe('error');
  });

  it('accepts a company list that carries only codes and prices', async () => {
    const product = await seedProduct();
    const context = await buildContext(db);
    const prepared = prepareRows(
      [{ 'کد کالا': product.code, 'فی خرید': '۹۹۰۰۰' }],
      { code: 'کد کالا', buy: 'فی خرید' },
      context,
      { mode: 'prices' },
    );

    expect(prepared[0]?.action).toBe('update');
    // The review falls back to the shop's own name when the file has none.
    expect(prepared[0]?.name).toBe(product.name);

    const result = await commitRows(prepared, {}, db);
    expect(result.updated).toBe(1);
    expect((await db.products.get(product.id))?.buyPrice).toBe(99_000);
  });

  it('flags a price row that has neither code nor name', async () => {
    await seedProduct();
    const context = await buildContext(db);
    const prepared = prepareRows([{ 'فی خرید': '۹۹۰۰۰' }], { buy: 'فی خرید' }, context, {
      mode: 'prices',
    });

    expect(prepared[0]?.action).toBe('error');
    expect(prepared[0]?.reason).toContain('نه کد');
  });

  it('is undoable like any other import', async () => {
    const product = await seedProduct();
    const context = await buildContext(db);
    const prepared = prepareRows(
      [{ نام: 'ظرف غذا', خرده: '۳۳۰۰۰' }],
      { name: 'نام', retail: 'خرده' },
      context,
      { mode: 'prices' },
    );
    const result = await commitRows(prepared, {}, db);
    if (!result.batchId) throw new Error('expected a batch');
    expect((await db.products.get(product.id))?.retailPrice).toBe(33_000);

    await undoImportBatch(result.batchId, db);
    expect((await db.products.get(product.id))?.retailPrice).toBe(22_000);
  });
});
