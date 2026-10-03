import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyWaitingUpdate, hasWaitingUpdate, setWaitingUpdate } from './updateStore';

afterEach(() => {
  setWaitingUpdate(null);
});

describe('updateStore', () => {
  it('reports nothing to apply until PwaUpdate registers a handler', () => {
    expect(hasWaitingUpdate()).toBe(false);
    expect(applyWaitingUpdate()).toBe(false);
  });

  it('applies the waiting update exactly once', () => {
    const apply = vi.fn(async () => undefined);
    setWaitingUpdate(apply);

    expect(hasWaitingUpdate()).toBe(true);
    expect(applyWaitingUpdate()).toBe(true);
    expect(apply).toHaveBeenCalledTimes(1);

    // A second tap must not reload the page again.
    expect(applyWaitingUpdate()).toBe(false);
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
