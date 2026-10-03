import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BACKUP_STALE_MS,
  isBackupStale,
  readCacheStatus,
  readServiceWorkerStatus,
  readStorageUsage,
} from './appStatus';

interface WindowFlags {
  __PLASCO_PREVIEW__?: boolean;
}

function stubServiceWorker(container: unknown): void {
  Object.defineProperty(window.navigator, 'serviceWorker', { value: container, configurable: true });
}

function stubCaches(store: unknown): void {
  Object.defineProperty(globalThis, 'caches', { value: store, configurable: true });
}

function stubStorage(manager: unknown): void {
  Object.defineProperty(window.navigator, 'storage', { value: manager, configurable: true });
}

afterEach(() => {
  delete (window.navigator as { serviceWorker?: unknown }).serviceWorker;
  delete (window.navigator as { storage?: unknown }).storage;
  delete (globalThis as { caches?: unknown }).caches;
  delete (globalThis as WindowFlags).__PLASCO_PREVIEW__;
  vi.restoreAllMocks();
});

describe('appStatus', () => {
  it('says unsupported when the browser has no service worker API', async () => {
    expect(await readServiceWorkerStatus()).toEqual({ state: 'unsupported', controlling: false });
  });

  it('says preview for the single-file build, where no worker exists', async () => {
    (globalThis as WindowFlags).__PLASCO_PREVIEW__ = true;
    stubServiceWorker({ controller: {}, getRegistration: async () => undefined });
    expect(await readServiceWorkerStatus()).toEqual({ state: 'preview', controlling: false });
  });

  it('distinguishes active, waiting-for-update and not-registered', async () => {
    stubServiceWorker({ controller: {}, getRegistration: async () => undefined });
    expect(await readServiceWorkerStatus()).toEqual({ state: 'none', controlling: true });

    stubServiceWorker({
      controller: {},
      getRegistration: async () => ({ active: {}, scope: 'http://localhost/' }),
    });
    expect(await readServiceWorkerStatus()).toEqual({
      state: 'active',
      controlling: true,
      scope: 'http://localhost/',
    });

    // A waiting worker means an update is ready but not applied (registerType: prompt).
    stubServiceWorker({
      controller: {},
      getRegistration: async () => ({ active: {}, waiting: {}, scope: 'http://localhost/' }),
    });
    expect((await readServiceWorkerStatus()).state).toBe('waiting');
  });

  it('survives a browser that rejects the registration lookup', async () => {
    stubServiceWorker({
      getRegistration: async () => {
        throw new Error('SecurityError');
      },
    });
    expect((await readServiceWorkerStatus()).state).toBe('unsupported');
  });

  it('counts the cached files across buckets', async () => {
    stubCaches({
      keys: async () => ['workbox-precache-v2', 'extra'],
      open: async (name: string) => ({
        keys: async () => (name === 'extra' ? [1, 2] : [1, 2, 3]),
      }),
    });
    expect(await readCacheStatus()).toEqual({
      buckets: 2,
      entries: 5,
      names: ['workbox-precache-v2', 'extra'],
    });
  });

  it('reports an empty cache instead of throwing when Cache Storage is blocked', async () => {
    expect(await readCacheStatus()).toEqual({ buckets: 0, entries: 0, names: [] });
    stubCaches({
      keys: async () => {
        throw new Error('blocked');
      },
    });
    expect(await readCacheStatus()).toEqual({ buckets: 0, entries: 0, names: [] });
  });

  it('reads the storage estimate and tolerates browsers without one', async () => {
    expect(await readStorageUsage()).toBeNull();

    stubStorage({ estimate: async () => ({ usage: 1024, quota: 4096 }) });
    expect(await readStorageUsage()).toEqual({ used: 1024, quota: 4096 });

    stubStorage({
      estimate: async () => {
        throw new Error('nope');
      },
    });
    expect(await readStorageUsage()).toBeNull();
  });

  it('calls a backup stale after a week, or when there never was one', () => {
    const now = 1_700_000_000_000;
    expect(isBackupStale(undefined, now)).toBe(true);
    expect(isBackupStale(now - BACKUP_STALE_MS + 1_000, now)).toBe(false);
    expect(isBackupStale(now - BACKUP_STALE_MS - 1_000, now)).toBe(true);
  });
});
