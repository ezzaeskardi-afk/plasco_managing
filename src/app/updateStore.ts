/**
 * Hand-off for "a new version is waiting": `PwaUpdate` registers the way to
 * apply it, the «وضعیت اپ» page offers the same action as the toast. Kept out of
 * the component file so neither module has to export non-components.
 */

let applyWaiting: (() => Promise<void>) | null = null;

export function setWaitingUpdate(apply: (() => Promise<void>) | null): void {
  applyWaiting = apply;
}

export function hasWaitingUpdate(): boolean {
  return applyWaiting != null;
}

/** `false` when nothing is waiting — the caller then just refreshes its rows. */
export function applyWaitingUpdate(): boolean {
  const run = applyWaiting;
  if (!run) return false;
  // One shot: applying twice would reload the page twice.
  applyWaiting = null;
  void run();
  return true;
}
