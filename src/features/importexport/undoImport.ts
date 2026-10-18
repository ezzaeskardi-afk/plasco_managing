import { db as defaultDb, type PlascoDb } from '@/db/dexie';
import type { ID } from '@/db/types';
import {
  ImportUndoBlockedError,
  previewImportUndo,
  revertibleImportRemainders,
  undoImportBatch,
  type ImportUndoBlockedRow,
  type ImportUndoPlannedRow,
} from '@/db/imports';
import { formatQty } from '@/domain/format';
import { fa } from '@/i18n/fa';
import { toastAction, toastError, toastSuccess } from '@/lib/toast';

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
  if (row.reason === 'code-taken') {
    return fa.importexport.undoRowCodeTaken.replace('{name}', name);
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
 * Called after stock comes in: if a half-reverted import can now finish, offer it
 * in the toast — the same action the history list carries, so a delivery that
 * unblocks it is met with the offer instead of the shopkeeper having to remember.
 * Best effort by design: nothing to offer, or a journal that cannot be read, stays
 * silent instead of raising an error over a suggestion.
 */
export async function suggestImportUndoRemainder(target: PlascoDb = defaultDb): Promise<void> {
  const [newest] = await revertibleImportRemainders(target).catch(() => []);
  if (!newest) return;
  toastAction(
    fa.importexport.undoSuggestTitle,
    fa.importexport.undoSuggestBody
      .replace('{file}', newest.batch.fileName || fa.importexport.fileNameUnnamed)
      .replace('{count}', formatQty(newest.rows)),
    fa.importexport.undoRemaining,
    () => undoImportRemainder(newest.batch.id, target),
  );
}

/**
 * Confirmation + one-batch undo of an import. Shared by the wizard's undo button
 * and the recent-imports list so both behave identically. When only part of the
 * batch can be reverted, the dialog names the rows that stay behind first.
 */
export async function confirmAndUndoImport(batchId: ID, target: PlascoDb = defaultDb): Promise<boolean> {
  try {
    const preview = await previewImportUndo(batchId, target);

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
    return runImportUndo(batchId, target);
  } catch (error) {
    return reportUndoError(error);
  }
}

/**
 * The suggestion's action. The offer only ever appears when the remainder reverts
 * **whole**, so this runs the same undo the history button runs — without its
 * dialog, which is the whole point of the offer: one tap, no list to scroll.
 * A race (stock sold between the offer and the tap) is reported, not forced:
 * `undoImportBatch` refuses the rows it cannot reverse and says which.
 */
export async function undoImportRemainder(batchId: ID, target: PlascoDb = defaultDb): Promise<boolean> {
  try {
    return await runImportUndo(batchId, target);
  } catch (error) {
    return reportUndoError(error);
  }
}

/** The batch undo itself, shared by the dialog path and the one-tap offer. */
async function runImportUndo(batchId: ID, target: PlascoDb): Promise<boolean> {
  const outcome = await undoImportBatch(batchId, target);
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
}

/** The two refusals an undo can meet, in one place. */
function reportUndoError(error: unknown): false {
  if (error instanceof ImportUndoBlockedError) {
    toastError(fa.importexport.undoBlocked, `${blockedList(error.rows)} — ${fa.importexport.undoBlockedHint}`);
    return false;
  }
  toastError(fa.errors.title, error instanceof Error ? error.message : undefined);
  return false;
}
