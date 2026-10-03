/**
 * Read-only status for the «وضعیت اپ» page: service worker, offline cache and
 * storage estimate. Every reader degrades to a plain state instead of throwing —
 * a status screen that itself fails is worse than one that says it cannot tell.
 */

export type WorkerState = 'preview' | 'unsupported' | 'none' | 'installing' | 'waiting' | 'active';

export interface ServiceWorkerStatus {
  state: WorkerState;
  /** True when this very page is served by the worker, so offline works now. */
  controlling: boolean;
  scope?: string;
}

interface RegistrationLike {
  installing?: unknown;
  waiting?: unknown;
  active?: unknown;
  scope?: string;
}

interface ServiceWorkerContainerLike {
  controller?: unknown;
  getRegistration?: () => Promise<RegistrationLike | undefined>;
}

function workerContainer(): ServiceWorkerContainerLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as { serviceWorker?: ServiceWorkerContainerLike }).serviceWorker;
}

export async function readServiceWorkerStatus(): Promise<ServiceWorkerStatus> {
  const preview = (globalThis as { __PLASCO_PREVIEW__?: boolean }).__PLASCO_PREVIEW__ === true;
  if (preview) return { state: 'preview', controlling: false };

  const container = workerContainer();
  if (!container?.getRegistration) return { state: 'unsupported', controlling: false };

  const controlling = container.controller != null;
  try {
    const registration = await container.getRegistration();
    if (!registration) return { state: 'none', controlling };
    const scope = registration.scope;
    if (registration.installing) return { state: 'installing', controlling, scope };
    if (registration.waiting) return { state: 'waiting', controlling, scope };
    if (registration.active) return { state: 'active', controlling, scope };
    return { state: 'none', controlling };
  } catch {
    return { state: 'unsupported', controlling: false };
  }
}

export interface CacheStatus {
  /** Cache Storage buckets (the worker keeps one). */
  buckets: number;
  /** Requests cached across all buckets - the offline file count. */
  entries: number;
  names: readonly string[];
}

interface CacheLike {
  keys: () => Promise<readonly unknown[]>;
}

interface CacheStorageLike {
  keys: () => Promise<readonly string[]>;
  open: (name: string) => Promise<CacheLike>;
}

/** Read through the global each time, so the page sees the live buckets. */
function cacheStorage(): CacheStorageLike | undefined {
  if (typeof caches === 'undefined') return undefined;
  return { keys: () => caches.keys(), open: (name) => caches.open(name) };
}

export async function readCacheStatus(): Promise<CacheStatus> {
  const store = cacheStorage();
  if (!store?.keys) return { buckets: 0, entries: 0, names: [] };
  try {
    const names = await store.keys();
    let entries = 0;
    for (const name of names) {
      const cache = await store.open(name);
      entries += (await cache.keys()).length;
    }
    return { buckets: names.length, entries, names };
  } catch {
    return { buckets: 0, entries: 0, names: [] };
  }
}

export interface StorageUsage {
  used: number;
  quota: number;
}

interface StorageManagerLike {
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
}

/** `null` when the browser cannot tell (older Safari) - the page shows a dash. */
export async function readStorageUsage(): Promise<StorageUsage | null> {
  if (typeof navigator === 'undefined') return null;
  const storage = (navigator as { storage?: StorageManagerLike }).storage;
  if (!storage?.estimate) return null;
  try {
    const estimate = await storage.estimate();
    return { used: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
  } catch {
    return null;
  }
}

/** One rule for "the shop has not backed up in a while" (dashboard + status page). */
export const BACKUP_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export function isBackupStale(lastBackupAt: number | undefined, now = Date.now()): boolean {
  return !lastBackupAt || now - lastBackupAt > BACKUP_STALE_MS;
}
