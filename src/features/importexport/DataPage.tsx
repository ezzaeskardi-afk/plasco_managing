import { Database, Download, FileSpreadsheet, HardDrive, History, Undo2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Panel } from '@/components/common/Kpi';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/input';
import { Select } from '@/components/ui/misc';
import { createBackup, restoreBackup, BackupInvalidError } from '@/db/backup';
import { listImportBatches } from '@/db/imports';
import { listBrands, listCategories, listLocations, listProducts, listStockLevels } from '@/db/repos';
import { readPersistState, requestPersist, type PersistState } from '@/app/persistStorage';
import { formatJalali, formatQty } from '@/domain/format';
import { fa } from '@/i18n/fa';
import { toastError, toastSuccess } from '@/lib/toast';
import { useSettings } from '@/app/settings-context';
import { ImportWizard } from './ImportWizard';
import { buildCsv, buildWorkbook, saveBlob } from './spreadsheet';
import { confirmAndUndoImport } from './undoImport';

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DataPage() {
  const { settings, update } = useSettings();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'replace' | 'merge'>('replace');
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  const [persistState, setPersistState] = useState<PersistState | null>(null);

  const askPersist = async () => {
    const state = await requestPersist();
    setPersistState(state);
    if (state === 'granted') toastSuccess(fa.settings.persistDone);
  };
  const batches = useLiveQuery(() => listImportBatches(5), []);

  useEffect(() => {
    void (async () => {
      if (navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate();
        setUsage({ used: estimate.usage ?? 0, quota: estimate.quota ?? 0 });
      }
      setPersistState(await readPersistState());
    })();
  }, []);

  const exportData = async (kind: 'xlsx' | 'csv') => {
    setBusy(true);
    try {
      const [products, levels, locations, brands, categories] = await Promise.all([
        listProducts(),
        listStockLevels(),
        listLocations(),
        listBrands(),
        listCategories(),
      ]);
      const brandMap = new Map(brands.map((b) => [b.id, b.name]));
      const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
      const locationMap = new Map(locations.map((l) => [l.id, l.name]));
      const totals = new Map<string, number>();
      for (const level of levels) totals.set(level.productId, (totals.get(level.productId) ?? 0) + level.qty);

      const productHeader = [
        'کد',
        'نام',
        'نسخه',
        'برند',
        'دسته',
        'بارکد',
        'تعداد در بسته',
        'قیمت خرید',
        'قیمت خرده',
        'قیمت عمده',
        'حداقل موجودی',
        'موجودی کل',
        'ارزش خرید',
      ];
      const productRows = products.map((product) => [
        product.code,
        product.name,
        product.variant ?? '',
        product.brandId ? (brandMap.get(product.brandId) ?? '') : '',
        product.categoryId ? (categoryMap.get(product.categoryId) ?? '') : '',
        product.barcodes.join(' '),
        product.packSize,
        product.buyPrice,
        product.retailPrice,
        product.wholesalePrice ?? '',
        product.minStock ?? '',
        totals.get(product.id) ?? 0,
        (totals.get(product.id) ?? 0) * product.buyPrice,
      ]);

      const levelHeader = ['کد کالا', 'نام کالا', 'مکان', 'قفسه', 'موجودی'];
      const productMap = new Map(products.map((p) => [p.id, p]));
      const levelRows = levels
        .filter((level) => level.qty !== 0)
        .map((level) => [
          productMap.get(level.productId)?.code ?? '',
          productMap.get(level.productId)?.name ?? '',
          locationMap.get(level.locationId) ?? '',
          level.bin ?? '',
          level.qty,
        ]);

      if (kind === 'xlsx') {
        const blob = await buildWorkbook([
          { name: 'کالاها', header: productHeader, rows: productRows },
          { name: 'موجودی', header: levelHeader, rows: levelRows },
        ]);
        await saveBlob(blob, `plasco-products-${stamp()}.xlsx`);
      } else {
        const blob = buildCsv(productHeader, productRows);
        await saveBlob(blob, `plasco-products-${stamp()}.csv`);
      }
      toastSuccess(fa.importexport.exportExcel);
    } catch (error) {
      toastError(fa.errors.title, error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const backup = async () => {
    setBusy(true);
    try {
      const { blob, summary } = await createBackup();
      await saveBlob(blob, `plasco-backup-${stamp()}.zip`);
      await update({ lastBackupAt: Date.now() });
      toastSuccess(fa.importexport.backupCreate, `${summary.products} کالا · ${Math.round(summary.bytes / 1024)} KB`);
    } catch (error) {
      toastError(fa.errors.backupFailed, error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const restore = async (file: File) => {
    if (mode === 'replace' && !window.confirm(fa.importexport.replaceConfirm)) return;
    setBusy(true);
    try {
      const outcome = await restoreBackup(file, mode);
      toastSuccess(fa.importexport.restoreDone, `${outcome.products} کالا · ${outcome.movements} حرکت`);
      if (outcome.renumbered > 0) {
        toastSuccess(
          fa.importexport.renumbered.replace('{count}', formatQty(outcome.renumbered)),
        );
      }
    } catch (error) {
      toastError(
        fa.importexport.invalidBackup,
        error instanceof BackupInvalidError ? error.detail : error instanceof Error ? error.message : undefined,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[860px] pb-10">
      <Panel className="mb-6">
        <h2 className="mb-3 flex items-center gap-2 text-title font-bold text-ink">
          <FileSpreadsheet className="size-5 text-basin" />
          {fa.importexport.importTitle}
        </h2>
        <ImportWizard />
      </Panel>

      <Panel className="mb-6">
        <h2 className="mb-3 flex items-center gap-2 text-title font-bold text-ink">
          <History className="size-5 text-basin" />
          {fa.importexport.historyTitle}
        </h2>
        {!batches || batches.length === 0 ? (
          <p className="text-crate">{fa.importexport.historyEmpty}</p>
        ) : (
          <ul className="space-y-2">
            {batches.map((batch) => (
              <li
                key={batch.id}
                className="flex flex-wrap items-center gap-2 rounded-input border border-line bg-paper p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-ink">
                    {batch.fileName || fa.importexport.fileNameUnnamed}
                  </p>
                  <p className="text-[0.8rem] text-crate">
                    {formatJalali(batch.createdAt)} ·{' '}
                    {fa.importexport.historyLine
                      .replace('{created}', formatQty(batch.created))
                      .replace('{updated}', formatQty(batch.updated))
                      .replace('{movements}', formatQty(batch.movements))}
                  </p>
                </div>
                {batch.undoneAt ? (
                  <span className="text-[0.8rem] text-crate">{fa.importexport.historyUndone}</span>
                ) : (
                  <div className="flex flex-col items-end gap-1">
                    {batch.partialUndoAt ? (
                      <span className="text-[0.8rem] text-low">
                        {fa.importexport.historyPartial.replace('{count}', formatQty(batch.partialRows ?? 0))}
                      </span>
                    ) : null}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void confirmAndUndoImport(batch.id)}
                    >
                      <Undo2 className="size-4" />
                      {batch.partialUndoAt ? fa.importexport.undoRemaining : fa.actions.undo}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel className="mb-6">
        <h2 className="mb-3 flex items-center gap-2 text-title font-bold text-ink">
          <Download className="size-5 text-basin" />
          اکسپورت
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => void exportData('xlsx')}>
            {fa.importexport.exportExcel}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void exportData('csv')}>
            {fa.importexport.exportCsv}
          </Button>
        </div>
      </Panel>

      <Panel className="mb-6">
        <h2 className="mb-3 flex items-center gap-2 text-title font-bold text-ink">
          <Database className="size-5 text-basin" />
          {fa.importexport.backupTitle}
        </h2>
        <p className="mb-3 text-crate">{fa.importexport.backupHint}</p>
        <p className="mb-3 text-[0.9rem] text-crate">
          {fa.importexport.lastBackup}:{' '}
          {settings.lastBackupAt ? formatJalali(settings.lastBackupAt) : fa.importexport.never}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void backup()}>
            <Download className="size-5" />
            {fa.importexport.backupCreate}
          </Button>
        </div>

        <div className="mt-6 border-t border-line pt-4">
          <Label>{fa.importexport.restoreMode}</Label>
          <Select
            value={mode}
            onValueChange={(value) => setMode(value as 'replace' | 'merge')}
            options={[
              { value: 'merge', label: fa.importexport.modeMerge },
              { value: 'replace', label: fa.importexport.modeReplace },
            ]}
          />
          {mode === 'replace' ? (
            <p className="mt-1 text-[0.8rem] text-low">{fa.importexport.replaceHint}</p>
          ) : null}
          <input
            id="restore-file"
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void restore(file);
              event.target.value = '';
            }}
          />
          <Button asChild variant="secondary" className="mt-3" disabled={busy}>
            <label htmlFor="restore-file" className="cursor-pointer">
              <Upload className="size-5" />
              {fa.importexport.restore}
            </label>
          </Button>
        </div>
      </Panel>

      <Panel>
        <h2 className="mb-3 flex items-center gap-2 text-title font-bold text-ink">
          <HardDrive className="size-5 text-basin" />
          {fa.settings.storage}
        </h2>
        {usage ? (
          <p className="tnum text-crate">
            {formatQty(Math.round(usage.used / 1024 / 1024))} MB ·{' '}
            {formatQty(Math.round(usage.quota / 1024 / 1024))} MB
          </p>
        ) : (
          <p className="text-crate">{fa.common.unknown}</p>
        )}
        {persistState === 'best-effort' ? (
          <Button variant="secondary" className="mt-3" onClick={() => void askPersist()}>
            {fa.settings.persist}
          </Button>
        ) : null}
      </Panel>
    </div>
  );
}
