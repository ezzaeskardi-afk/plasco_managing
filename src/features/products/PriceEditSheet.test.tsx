import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SettingsContext, type SettingsContextValue } from '@/app/settings-context';
import { DEFAULT_SETTINGS } from '@/db/dexie';
import type { Product } from '@/db/types';
import { fa } from '@/i18n/fa';
import { PriceEditSheet } from './PriceEditSheet';

const product: Product = {
  id: 'p-1',
  code: 'P-00001',
  name: 'ظرف غذا',
  nameN: 'ظرف غذا',
  barcodes: [],
  packLabel: 'بسته',
  packSize: 12,
  buyPrice: 10_000,
  retailPrice: 15_000,
  wholesalePrice: 12_000,
  active: true,
  createdAt: 1,
  updatedAt: 1,
};

function renderSheet(costVisible: boolean) {
  const value: SettingsContextValue = {
    settings: { ...DEFAULT_SETTINGS, costLockEnabled: !costVisible },
    update: async () => {},
    costVisible,
    unlock: async () => false,
    lock: () => {},
    setPin: async () => {},
    disableCostLock: async () => {},
  };
  return render(
    <SettingsContext.Provider value={value}>
      <PriceEditSheet product={product} onClose={() => {}} />
    </SettingsContext.Provider>,
  );
}

describe('PriceEditSheet', () => {
  afterEach(cleanup);

  it('hides the buy-price field while the cost lock is on', () => {
    renderSheet(false);
    expect(screen.queryByLabelText(fa.products.buyPrice)).toBeNull();
    expect(screen.getByLabelText(fa.products.retailPrice)).toBeTruthy();
    expect(screen.getByLabelText(fa.products.wholesalePrice)).toBeTruthy();
  });

  it('shows all three price fields when the lock is off', () => {
    renderSheet(true);
    expect(screen.getByLabelText(fa.products.buyPrice)).toBeTruthy();
    expect(screen.getByLabelText(fa.products.retailPrice)).toBeTruthy();
    expect(screen.getByLabelText(fa.products.wholesalePrice)).toBeTruthy();
  });
});
