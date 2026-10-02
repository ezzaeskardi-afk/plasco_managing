import { formatProductCode } from '@/domain/codes';
import { normalizeFa } from '@/domain/normalizeFa';
import { newId } from '@/lib/id';
import { DEFAULT_SETTINGS, db, type PlascoDb } from './dexie';
import { diffPrices, writePriceChanges } from './priceHistory';
import type {
  Brand,
  Category,
  ID,
  Location,
  Movement,
  Photo,
  Product,
  Settings,
  StockLevel,
} from './types';

const collator = new Intl.Collator('fa');

/** Raised when an auto or user-supplied product code is already taken. */
export class DuplicateCodeError extends Error {
  constructor(readonly code: string) {
    super('DuplicateCode');
    this.name = 'DuplicateCodeError';
  }
}

function now(): number {
  return Date.now();
}

function alive<T extends { deletedAt?: number }>(rows: readonly T[]): T[] {
  return rows.filter((row) => row.deletedAt == null);
}

function byNameN<T extends { nameN: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => collator.compare(a.nameN, b.nameN));
}

function isConstraintError(error: unknown): boolean {
  return error instanceof Error && error.name === 'ConstraintError';
}

// ----------------------------------------------------------------- settings

export async function getSettings(target: PlascoDb = db): Promise<Settings> {
  const rows = await target.settings.toArray();
  const settings: Settings = { ...DEFAULT_SETTINGS };
  // Every stored row counts, not only the keys that have a default: optional
  // settings (lastBackupAt, costLockPinHash, persistAskedAt) live only in the table.
  for (const row of rows) {
    (settings as unknown as Record<string, unknown>)[row.key] = row.value;
  }
  return settings;
}

export async function setSettings(patch: Partial<Settings>, target: PlascoDb = db): Promise<void> {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return;
  await target.settings.bulkPut(entries.map(([key, value]) => ({ key, value })));
}

// ------------------------------------------------------- brands / categories

export interface BrandDraft {
  name: string;
  phone?: string;
  repName?: string;
  note?: string;
}

export async function listBrands(target: PlascoDb = db): Promise<Brand[]> {
  return byNameN(alive(await target.brands.toArray()));
}

export async function createBrand(draft: BrandDraft, target: PlascoDb = db): Promise<Brand> {
  const at = now();
  const brand: Brand = {
    id: newId(),
    name: draft.name.trim(),
    nameN: normalizeFa(draft.name),
    phone: draft.phone,
    repName: draft.repName,
    note: draft.note,
    createdAt: at,
    updatedAt: at,
  };
  await target.brands.add(brand);
  return brand;
}

export async function updateBrand(id: ID, draft: BrandDraft, target: PlascoDb = db): Promise<void> {
  await target.brands.update(id, {
    name: draft.name.trim(),
    nameN: normalizeFa(draft.name),
    phone: draft.phone,
    repName: draft.repName,
    note: draft.note,
    updatedAt: now(),
  });
}

export interface CategoryDraft {
  name: string;
  sort?: number;
}

export async function listCategories(target: PlascoDb = db): Promise<Category[]> {
  const rows = alive(await target.categories.toArray());
  return [...rows].sort((a, b) => a.sort - b.sort || collator.compare(a.nameN, b.nameN));
}

export async function createCategory(draft: CategoryDraft, target: PlascoDb = db): Promise<Category> {
  const at = now();
  const rows = alive(await target.categories.toArray());
  const category: Category = {
    id: newId(),
    name: draft.name.trim(),
    nameN: normalizeFa(draft.name),
    sort: draft.sort ?? rows.length,
    createdAt: at,
    updatedAt: at,
  };
  await target.categories.add(category);
  return category;
}

export async function updateCategory(
  id: ID,
  draft: CategoryDraft,
  target: PlascoDb = db,
): Promise<void> {
  const patch: Partial<Category> = { name: draft.name.trim(), nameN: normalizeFa(draft.name), updatedAt: now() };
  if (draft.sort != null) patch.sort = draft.sort;
  await target.categories.update(id, patch);
}

// -------------------------------------------------------------- locations

export interface LocationDraft {
  name: string;
  sort?: number;
}

export async function listLocations(target: PlascoDb = db): Promise<Location[]> {
  const rows = alive(await target.locations.toArray());
  return [...rows].sort((a, b) => a.sort - b.sort || collator.compare(a.name, b.name));
}

export async function createLocation(draft: LocationDraft, target: PlascoDb = db): Promise<Location> {
  const at = now();
  const rows = alive(await target.locations.toArray());
  const location: Location = {
    id: newId(),
    name: draft.name.trim(),
    sort: draft.sort ?? rows.length,
    createdAt: at,
    updatedAt: at,
  };
  await target.locations.add(location);
  return location;
}

export async function updateLocation(
  id: ID,
  draft: LocationDraft,
  target: PlascoDb = db,
): Promise<void> {
  const patch: Partial<Location> = { name: draft.name.trim(), updatedAt: now() };
  if (draft.sort != null) patch.sort = draft.sort;
  await target.locations.update(id, patch);
}

/** Soft delete; used for brands, categories, locations and products. */
export async function softDelete(
  table: 'brands' | 'categories' | 'locations' | 'products',
  id: ID,
  target: PlascoDb = db,
): Promise<void> {
  const at = now();
  await target[table].update(id, { deletedAt: at, updatedAt: at });
}

export async function restore(
  table: 'brands' | 'categories' | 'locations' | 'products',
  id: ID,
  target: PlascoDb = db,
): Promise<void> {
  await target[table].update(id, { deletedAt: undefined, updatedAt: now() });
}

// --------------------------------------------------------------- products

export interface ProductDraft {
  name: string;
  variant?: string;
  family?: string;
  brandId?: ID;
  categoryId?: ID;
  code?: string;
  barcodes?: string[];
  packLabel?: string;
  packSize?: number;
  buyPrice: number;
  retailPrice: number;
  wholesalePrice?: number;
  minStock?: number;
  note?: string;
  active?: boolean;
}

export const DEFAULT_PACK_LABEL = 'کارتن';

export function buildNameN(
  draft: Pick<ProductDraft, 'name' | 'variant' | 'family'>,
): string {
  return normalizeFa([draft.name, draft.variant, draft.family].filter(Boolean).join(' '));
}

export async function listProducts(target: PlascoDb = db): Promise<Product[]> {
  return byNameN(alive(await target.products.toArray()));
}

export async function listDeletedProducts(target: PlascoDb = db): Promise<Product[]> {
  const rows = await target.products.toArray();
  return byNameN(rows.filter((row) => row.deletedAt != null));
}

export async function getProduct(id: ID, target: PlascoDb = db): Promise<Product | undefined> {
  return target.products.get(id);
}

/** Code is taken from `settings.nextProductNo` inside the same transaction as the insert. */
export async function createProduct(
  draft: ProductDraft,
  target: PlascoDb = db,
): Promise<Product> {
  return target.transaction('rw', target.products, target.settings, async () => {
    const settings = await getSettings(target);
    const custom = draft.code?.trim();
    const code = custom && custom.length > 0 ? custom : formatProductCode(settings.nextProductNo);
    const at = now();
    const product: Product = {
      id: newId(),
      code,
      name: draft.name.trim(),
      variant: draft.variant?.trim() || undefined,
      family: draft.family?.trim() || undefined,
      nameN: buildNameN(draft),
      brandId: draft.brandId,
      categoryId: draft.categoryId,
      barcodes: (draft.barcodes ?? []).map((b) => b.trim()).filter(Boolean),
      packLabel: draft.packLabel?.trim() || DEFAULT_PACK_LABEL,
      packSize: Math.max(1, Math.round(draft.packSize ?? 1)),
      buyPrice: Math.max(0, Math.round(draft.buyPrice)),
      retailPrice: Math.max(0, Math.round(draft.retailPrice)),
      wholesalePrice: draft.wholesalePrice != null ? Math.max(0, Math.round(draft.wholesalePrice)) : undefined,
      minStock: draft.minStock != null ? Math.max(0, Math.round(draft.minStock)) : undefined,
      note: draft.note,
      active: draft.active ?? true,
      createdAt: at,
      updatedAt: at,
    };

    try {
      await target.products.add(product);
    } catch (error) {
      if (isConstraintError(error)) throw new DuplicateCodeError(code);
      throw error;
    }
    if (!custom) await setSettings({ nextProductNo: settings.nextProductNo + 1 }, target);
    return product;
  });
}

export async function updateProduct(
  id: ID,
  draft: Partial<ProductDraft>,
  options: { reason?: string } = {},
  target: PlascoDb = db,
): Promise<Product> {
  return target.transaction('rw', target.products, target.priceChanges, async () => {
    const existing = await target.products.get(id);
    if (!existing) throw new Error('ProductNotFound');

    const merged = { ...existing, ...draft } as Product;
    const diffs = diffPrices(existing, draft);
    const nextCode = draft.code?.trim();
    const at = now();

    const patch: Partial<Product> = {
      name: merged.name.trim(),
      variant: merged.variant?.trim() || undefined,
      family: merged.family?.trim() || undefined,
      nameN: buildNameN(merged),
      brandId: merged.brandId,
      categoryId: merged.categoryId,
      barcodes: (merged.barcodes ?? []).map((b) => b.trim()).filter(Boolean),
      packLabel: merged.packLabel?.trim() || DEFAULT_PACK_LABEL,
      packSize: Math.max(1, Math.round(merged.packSize ?? 1)),
      buyPrice: Math.max(0, Math.round(merged.buyPrice)),
      retailPrice: Math.max(0, Math.round(merged.retailPrice)),
      wholesalePrice:
        merged.wholesalePrice != null ? Math.max(0, Math.round(merged.wholesalePrice)) : undefined,
      minStock: merged.minStock != null ? Math.max(0, Math.round(merged.minStock)) : undefined,
      note: merged.note,
      active: merged.active ?? true,
      updatedAt: at,
    };
    if (nextCode) patch.code = nextCode;

    try {
      await target.products.update(id, patch);
    } catch (error) {
      if (isConstraintError(error)) throw new DuplicateCodeError(nextCode ?? existing.code);
      throw error;
    }
    await writePriceChanges(target, id, diffs, options.reason);
    return { ...existing, ...patch } as Product;
  });
}

export async function softDeleteProduct(id: ID, target: PlascoDb = db): Promise<void> {
  await target.products.update(id, { deletedAt: now(), updatedAt: now() });
}

export async function restoreProduct(id: ID, target: PlascoDb = db): Promise<void> {
  await target.products.update(id, { deletedAt: undefined, updatedAt: now() });
}

export async function countProducts(target: PlascoDb = db): Promise<number> {
  return target.products.count();
}

// ------------------------------------------------------------------ photos

export async function putPhoto(
  productId: ID,
  full: Blob,
  thumb: Blob,
  target: PlascoDb = db,
): Promise<void> {
  await target.photos.put({ productId, full, thumb, updatedAt: now() });
}

export async function getPhoto(productId: ID, target: PlascoDb = db): Promise<Photo | undefined> {
  return target.photos.get(productId);
}

export async function deletePhoto(productId: ID, target: PlascoDb = db): Promise<void> {
  await target.photos.delete(productId);
}

// ------------------------------------------------------------ stock levels

export async function listStockLevels(target: PlascoDb = db): Promise<StockLevel[]> {
  return target.stockLevels.toArray();
}

/**
 * Shelf position is level metadata, not stock: it never touches `qty`
 * (quantity moves only through applyMovement / rebuildStockLevels).
 */
export async function setBin(
  productId: ID,
  locationId: ID,
  bin: string | undefined,
  target: PlascoDb = db,
): Promise<void> {
  const key: [ID, ID] = [productId, locationId];
  const existing = await target.stockLevels.get(key);
  if (!existing) {
    if (!bin) return;
    await target.stockLevels.put({ productId, locationId, qty: 0, bin, updatedAt: now() });
    return;
  }
  await target.stockLevels.update(key, { bin: bin || undefined, updatedAt: now() });
}

// --------------------------------------------------------------- movements

export interface MovementFilter {
  productId?: ID;
  locationId?: ID;
  types?: readonly Movement['type'][];
  from?: number;
  to?: number;
  limit?: number;
}

export async function listMovements(
  filter: MovementFilter = {},
  target: PlascoDb = db,
): Promise<Movement[]> {
  let rows: Movement[];
  if (filter.productId) {
    rows = await target.movements.where('productId').equals(filter.productId).toArray();
  } else if (filter.locationId) {
    rows = await target.movements.where('locationId').equals(filter.locationId).toArray();
  } else {
    rows = await target.movements.orderBy('at').reverse().toArray();
  }
  let filtered = rows;
  if (filter.locationId && filter.productId) {
    filtered = filtered.filter((m) => m.locationId === filter.locationId);
  }
  if (filter.types && filter.types.length > 0) {
    filtered = filtered.filter((m) => filter.types?.includes(m.type));
  }
  if (filter.from != null) filtered = filtered.filter((m) => m.at >= filter.from!);
  if (filter.to != null) filtered = filtered.filter((m) => m.at <= filter.to!);
  filtered.sort((a, b) => b.at - a.at);
  return filter.limit ? filtered.slice(0, filter.limit) : filtered;
}
