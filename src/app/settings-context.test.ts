import { describe, expect, it } from 'vitest';
import { fallbackPinHash, hashPin, verifyPin } from './settings-context';

describe('PIN verification', () => {
  it('accepts a fallback hash saved before the page moved to a secure context', async () => {
    const legacy = fallbackPinHash('1234');
    expect(await verifyPin('1234', legacy)).toBe(true);
    expect(await verifyPin('4321', legacy)).toBe(false);
  });

  it('accepts the hash produced by the current environment', async () => {
    const current = await hashPin('1234');
    expect(await verifyPin('1234', current)).toBe(true);
    expect(await verifyPin('12345', current)).toBe(false);
  });

  it('treats a missing stored hash as locked', async () => {
    expect(await verifyPin('', undefined)).toBe(false);
    expect(await verifyPin('1234', '')).toBe(false);
  });
});
