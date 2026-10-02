import { newId } from '@/lib/id';
import { db, type PlascoDb } from './dexie';
import type { ID, PriceChange } from './types';

export type PriceField = PriceChange['field'];

export interface PriceDiff {
  field: PriceField;
  oldValue: number;
  newValue: number;
}

/** Pure comparison so the same rule can be tested and reused by bulk updates. */
export function diffPrices(
  previous: { buyPrice: number; retailPrice: number; wholesalePrice?: number },
  next: { buyPrice?: number; retailPrice?: number; wholesalePrice?: number },
): PriceDiff[] {
  const diffs: PriceDiff[] = [];
  const pairs: Array<[PriceField, number | undefined, number | undefined]> = [
    ['buy', previous.buyPrice, next.buyPrice],
    ['retail', previous.retailPrice, next.retailPrice],
    ['wholesale', previous.wholesalePrice, next.wholesalePrice],
  ];
  for (const [field, before, after] of pairs) {
    if (after == null) continue;
    const oldValue = before ?? 0;
    if (oldValue !== after) diffs.push({ field, oldValue, newValue: after });
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
