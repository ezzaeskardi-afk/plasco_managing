import { db as defaultDb, type PlascoDb } from '@/db/dexie';
import { setSettings } from '@/db/repos';

/**
 * Persistent storage: without it the browser may evict the shop's IndexedDB
 * under disk pressure (or after a long quiet period on iOS). Requesting it once
 * on the first run is silent in Chrome; Safari decides by itself.
 */

export type PersistState = 'granted' | 'best-effort' | 'unsupported';

interface StorageManagerLike {
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
}

function storageManager(): StorageManagerLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return navigator.storage as StorageManagerLike | undefined;
}

export function persistSupported(): boolean {
  return typeof storageManager()?.persisted === 'function';
}

export async function readPersistState(): Promise<PersistState> {
  const storage = storageManager();
  if (!storage?.persisted) return 'unsupported';
  try {
    return (await storage.persisted()) ? 'granted' : 'best-effort';
  } catch {
    return 'unsupported';
  }
}

/** Ask the browser to keep the data; the answer is read back from the API, not assumed. */
export async function requestPersist(): Promise<PersistState> {
  const storage = storageManager();
  if (!storage?.persist) return 'unsupported';
  try {
    await storage.persist();
  } catch {
    // Some browsers reject instead of resolving false; the state read below is the truth.
  }
  return readPersistState();
}

/**
 * First run of the app only: ask once and record that we did, so a browser that
 * would prompt on every start (Firefox) asks at most once. The flag is read from
 * the table directly — a live query would hand out the defaults before the row
 * is loaded and ask again on every boot.
 */
export async function askPersistOnFirstRun(target: PlascoDb = defaultDb): Promise<PersistState | null> {
  const asked = await target.settings.get('persistAskedAt');
  if (asked) return null;
  const state = await requestPersist();
  await setSettings({ persistAskedAt: Date.now() }, target);
  return state;
}
