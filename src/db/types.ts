// Data model - AGENTS.md section 5. Types only: no Dexie, no React.
export type ID = string;

export interface Base {
  id: ID;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface Brand extends Base {
  name: string;
  nameN: string;
  phone?: string;
  repName?: string;
  note?: string;
}

export interface Category extends Base {
  name: string;
  nameN: string;
  sort: number;
}

export interface Location extends Base {
  name: string;
  sort: number;
}

export interface Product extends Base {
  code: string;
  name: string;
  variant?: string;
  family?: string;
  nameN: string;
  brandId?: ID;
  categoryId?: ID;
  barcodes: string[];
  packLabel: string;
  packSize: number;
  buyPrice: number;
  retailPrice: number;
  wholesalePrice?: number;
  minStock?: number;
  note?: string;
  active: boolean;
}

export interface Photo {
  productId: ID;
  thumb: Blob;
  full: Blob;
  updatedAt: number;
}

export interface StockLevel {
  productId: ID;
  locationId: ID;
  qty: number;
  bin?: string;
  updatedAt: number;
}

export type MovementType =
  | 'initial'
  | 'receive'
  | 'sale'
  | 'return_in'
  | 'return_out'
  | 'adjust'
  | 'count'
  | 'transfer_out'
  | 'transfer_in'
  | 'damage';

export interface Movement extends Base {
  productId: ID;
  locationId: ID;
  type: MovementType;
  qty: number;
  unitCost?: number;
  unitPrice?: number;
  refId?: ID;
  undoOf?: ID;
  note?: string;
  at: number;
}

export interface PriceChange {
  id: ID;
  productId: ID;
  field: 'buy' | 'retail' | 'wholesale';
  oldValue: number;
  newValue: number;
  at: number;
  reason?: string;
}

export interface StockTake extends Base {
  locationId: ID;
  status: 'open' | 'applied' | 'cancelled';
  appliedAt?: number;
  note?: string;
}

export interface StockTakeItem {
  id: ID;
  stockTakeId: ID;
  productId: ID;
  counted: number;
  systemQtyAtCount: number;
  at: number;
}

/**
 * A column mapping the shop reused. Keyed by the file's header row, so the same
 * company price list opens with its mapping (and mode) already in place.
 */
export interface SavedImportMapping {
  /** Normalized, order-insensitive header signature - the identity of the mapping. */
  signature: string;
  headers: string[];
  /** Import field -> header name (the shape of the import feature's ColumnMap). */
  map: Record<string, string>;
  mode: 'full' | 'prices';
  label?: string;
  usedAt: number;
}

/** One committed import file, kept so the whole batch can be undone in one go. */
export interface ImportBatch extends Base {
  fileName?: string;
  created: number;
  updated: number;
  movements: number;
  undoneAt?: number;
  /** Set when only part of the batch could be reverted; `partialRows` then wait. */
  partialUndoAt?: number;
  partialRows?: number;
}

/** Field values an import wrote over an existing product (restored on undo). */
export interface ImportedProductFields {
  name?: string;
  brandId?: ID;
  code?: string;
  barcodes?: string[];
  packLabel?: string;
  packSize?: number;
  buyPrice?: number;
  retailPrice?: number;
  wholesalePrice?: number;
}

/** Journal of what one import did, entry by entry. Cleared after a successful undo. */
export type ImportEntry =
  | { id: ID; batchId: ID; kind: 'product-created'; productId: ID }
  | { id: ID; batchId: ID; kind: 'product-updated'; productId: ID; before: ImportedProductFields }
  | { id: ID; batchId: ID; kind: 'movement'; movementId: ID; productId: ID }
  | { id: ID; batchId: ID; kind: 'brand-created'; brandId: ID };

export interface Setting {
  key: string;
  value: unknown;
}
export type StockState = 'ok' | 'low' | 'out';

export interface Settings {
  shopName: string;
  currencyLabel: string;
  textScale: number;
  theme: 'system' | 'light' | 'dark';
  nextProductNo: number;
  lastBackupAt?: number;
  /** When the app first asked the browser for persistent storage. */
  persistAskedAt?: number;
  /** Remembered import column mappings (newest first). */
  importMappings?: SavedImportMapping[];
  costLockPinHash?: string;
  costLockEnabled: boolean;
  deviceName: string;
  devicePrefix: string;
}
