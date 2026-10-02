import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PlascoDb } from './dexie';
import { applyMovement } from './movements';
import { createProduct, listProducts } from './repos';
import {
  StockTakeNotOpenError,
  applyStockTake,
  revertStockTake,
} from './stocktake';
import type { PlascoDb as Db } from './dexie';
import type { ID, StockTake, StockTakeItem } from './types';

let db: PlascoDb;
let dbIndex = 0;

beforeEach(async () => {
  dbIndex += 1;
  db = new PlascoDb(`test-stocktake-${dbIndex}`);
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

const LOC = 'loc-shop';

async function makeProduct(target: Db, name: string, qty: number) {
  const product = await createProduct(
    { name, buyPrice: 10_000, retailPrice: 15_000, packSize: 12 },
    target,
  );
  if (qty !== 0) {
    await applyMovement({ productId: product.id, locationId: LOC, type: 'receive', qty }, target);
  }
  return product;
}

async function openSession(target: Db, locationId = LOC): Promise<ID> {
  const at = Date.now();
  const session: StockTake = {
    id: `st-${Math.random().toString(36).slice(2)}`,
    locationId,
    status: 'open',
    createdAt: at,
    updatedAt: at,
  };
  await target.stockTakes.add(session);
  return session.id;
}

async function countItem(target: Db, stockTakeId: ID, productId: ID, counted: number) {
  const item: StockTakeItem = {
    id: `sti-${Math.random().toString(36).slice(2)}`,
    stockTakeId,
    productId,
    counted,
    systemQtyAtCount: 0,
    at: Date.now(),
  };
  await target.stockTakeItems.add(item);
}

async function levelOf(target: Db, productId: ID, locationId = LOC) {
  const row = await target.stockLevels.get([productId, locationId]);
  return row?.qty ?? 0;
}

describe('applyStockTake', () => {
  it('writes one count movement per difference and closes the session', async () => {
    const short = await makeProduct(db, 'کوتاه', 10);
    const over = await makeProduct(db, 'زیاد', 3);
    const same = await makeProduct(db, 'یکسان', 7);
    const sessionId = await openSession(db);

    await countItem(db, sessionId, short.id, 6);
    await countItem(db, sessionId, over.id, 9);
    await countItem(db, sessionId, same.id, 7);

    const result = await applyStockTake(sessionId, {}, db);

    expect(result.movements).toHaveLength(2);
    expect(result.unchanged).toBe(1);
    expect(await levelOf(db, short.id)).toBe(6);
    expect(await levelOf(db, over.id)).toBe(9);
    expect(await levelOf(db, same.id)).toBe(7);

    const movements = await db.movements.where('refId').equals(sessionId).toArray();
    expect(movements.every((m) => m.type === 'count')).toBe(true);
    expect(movements.map((m) => m.qty).sort((a, b) => a - b)).toEqual([-4, 6]);

    const session = await db.stockTakes.get(sessionId);
    expect(session?.status).toBe('applied');
    expect(session?.appliedAt).toBeTypeOf('number');
  });

  it('applies nothing when nobody counted anything', async () => {
    await makeProduct(db, 'دست‌نخورده', 12);
    const sessionId = await openSession(db);

    const result = await applyStockTake(sessionId, {}, db);

    expect(result.movements).toEqual([]);
    expect(result.unchanged).toBe(0);
    expect(await db.movements.where('refId').equals(sessionId).count()).toBe(0);
    expect((await db.stockTakes.get(sessionId))?.status).toBe('applied');
  });

  it('zeroes only uncounted products when asked, and skips deleted ones', async () => {
    const counted = await makeProduct(db, 'شمرده', 5);
    const uncounted = await makeProduct(db, 'نشمرده', 4);
    const gone = await makeProduct(db, 'حذف‌شده', 3);
    await db.products.update(gone.id, { deletedAt: Date.now() });

    const sessionId = await openSession(db);
    await countItem(db, sessionId, counted.id, 5);

    const result = await applyStockTake(sessionId, { treatUncountedAsZero: true }, db);

    expect(result.movements).toHaveLength(1);
    expect(await levelOf(db, counted.id)).toBe(5);
    expect(await levelOf(db, uncounted.id)).toBe(0);
    expect(await levelOf(db, gone.id)).toBe(3);
  });

  it('refuses to run twice and refuses a cancelled session', async () => {
    const product = await makeProduct(db, 'ظرف', 10);
    const sessionId = await openSession(db);
    await countItem(db, sessionId, product.id, 4);

    await applyStockTake(sessionId, {}, db);
    await expect(applyStockTake(sessionId, {}, db)).rejects.toBeInstanceOf(StockTakeNotOpenError);

    const other = await openSession(db);
    await db.stockTakes.update(other, { status: 'cancelled' });
    await expect(applyStockTake(other, {}, db)).rejects.toBeInstanceOf(StockTakeNotOpenError);

    // The failed second apply must not have touched the shelf again.
    expect(await levelOf(db, product.id)).toBe(4);
  });

  it('rolls the whole apply back when one movement is impossible', async () => {
    const fine = await makeProduct(db, 'سالم', 10);
    const broken = await makeProduct(db, 'خراب', 0);
    const sessionId = await openSession(db);

    await countItem(db, sessionId, fine.id, 6);
    // A negative count can only come from a corrupted row; the ledger must reject it.
    await countItem(db, sessionId, broken.id, -3);

    await expect(applyStockTake(sessionId, {}, db)).rejects.toThrow('InsufficientStock');

    expect(await levelOf(db, fine.id)).toBe(10);
    expect(await db.movements.where('refId').equals(sessionId).count()).toBe(0);
    expect((await db.stockTakes.get(sessionId))?.status).toBe('open');
  });
});

describe('revertStockTake', () => {
  it('compensates the count movements and reopens the session', async () => {
    const product = await makeProduct(db, 'ظرف', 10);
    const sessionId = await openSession(db);
    await countItem(db, sessionId, product.id, 4);

    await applyStockTake(sessionId, {}, db);
    expect(await levelOf(db, product.id)).toBe(4);

    const result = await revertStockTake(sessionId, db);

    expect(result.reverted).toBe(1);
    expect(await levelOf(db, product.id)).toBe(10);
    const session = await db.stockTakes.get(sessionId);
    expect(session?.status).toBe('open');
    expect(session?.appliedAt).toBeUndefined();

    await expect(revertStockTake(sessionId, db)).rejects.toBeInstanceOf(StockTakeNotOpenError);
    expect(await levelOf(db, product.id)).toBe(10);
  });

  it('keeps levels consistent with the movements ledger after a revert', async () => {
    const product = await makeProduct(db, 'ظرف', 8);
    const sessionId = await openSession(db);
    await countItem(db, sessionId, product.id, 5);

    await applyStockTake(sessionId, {}, db);
    await revertStockTake(sessionId, db);

    const movements = await db.movements.toArray();
    const sum = movements.reduce((total, m) => total + m.qty, 0);
    expect(await levelOf(db, product.id)).toBe(sum);
    expect(await listProducts(db)).toHaveLength(1);
  });
});
