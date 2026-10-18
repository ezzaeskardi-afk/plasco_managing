import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeftRight,
  Boxes,
  ChevronLeft,
  Download,
  Package,
  PackageOpen,
  PackagePlus,
  ShoppingBasket,
  Sparkles,
  Tag,
  TrendingUp,
  Truck,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { isBackupStale } from '@/app/appStatus';
import { APP_VERSION } from '@/app/version';
import { MoneyText, Panel, Section } from '@/components/common/Kpi';
import { StockStack } from '@/components/common/StockStack';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import {
  listBrands,
  listCategories,
  listLocations,
  listMovements,
  listProducts,
  listStockLevels,
} from '@/db/repos';
import { seedSynthetic } from '@/db/seed';
import type { ID } from '@/db/types';
import { displayProductName, formatQty } from '@/domain/format';
import { stockAlerts, valuate, type GroupValuation } from '@/domain/valuation';
import { fa } from '@/i18n/fa';
import { toastSuccess } from '@/lib/toast';
import { useSettings } from '@/app/settings-context';
import { MovementRow } from '@/features/stock/MovementRow';

const QUICK_ACTIONS: ReadonlyArray<{ to: string; label: string; icon: LucideIcon }> = [
  { to: '/stock/receive', label: fa.stock.receive, icon: ShoppingBasket },
  { to: '/stock/issue', label: fa.stock.issue, icon: Truck },
  { to: '/stock/transfer', label: fa.stock.transfer, icon: ArrowLeftRight },
  { to: '/products/new', label: fa.products.new, icon: PackagePlus },
];

export function DashboardPage() {
  const navigate = useNavigate();
  const { settings, costVisible } = useSettings();
  const products = useLiveQuery(() => listProducts(), []);
  const levels = useLiveQuery(() => listStockLevels(), []);
  const locations = useLiveQuery(() => listLocations(), []);
  const brands = useLiveQuery(() => listBrands(), []);
  const categories = useLiveQuery(() => listCategories(), []);
  const movements = useLiveQuery(() => listMovements({ limit: 5 }), []);

  const summary = useMemo(() => valuate(products ?? [], levels ?? []), [products, levels]);
  const alerts = useMemo(() => stockAlerts(products ?? [], levels ?? []), [products, levels]);

  const locationNames = useMemo(
    () => new Map((locations ?? []).map((l) => [l.id, l.name])),
    [locations],
  );
  const productNames = useMemo(
    () => new Map((products ?? []).map((p) => [p.id, displayProductName(p.name)])),
    [products],
  );
  const brandNames = useMemo(() => new Map((brands ?? []).map((b) => [b.id, b.name])), [brands]);
  const categoryNames = useMemo(
    () => new Map((categories ?? []).map((c) => [c.id, c.name])),
    [categories],
  );

  if (!products || !levels) return <p className="text-crate">{fa.common.loading}</p>;

  const backupStale = isBackupStale(settings.lastBackupAt);

  if (products.length === 0) {
    return (
      <EmptyState
        icon={<PackageOpen className="size-7" />}
        message={fa.empty.products}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => navigate('/products/new')}>{fa.products.new}</Button>
            <Button
              variant="secondary"
              onClick={() => {
                void seedSynthetic({ count: 200 }).then(() => {
                  toastSuccess(fa.dashboard.loadSample, fa.dashboard.loadSampleHint);
                });
              }}
            >
              <Sparkles className="size-4" />
              {fa.dashboard.loadSample}
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <div>
      {backupStale ? (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-input border border-low bg-paper p-3">
          <p className="text-[0.9rem] text-ink">{fa.dashboard.lastBackupWarning}</p>
          <Button size="sm" variant="secondary" onClick={() => navigate('/more/data')}>
            <Download className="size-4" />
            {fa.dashboard.backupNow}
          </Button>
        </div>
      ) : null}

      {/* One surface, 2x2 numerals - not four separate cards. */}
      <Panel className="mb-4 grid grid-cols-2 gap-2">
        <KpiCell
          icon={Boxes}
          label={fa.dashboard.pieces}
          onClick={() => navigate('/products?sort=qty')}
          node={
            <span className="tnum whitespace-nowrap text-[1.6rem] font-extrabold leading-tight text-ink sm:text-[2rem]">
              {formatQty(summary.pieces)}
            </span>
          }
        />
        <KpiCell
          icon={Package}
          label={fa.dashboard.skus}
          onClick={() => navigate('/products')}
          node={
            <span className="tnum whitespace-nowrap text-[1.6rem] font-extrabold leading-tight text-ink sm:text-[2rem]">
              {formatQty(summary.productCount)}
            </span>
          }
        />
        <KpiCell
          icon={Wallet}
          label={fa.dashboard.costValue}
          onClick={() => navigate('/products?sort=value')}
          node={<MoneyText value={summary.cost} className="whitespace-nowrap text-[1.6rem] font-extrabold sm:text-[2rem]" compact showLabel={false} />}
        />
        <KpiCell
          icon={Tag}
          label={fa.dashboard.retailValue}
          onClick={() => navigate('/products?sort=value')}
          node={<MoneyText value={summary.retail} className="whitespace-nowrap text-[1.6rem] font-extrabold sm:text-[2rem]" compact showLabel={false} />}
        />
        <div className="col-span-2 flex items-center justify-between border-t border-line pt-3">
          <span className="flex items-center gap-1.5 text-crate">
            <TrendingUp className="size-4" />
            {fa.dashboard.potentialProfit}
          </span>
          <MoneyText value={summary.potentialProfit} className="text-title font-bold text-ok" />
        </div>
      </Panel>

      <Section title={fa.dashboard.quickTitle}>
        <div className="grid grid-cols-4 gap-2">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.to}
              type="button"
              onClick={() => navigate(action.to)}
              className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-input border border-line bg-paper px-1 py-3 text-ink transition-colors hover:border-basin"
            >
              <action.icon className="size-6 text-basin" />
              <span className="text-center text-[0.8rem] leading-snug">{action.label}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title={fa.dashboard.lowStock}>
        {alerts.low.length === 0 ? (
          <p className="text-crate">{fa.dashboard.lowStockEmpty}</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-input border border-line bg-paper">
            {alerts.low.slice(0, 8).map((row) => (
              <ProductAlertRow
                key={row.product.id}
                name={displayProductName(row.product.name)}
                code={row.product.code}
                total={row.total}
                minStock={row.product.minStock}
                onOpen={() => navigate(`/products/${row.product.id}`)}
              />
            ))}
          </ul>
        )}
      </Section>

      <Section title={fa.dashboard.outOfStock}>
        {alerts.out.length === 0 ? (
          <p className="text-crate">{fa.dashboard.outOfStockEmpty}</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-input border border-line bg-paper">
            {alerts.out.slice(0, 8).map((row) => (
              <ProductAlertRow
                key={row.product.id}
                name={displayProductName(row.product.name)}
                code={row.product.code}
                total={row.total}
                onOpen={() => navigate(`/products/${row.product.id}`)}
              />
            ))}
          </ul>
        )}
      </Section>

      <Section
        title={fa.dashboard.recentTitle}
        action={
          <Button size="sm" variant="ghost" onClick={() => navigate('/movements')}>
            {fa.dashboard.viewAll}
            <ChevronLeft className="size-4" />
          </Button>
        }
      >
        {(movements ?? []).length === 0 ? (
          <p className="text-crate">{fa.dashboard.recentEmpty}</p>
        ) : (
          <ul className="overflow-hidden rounded-input border border-line bg-paper">
            {(movements ?? []).map((movement) => (
              <MovementRow
                key={movement.id}
                movement={movement}
                locationName={locationNames.get(movement.locationId)}
                productName={productNames.get(movement.productId)}
              />
            ))}
          </ul>
        )}
      </Section>

      <Section title={fa.dashboard.byLocation}>
        <Breakdown
          groups={summary.byLocation}
          names={locationNames}
          onPick={(id) => navigate(`/products?location=${id}`)}
          costVisible={costVisible}
        />
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={fa.dashboard.byBrand}>
          <Breakdown
            groups={summary.byBrand.slice(0, 8)}
            names={brandNames}
            onPick={(id) => navigate(`/products?brand=${id}`)}
            costVisible={costVisible}
          />
        </Section>
        <Section title={fa.dashboard.byCategory}>
          <Breakdown
            groups={summary.byCategory.slice(0, 8)}
            names={categoryNames}
            onPick={(id) => navigate(`/products?category=${id}`)}
            costVisible={costVisible}
          />
        </Section>
      </div>

      <p className="mt-8 text-center text-[0.8rem] text-crate">
        {fa.settings.version} {APP_VERSION}
      </p>
    </div>
  );
}

function KpiCell({
  icon: Icon,
  label,
  node,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  node: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-1 rounded-input p-2 text-start transition-colors hover:bg-frost"
    >
      <span className="flex items-center gap-1.5 text-[0.9rem] text-crate">
        <Icon className="size-4 shrink-0" />
        {label}
      </span>
      {node}
    </button>
  );
}

function Breakdown({
  groups,
  names,
  onPick,
  costVisible,
}: {
  groups: readonly GroupValuation[];
  names: Map<ID, string>;
  onPick: (id: ID) => void;
  costVisible: boolean;
}) {
  if (groups.length === 0) return <p className="text-crate">{fa.common.none}</p>;
  const max = Math.max(...groups.map((g) => g.retail), 1);
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-input border border-line bg-paper">
      {groups.map((group) => (
        <li key={group.id}>
          <button
            type="button"
            onClick={() => onPick(group.id)}
            className="flex w-full items-center gap-3 p-3 text-start"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-ink">{names.get(group.id) ?? fa.common.unknown}</span>
                <span className="tnum shrink-0 text-[0.9rem] text-crate">
                  {formatQty(group.pieces)} {fa.common.pieces}
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-frost">
                <div
                  className="h-full rounded-full bg-basin"
                  style={{ width: `${Math.max(4, (group.retail / max) * 100)}%` }}
                />
              </div>
              {costVisible ? (
                <div className="mt-1 text-[0.8rem] text-crate">
                  <MoneyText value={group.retail} />
                </div>
              ) : null}
            </div>
            <ChevronLeft className="size-4 shrink-0 text-crate" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function ProductAlertRow({
  name,
  code,
  total,
  minStock,
  onOpen,
}: {
  name: string;
  code: string;
  total: number;
  minStock?: number;
  onOpen: () => void;
}) {
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex min-h-16 w-full items-center gap-3 px-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-ink">{name}</p>
          <p dir="ltr" className="text-start text-[0.9rem] text-crate">
            {code}
          </p>
        </div>
        <span className="tnum text-title font-extrabold text-ink">{formatQty(total)}</span>
        <StockStack total={total} minStock={minStock} />
      </button>
    </li>
  );
}
