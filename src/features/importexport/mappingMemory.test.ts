import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PlascoDb } from '@/db/dexie';
import { findSavedMapping, rememberMapping, toColumnMap } from './mappingMemory';

let db: PlascoDb;
let dbIndex = 0;

beforeEach(async () => {
  dbIndex += 1;
  db = new PlascoDb(`test-mappings-${dbIndex}`);
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

const SHARED_HEADERS = ['کد کالا', 'شرح کالا', 'فی خرید', 'فی خرده'];

describe('mapping memory', () => {
  it('finds a mapping again from the same headers, whatever the column order', async () => {
    await rememberMapping(
      {
        headers: SHARED_HEADERS,
        map: { code: 'کد کالا', name: 'شرح کالا', buy: 'فی خرید', retail: 'فی خرده' },
        mode: 'prices',
        label: 'sharikat-a.xlsx',
      },
      db,
    );

    const found = await findSavedMapping(['فی خرده', 'شرح کالا', 'فی خرید', 'کد کالا'], db);
    expect(found?.mode).toBe('prices');
    expect(found?.label).toBe('sharikat-a.xlsx');
    expect(toColumnMap(found?.map ?? {})).toEqual({
      code: 'کد کالا',
      name: 'شرح کالا',
      buy: 'فی خرید',
      retail: 'فی خرده',
    });
  });

  it('refreshes a known header row instead of piling up copies', async () => {
    const input = { headers: SHARED_HEADERS, map: { name: 'شرح کالا' }, mode: 'full' as const, label: 'first.xlsx' };
    await rememberMapping(input, db);
    await rememberMapping({ ...input, map: { name: 'شرح کالا', retail: 'فی خرده' }, mode: 'prices', label: 'second.xlsx' }, db);

    const settings = await db.settings.get('importMappings');
    expect(settings?.value).toHaveLength(1);
    expect((await findSavedMapping(SHARED_HEADERS, db))?.label).toBe('second.xlsx');
    expect(toColumnMap((await findSavedMapping(SHARED_HEADERS, db))?.map ?? {})).toEqual({
      name: 'شرح کالا',
      retail: 'فی خرده',
    });
  });

  it('keeps only the newest 20 mappings', async () => {
    for (let i = 1; i <= 22; i += 1) {
      await rememberMapping(
        { headers: [`نام ${i}`, 'قیمت'], map: { name: `نام ${i}`, retail: 'قیمت' }, mode: 'prices' },
        db,
      );
    }

    const settings = await db.settings.get('importMappings');
    expect(settings?.value).toHaveLength(20);
    expect(await findSavedMapping(['نام 1', 'قیمت'], db)).toBeUndefined();
    expect(await findSavedMapping(['نام 22', 'قیمت'], db)).toBeTruthy();
  });

  it('returns nothing for an unknown header row', async () => {
    expect(await findSavedMapping(['هیچ', 'چیز'], db)).toBeUndefined();
  });
});
