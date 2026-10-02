import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlascoDb } from '@/db/dexie';
import { getSettings } from '@/db/repos';
import { askPersistOnFirstRun, persistSupported, readPersistState, requestPersist } from './persistStorage';

let db: PlascoDb;
let dbIndex = 0;

function stubStorage(storage: unknown): void {
  Object.defineProperty(window.navigator, 'storage', { value: storage, configurable: true });
}

beforeEach(async () => {
  dbIndex += 1;
  db = new PlascoDb(`test-persist-${dbIndex}`);
  await db.open();
});

afterEach(async () => {
  await db.delete();
  delete (window.navigator as { storage?: unknown }).storage;
  vi.restoreAllMocks();
});

describe('persistStorage', () => {
  it('reports unsupported when the browser has no StorageManager', async () => {
    expect(persistSupported()).toBe(false);
    expect(await readPersistState()).toBe('unsupported');
    expect(await requestPersist()).toBe('unsupported');
  });

  it('reads the live answer instead of assuming the request worked', async () => {
    const persist = vi.fn(async () => true);
    stubStorage({ persist, persisted: async () => false });
    expect(await readPersistState()).toBe('best-effort');

    // persist() resolving true is not proof: the state is read back from the API.
    expect(await requestPersist()).toBe('best-effort');

    stubStorage({ persist, persisted: async () => true });
    expect(await readPersistState()).toBe('granted');
  });

  it('survives a browser that rejects the request', async () => {
    stubStorage({
      persist: async () => {
        throw new Error('not allowed');
      },
      persisted: async () => false,
    });
    expect(await requestPersist()).toBe('best-effort');
  });

  it('asks on the first run, records it, and never asks again', async () => {
    const persist = vi.fn(async () => true);
    stubStorage({ persist, persisted: async () => false });

    expect(await askPersistOnFirstRun(db)).toBe('best-effort');
    expect(persist).toHaveBeenCalledTimes(1);
    expect((await getSettings(db)).persistAskedAt).toBeTruthy();

    persist.mockClear();
    expect(await askPersistOnFirstRun(db)).toBeNull();
    expect(persist).not.toHaveBeenCalled();
  });

  it('records the attempt even when the browser cannot persist at all', async () => {
    // Nothing to ask for, but the app must not retry on every start.
    expect(await askPersistOnFirstRun(db)).toBe('unsupported');
    expect((await getSettings(db)).persistAskedAt).toBeTruthy();
    expect(await askPersistOnFirstRun(db)).toBeNull();
  });
});
