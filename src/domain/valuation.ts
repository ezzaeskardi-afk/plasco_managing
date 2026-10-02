import type { ID, Product, StockLevel, StockState } from '../db/types';

/** Stock state and the signature stack indicator - AGENTS.md sections 6 and 8. */
export function stockState(total: number, minStock?: number): StockState {
  if (!Number.isFinite(total) || total <= 0) return 'out';
  if (minStock != null && minStock > 0 && total <= minStock) return 'low';
  return 'ok';
}

/** 0..4 bars. 0 means "out" (dashed outline in the UI). */
export function stackLevel(total: number, minStock?: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  if (minStock != null && minStock > 0) {
    const ratio = total / minStock;
    if (ratio <= 1) return 1;
    if (ratio <= 2) return 2;
    if (ratio <= 4) return 3;
    return 4;
  }
  if (total <= 9) return 1;
  if (total <= 49) return 2;
  if (total <= 199) return 3;
  return 4;
}

export interface GroupValuation {
  id: ID;
  label?: string;
  pieces: number;
  skuCount: number;
  cost: number;
  retail: number;
}

export interface ValuationSummary {
  /** Pieces in stock (negative level contributions are clamped to 0). */
  pieces: number;
  /** Active products with a positive quantity. */
  skuCount: number;
  /** Active products, in stock or not. */
  productCount: number;
  cost: number;
  retail: number;
  potentialProfit: number;
  byLocation: GroupValuation[];
  byBrand: GroupValuation[];
  byCategory: GroupValuation[];
  /** Total per product, including inactive products (used for stock-state lists). */
  totals: Map<ID, number>;
}

export type ValuationProduct = Pick<
  Product,
  'id' | 'name' | 'code' | 'buyPrice' | 'retailPrice' | 'minStock' | 'active' | 'brandId' | 'categoryId'
> & { deletedAt?: number };

/** Sums stock levels per product. */
export function productTotals(levels: readonly StockLevel[]): Map<ID, number> {
  const totals = new Map<ID, number>();
  for (const level of levels) {
    if (!Number.isFinite(level.qty) || level.qty === 0) continue;
    totals.set(level.productId, (totals.get(level.productId) ?? 0) + level.qty);
  }
  return totals;
}

function emptyGroup(id: ID, label?: string): GroupValuation {
  return { id, label, pieces: 0, skuCount: 0, cost: 0, retail: 0 };
}

function addToGroup(group: GroupValuation, pieces: number, cost: number, retail: number): void {
  group.pieces += pieces;
  if (pieces > 0) group.skuCount += 1;
  group.cost += cost;
  group.retail += retail;
}

function sortGroups(groups: Map<ID, GroupValuation>): GroupValuation[] {
  return Array.from(groups.values()).sort((a, b) => b.retail - a.retail || b.pieces - a.pieces);
}

/**
 * Valuation (Phase 1): cost = Σ(total × buyPrice); retail = Σ(total × retailPrice);
 * potential profit = retail − cost. Inactive/deleted products are skipped and
 * totals ≤ 0 contribute 0.
 */
export function valuate(
  products: readonly ValuationProduct[],
  levels: readonly StockLevel[],
): ValuationSummary {
  const totals = productTotals(levels);
  const byLocation = new Map<ID, GroupValuation>();
  const byBrand = new Map<ID, GroupValuation>();
  const byCategory = new Map<ID, GroupValuation>();
  // Indexed lookup: a linear scan here is O(levels × products) on every render.
  const productById = new Map(products.map((product) => [product.id, product]));

  for (const level of levels) {
    const product = productById.get(level.productId);
    if (!product || !product.active || product.deletedAt != null) continue;
    if (!Number.isFinite(level.qty) || level.qty <= 0) continue;
    const group = byLocation.get(level.locationId) ?? emptyGroup(level.locationId);
    addToGroup(group, level.qty, level.qty * (product.buyPrice || 0), level.qty * (product.retailPrice || 0));
    byLocation.set(level.locationId, group);
  }

  let pieces = 0;
  let skuCount = 0;
  let productCount = 0;
  let cost = 0;
  let retail = 0;

  for (const product of products) {
    if (!product.active || product.deletedAt != null) continue;
    productCount += 1;
    const total = Math.max(0, totals.get(product.id) ?? 0);
    if (total <= 0) continue;
    skuCount += 1;
    const rowCost = total * (product.buyPrice || 0);
    const rowRetail = total * (product.retailPrice || 0);
    pieces += total;
    cost += rowCost;
    retail += rowRetail;

    if (product.brandId) {
      const group = byBrand.get(product.brandId) ?? emptyGroup(product.brandId);
      addToGroup(group, total, rowCost, rowRetail);
      byBrand.set(product.brandId, group);
    }
    if (product.categoryId) {
      const group = byCategory.get(product.categoryId) ?? emptyGroup(product.categoryId);
      addToGroup(group, total, rowCost, rowRetail);
      byCategory.set(product.categoryId, group);
    }
  }

  return {
    pieces,
    skuCount,
    productCount,
    cost,
    retail,
    potentialProfit: retail - cost,
    byLocation: sortGroups(byLocation),
    byBrand: sortGroups(byBrand),
    byCategory: sortGroups(byCategory),
    totals,
  };
}

export interface StockAlertRow {
  product: ValuationProduct;
  total: number;
  state: StockState;
}

/** Low-stock and out-of-stock lists for the dashboard. */
export function stockAlerts(products: readonly ValuationProduct[], levels: readonly StockLevel[]) {
  const totals = productTotals(levels);
  const low: StockAlertRow[] = [];
  const out: StockAlertRow[] = [];
  for (const product of products) {
    if (!product.active || product.deletedAt != null) continue;
    const total = totals.get(product.id) ?? 0;
    const state = stockState(total, product.minStock);
    if (state === 'out') out.push({ product, total, state });
    else if (state === 'low') low.push({ product, total, state });
  }
  // Most urgent first: the cost value of the missing pieces, then brand/name.
  const deficitValue = (row: StockAlertRow) =>
    Math.max(0, (row.product.minStock ?? 0) - row.total) * (row.product.buyPrice || 0);
  low.sort(
    (a, b) =>
      deficitValue(b) - deficitValue(a) ||
      a.product.name.localeCompare(b.product.name, 'fa'),
  );
  out.sort((a, b) => a.product.name.localeCompare(b.product.name, 'fa'));
  return { low, out, totals };
}
