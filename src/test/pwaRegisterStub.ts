/**
 * Test-only stand-in for `virtual:pwa-register` (see `vitest.config.ts`): the
 * service-worker plugin is not part of the vitest pipeline, but `PwaUpdate`
 * imports the virtual module. Tests replace it with `vi.mock`.
 */
export function registerSW(): (reloadPage?: boolean) => Promise<void> {
  return () => Promise.resolve();
}
