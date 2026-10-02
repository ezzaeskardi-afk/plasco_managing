import { useLiveQuery } from 'dexie-react-hooks';
import { Banknote, Filter, Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { StockStack } from '@/components/common/StockStack';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, Select } from '@/components/ui/misc';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { listBrands, listCategories, listLocations, listProducts, listStockLevels } from '@/db/repos';
import type { Product } from '@/db/types';
import { formatQty } from '@/domain/format';
import { buildSearchIndex, searchIndex } from '@/domain/search';
import { productTotals, stockState } from '@/domain/valuation';
import { fa } from '@/i18n/fa';
import { cn } from '@/lib/utils';
import { useVirtualizer } from '@tanstack/react-virtual';
import { PriceEditSheet } from './PriceEditSheet';
import { ProductThumb } from './ProductThumb';

type SortKey = 'name' | 'qty' | 'value';

export function ProductsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [term, setTerm] = useState(params.get('q') ?? '');
  const [debounced, setDebounced] = useState(term);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [priceFor, setPriceFor] = useState<Product | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), 100);
    return () => clearTimeout(timer);
  }, [term]);

  const products = useLiveQuery(() => listProducts(), []);
  const levels = useLiveQuery(() => listStockLevels(), []);
  const brands = useLiveQuery(() => listBrands(), []);
  const categories = useLiveQuery(() => listCategories(), []);
  const locations = useLiveQuery(() => listLocations(), []);

  const brandId = params.get('brand') ?? '';
  const categoryId = params.get('category') ?? '';
  const locationId = params.get('location') ?? '';
  const state = params.get('state') ?? '';
  const sort = (params.get('sort') as SortKey | null) ?? 'name';

  const totals = useMemo(() => productTotals(levels ?? []), [levels]);
  const totalsByLocation = useMemo(() => {
    const map = new Map<string, number>();
    for (const level of levels ?? []) {
      map.set(`${level.productId}\u0000${level.locationId}`, level.qty);
    }
    return map;
  }, [levels]);

  const index = useMemo(() => {
    const brandNames = new Map((brands ?? []).map((b) => [b.id, b.name]));
    const categoryNames = new Map((categories ?? []).map((c) => [c.id, c.name]));
    return buildSearchIndex(
      (products ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        variant: p.variant,
        family: p.family,
        code: p.code,
        barcodes: p.barcodes,
        brandName: p.brandId ? brandNames.get(p.brandId) : undefined,
        categoryName: p.categoryId ? categoryNames.get(p.categoryId) : undefined,
      })),
    );
  }, [products, brands, categories]);

  const productMap = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products]);

  const rows = useMemo(() => {
    const all = products ?? [];
    let list: Product[] = all;
    const searched = searchIndex(index, debounced, 5000);
    if (debounced.trim()) {
      list = searched.map((id) => productMap.get(id)).filter((p): p is Product => p != null);
    }
    if (brandId) list = list.filter((p) => p.brandId === brandId);
    if (categoryId) list = list.filter((p) => p.categoryId === categoryId);
    if (locationId) {
      list = list.filter((p) => (totalsByLocation.get(`${p.id}\u0000${locationId}`) ?? 0) > 0);
    }
    if (state) {
      list = list.filter((p) => stockState(totals.get(p.id) ?? 0, p.minStock) === state);
    }
    if (sort === 'qty') {
      list = [...list].sort((a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0));
    } else if (sort === 'value') {
      list = [...list].sort(
        (a, b) => (totals.get(b.id) ?? 0) * b.buyPrice - (totals.get(a.id) ?? 0) * a.buyPrice,
      );
    }
    return list;
  }, [products, index, debounced, productMap, brandId, categoryId, locationId, state, sort, totals, totalsByLocation]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 68,
    overscan: 10,
  });

  if (!products || !levels) return <p className="text-crate">{fa.common.loading}</p>;

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const activeFilters =
    [brandId, categoryId, locationId, state].filter(Boolean).length + (sort !== 'name' ? 1 : 0);

  const brandName = (brands ?? []).find((b) => b.id === brandId)?.name;
  const categoryName = (categories ?? []).find((c) => c.id === categoryId)?.name;
  const locationName = (locations ?? []).find((l) => l.id === locationId)?.name;

  return (
    <div className="flex h-[calc(100dvh-12.5rem)] flex-col gap-3 lg:h-[calc(100dvh-9rem)]">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-5 text-crate" />
          <Input
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              setParam('q', e.target.value);
            }}
            placeholder={fa.products.searchPlaceholder}
            inputMode="search"
            className="ps-10"
            aria-label={fa.actions.search}
          />
          {term ? (
            <button
              type="button"
              aria-label={fa.actions.clear}
              onClick={() => {
                setTerm('');
                setParam('q', '');
              }}
              className="absolute inset-y-0 end-1 my-auto flex size-10 items-center justify-center text-crate"
            >
              <X className="size-5" />
            </button>
          ) : null}
        </div>
        <Button
          variant="secondary"
          onClick={() => setFiltersOpen(true)}
          aria-label={fa.products.filterState}
          className={cn('px-3', activeFilters > 0 && 'border-basin text-basin')}
        >
          <Filter className="size-5" />
          {activeFilters > 0 ? <span className="tnum">{formatQty(activeFilters)}</span> : null}
        </Button>
        <Button size="icon" onClick={() => navigate('/products/new')} aria-label={fa.products.new}>
          <Plus className="size-5" />
        </Button>
      </div>

      {activeFilters > 0 ? (
        <div className="flex flex-wrap gap-2">
          {brandName ? <Chip label={brandName} onClear={() => setParam('brand', '')} /> : null}
          {categoryName ? <Chip label={categoryName} onClear={() => setParam('category', '')} /> : null}
          {locationName ? <Chip label={locationName} onClear={() => setParam('location', '')} /> : null}
          {state ? <Chip label={stateLabel(state)} onClear={() => setParam('state', '')} /> : null}
          {sort !== 'name' ? (
            <Chip
              label={sort === 'qty' ? fa.products.sortQty : fa.products.sortValue}
              onClear={() => setParam('sort', '')}
            />
          ) : null}
        </div>
      ) : null}

      <p className="text-[0.9rem] text-crate">
        {formatQty(rows.length)} {fa.products.countLabel}
      </p>

      {rows.length === 0 ? (
        <EmptyState
          message={debounced ? fa.empty.search : fa.empty.products}
          action={<Button onClick={() => navigate('/products/new')}>{fa.products.new}</Button>}
        />
      ) : (
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-input border border-line bg-paper"
        >
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const product = rows[item.index];
              if (!product) return null;
              const total = totals.get(product.id) ?? 0;
              return (
                <div
                  key={item.key}
                  className="absolute inset-x-0 top-0"
                  style={{ height: item.size, transform: `translateY(${item.start}px)` }}
                >
                  <ProductRow
                    product={product}
                    total={total}
                    brandName={
                      product.brandId
                        ? (brands ?? []).find((b) => b.id === product.brandId)?.name
                        : undefined
                    }
                    onOpen={() => navigate(`/products/${product.id}`)}
                    onPrice={() => setPriceFor(product)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {priceFor ? (
        <PriceEditSheet
          key={priceFor.id}
          product={priceFor}
          onClose={() => setPriceFor(null)}
        />
      ) : null}

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent title={fa.products.title}>
          <div className="space-y-3">
            <Select
              value={sort}
              onValueChange={(value) => setParam('sort', value === 'name' ? '' : value)}
              options={[
                { value: 'name', label: fa.products.sortName },
                { value: 'qty', label: fa.products.sortQty },
                { value: 'value', label: fa.products.sortValue },
              ]}
              aria-label={fa.products.sort}
            />
            <Select
              value={brandId}
              onValueChange={(value) => setParam('brand', value)}
              allowEmpty
              options={(brands ?? []).map((b) => ({ value: b.id, label: b.name }))}
              placeholder={fa.products.filterBrand}
            />
            <Select
              value={categoryId}
              onValueChange={(value) => setParam('category', value)}
              allowEmpty
              options={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))}
              placeholder={fa.products.filterCategory}
            />
            <Select
              value={locationId}
              onValueChange={(value) => setParam('location', value)}
              allowEmpty
              options={(locations ?? []).map((l) => ({ value: l.id, label: l.name }))}
              placeholder={fa.products.filterLocation}
            />
            <Select
              value={state}
              onValueChange={(value) => setParam('state', value)}
              allowEmpty
              options={[
                { value: 'ok', label: fa.products.inStock },
                { value: 'low', label: fa.dashboard.lowStock },
                { value: 'out', label: fa.dashboard.outOfStock },
              ]}
              placeholder={fa.products.filterState}
            />
            <div className="flex gap-2 pt-2">
              <Button
                variant="secondary"
                block
                onClick={() => {
                  setParams(new URLSearchParams(), { replace: true });
                  setFiltersOpen(false);
                }}
              >
                {fa.actions.clear}
              </Button>
              <Button block onClick={() => setFiltersOpen(false)}>
                {fa.actions.done}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function stateLabel(state: string): string {
  if (state === 'low') return fa.dashboard.lowStock;
  if (state === 'out') return fa.dashboard.outOfStock;
  return fa.products.inStock;
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="flex h-9 items-center gap-1 rounded-full border border-line bg-paper px-3 text-sm text-ink"
    >
      {label}
      <X className="size-4 text-crate" />
    </button>
  );
}

function ProductRow({
  product,
  total,
  brandName,
  onOpen,
  onPrice,
}: {
  product: Product;
  total: number;
  brandName?: string;
  onOpen: () => void;
  onPrice: () => void;
}) {
  return (
    <div className="flex h-[68px] w-full items-center gap-2 border-b border-line ps-3 pe-1">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-start"
      >
        <ProductThumb productId={product.id} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-ink">
            {product.name}
            {product.variant ? <span className="text-crate"> · {product.variant}</span> : null}
          </p>
          <p className="flex items-center gap-2 text-[0.9rem] text-crate">
            {brandName ? <span className="truncate">{brandName}</span> : null}
            <span dir="ltr" className="shrink-0">
              {product.code}
            </span>
          </p>
        </div>
        {/* Quantity and the stock bars stack vertically so the name keeps the width. */}
        <div className="flex shrink-0 flex-col items-center gap-0.5">
          <span className="tnum text-title font-extrabold text-ink">{formatQty(total)}</span>
          <StockStack total={total} minStock={product.minStock} />
        </div>
      </button>
      <button
        type="button"
        onClick={onPrice}
        aria-label={`${fa.products.priceEdit} — ${product.name}`}
        className="flex size-11 shrink-0 items-center justify-center rounded-input text-basin"
      >
        <Banknote className="size-5" />
      </button>
    </div>
  );
}
