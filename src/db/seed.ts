import { db, type PlascoDb } from './dexie';
import { createProduct, createBrand, createCategory, type ProductDraft } from './repos';
import { applyMovement } from './movements';
import type { ID } from './types';

const WORDS = [
  'ظرف',
  'سطل',
  'سبد',
  'بشقاب',
  'لیوان',
  'قاشق',
  'چنگال',
  'درب',
  'کاسه',
  'تشت',
  'زیرلیوانی',
  'جاادویه',
  'جالباسی',
  'سبدی رخت',
  'قابلمه',
];
const SIZES = ['کوچک', 'متوسط', 'بزرگ', 'خانوادگی'];
const COLORS = ['قرمز', 'آبی', 'سبز', 'شیری', 'دودی', 'صورتی'];

export interface SeedOptions {
  count?: number;
  brands?: number;
  /** Only seeds when the catalogue is empty, unless false. */
  onlyWhenEmpty?: boolean;
}

/** Dev helper (Step 3): 5,000 synthetic products with realistic stock. */
export async function seedSynthetic(
  options: SeedOptions = {},
  target: PlascoDb = db,
): Promise<{ products: number }> {
  const { count = 5000, brands = 12, onlyWhenEmpty = true } = options;
  if (onlyWhenEmpty && (await target.products.count()) > 0) return { products: 0 };

  const locations = await target.locations.toArray();
  const locationIds: ID[] = locations.map((l) => l.id);
  const brandIds: ID[] = [];
  for (let b = 0; b < brands; b++) {
    const brand = await createBrand({ name: `شرکت نمونه ${b + 1}` }, target);
    brandIds.push(brand.id);
  }
  const categoryIds: ID[] = [];
  for (const name of ['ظروف', 'سطل و سبد', 'لوازم آشپزخانه', 'دکوری']) {
    const category = await createCategory({ name }, target);
    categoryIds.push(category.id);
  }

  const pick = <T>(arr: readonly T[], i: number): T => arr[i % arr.length] as T;

  for (let i = 0; i < count; i++) {
    const buyPrice = 5_000 + (i % 90) * 2_000;
    const packSize = [1, 6, 12, 24, 48][i % 5] ?? 1;
    const draft: ProductDraft = {
      name: `${pick(WORDS, i)} ${pick(SIZES, i * 7)} ${pick(COLORS, i * 3)}`,
      variant: `${pick(COLORS, i * 3)} - ${(i % 12) + 1} لیتر`,
      family: pick(WORDS, i),
      brandId: pick(brandIds, i * 5),
      categoryId: pick(categoryIds, i * 3),
      barcodes: i % 3 === 0 ? [`62${String(1_000_000_000_000 + i)}`] : [],
      packLabel: packSize === 1 ? 'دست' : 'کارتن',
      packSize,
      buyPrice,
      retailPrice: Math.round((buyPrice * 1.35) / 1000) * 1000,
      wholesalePrice: Math.round((buyPrice * 1.15) / 1000) * 1000,
      minStock: packSize * 2,
    };
    const product = await createProduct(draft, target);
    if (locationIds.length > 0 && i % 4 !== 3) {
      const locationId = pick(locationIds, i);
      await applyMovement(
        {
          productId: product.id,
          locationId,
          type: 'initial',
          qty: ((i * 37) % 200) + 1,
          unitCost: buyPrice,
        },
        target,
      );
    }
  }
  return { products: count };
}

/** Wipes every table. Used by tests, "reset data" and the restore flow. */
export async function wipeAll(target: PlascoDb = db): Promise<void> {
  await target.transaction(
    'rw',
    [
      target.brands,
      target.categories,
      target.locations,
      target.products,
      target.photos,
      target.stockLevels,
      target.movements,
      target.priceChanges,
      target.stockTakes,
      target.stockTakeItems,
      target.settings,
    ],
    async () => {
      await Promise.all([
        target.brands.clear(),
        target.categories.clear(),
        target.locations.clear(),
        target.products.clear(),
        target.photos.clear(),
        target.stockLevels.clear(),
        target.movements.clear(),
        target.priceChanges.clear(),
        target.stockTakes.clear(),
        target.stockTakeItems.clear(),
        target.settings.clear(),
      ]);
    },
  );
}
