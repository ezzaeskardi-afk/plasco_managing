import { useLiveQuery } from 'dexie-react-hooks';
import { ClipboardList, Minus, Plus, ScanLine, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { StockStack } from '@/components/common/StockStack';
import { StepButton } from '@/components/common/QuantityInput';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { EmptyState, Select, Switch } from '@/components/ui/misc';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { applyStockTake, revertStockTake } from '@/db/stocktake';
import { suggestImportUndoRemainder } from '@/features/importexport/undoImport';
import { listLocations, listProducts, listStockLevels } from '@/db/repos';
import { db } from '@/db/dexie';
import type { ID, Product, StockTake, StockTakeItem } from '@/db/types';
import { matchProductByBarcode } from '@/domain/barcode';
import { displayProductName, formatJalali, formatQty } from '@/domain/format';
import { clampInt, parseIntegerInput } from '@/domain/numbers';
import { buildSearchIndex, searchIndex } from '@/domain/search';
import { fa } from '@/i18n/fa';
import { MoneyText } from '@/components/common/Kpi';
import { newId } from '@/lib/id';
import { toastError, toastSuccess, toastUndo } from '@/lib/toast';
import { Scanner } from '@/features/scan/Scanner';
import { useSettings } from '@/app/settings-context';

export function StockTakeListPage() {
  const navigate = useNavigate();
  const sessions = useLiveQuery(() => db.stockTakes.toArray(), []);
  const locations = useLiveQuery(() => listLocations(), []);
  const locationMap = useMemo(
    () => new Map((locations ?? []).map((l) => [l.id, l.name])),
    [locations],
  );

  return (
    <div className="mx-auto max-w-[860px] pb-10">
      <Button className="mb-4" onClick={() => navigate('/stocktake/new')}>
        <Plus className="size-5" />
        {fa.stocktake.start}
      </Button>

      {!sessions || sessions.length === 0 ? (
        <EmptyState message={fa.empty.stockTakes} />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-input border border-line bg-paper">
          {[...sessions]
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((session) => (
              <li key={session.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/stocktake/${session.id}`)}
                  className="flex min-h-16 w-full items-center gap-3 px-3 text-start"
                >
                  <ClipboardList className="size-5 shrink-0 text-basin" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-ink">
                      {locationMap.get(session.locationId) ?? fa.common.unknown}
                    </p>
                    <p className="text-[0.8rem] text-crate">{formatJalali(session.createdAt)}</p>
                  </div>
                  <span className="text-[0.9rem] text-crate">
                    {session.status === 'open'
                      ? fa.stocktake.open
                      : session.status === 'applied'
                        ? fa.stocktake.applied
                        : fa.stocktake.cancelled}
                  </span>
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

export function StockTakeNewPage() {
  const navigate = useNavigate();
  const locations = useLiveQuery(() => listLocations(), []);
  const [locationId, setLocationId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!locationId && locations && locations.length > 0) setLocationId(locations[0]!.id);
  }, [locations, locationId]);

  const start = async () => {
    if (!locationId) return;
    setBusy(true);
    try {
      const at = Date.now();
      const session: StockTake = {
        id: newId(),
        locationId,
        status: 'open',
        createdAt: at,
        updatedAt: at,
      };
      await db.stockTakes.add(session);
      navigate(`/stocktake/${session.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[600px] pb-10">
      <h2 className="mb-4 text-title font-bold text-ink">{fa.stocktake.start}</h2>
      <div className="mb-4">
        <Label htmlFor="location">{fa.stocktake.location}</Label>
        <Select
          id="location"
          value={locationId}
          onValueChange={setLocationId}
          options={(locations ?? []).map((l) => ({ value: l.id, label: l.name }))}
        />
      </div>
      <div className="flex gap-2">
        <Button className="flex-1" disabled={busy || !locationId} onClick={() => void start()}>
          {fa.stocktake.start}
        </Button>
        <Button variant="secondary" onClick={() => navigate('/stocktake')}>
          {fa.actions.cancel}
        </Button>
      </div>
    </div>
  );
}

function useCounted(sessionId: ID | undefined) {
  return useLiveQuery(
    () =>
      sessionId
        ? db.stockTakeItems.where('stockTakeId').equals(sessionId).toArray()
        : Promise.resolve<StockTakeItem[]>([]),
    [sessionId],
  );
}

export function StockTakeCountPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const session = useLiveQuery<StockTake | undefined>(
    () => (id ? db.stockTakes.get(id) : Promise.resolve(undefined)),
    [id],
  );
  const products = useLiveQuery(() => listProducts(), []);
  const levels = useLiveQuery(() => listStockLevels(), []);
  const items = useCounted(id);
  const [term, setTerm] = useState('');
  const [openId, setOpenId] = useState<ID | null>(null);
  const [draft, setDraft] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [scanTarget, setScanTarget] = useState<Product | null>(null);
  const [scanDraft, setScanDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const countedMap = useMemo(
    () => new Map((items ?? []).map((item) => [item.productId, item])),
    [items],
  );

  // One pass over the levels: later lookups must never scan the whole table.
  const levelIndex = useMemo(() => {
    const map = new Map<ID, { qty: number; bin: string }>();
    if (!session) return map;
    for (const level of levels ?? []) {
      if (level.locationId !== session.locationId) continue;
      map.set(level.productId, { qty: level.qty, bin: level.bin ?? '' });
    }
    return map;
  }, [levels, session]);

  const systemQty = useMemo(
    () => new Map(Array.from(levelIndex, ([id, value]) => [id, value.qty])),
    [levelIndex],
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

  const rows = useMemo(() => {
    const all = products ?? [];
    const ordered = [...all].sort((a, b) => {
      const binA = levelIndex.get(a.id)?.bin ?? '';
      const binB = levelIndex.get(b.id)?.bin ?? '';
      return binA.localeCompare(binB, 'fa') || a.nameN.localeCompare(b.nameN, 'fa');
    });
    if (!term.trim()) return ordered;
    const map = new Map(all.map((p) => [p.id, p]));
    return searchIndex(index, term, 500)
      .map((pid) => map.get(pid))
      .filter((p) => p != null);
  }, [products, term, index, levelIndex]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 64,
    overscan: 8,
  });

  if (!session) return <p className="text-crate">{fa.common.loading}</p>;

  if (session.status !== 'open') {
    return (
      <div className="p-6 text-center">
        <p className="mb-4 text-crate">{fa.stocktake.applyBlocked}</p>
        <Button onClick={() => navigate(`/stocktake/${session.id}/review`)}>
          {fa.stocktake.review}
        </Button>
      </div>
    );
  }

  const saveCount = async (productId: ID, counted: number) => {
    if (saving) return;
    setSaving(true);
    try {
      await upsertCount(productId, clampInt(counted, 0, 9_999_999));
      setOpenId(null);
      setDraft('');
    } finally {
      setSaving(false);
    }
  };

  // Reads the live row instead of the possibly-stale live-query map so a double
  // tap (or a fast scan loop) can never insert two items for one product.
  const upsertCount = async (productId: ID, counted: number) => {
    const existing = await db.stockTakeItems
      .where('[stockTakeId+productId]')
      .equals([session.id, productId])
      .first();
    const item: StockTakeItem = {
      id: existing?.id ?? newId(),
      stockTakeId: session.id,
      productId,
      counted,
      systemQtyAtCount: systemQty.get(productId) ?? 0,
      at: Date.now(),
    };
    await db.stockTakeItems.put(item);
  };

  const handleScan = (code: string) => {
    setScanOpen(false);
    if (!products) return;
    const found = matchProductByBarcode(products, code);
    if (!found) {
      toastError(`${fa.scan.notFound} ${code}`);
      return;
    }
    const existing = countedMap.get(found.id);
    setScanTarget(found);
    setScanDraft(existing ? String(existing.counted) : '');
  };

  const closeScanTarget = () => {
    setScanTarget(null);
    setScanDraft('');
  };

  // Same behavior as the phone: an empty box removes the count silently, junk
  // keeps the dialog open, and «ثبت و بارکد بعدی» hands the camera back.
  const saveScan = async (next: boolean) => {
    const target = scanTarget;
    if (!target || saving) return;
    setSaving(true);
    try {
      if (!scanDraft.trim()) {
        const existing = await db.stockTakeItems
          .where('[stockTakeId+productId]')
          .equals([session.id, target.id])
          .first();
        if (existing) await db.stockTakeItems.delete(existing.id);
        closeScanTarget();
        if (next) setScanOpen(true);
        return;
      }
      const parsed = parseIntegerInput(scanDraft);
      if (parsed == null || parsed < 0) {
        toastError(fa.stock.enterQty);
        return;
      }
      // Same sane ceiling the phone's Int input implicitly has.
      await upsertCount(target.id, clampInt(parsed, 0, 9_999_999));
      toastSuccess(fa.stocktake.scanned);
      closeScanTarget();
      if (next) setScanOpen(true);
    } finally {
      setSaving(false);
    }
  };

  const existingScanCount = scanTarget ? countedMap.get(scanTarget.id) : undefined;

  // Same «−۱ / +۱» steppers as the phone's scan dialog; the minus clamps at zero.
  const bumpScan = (delta: number) => {
    const value = Math.max(0, (parseIntegerInput(scanDraft) ?? 0) + delta);
    setScanDraft(String(value));
  };

  return (
    <div className="mx-auto max-w-[860px] pb-10">
      <div className="mb-3">
        <p className="text-crate">
          {fa.stocktake.progress}: <span className="tnum font-bold text-ink">{formatQty(countedMap.size)}</span> /{' '}
          <span className="tnum">{formatQty(products?.length ?? 0)}</span>
        </p>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-frost">
          <div
            className="h-full rounded-full bg-basin"
            style={{ width: `${((countedMap.size / Math.max(1, products?.length ?? 1)) * 100).toFixed(1)}%` }}
          />
        </div>
      </div>

      <div className="mb-3 flex items-start gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-5 text-crate" />
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={fa.stocktake.searchPlaceholder}
            className="ps-10"
          />
        </div>
        <Button variant="secondary" disabled={!products} onClick={() => setScanOpen(true)}>
          <ScanLine className="size-5" />
          {fa.scan.button}
        </Button>
      </div>

      {/* Virtualized: a location can hold thousands of products. */}
      <div
        ref={scrollRef}
        className="h-[60dvh] overflow-y-auto overscroll-contain rounded-input border border-line bg-paper"
      >
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const product = rows[item.index];
            if (!product) return null;
            const counted = countedMap.get(product.id);
            const system = systemQty.get(product.id) ?? 0;
            return (
            <div
              key={item.key}
              data-index={item.index}
              ref={virtualizer.measureElement}
              className="absolute inset-x-0 top-0 border-b border-line bg-paper"
              style={{ transform: `translateY(${item.start}px)` }}
            >
              <div className="flex min-h-16 items-center gap-3 px-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-ink">{displayProductName(product.name)}</p>
                  <p className="text-[0.8rem] text-crate">
                    {fa.common.system}: <span className="tnum">{formatQty(system)}</span>
                    {counted ? (
                      <>
                        {' · '}
                        {fa.stocktake.counted}:{' '}
                        <span className="tnum font-bold text-ink">{formatQty(counted.counted)}</span>
                      </>
                    ) : null}
                  </p>
                </div>
                <StockStack total={counted ? counted.counted : system} minStock={product.minStock} />
                <Button
                  size="sm"
                  variant={counted ? 'secondary' : 'default'}
                  onClick={() => {
                    setOpenId(openId === product.id ? null : product.id);
                    setDraft(counted ? String(counted.counted) : '');
                  }}
                >
                  {counted ? fa.actions.edit : fa.stock.count}
                </Button>
              </div>
              {openId === product.id ? (
                <div className="flex items-end gap-2 bg-frost p-3">
                  <div className="flex-1">
                    <Label htmlFor={`count-${product.id}`}>{fa.common.quantity}</Label>
                    <Input
                      id={`count-${product.id}`}
                      inputMode="numeric"
                      autoFocus
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder="۰"
                    />
                  </div>
                  <Button
                    disabled={saving}
                    onClick={() => {
                      const value = parseIntegerInput(draft);
                      if (value == null || value < 0) {
                        toastError(fa.stock.enterQty);
                        return;
                      }
                      void saveCount(product.id, value);
                    }}
                  >
                    {fa.actions.save}
                  </Button>
                </div>
              ) : null}
            </div>
            );
          })}
        </div>
      </div>

      {/* Sticky above the bottom nav: on a phone in landscape the actions would
          otherwise sit below the fold. */}
      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom)+0.5rem)] z-10 mt-4 flex flex-wrap gap-2 rounded-input border border-line bg-frost p-2 lg:static lg:border-0 lg:bg-transparent lg:p-0">
        <Button onClick={() => navigate(`/stocktake/${session.id}/review`)}>
          {fa.stocktake.review}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            if (!window.confirm(fa.stocktake.discardConfirm)) return;
            const reopen = () =>
              db.stockTakes.update(session.id, { status: 'open', updatedAt: Date.now() });
            void db.stockTakes
              .update(session.id, { status: 'cancelled', updatedAt: Date.now() })
              .then(() => {
                toastUndo(fa.stocktake.discardedToast, reopen);
                navigate('/stocktake');
              })
              .catch((error: unknown) =>
                toastError(fa.errors.title, error instanceof Error ? error.message : undefined),
              );
          }}
        >
          {fa.stocktake.discard}
        </Button>
      </div>

      {scanTarget ? (
        <Sheet open onOpenChange={(next) => (next ? undefined : closeScanTarget())}>
          <SheetContent title={displayProductName(scanTarget.name)}>
            <p dir="ltr" className="text-start text-[0.8rem] text-crate">
              {scanTarget.code}
            </p>
            <p className="mt-1 text-[0.8rem] text-crate">
              {fa.common.pieces} در این مکان:{' '}
              <span className="tnum">{formatQty(systemQty.get(scanTarget.id) ?? 0)}</span>
            </p>
            {existingScanCount ? (
              <p className="mt-1 text-[0.8rem] text-basin">
                {fa.stocktake.countedBefore.replace('{count}', formatQty(existingScanCount.counted))}
              </p>
            ) : null}
            <p className="mt-2 text-[0.8rem] text-crate">{fa.stocktake.scanHint}</p>
            <div className="mt-3">
              <Label htmlFor="scanCount">{fa.stocktake.counted}</Label>
              <Input
                id="scanCount"
                inputMode="numeric"
                autoFocus
                value={scanDraft}
                onChange={(event) => setScanDraft(event.target.value)}
                placeholder="۰"
              />
              <div className="mt-2 flex items-center gap-2">
                <StepButton label={fa.stocktake.oneLess} onClick={() => bumpScan(-1)}>
                  <Minus className="size-4" />
                  <span className="tnum">۱</span>
                </StepButton>
                <StepButton label={fa.stocktake.oneMore} onClick={() => bumpScan(1)}>
                  <Plus className="size-4" />
                  <span className="tnum">۱</span>
                </StepButton>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button className="flex-1" disabled={saving} onClick={() => void saveScan(false)}>
                {fa.actions.save}
              </Button>
              <Button variant="secondary" disabled={saving} onClick={() => void saveScan(true)}>
                {fa.stocktake.scanNext}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      ) : null}

      <Scanner open={scanOpen} onClose={() => setScanOpen(false)} onResult={handleScan} />
    </div>
  );
}

export function StockTakeReviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const session = useLiveQuery<StockTake | undefined>(
    () => (id ? db.stockTakes.get(id) : Promise.resolve(undefined)),
    [id],
  );
  const products = useLiveQuery(() => listProducts(), []);
  const levels = useLiveQuery(() => listStockLevels(), []);
  const items = useCounted(id);
  const [treatUncountedAsZero, setTreatUncountedAsZero] = useState(false);
  const [busy, setBusy] = useState(false);
  const { costVisible } = useSettings();

  const levelIndex = useMemo(() => {
    const map = new Map<ID, number>();
    if (!session) return map;
    for (const level of levels ?? []) {
      if (level.locationId !== session.locationId) continue;
      map.set(level.productId, level.qty);
    }
    return map;
  }, [levels, session]);

  const currentQtyOf = (productId: ID) => levelIndex.get(productId) ?? 0;

  const rows = useMemo(() => {
    if (!session) return [];
    const map = new Map((products ?? []).map((p) => [p.id, p]));
    const list = (items ?? [])
      .map((item) => {
        const product = map.get(item.productId);
        const current = levelIndex.get(item.productId) ?? 0;
        const delta = item.counted - current;
        return { item, product, current, delta, value: Math.abs(delta) * (product?.buyPrice ?? 0) };
      })
      .filter((row) => row.product);
    // Financial impact sorts by cost, which the lock hides; a locked device sees
    // the biggest piece differences first instead (the values are masked anyway).
    return list.sort(
      costVisible
        ? (a, b) => b.value - a.value
        : (a, b) => Math.abs(b.delta) - Math.abs(a.delta),
    );
  }, [session, items, products, levelIndex, costVisible]);

  if (!session) return <p className="text-crate">{fa.common.loading}</p>;
  if (session.status !== 'open') {
    const revert = async () => {
      if (!window.confirm(fa.stocktake.revertConfirm)) return;
      try {
        await revertStockTake(session.id);
        toastSuccess(fa.stocktake.revertedToast);
        // Reverting puts pieces back: a half-reverted import may now finish.
        void suggestImportUndoRemainder();
        navigate('/stocktake');
      } catch (error) {
        toastError(fa.errors.title, error instanceof Error ? error.message : undefined);
      }
    };
    return (
      <div className="p-6 text-center text-crate">
        <p>{session.status === 'applied' ? fa.stocktake.applyBlocked : fa.stocktake.cancelledBlocked}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {session.status === 'applied' ? (
            <Button variant="destructive" onClick={() => void revert()}>
              {fa.stocktake.revert}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => navigate('/stocktake')}>
            {fa.stocktake.title}
          </Button>
        </div>
      </div>
    );
  }

  const differences = rows.filter((row) => row.delta !== 0);
  const surplusPieces = differences.reduce((sum, row) => sum + Math.max(0, row.delta), 0);
  const shortagePieces = differences.reduce((sum, row) => sum + Math.min(0, row.delta), 0);
  const surplusValue = differences.reduce((sum, row) => sum + Math.max(0, row.delta) * (row.product?.buyPrice ?? 0), 0);
  const shortageValue = differences.reduce((sum, row) => sum + Math.min(0, row.delta) * (row.product?.buyPrice ?? 0), 0);
  const countedIds = new Set((items ?? []).map((i) => i.productId));
  const uncounted = (products ?? []).filter((p) => !countedIds.has(p.id));

  const plannedChanges =
    differences.length +
    (treatUncountedAsZero ? uncounted.filter((product) => currentQtyOf(product.id) !== 0).length : 0);

  const apply = async () => {
    // Applying flips the session to a closed state, so never do it silently.
    const confirmed =
      plannedChanges === 0
        ? window.confirm(fa.stocktake.applyEmptyConfirm)
        : window.confirm(fa.stocktake.applyConfirm.replace('{count}', formatQty(plannedChanges)));
    if (!confirmed) return;

    setBusy(true);
    try {
      const result = await applyStockTake(session.id, { treatUncountedAsZero });
      if (result.movements.length > 0) {
        toastUndo(fa.stocktake.appliedToast, async () => {
          await revertStockTake(session.id);
          void suggestImportUndoRemainder();
        });
      } else {
        toastSuccess(fa.stocktake.appliedToast);
      }
      // Surplus counts add pieces: the same offer any stock-in makes.
      void suggestImportUndoRemainder();
      navigate('/stocktake');
    } catch (error) {
      toastError(fa.errors.title, error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[860px] pb-10">
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={fa.stocktake.counted} value={formatQty(items?.length ?? 0)} />
        <Stat label={fa.stocktake.difference} value={formatQty(differences.length)} />
        <Stat label={fa.stocktake.surplus} value={formatQty(surplusPieces)} />
        <Stat label={fa.stocktake.shortage} value={formatQty(Math.abs(shortagePieces))} />
      </div>

      {differences.length === 0 ? (
        <p className="mb-4 text-crate">{fa.stocktake.noDifferences}</p>
      ) : (
        <ul className="mb-4 max-h-[55dvh] divide-y divide-line overflow-y-auto overscroll-contain rounded-input border border-line bg-paper">
          {differences.map((row) => (
            <li key={row.item.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-ink">
                  {row.product ? displayProductName(row.product.name) : null}
                </p>
                <p className="text-[0.8rem] text-crate">
                  {fa.common.system}: {formatQty(row.current)} → {fa.stocktake.counted}: {formatQty(row.item.counted)}
                </p>
              </div>
              <span
                className={`tnum font-bold ${row.delta > 0 ? 'text-ok' : row.delta < 0 ? 'text-out' : 'text-crate'}`}
              >
                {row.delta > 0 ? '+' : '−'}
                {formatQty(Math.abs(row.delta))}
              </span>
              <MoneyText value={row.value} className="text-[0.8rem] text-crate" compact />
            </li>
          ))}
        </ul>
      )}

      {uncounted.length > 0 ? (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-input border border-line bg-paper p-3">
          <div>
            <p className="text-ink">{fa.stocktake.treatUncountedAsZero}</p>
            <p className="text-[0.8rem] text-crate">
              {formatQty(uncounted.length)} {fa.stocktake.uncounted}
            </p>
          </div>
          <Switch
            checked={treatUncountedAsZero}
            onCheckedChange={(value) => {
              if (value && !window.confirm(fa.stocktake.treatUncountedConfirm)) return;
              setTreatUncountedAsZero(value);
            }}
            label={fa.stocktake.treatUncountedAsZero}
          />
        </div>
      ) : null}

      {surplusValue !== 0 || shortageValue !== 0 ? (
        <p className="mb-4 text-[0.8rem] text-crate">
          {fa.stocktake.impact}: <MoneyText value={surplusValue + shortageValue} compact />
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button className="flex-1" disabled={busy} onClick={() => void apply()}>
          {fa.stocktake.apply}
        </Button>
        <Button variant="secondary" onClick={() => navigate(`/stocktake/${session.id}`)}>
          {fa.actions.back}
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-input border border-line bg-paper p-3">
      <p className="text-[0.8rem] text-crate">{label}</p>
      <p className="tnum font-bold text-ink">{value}</p>
    </div>
  );
}
