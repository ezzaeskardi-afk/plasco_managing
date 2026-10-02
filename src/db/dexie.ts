import Dexie, { type EntityTable, type Table } from 'dexie';
import type {
  Brand,
  Category,
  ID,
  ImportBatch,
  ImportEntry,
  Location,
  Movement,
  Photo,
  PriceChange,
  Product,
  Setting,
  Settings,
  StockLevel,
  StockTake,
  StockTakeItem,
} from './types';

export const DEFAULT_SETTINGS: Settings = {
  shopName: 'پلاسکو منیجینگ',
  currencyLabel: 'تومان',
  textScale: 1,
  theme: 'system',
  nextProductNo: 1,
  costLockEnabled: false,
  deviceName: 'دستگاه اصلی',
  devicePrefix: 'DEV1',
};

export const DEFAULT_LOCATIONS: ReadonlyArray<Pick<Location, 'id' | 'name' | 'sort'>> = [
  { id: 'loc-shop', name: 'مغازه', sort: 0 },
  { id: 'loc-warehouse', name: 'انبار', sort: 1 },
  { id: 'loc-basement', name: 'زیرزمین', sort: 2 },
];

export class PlascoDb extends Dexie {
  brands!: Table<Brand, ID>;
  categories!: Table<Category, ID>;
  locations!: Table<Location, ID>;
  products!: Table<Product, ID>;
  photos!: Table<Photo, string>;
  stockLevels!: Table<StockLevel, [ID, ID]>;
  movements!: Table<Movement, ID>;
  priceChanges!: Table<PriceChange, ID>;
  stockTakes!: Table<StockTake, ID>;
  stockTakeItems!: Table<StockTakeItem, ID>;
  imports!: Table<ImportBatch, ID>;
  importEntries!: Table<ImportEntry, ID>;
  settings!: EntityTable<Setting, 'key'>;

  constructor(name = 'plasco-managing') {
    super(name);

    // Never edit an existing version block: schema changes get a new version (AGENTS.md rule 9).
    this.version(1).stores({
      brands: 'id, nameN, updatedAt',
      categories: 'id, nameN, sort',
      locations: 'id, sort',
      products: 'id, &code, nameN, brandId, categoryId, family, *barcodes, updatedAt',
      photos: 'productId',
      stockLevels: '[productId+locationId], productId, locationId',
      movements: 'id, productId, locationId, type, at, refId, [productId+at]',
      priceChanges: 'id, productId, at',
      stockTakes: 'id, locationId, status, updatedAt',
      stockTakeItems: 'id, stockTakeId, [stockTakeId+productId]',
      settings: 'key',
    });

    // v2 adds the import journal (`imports` / `importEntries`) so an import can be
    // undone as one batch. The full schema is repeated here on purpose: a version
    // block must describe its own stores completely.
    this.version(2).stores({
      brands: 'id, nameN, updatedAt',
      categories: 'id, nameN, sort',
      locations: 'id, sort',
      products: 'id, &code, nameN, brandId, categoryId, family, *barcodes, updatedAt',
      photos: 'productId',
      stockLevels: '[productId+locationId], productId, locationId',
      movements: 'id, productId, locationId, type, at, refId, [productId+at]',
      priceChanges: 'id, productId, at',
      stockTakes: 'id, locationId, status, updatedAt',
      stockTakeItems: 'id, stockTakeId, [stockTakeId+productId]',
      imports: 'id, createdAt, undoneAt',
      importEntries: 'id, batchId',
      settings: 'key',
    });

    this.on('populate', () => {
      const now = Date.now();
      return this.transaction('rw', this.locations, this.settings, async () => {
        await this.locations.bulkAdd(
          DEFAULT_LOCATIONS.map((l) => ({ ...l, createdAt: now, updatedAt: now })),
        );
        await this.settings.bulkAdd(
          Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value })),
        );
      });
    });
  }
}

export const db = new PlascoDb();

/** Idempotent defaults: safe to call after a restore or on every boot. */
export async function ensureDefaults(target: PlascoDb = db): Promise<void> {
  const now = Date.now();
  const locationCount = await target.locations.count();
  if (locationCount === 0) {
    await target.locations.bulkPut(
      DEFAULT_LOCATIONS.map((l) => ({ ...l, createdAt: now, updatedAt: now })),
    );
  }
  const keys = new Set((await target.settings.toArray()).map((s) => s.key));
  const missing = Object.entries(DEFAULT_SETTINGS).filter(([key]) => !keys.has(key));
  if (missing.length > 0) {
    await target.settings.bulkPut(missing.map(([key, value]) => ({ key, value })));
  }
}
