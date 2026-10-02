import { CheckCircle2, FileSpreadsheet, Undo2, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/input';
import { Panel } from '@/components/common/Kpi';
import { Select } from '@/components/ui/misc';
import { listLocations } from '@/db/repos';
import type { ID, SavedImportMapping } from '@/db/types';
import { formatQty } from '@/domain/format';
import { fa } from '@/i18n/fa';
import { toastError, toastSuccess } from '@/lib/toast';
import { ImportReview, type ImportSummary } from './ImportReview';
import { findSavedMapping, rememberMapping, toColumnMap } from './mappingMemory';
import {
  IMPORT_FIELDS,
  FIELD_LABELS,
  buildContext,
  commitRows,
  guessMap,
  prepareRows,
  type ColumnMap,
  type CommitResult,
  type ImportContext,
  type ImportField,
  type ImportMode,
  type PreparedRow,
} from './importer';
import { FileUnreadableError, readTableFile, type Row } from './spreadsheet';
import { confirmAndUndoImport } from './undoImport';

type Step = 'pick' | 'map' | 'review' | 'done';

export function ImportWizard() {
  const [step, setStep] = useState<Step>('pick');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [map, setMap] = useState<ColumnMap>({});
  const [mode, setMode] = useState<ImportMode>('full');
  const [restored, setRestored] = useState<SavedImportMapping | null>(null);
  const [context, setContext] = useState<ImportContext | null>(null);
  const [prepared, setPrepared] = useState<PreparedRow[]>([]);
  const [defaultLocationId, setDefaultLocationId] = useState('');
  const [updateExistingStock, setUpdateExistingStock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [batchId, setBatchId] = useState<ID | null>(null);

  const summary = useMemo<ImportSummary>(() => {
    const counts: ImportSummary = { new: 0, update: 0, missing: 0, error: 0 };
    for (const row of prepared) counts[row.action] += 1;
    return counts;
  }, [prepared]);

  const pickFile = async (file: File) => {
    setBusy(true);
    setFileName(file.name);
    try {
      const parsed = await readTableFile(file);
      const [ctx, locations, saved] = await Promise.all([
        buildContext(),
        listLocations(),
        findSavedMapping(parsed.headers),
      ]);
      const locationId = locations[0]?.id ?? '';
      // A company list comes back with the same header row: reuse its mapping and mode.
      const nextMap = saved ? toColumnMap(saved.map) : guessMap(parsed.headers);
      const nextMode: ImportMode = saved?.mode ?? 'full';

      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMap(nextMap);
      setMode(nextMode);
      setRestored(saved ?? null);
      setContext(ctx);
      setDefaultLocationId(locationId);
      setPrepared(
        prepareRows(parsed.rows, nextMap, { ...ctx, defaultLocationId: locationId }, { mode: nextMode }),
      );
      setStep('map');
    } catch (error) {
      toastError(fa.importexport.badFile, error instanceof FileUnreadableError ? undefined : String(error));
    } finally {
      setBusy(false);
    }
  };

  const runDryRun = () => {
    if (!context) return;
    setPrepared(prepareRows(rows, map, { ...context, defaultLocationId }, { mode }));
    setStep('review');
    // Remembered here, not on commit: stage one of a price list may end at the review.
    void rememberMapping({ headers, map, mode, label: fileName }).catch(() => undefined);
  };

  const commit = async () => {
    if (!context) return;
    setBusy(true);
    setProgress(0);
    try {
      const outcome = await commitRows(prepared, {
        updateExistingStock,
        fileName,
        onProgress: (done, total) => setProgress(Math.round((done / Math.max(1, total)) * 100)),
      });
      setResult(outcome);
      setBatchId(outcome.batchId);
      setStep('done');

      const id = outcome.batchId;
      if (id) {
        // The window is short: a wrong file must be revertible while the summary is on screen.
        toast(fa.importexport.commitDone, {
          duration: 10_000,
          action: {
            label: fa.actions.undo,
            onClick: () => {
              void confirmAndUndoImport(id).then((undone) => {
                if (undone) reset();
              });
            },
          },
        });
      } else {
        toastSuccess(fa.importexport.commitDone);
      }
    } catch (error) {
      toastError(fa.errors.title, error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setStep('pick');
    setHeaders([]);
    setRows([]);
    setMap({});
    setMode('full');
    setRestored(null);
    setPrepared([]);
    setResult(null);
    setProgress(0);
    setFileName('');
    setBatchId(null);
    // Back to the safe default: the next file must not inherit a stock update.
    setUpdateExistingStock(false);
  };

  const undo = () => {
    if (!batchId) return;
    void confirmAndUndoImport(batchId).then((undone) => {
      if (undone) reset();
    });
  };

  const pricesMapped = Boolean(map.buy || map.retail || map.wholesale);
  const identityMapped = Boolean(map.name || map.code || map.barcode);
  // A price list may arrive with only codes; a full import must know the name.
  const canDryRun = mode === 'prices' ? pricesMapped && identityMapped : Boolean(map.name);

  return (
    <div>
      {step === 'pick' ? (
        <Panel>
          <p className="mb-3 text-crate">{fa.importexport.pickFile}: .xlsx / .csv</p>
          <input
            id="import-file"
            type="file"
            accept=".xlsx,.xlsm,.csv,text/csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void pickFile(file);
            }}
          />
          <Button asChild disabled={busy}>
            <label htmlFor="import-file" className="cursor-pointer">
              <Upload className="size-5" />
              {fa.importexport.pickFile}
            </label>
          </Button>
        </Panel>
      ) : null}

      {step === 'map' ? (
        <div>
          <p className="mb-3 flex items-center gap-2 text-crate">
            <FileSpreadsheet className="size-5" />
            {formatQty(rows.length)} {fa.common.count} · {headers.length} ستون
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {IMPORT_FIELDS.map((field: ImportField) => (
              <div key={field}>
                <Label htmlFor={`map-${field}`}>{FIELD_LABELS[field]}</Label>
                <Select
                  id={`map-${field}`}
                  value={map[field] ?? ''}
                  onValueChange={(value) => {
                    const next = { ...map };
                    if (value) next[field] = value;
                    else delete next[field];
                    setMap(next);
                  }}
                  allowEmpty
                  emptyLabel="—"
                  options={headers.map((header) => ({ value: header, label: header }))}
                />
              </div>
            ))}
          </div>

          <div className="mt-4">
            <Label htmlFor="import-mode">{fa.importexport.importMode}</Label>
            <Select
              id="import-mode"
              value={mode}
              onValueChange={(value) => setMode(value as ImportMode)}
              options={[
                { value: 'full', label: fa.importexport.modeFull },
                { value: 'prices', label: fa.importexport.modePrices },
              ]}
            />
            <p className="mt-1 text-[0.8rem] text-crate">
              {mode === 'prices' ? fa.importexport.modePricesHint : fa.importexport.modeFullHint}
            </p>
            {mode === 'prices' && !pricesMapped ? (
              <p className="mt-1 text-[0.8rem] text-low">{fa.importexport.modePricesNeedColumn}</p>
            ) : null}
            {mode === 'prices' && !identityMapped ? (
              <p className="mt-1 text-[0.8rem] text-low">{fa.importexport.modePricesNeedIdentity}</p>
            ) : null}
          </div>

          <div className="mt-4">
            <Label htmlFor="default-location">{fa.stock.location}</Label>
            <Select
              id="default-location"
              value={defaultLocationId}
              onValueChange={setDefaultLocationId}
              options={(context?.locations ?? []).map((l) => ({ value: l.id, label: l.name }))}
            />
            {mode === 'full' && map.quantity && !defaultLocationId ? (
              <p className="mt-1 text-[0.8rem] text-low">{fa.importexport.needLocation}</p>
            ) : null}
          </div>

          {restored ? (
            <p className="mt-3 text-[0.8rem] text-ok">
              {fa.importexport.mappingRestored.replace(
                '{label}',
                restored.label || fa.importexport.fileNameUnnamed,
              )}
            </p>
          ) : null}

          <div className="mt-4 flex gap-2">
            <Button disabled={!canDryRun || busy} onClick={runDryRun}>
              {fa.importexport.dryRun}
            </Button>
            <Button variant="secondary" onClick={reset}>
              {fa.actions.cancel}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 'review' ? (
        <ImportReview
          mode={mode}
          prepared={prepared}
          summary={summary}
          updateExistingStock={updateExistingStock}
          onUpdateExistingStock={setUpdateExistingStock}
          busy={busy}
          progress={progress}
          onCommit={() => void commit()}
          onBack={() => setStep('map')}
        />
      ) : null}

      {step === 'done' && result ? (
        <Panel>
          <p className="mb-3 flex items-center gap-2 text-ok">
            <CheckCircle2 className="size-5" />
            {fa.importexport.commitDone}
          </p>
          <ul className="text-crate">
            <li>
              {fa.importexport.newRows}: <span className="tnum text-ink">{formatQty(result.created)}</span>
            </li>
            <li>
              {fa.importexport.updatedRows}: <span className="tnum text-ink">{formatQty(result.updated)}</span>
            </li>
            <li>
              {fa.importexport.errorRows}: <span className="tnum text-ink">{formatQty(result.failed)}</span>
            </li>
            {mode === 'prices' ? (
              <li>
                {fa.importexport.missingRows}:{' '}
                <span className="tnum text-ink">{formatQty(summary.missing)}</span>
              </li>
            ) : null}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            {batchId ? (
              <Button variant="secondary" onClick={undo}>
                <Undo2 className="size-4" />
                {fa.importexport.undoImport}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={reset}>
              {fa.actions.done}
            </Button>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
