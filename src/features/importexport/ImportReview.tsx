import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/misc';
import { formatQty } from '@/domain/format';
import { fa } from '@/i18n/fa';
import type { ImportMode, PreparedRow } from './importer';

export interface ImportSummary {
  new: number;
  update: number;
  missing: number;
  error: number;
}

interface Props {
  mode: ImportMode;
  prepared: readonly PreparedRow[];
  summary: ImportSummary;
  updateExistingStock: boolean;
  onUpdateExistingStock: (value: boolean) => void;
  busy: boolean;
  progress: number;
  onCommit: () => void;
  onBack: () => void;
}

function rowTone(action: PreparedRow['action']): string {
  if (action === 'error') return 'text-out';
  if (action === 'missing') return 'text-low';
  return action === 'update' ? 'text-basin' : 'text-ok';
}

function rowLabel(row: PreparedRow): string {
  if (row.action === 'error' || row.action === 'missing') return row.reason ?? '';
  return row.action === 'update' ? fa.importexport.updatedRows : fa.importexport.newRows;
}

export function ImportReview({
  mode,
  prepared,
  summary,
  updateExistingStock,
  onUpdateExistingStock,
  busy,
  progress,
  onCommit,
  onBack,
}: Props) {
  return (
    <div>
      <div className="mb-3 grid grid-cols-3 gap-2">
        {mode === 'prices' ? (
          <>
            <Stat label={fa.importexport.updatedRows} value={summary.update} tone="text-basin" />
            <Stat label={fa.importexport.missingRows} value={summary.missing} tone="text-low" />
            <Stat label={fa.importexport.errorRows} value={summary.error} tone="text-out" />
          </>
        ) : (
          <>
            <Stat label={fa.importexport.newRows} value={summary.new} tone="text-ok" />
            <Stat label={fa.importexport.updatedRows} value={summary.update} tone="text-basin" />
            <Stat label={fa.importexport.errorRows} value={summary.error} tone="text-out" />
          </>
        )}
      </div>

      <div className="mb-3 max-h-64 overflow-y-auto overscroll-contain rounded-input border border-line bg-paper">
        {prepared.slice(0, 200).map((row) => (
          <div
            key={row.rowNumber}
            className="flex items-center gap-2 border-b border-line px-3 py-2 last:border-b-0"
          >
            <span className="tnum w-8 shrink-0 text-[0.8rem] text-crate">{row.rowNumber}</span>
            <span className="min-w-0 flex-1 truncate text-ink">{row.name ?? row.reason}</span>
            {row.quantitySkipped ? (
              <span className="text-[0.8rem] text-low">{fa.importexport.quantitySkipped}</span>
            ) : null}
            <span className={`text-[0.8rem] ${rowTone(row.action)}`}>{rowLabel(row)}</span>
          </div>
        ))}
      </div>

      {prepared.length > 200 ? (
        <p className="mb-3 text-[0.8rem] text-crate">{fa.importexport.previewTruncated}</p>
      ) : null}

      {mode === 'prices' ? (
        <p className="mb-3 text-[0.8rem] text-crate">{fa.importexport.modePricesHint}</p>
      ) : (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-input border border-line bg-paper p-3">
          <span className="text-ink">{fa.importexport.updateExistingStock}</span>
          <Switch
            checked={updateExistingStock}
            onCheckedChange={onUpdateExistingStock}
            label={fa.importexport.updatedRows}
          />
        </div>
      )}

      {busy ? (
        <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-frost">
          <div className="h-full rounded-full bg-basin" style={{ width: `${progress}%` }} />
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button disabled={busy || summary.new + summary.update === 0} onClick={onCommit}>
          {fa.importexport.commit}
        </Button>
        <Button variant="secondary" onClick={onBack}>
          {fa.actions.back}
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-input border border-line bg-paper p-3">
      <p className="text-[0.8rem] text-crate">{label}</p>
      <p className={`tnum text-title font-bold ${tone}`}>{formatQty(value)}</p>
    </div>
  );
}
