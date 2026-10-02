import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers';
import { db, ensureDefaults } from '@/db/dexie';
import { seedSynthetic, wipeAll } from '@/db/seed';
import { fa } from '@/i18n/fa';
import { DashboardPage } from './DashboardPage';

function renderDashboard() {
  return render(
    <AppProviders>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </AppProviders>,
  );
}

beforeEach(async () => {
  await db.open();
  await wipeAll(db);
  await ensureDefaults(db);
});

afterEach(() => {
  cleanup();
});

describe('DashboardPage', () => {
  it('offers to add the first product when the catalogue is empty', async () => {
    renderDashboard();
    expect(await screen.findByText(fa.products.new)).toBeTruthy();
  });

  it('renders the KPI surface and breakdowns once products exist', async () => {
    await seedSynthetic({ count: 5, brands: 2 }, db);
    renderDashboard();

    expect(await screen.findByText(fa.dashboard.retailValue)).toBeTruthy();
    expect(await screen.findByText(fa.dashboard.costValue)).toBeTruthy();
    expect(await screen.findByText(fa.dashboard.potentialProfit)).toBeTruthy();
    expect(await screen.findByText(fa.dashboard.byLocation)).toBeTruthy();
  });
});
