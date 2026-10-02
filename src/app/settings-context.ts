import { createContext, useContext } from 'react';
import type { Settings } from '@/db/types';

export interface SettingsContextValue {
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<void>;
  /** False only when the cost lock is on and the session is locked. */
  costVisible: boolean;
  unlock: (pin: string) => Promise<boolean>;
  lock: () => void;
  setPin: (pin: string) => Promise<void>;
  disableCostLock: () => Promise<void>;
}

export const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('SettingsProvider is missing');
  return value;
}

/**
 * UI privacy only - a casual PIN, not cryptographic security (Step 8).
 * `crypto.subtle` is unavailable outside secure contexts, and the app may be
 * opened over plain HTTP on the shop network, so fall back to a small hash.
 */
export async function hashPin(pin: string): Promise<string> {
  const input = `plasco-pin:${pin}`;
  const subtle = globalThis.crypto?.subtle as SubtleCrypto | undefined;
  if (subtle) {
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(input));
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let hash = 5381;
  for (let i = 0; i < input.length; i++) hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  return `fallback-${(hash >>> 0).toString(16)}`;
}
