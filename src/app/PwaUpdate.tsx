import { useEffect } from 'react';
import { toast } from 'sonner';
import { registerSW } from 'virtual:pwa-register';
import { fa } from '@/i18n/fa';
import { setWaitingUpdate } from './updateStore';

interface PreviewFlag {
  __PLASCO_PREVIEW__?: boolean;
}

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** registerType: 'prompt' - the update is applied only when the user taps it. */
export function PwaUpdate() {
  useEffect(() => {
    // The single-file preview build has no service worker next to it.
    if ((window as unknown as PreviewFlag).__PLASCO_PREVIEW__ === true) return;

    let registration: ServiceWorkerRegistration | undefined;

    // A phone that lives on the home screen for days never reloads on its own,
    // so the "update available" alarm would never ring. Ask the browser for a
    // fresh service worker whenever the phone comes back online, returns to the
    // app, or once an hour - the alarm itself still waits for a tap below.
    const check = () => {
      void registration?.update().catch(() => undefined);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', onVisible);
    const interval = window.setInterval(check, CHECK_INTERVAL_MS);

    const updateSW = registerSW({
      onRegisteredSW(_swUrl, swRegistration) {
        registration = swRegistration ?? undefined;
      },
      onNeedRefresh() {
        setWaitingUpdate(() => updateSW(true));
        // One toast at a time, and it can be closed: a toast pinned at the top
        // covers the top of the page (and the search field on a phone) until it is.
        // sonner's own close circle announces itself as the English "Close
        // toast" and cannot be relabelled through its public API, so the app
        // draws its own Persian control instead (AGENTS.md §۸).
        toast(fa.settings.updateAvailable, {
          id: 'pwa-update',
          duration: Infinity,
          cancel: { label: fa.actions.close, onClick: () => toast.dismiss('pwa-update') },
          action: { label: fa.settings.update, onClick: () => void updateSW(true) },
        });
      },
      onRegisterError(error) {
        console.warn('service worker registration failed', error);
      },
    });

    return () => {
      window.removeEventListener('online', check);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(interval);
    };
  }, []);
  return null;
}
