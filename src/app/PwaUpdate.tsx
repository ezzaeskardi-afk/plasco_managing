import { useEffect } from 'react';
import { toast } from 'sonner';
import { registerSW } from 'virtual:pwa-register';
import { fa } from '@/i18n/fa';
import { setWaitingUpdate } from './updateStore';

interface PreviewFlag {
  __PLASCO_PREVIEW__?: boolean;
}

/** registerType: 'prompt' - the update is applied only when the user taps it. */
export function PwaUpdate() {
  useEffect(() => {
    // The single-file preview build has no service worker next to it.
    if ((window as unknown as PreviewFlag).__PLASCO_PREVIEW__ === true) return;

    const updateSW = registerSW({
      onNeedRefresh() {
        setWaitingUpdate(() => updateSW(true));
        // One toast at a time, and it can be closed: a toast pinned at the top
        // covers the page title (and the search field on a phone) until it is.
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
  }, []);
  return null;
}
