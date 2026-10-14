import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '@/app/version';
import { readBackup, restoreBackup } from './backup';
import { PlascoDb } from './dexie';

/**
 * The Android app writes the same backup ZIP as this PWA — `data.json` plus
 * `photos/<productId>-thumb.jpg` / `-full.jpg` — and a shop that counts on one
 * device must be able to open that file on the other. `fixtures/android-backup.zip`
 * is a real file produced by the Android app (1.2.0) on an emulator, not a
 * hand-written fixture: 2 products (one soft-deleted), one photo the phone camera
 * produced (real JPEG bytes, thumb and full), 11 movements covering all ten
 * movement types (a transfer pair sharing `refId`, an undo), a stock take with
 * items, a price change, four locations and the settings row.
 *
 * To regenerate it: in the Android app go to «بیشتر ← بکاپ و بازیابی ← بکاپ گرفتن»
 * and copy the saved ZIP here unchanged.
 */
// import.meta.url is not a file URL under vitest's jsdom transform, so resolve from the runner cwd.
const fixture = resolve(process.cwd(), 'src/db/fixtures/android-backup.zip');
const file = new Blob([new Uint8Array(readFileSync(fixture))], { type: 'application/zip' });

const JPEG_SOI = [0xff, 0xd8, 0xff];

let db: PlascoDb;
let dbIndex = 0;

beforeEach(async () => {
  dbIndex += 1;
  db = new PlascoDb(`test-android-backup-${dbIndex}`);
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

describe('a backup written by the Android app', () => {
  it('passes the same validation as a file written here', async () => {
    const { data } = await readBackup(file);

    expect(data.schemaVersion).toBe(SCHEMA_VERSION);
    expect(data.tables.products).toHaveLength(2);
    expect(data.tables.movements).toHaveLength(11);
    expect(data.tables.locations).toHaveLength(4);
    expect(data.tables.stockTakes).toHaveLength(1);
    expect(data.tables.stockTakeItems).toHaveLength(2);
    expect(data.tables.priceChanges).toHaveLength(1);

    const product = data.tables.products.find((row) => row.code === 'P-00001');
    // Persian names and digit characters survive the phone's JSON round trip.
    expect(product?.name).toBe('ظرف غذا قرمز ۱۰ لیتری');
    expect(product?.barcodes).toEqual(['6260000000012', '111']);
    expect(product?.packSize).toBe(12);
    expect(data.tables.products.find((row) => row.id === 'prod-2')?.deletedAt).toBeTypeOf('number');
    expect(new Set(data.tables.movements.map((row) => row.type)).size).toBe(10);
  });

  it('carries the product photo in the same two entries as this app', async () => {
    const { photos } = await readBackup(file);

    // The photo table is not in data.json — it travels as ZIP members.
    expect(photos.size).toBe(1);
    const photo = photos.get('prod-1');
    expect(photo?.thumb?.byteLength ?? 0).toBeGreaterThan(0);
    expect(photo?.full?.byteLength ?? 0).toBeGreaterThan(0);
    // The phone resized and re-encoded them with the same rules as here.
    expect([...(photo?.thumb ?? []).slice(0, 3)]).toEqual(JPEG_SOI);
    expect([...(photo?.full ?? []).slice(0, 3)]).toEqual(JPEG_SOI);
    expect(photo?.full?.byteLength ?? 0).toBeGreaterThan(photo?.thumb?.byteLength ?? 0);
    // No stray entry for a product that has no photo.
    expect(photos.has('prod-2')).toBe(false);
  });

  it('restores into this device without losing the ledger', async () => {
    const result = await restoreBackup(file, 'replace', db);
    expect(result.products).toBe(2);
    expect(result.movements).toBe(11);
    expect(result.renumbered).toBe(0);

    const movements = await db.movements.toArray();
    const ledger = movements.reduce((total, row) => total + row.qty, 0);
    expect((await db.stockLevels.get(['prod-1', 'loc-shop']))?.qty).toBe(22);
    expect((await db.stockLevels.get(['prod-1', 'loc-shop']))?.bin).toBe('قفسه ۳');
    expect((await db.stockLevels.get(['prod-1', 'loc-warehouse']))?.qty).toBe(5);
    expect((await db.stockLevels.toArray()).reduce((total, row) => total + row.qty, 0)).toBe(ledger);
    expect(movements.find((row) => row.refId === 'tr-1')?.locationId).toBe('loc-shop');

    const settings = new Map((await db.settings.toArray()).map((row) => [row.key, row.value]));
    expect(settings.get('shopName')).toBe('فروشگاه آزمون');
    expect(settings.get('currencyLabel')).toBe('تومان');
    expect(settings.get('theme')).toBe('dark');
    expect(settings.get('nextProductNo')).toBe(9);
    // The file keeps the Android device's own name only as data; the restoring
    // device keeps its identity (the row must be overwritten by ours).
    await db.settings.put({ key: 'deviceName', value: 'این دستگاه' });
    await restoreBackup(file, 'replace', db);
    expect((await db.settings.get('deviceName'))?.value).toBe('این دستگاه');
  });

  /**
   * fake-indexeddb gives a stored Blob back as `{}`, so the bytes themselves can
   * only be read in a browser (see backup.test.ts). What this asserts is that the
   * phone's photo reaches the photos table at all, stamped with the file's time.
   */
  it('lands the photo row in the photos table', async () => {
    const { data } = await readBackup(file);
    await restoreBackup(file, 'replace', db);

    expect(await db.photos.count()).toBe(1);
    const photo = await db.photos.get('prod-1');
    expect(photo?.productId).toBe('prod-1');
    expect(photo?.updatedAt).toBe(data.exportedAt);
  });
});
