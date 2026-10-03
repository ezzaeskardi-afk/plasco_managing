import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { ProductsPage } from '@/features/products/ProductsPage';
import { ProductFormPage } from '@/features/products/ProductFormPage';
import { ProductDetailPage } from '@/features/products/ProductDetailPage';
import { StockOpPage } from '@/features/stock/StockOpPage';
import { MovementsPage } from '@/features/stock/MovementsPage';
import {
  StockTakeCountPage,
  StockTakeListPage,
  StockTakeNewPage,
  StockTakeReviewPage,
} from '@/features/stocktake/StockTakePages';
import { DataPage } from '@/features/importexport/DataPage';
import { MorePage } from '@/features/settings/MorePage';
import { StatusPage } from '@/features/settings/StatusPage';
import { LabelsPage } from '@/features/settings/LabelsPage';
import { SettingsPage } from '@/features/settings/SettingsPage';

export function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="products/new" element={<ProductFormPage />} />
          <Route path="products/:id" element={<ProductDetailPage />} />
          <Route path="products/:id/edit" element={<ProductFormPage />} />
          <Route path="stock/:op" element={<StockOpPage />} />
          <Route path="movements" element={<MovementsPage />} />
          <Route path="stocktake" element={<StockTakeListPage />} />
          <Route path="stocktake/new" element={<StockTakeNewPage />} />
          <Route path="stocktake/:id" element={<StockTakeCountPage />} />
          <Route path="stocktake/:id/review" element={<StockTakeReviewPage />} />
          <Route path="more" element={<MorePage />} />
          <Route path="more/labels" element={<LabelsPage />} />
          <Route path="more/data" element={<DataPage />} />
          <Route path="more/settings" element={<SettingsPage />} />
          <Route path="more/status" element={<StatusPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
