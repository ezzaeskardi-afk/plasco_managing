import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { registerSW } from 'virtual:pwa-register';
import { fa } from '@/i18n/fa';
import { PwaUpdate } from './PwaUpdate';

vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('virtual:pwa-register', () => ({ registerSW: vi.fn(() => vi.fn()) }));

interface PreviewFlag {
  __PLASCO_PREVIEW__?: boolean;
}

interface RefreshOptions {
  onNeedRefresh?: () => void;
  onRegisterError?: (error: unknown) => void;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  delete (window as unknown as PreviewFlag).__PLASCO_PREVIEW__;
});

beforeEach(() => {
  vi.mocked(registerSW).mockReturnValue(vi.fn());
});

describe('PwaUpdate', () => {
  it('shows one dismissible toast per update, pinned above the page content', () => {
    render(<PwaUpdate />);

    const options = vi.mocked(registerSW).mock.calls[0]?.[0] as RefreshOptions;
    expect(options?.onNeedRefresh).toBeTypeOf('function');
    options.onNeedRefresh?.();

    expect(vi.mocked(toast)).toHaveBeenCalledWith(
      fa.settings.updateAvailable,
      expect.objectContaining({
        id: 'pwa-update',
        closeButton: true,
        duration: Infinity,
      }),
    );
  });

  it('applies the update only when the toast action is tapped', () => {
    const updateSW = vi.fn();
    vi.mocked(registerSW).mockReturnValue(updateSW);
    render(<PwaUpdate />);

    const options = vi.mocked(registerSW).mock.calls[0]?.[0] as RefreshOptions;
    options.onNeedRefresh?.();

    const toastOptions = vi.mocked(toast).mock.calls[0]?.[1] as {
      action?: { label: string; onClick: () => void };
    };
    expect(toastOptions.action?.label).toBe(fa.settings.update);
    expect(updateSW).not.toHaveBeenCalled();

    toastOptions.action?.onClick();
    expect(updateSW).toHaveBeenCalledWith(true);
  });

  it('does not register a service worker in the single-file preview build', () => {
    (window as unknown as PreviewFlag).__PLASCO_PREVIEW__ = true;
    render(<PwaUpdate />);
    expect(registerSW).not.toHaveBeenCalled();
  });
});
