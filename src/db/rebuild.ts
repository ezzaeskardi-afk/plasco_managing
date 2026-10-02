import { db, type PlascoDb } from './dexie';
import type { ID, StockLevel } from './types';

/**
 * `stockLevels` is a cache of the sum of `movements`.
 * Runs after restore, merge and import. Existing `bin` values are preserved.
 */
export async function rebuildStockLevels(target: PlascoDb = db): Promise<number> {
  return target.transaction('rw', target.movements, target.stockLevels, async () => {
    const sums = new Map<string, number>();
    await target.movements.each((m) => {
      const key = `${m.productId}\u0000${m.locationId}`;
      sums.set(key, (sums.get(key) ?? 0) + m.qty);
    });

    const previous = await target.stockLevels.toArray();
    const previousByKey = new Map<string, StockLevel>();
    for (const level of previous) previousByKey.set(`${level.productId}\u0000${level.locationId}`, level);

    const now = Date.now();
    const next: StockLevel[] = [];
    for (const [key, qty] of sums) {
      const [productId, locationId] = key.split('\u0000') as [ID, ID];
      const old = previousByKey.get(key);
      if (qty === 0 && !old) continue;
      next.push({ productId, locationId, qty, bin: old?.bin, updatedAt: now });
      previousByKey.delete(key);
    }

    // Rows with no movements keep their bin so shelf positions are not lost;
    // rows that only carried a (possibly stale) quantity are dropped.
    for (const leftover of previousByKey.values()) {
      if (!leftover.bin) continue;
      next.push({ ...leftover, qty: 0, bin: leftover.bin, updatedAt: now });
    }

    await target.stockLevels.clear();
    if (next.length > 0) await target.stockLevels.bulkPut(next);
    return next.length;
  });
}
