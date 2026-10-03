import type { ID } from '@/db/types';
import {
  ImportUndoBlockedError,
  previewImportUndo,
  undoImportBatch,
  type ImportUndoBlockedRow,
  type ImportUndoPlannedRow,
} from '@/db/imports';
import { formatQty } from '@/domain/format';
import { fa } from '@/i18n/fa';
import { toastError, toastSuccess } from '@/lib/toast';

/** «سطل — انبار: ۴ عدد کم»; the shopkeeper reads which rows stay and why. */
function rowLabel(row: ImportUndoBlockedRow): string {
  const name = row.name ?? fa.common.unknown;
  if (row.reason === 'stock-used') {
    return fa.importexport.undoRowStock
      .replace('{name}', name)
      .replace('{location}', row.locationName ?? fa.common.location)
      .replace('{qty}', formatQty(row.qty));
  }
  if (row.reason === 'holds-stock') {
    return row.qty > 0
      ? fa.importexport.undoRowHeld.replace('{name}', name).replace('{qty}', formatQty(row.qty))
      : fa.importexport.undoRowHeldMovement.replace('{name}', name);
  }
  return fa.importexport.undoRowInUse.replace('{name}', name);
}

/** Names up to four rows; the rest is collapsed so the message stays short. */
function blockedList(rows: readonly ImportUndoBlockedRow[]): string {
  const labels = rows.slice(0, 4).map(rowLabel);
  const rest = rows.length - labels.length;
  if (rest > 0) labels.push(fa.importexport.undoRowMore.replace('{count}', formatQty(rest)));
  return labels.join('، ');
}

function kindLabel(kind: ImportUndoPlannedRow['kind']): string {
  if (kind === 'product-created') return fa.importexport.undoKindCreated;
  if (kind === 'product-updated') return fa.importexport.undoKindUpdated;
  if (kind === 'brand-created') return fa.importexport.undoKindBrand;
  return fa.importexport.undoKindMovement;
}

/** «سبد — حرکت انبار در انبار (۵ عدد)» - one row of the undo list. */
function plannedText(row: ImportUndoPlannedRow): string {
  const name = row.name ?? fa.common.unknown;
  if (row.kind === 'movement') {
    return fa.importexport.undoPlannedMovement
      .replace('{name}', name)
      .replace('{location}', row.locationName ?? fa.common.location)
      .replace('{qty}', formatQty(Math.abs(row.qty)));
  }
  return fa.importexport.undoPlannedRow.replace('{name}', name).replace('{kind}', kindLabel(row.kind));
}

/** The rows that revert now: five names, then «و N ردیف دیگر». */
function plannedList(rows: readonly ImportUndoPlannedRow[]): string {
  const labels = rows.slice(0, 5).map(plannedText);
  const rest = rows.length - labels.length;
  if (rest > 0) labels.push(fa.importexport.undoRowMore.replace('{count}', formatQty(rest)));
  return labels.join('، ');
}

function detailLine(counts: { created: number; updated: number; movements: number }): string {
  return fa.importexport.undoConfirmDetail
    .replace('{created}', formatQty(counts.created))
    .replace('{updated}', formatQty(counts.updated))
    .replace('{movements}', formatQty(counts.movements));
}

/**
 * Confirmation + one-batch undo of an import. Shared by the wizard's undo button
 * and the recent-imports list so both behave identically. When only part of the
 * batch can be reverted, the dialog names the rows that stay behind first.
 */
export async function confirmAndUndoImport(batchId: ID): Promise<boolean> {
  try {
    const preview = await previewImportUndo(batchId);

    if (preview.entries === 0) {
      toastError(fa.importexport.undoNothing);
      return false;
    }

    const detail = detailLine(preview);
    // A partial undo lists both sides by name: what goes back now, and what has
    // to wait (and why). The counts alone never said which rows were which.
    const question =
      preview.blockedRows.length > 0
        ? [
            fa.importexport.undoPartial,
            fa.importexport.undoPlanned
              .replace('{count}', formatQty(preview.undoableRows))
              .replace('{rows}', plannedList(preview.plannedRows)),
            fa.importexport.undoPartialWhy.replace('{names}', blockedList(preview.blockedRows)),
            fa.importexport.undoPartialAsk,
          ].join('\n\n')
        : `${fa.importexport.undoConfirm}\n\n${detail}`;
    if (!window.confirm(question)) return false;

    const outcome = await undoImportBatch(batchId);
    if (outcome.partial) {
      const undone =
        outcome.movementsUndone + outcome.productsRestored + outcome.productsDeleted + outcome.brandsDeleted;
      toastSuccess(
        fa.importexport.undoPartialDone,
        fa.importexport.undoPartialSummary
          .replace('{undone}', formatQty(undone))
          .replace('{left}', formatQty(outcome.rowsLeft))
          .replace('{names}', blockedList(outcome.blocked)),
      );
    } else {
      toastSuccess(
        fa.importexport.undoDone,
        fa.importexport.undoSummary
          .replace('{created}', formatQty(outcome.productsDeleted))
          .replace('{restored}', formatQty(outcome.productsRestored))
          .replace('{movements}', formatQty(outcome.movementsUndone)),
      );
    }
    return true;
  } catch (error) {
    if (error instanceof ImportUndoBlockedError) {
      toastError(fa.importexport.undoBlocked, `${blockedList(error.rows)} — ${fa.importexport.undoBlockedHint}`);
      return false;
    }
    toastError(fa.errors.title, error instanceof Error ? error.message : undefined);
    return false;
  }
}
