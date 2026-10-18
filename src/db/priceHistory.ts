import { newId } from '@/lib/id';
import { db, type PlascoDb } from './dexie';
import type { ID, PriceChange } from './types';

export type PriceField = PriceChange['field'];

export interface PriceDiff {
  field: PriceField;
  oldValue: number;
  newValue: number;
}

/**
 * Pure comparison so the same rule can be tested and reused by bulk updates.
 *
 * A key that is *present but undefined* means "clear this field" (the product
 * form always carries all three price keys), so clearing wholesale logs a
 * change to zero. A key that is absent means "the caller doesn't carry this
 * field at all" (price lists, undo journals) and stays untouched.
 */
export function diffPrices(
  previous: { buyPrice: number; retailPrice: number; wholesalePrice?: number },
  next: { buyPrice?: number; retailPrice?: number; wholesalePrice?: number },
): PriceDiff[] {
  const diffs: PriceDiff[] = [];
  const pairs: Array<[PriceField, boolean, number | undefined, number | undefined]> = [
    ['buy', 'buyPrice' in next, previous.buyPrice, next.buyPrice],
    ['retail', 'retailPrice' in next, previous.retailPrice, next.retailPrice],
    ['wholesale', 'wholesalePrice' in next, previous.wholesalePrice, next.wholesalePrice],
  ];
  for (const [field, carried, before, after] of pairs) {
    if (!carried) continue;
    const oldValue = before ?? 0;
    const newValue = after ?? 0;
    if (oldValue !== newValue) diffs.push({ field, oldValue, newValue });
  }
  return diffs;
}

/** Must run inside the same transaction as the product update. */
export async function writePriceChanges(
  target: PlascoDb,
  productId: ID,
  diffs: readonly PriceDiff[],
  reason?: string,
): Promise<void> {
  if (diffs.length === 0) return;
  const at = Date.now();
  await target.priceChanges.bulkAdd(
    diffs.map((d) => ({
      id: newId(),
      productId,
      field: d.field,
      oldValue: d.oldValue,
      newValue: d.newValue,
      at,
      reason,
    })),
  );
}

export async function listPriceChanges(
  productId: ID,
  target: PlascoDb = db,
): Promise<PriceChange[]> {
  const rows = await target.priceChanges.where('productId').equals(productId).toArray();
  return rows.sort((a, b) => b.at - a.at);
}
