import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeftRight,
  Banknote,
  Pencil,
  ShoppingBasket,
  Trash2,
  Truck,
  Wand2,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MoneyText, Section } from '@/components/common/Kpi';
import { StockStack } from '@/components/common/StockStack';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/misc';
import {
  getProduct,
  listBrands,
  listCategories,
  listLocations,
  listStockLevels,
  restoreProduct,
  setBin,
  softDeleteProduct,
} from '@/db/repos';
import { listMovements } from '@/db/repos';
import { listPriceChanges } from '@/db/priceHistory';
import type { Product, PriceChange } from '@/db/types';
import { formatJalali, formatMoney, formatQty } from '@/domain/format';
import { fa } from '@/i18n/fa';
import { toastUndo } from '@/lib/toast';
import { PriceEditSheet } from './PriceEditSheet';
import { ProductThumb } from './ProductThumb';
import { MovementRow } from '@/features/stock/MovementRow';

const PRICE_FIELD_LABELS: Record<string, string> = {
  buy: fa.products.buyPrice,
  retail: fa.products.retailPrice,
  wholesale: fa.products.wholesalePrice,
};

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const product = useLiveQuery<Product | undefined>(
    () => (id ? getProduct(id) : Promise.resolve(undefined)),
    [id],
  );
  const levels = useLiveQuery(() => listStockLevels(), []);
  const locations = useLiveQuery(() => listLocations(), []);
  const brands = useLiveQuery(() => listBrands(), []);
  const categories = useLiveQuery(() => listCategories(), []);
  const movements = useLiveQuery(() => listMovements({ productId: id, limit: 20 }), [id]);
  const priceChanges = useLiveQuery<PriceChange[]>(
    () => (id ? listPriceChanges(id) : Promise.resolve<PriceChange[]>([])),
    [id],
  );
  const [binDraft, setBinDraft] = useState<{ key: string; value: string } | null>(null);
  const [priceOpen, setPriceOpen] = useState(false);

  if (!product) return <p className="text-crate">{fa.common.loading}</p>;

  const myLevels = (levels ?? []).filter((level) => level.productId === product.id);
  const total = myLevels.reduce((sum, level) => sum + level.qty, 0);
  const brand = (brands ?? []).find((b) => b.id === product.brandId);
  const category = (categories ?? []).find((c) => c.id === product.categoryId);
  const locationName = (locationId: string) =>
    (locations ?? []).find((l) => l.id === locationId)?.name ?? fa.common.unknown;

  return (
    <div className="mx-auto max-w-[860px]">
      <div className="mb-4 flex items-start gap-4 rounded-input border border-line bg-paper p-4">
        <ProductThumb productId={product.id} kind="full" className="size-24 rounded-thumb" />
        <div className="min-w-0 flex-1">
          <h2 className="text-title font-bold text-ink">{product.name}</h2>
          {product.variant ? <p className="text-crate">{product.variant}</p> : null}
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[0.9rem] text-crate">
            {brand ? <span>{brand.name}</span> : null}
            {category ? <span>· {category.name}</span> : null}
            <span dir="ltr">· {product.code}</span>
            {product.family ? <span>· {product.family}</span> : null}
          </p>
          {product.barcodes.length > 0 ? (
            <p dir="ltr" className="mt-1 text-start text-[0.8rem] text-crate">
              {product.barcodes.join(' · ')}
            </p>
          ) : null}
          {!product.active ? <p className="mt-1 text-[0.8rem] text-low">{fa.products.deleted}</p> : null}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="tnum text-[2rem] font-extrabold leading-tight text-ink">
            {formatQty(total)}
          </span>
          <StockStack total={total} minStock={product.minStock} />
        </div>
      </div>

      <div className="mb-1 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <PriceCell
          label={fa.products.buyPrice}
          value={product.buyPrice}
          onClick={() => setPriceOpen(true)}
        />
        <PriceCell
          label={fa.products.retailPrice}
          value={product.retailPrice}
          onClick={() => setPriceOpen(true)}
        />
        <PriceCell
          label={fa.products.wholesalePrice}
          value={product.wholesalePrice}
          onClick={() => setPriceOpen(true)}
        />
        {product.minStock != null ? (
          <div className="rounded-input border border-line bg-paper p-3">
            <p className="text-[0.9rem] text-crate">{fa.products.minStock}</p>
            <p className="tnum font-bold text-ink">{formatQty(product.minStock)}</p>
          </div>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Button onClick={() => navigate(`/stock/receive?product=${product.id}`)}>
          <ShoppingBasket className="size-5" />
          {fa.stock.receive}
        </Button>
        <Button variant="secondary" onClick={() => navigate(`/stock/issue?product=${product.id}`)}>
          <Truck className="size-5" />
          {fa.stock.issue}
        </Button>
        <Button variant="secondary" onClick={() => navigate(`/stock/transfer?product=${product.id}`)}>
          <ArrowLeftRight className="size-5" />
          {fa.stock.transfer}
        </Button>
        <Button variant="secondary" onClick={() => navigate(`/stock/adjust?product=${product.id}`)}>
          <Wand2 className="size-5" />
          {fa.stock.adjust}
        </Button>
        <Button variant="secondary" onClick={() => setPriceOpen(true)}>
          <Banknote className="size-5" />
          {fa.products.priceEdit}
        </Button>
        <Button variant="secondary" onClick={() => navigate(`/products/${product.id}/edit`)}>
          <Pencil className="size-5" />
          {fa.actions.edit}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            void softDeleteProduct(product.id).then(() => {
              toastUndo(fa.products.deletedToast, async () => {
                await restoreProduct(product.id);
              });
              navigate('/products');
            });
          }}
        >
          <Trash2 className="size-5 text-out" />
          {fa.actions.delete}
        </Button>
      </div>

      <Section title={fa.products.perLocation}>
        {myLevels.length === 0 ? (
          <p className="text-crate">{fa.products.noLocation}</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-input border border-line bg-paper">
            {myLevels.map((level) => {
              const key = `${level.productId}:${level.locationId}`;
              const value = binDraft?.key === key ? binDraft.value : (level.bin ?? '');
              return (
                <li key={level.locationId} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-ink">{locationName(level.locationId)}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <Label className="mb-0 text-[0.8rem]">{fa.common.bin}</Label>
                      <Input
                        value={value}
                        placeholder={fa.products.binPlaceholder}
                        className="h-9 w-32 text-sm"
                        onChange={(event) => setBinDraft({ key, value: event.target.value })}
                        onBlur={() => {
                          if (binDraft?.key === key) {
                            void setBin(level.productId, level.locationId, value.trim());
                            setBinDraft(null);
                          }
                        }}
                      />
                    </div>
                  </div>
                  <span className="tnum text-title font-extrabold text-ink">
                    {formatQty(level.qty)}
                  </span>
                  <StockStack total={level.qty} minStock={product.minStock} />
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title={fa.products.history}>
        {!movements || movements.length === 0 ? (
          <p className="text-crate">{fa.empty.movements}</p>
        ) : (
          <ul className="overflow-hidden rounded-input border border-line bg-paper">
            {movements.map((movement) => (
              <MovementRow
                key={movement.id}
                movement={movement}
                locationName={locationName(movement.locationId)}
              />
            ))}
          </ul>
        )}
      </Section>

      <Section title={fa.products.priceHistory}>
        {!priceChanges || priceChanges.length === 0 ? (
          <p className="text-crate">{fa.common.none}</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-input border border-line bg-paper">
            {priceChanges.slice(0, 20).map((change) => (
              <li key={change.id} className="flex items-center gap-3 p-3">
                <span className="flex-1 text-ink">{PRICE_FIELD_LABELS[change.field] ?? change.field}</span>
                <span className="tnum text-[0.9rem] text-crate">{formatMoney(change.oldValue)}</span>
                <span className="text-crate">←</span>
                <span className="tnum font-bold text-ink">{formatMoney(change.newValue)}</span>
                <span className="text-[0.8rem] text-crate">{formatJalali(change.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {myLevels.length === 0 && total === 0 ? (
        <EmptyState message={fa.products.noLocation} />
      ) : null}

      {priceOpen ? (
        <PriceEditSheet product={product} onClose={() => setPriceOpen(false)} />
      ) : null}
    </div>
  );
}

function PriceCell({
  label,
  value,
  onClick,
}: {
  label: string;
  value?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-input border border-line bg-paper p-3 text-start"
    >
      <p className="text-[0.9rem] text-crate">{label}</p>
      {value != null ? (
        <MoneyText value={value} className="font-bold text-ink" />
      ) : (
        <span className="text-crate">{fa.products.noPrice}</span>
      )}
    </button>
  );
}
