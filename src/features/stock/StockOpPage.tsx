import { useLiveQuery } from 'dexie-react-hooks';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { QuantityInput } from '@/components/common/QuantityInput';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/input';
import { EmptyState, Select } from '@/components/ui/misc';
import {
  InsufficientStockError,
  applyMovement,
  applyTransfer,
  productLevels,
  undoMovement,
} from '@/db/movements';
import { listLocations, listProducts } from '@/db/repos';
import type { MovementType } from '@/db/types';
import { parseIntegerInput } from '@/domain/numbers';
import { buildSearchIndex, searchIndex } from '@/domain/search';
import { formatQty } from '@/domain/format';
import { fa } from '@/i18n/fa';
import { toastError, toastUndo } from '@/lib/toast';
import { ProductThumb } from '@/features/products/ProductThumb';

type Op = 'receive' | 'issue' | 'damage' | 'transfer' | 'adjust';

const OP_TITLES: Record<Op, string> = {
  receive: fa.stock.receive,
  issue: fa.stock.issue,
  damage: fa.stock.damage,
  transfer: fa.stock.transfer,
  adjust: fa.stock.adjust,
};

const OP_SUCCESS: Record<Op, string> = {
  receive: fa.stock.received,
  issue: fa.stock.issued,
  damage: fa.stock.damaged,
  transfer: fa.stock.transferred,
  adjust: fa.stock.adjusted,
};

const MOVEMENT_TYPE: Record<Op, MovementType> = {
  receive: 'receive',
  issue: 'sale',
  damage: 'damage',
  transfer: 'transfer_out',
  adjust: 'adjust',
};

const LAST_LOCATION_KEY = 'plasco:last-location';

export function StockOpPage() {
  const { op: opParam } = useParams<{ op: string }>();
  const op = (opParam ?? 'receive') as Op;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const presetProductId = params.get('product') ?? '';

  const products = useLiveQuery(() => listProducts(), []);
  const locations = useLiveQuery(() => listLocations(), []);
  const [productId, setProductId] = useState(presetProductId);
  const [term, setTerm] = useState('');
  const [locationId, setLocationId] = useState('');
  const [toLocationId, setToLocationId] = useState('');
  const [qty, setQty] = useState(0);
  const [targetQty, setTargetQty] = useState('');
  const [currentQty, setCurrentQty] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const product = useMemo(
    () => (products ?? []).find((p) => p.id === productId),
    [products, productId],
  );

  const index = useMemo(
    () =>
      buildSearchIndex(
        (products ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          variant: p.variant,
          family: p.family,
          code: p.code,
          barcodes: p.barcodes,
        })),
      ),
    [products],
  );

  const results = useMemo(() => {
    if (!term.trim()) return [];
    const ids = searchIndex(index, term, 20);
    const map = new Map((products ?? []).map((p) => [p.id, p]));
    return ids.map((id) => map.get(id)).filter((p) => p != null);
  }, [index, term, products]);

  useEffect(() => {
    if (!locations || locations.length === 0) return;
    const remembered = localStorage.getItem(LAST_LOCATION_KEY);
    const initial =
      locations.find((l) => l.id === remembered)?.id ?? locations[0]?.id ?? '';
    setLocationId((current) => current || initial);
    setToLocationId((current) => current || locations.find((l) => l.id !== initial)?.id || initial);
  }, [locations]);

  useEffect(() => {
    if (!productId) {
      setCurrentQty(null);
      return;
    }
    void productLevels(productId).then((levels) => {
      setCurrentQty(levels.find((l) => l.locationId === locationId)?.qty ?? 0);
    });
  }, [productId, locationId, products]);

  if (!products || !locations) return <p className="text-crate">{fa.common.loading}</p>;

  const submit = async () => {
    if (!product) {
      toastError(fa.stock.pickProduct);
      return;
    }
    setBusy(true);
    try {
      if (op === 'adjust') {
        // Persian/Arabic digits and separators are accepted here too.
        const target = parseIntegerInput(targetQty);
        if (target == null || target < 0) {
          toastError(fa.stock.enterQty);
          return;
        }
        const levels = await productLevels(product.id);
        const current = levels.find((l) => l.locationId === locationId)?.qty ?? 0;
        const delta = target - current;
        if (delta === 0) {
          toastError(fa.stock.zeroQty);
          return;
        }
        const movement = await applyMovement({
          productId: product.id,
          locationId,
          type: 'adjust',
          qty: delta,
          note: note || undefined,
        });
        toastUndo(fa.stock.adjusted, () => undoMovement(movement.id));
      } else if (op === 'transfer') {
        if (qty <= 0) {
          toastError(fa.stock.enterQty);
          return;
        }
        if (locationId === toLocationId) {
          toastError(fa.stock.sameLocation);
          return;
        }
        const transfer = await applyTransfer(product.id, locationId, toLocationId, qty, {
          note: note || undefined,
        });
        toastUndo(fa.stock.transferred, () => undoMovement(transfer.out.id));
      } else {
        if (qty <= 0) {
          toastError(fa.stock.enterQty);
          return;
        }
        const signed = op === 'receive' ? qty : -qty;
        const movement = await applyMovement({
          productId: product.id,
          locationId,
          type: MOVEMENT_TYPE[op],
          qty: signed,
          note: note || undefined,
        });
        toastUndo(OP_SUCCESS[op], () => undoMovement(movement.id));
      }
      localStorage.setItem(LAST_LOCATION_KEY, locationId);
      navigate(`/products/${product.id}`);
    } catch (error) {
      if (error instanceof InsufficientStockError) {
        toastError(
          fa.stock.insufficient,
          fa.stock.insufficientHint.replace('{available}', formatQty(error.available)),
        );
      } else {
        toastError(fa.errors.title, error instanceof Error ? error.message : undefined);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[720px] pb-10">
      <h2 className="mb-4 text-title font-bold text-ink">{OP_TITLES[op] ?? fa.stock.receive}</h2>

      {product ? (
        <div className="mb-4 flex items-center gap-3 rounded-input border border-line bg-paper p-3">
          <ProductThumb productId={product.id} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-ink">{product.name}</p>
            <p dir="ltr" className="text-start text-[0.8rem] text-crate">
              {product.code}
            </p>
          </div>
          {!presetProductId ? (
            <Button variant="ghost" size="sm" onClick={() => setProductId('')}>
              {fa.actions.clear}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="mb-4">
          <div className="relative">
            <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-5 text-crate" />
            <Input
              autoFocus
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder={fa.stock.pickProduct}
              className="ps-10"
            />
          </div>
          {term.trim() && results.length === 0 ? (
            <p className="mt-2 text-crate">{fa.empty.search}</p>
          ) : null}
          {results.length > 0 ? (
            <ul className="mt-2 max-h-72 overflow-y-auto overscroll-contain rounded-input border border-line bg-paper">
              {results.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setProductId(item.id);
                      setTerm('');
                    }}
                    className="flex min-h-16 w-full items-center gap-3 border-b border-line px-3 text-start last:border-b-0"
                  >
                    <ProductThumb productId={item.id} />
                    <span className="min-w-0 flex-1 truncate text-ink">{item.name}</span>
                    <span dir="ltr" className="text-[0.8rem] text-crate">
                      {item.code}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      <div className="mb-4">
        <Label htmlFor="location">
          {op === 'transfer' ? fa.stock.fromLocation : fa.stock.location}
        </Label>
        <Select
          id="location"
          value={locationId}
          onValueChange={setLocationId}
          options={locations.map((l) => ({ value: l.id, label: l.name }))}
        />
        {op !== 'transfer' && currentQty != null ? (
          <p className="mt-1 text-[0.8rem] text-crate">
            موجودی فعلی: <span className="tnum">{formatQty(currentQty)}</span>
          </p>
        ) : null}
      </div>

      {op === 'transfer' ? (
        <div className="mb-4">
          <Label htmlFor="toLocation">{fa.stock.toLocation}</Label>
          <Select
            id="toLocation"
            value={toLocationId}
            onValueChange={setToLocationId}
            options={locations.map((l) => ({ value: l.id, label: l.name }))}
          />
        </div>
      ) : null}

      {op === 'adjust' ? (
        <div className="mb-4 rounded-input border border-line bg-paper p-4">
          <Label htmlFor="targetQty">{fa.stock.adjustTarget}</Label>
          <Input
            id="targetQty"
            inputMode="numeric"
            value={targetQty}
            onChange={(event) => setTargetQty(event.target.value)}
            placeholder="۰"
          />
          <p className="mt-2 text-[0.8rem] text-crate">{fa.stock.adjustHelp}</p>
        </div>
      ) : (
        <div className="mb-4 rounded-input border border-line bg-paper p-4">
          <QuantityInput
            value={qty}
            onChange={setQty}
            packSize={product?.packSize ?? 1}
            packLabel={product?.packLabel ?? fa.units.carton}
          />
        </div>
      )}

      <div className="mb-6">
        <Label htmlFor="note">{fa.stock.reason}</Label>
        <Textarea id="note" value={note} onChange={(event) => setNote(event.target.value)} className="min-h-16" />
      </div>

      <div className="flex gap-2">
        <Button block disabled={busy || !product} onClick={() => void submit()}>
          {OP_TITLES[op] ?? fa.stock.receive}
        </Button>
        <Button variant="secondary" onClick={() => navigate(-1)}>
          {fa.actions.cancel}
        </Button>
      </div>

      {!product && !term.trim() ? <EmptyState message={fa.stock.pickProduct} /> : null}
    </div>
  );
}
