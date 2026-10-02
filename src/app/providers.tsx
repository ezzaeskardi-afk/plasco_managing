import { DirectionProvider } from '@radix-ui/react-direction';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { DEFAULT_SETTINGS } from '@/db/dexie';
import { fa } from '@/i18n/fa';
import { getSettings, setSettings } from '@/db/repos';
import type { Settings } from '@/db/types';
import { hashPin, SettingsContext, type SettingsContextValue } from './settings-context';

function applyTheme(theme: Settings['theme']) {
  const prefersDark =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const dark = theme === 'dark' || (theme === 'system' && prefersDark);
  document.documentElement.classList.toggle('dark', dark);
}

function SettingsProvider({ children }: { children: ReactNode }) {
  const stored = useLiveQuery(() => getSettings(), [], DEFAULT_SETTINGS);
  const settings = stored ?? DEFAULT_SETTINGS;
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    applyTheme(settings.theme);
    if (settings.theme !== 'system') return;
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return;
    const listener = () => applyTheme('system');
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [settings.theme]);

  useEffect(() => {
    document.documentElement.style.setProperty('--text-scale', String(settings.textScale || 1));
  }, [settings.textScale]);

  useEffect(() => {
    if (!settings.costLockEnabled) setUnlocked(false);
  }, [settings.costLockEnabled]);

  const update = useCallback(async (patch: Partial<Settings>) => {
    await setSettings(patch);
  }, []);

  const unlock = useCallback(
    async (pin: string) => {
      const hash = await hashPin(pin);
      if (settings.costLockPinHash && hash === settings.costLockPinHash) {
        setUnlocked(true);
        return true;
      }
      return false;
    },
    [settings.costLockPinHash],
  );

  const setPin = useCallback(
    async (pin: string) => {
      await setSettings({ costLockPinHash: await hashPin(pin), costLockEnabled: true });
      setUnlocked(true);
    },
    [],
  );

  const disableCostLock = useCallback(async () => {
    await setSettings({ costLockEnabled: false, costLockPinHash: undefined });
    setUnlocked(false);
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      update,
      costVisible: !settings.costLockEnabled || unlocked,
      unlock,
      lock: () => setUnlocked(false),
      setPin,
      disableCostLock,
    }),
    [settings, update, unlocked, unlock, setPin, disableCostLock],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <DirectionProvider dir="rtl">
      <SettingsProvider>
        {children}
        <Toaster
          position="top-center"
          dir="rtl"
          closeButton={false}
          closeButtonAriaLabel={fa.actions.close}
          containerAriaLabel={fa.common.notifications}
          toastOptions={{ style: { fontFamily: 'inherit' } }}
        />
      </SettingsProvider>
    </DirectionProvider>
  );
}
