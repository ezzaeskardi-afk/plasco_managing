import type { ID } from '@/db/types';
import { ImportUndoBlockedError, previewImportUndo, undoImportBatch } from '@/db/imports';
import { formatQty } from '@/domain/format';
import { fa } from '@/i18n/fa';
import { toastError, toastSuccess } from '@/lib/toast';

function blockedMessage(names: readonly string[]): string {
  return fa.importexport.undoBlockedHint.replace('{names}', names.slice(0, 3).join('، '));
}

/**
 * Confirmation + one-batch undo of an import. Shared by the wizard's undo button
 * and the recent-imports list so both behave identically.
 */
export async function confirmAndUndoImport(batchId: ID): Promise<boolean> {
  try {
    const preview = await previewImportUndo(batchId);

    if (preview.entries === 0) {
      toastError(fa.importexport.undoNothing);
      return false;
    }

    if (preview.blockers.length > 0) {
      const names = preview.blockers.map((blocker) => blocker.productName ?? fa.common.unknown);
      toastError(fa.importexport.undoBlocked, blockedMessage(names));
      return false;
    }

    const detail = fa.importexport.undoConfirmDetail
      .replace('{created}', formatQty(preview.created))
      .replace('{updated}', formatQty(preview.updated))
      .replace('{movements}', formatQty(preview.movements));
    if (!window.confirm(`${fa.importexport.undoConfirm}\n\n${detail}`)) return false;

    const outcome = await undoImportBatch(batchId);
    toastSuccess(
      fa.importexport.undoDone,
      fa.importexport.undoSummary
        .replace('{created}', formatQty(outcome.productsDeleted))
        .replace('{restored}', formatQty(outcome.productsRestored))
        .replace('{movements}', formatQty(outcome.movementsUndone)),
    );
    return true;
  } catch (error) {
    if (error instanceof ImportUndoBlockedError) {
      toastError(fa.importexport.undoBlocked, blockedMessage(error.blockers.map((b) => b.productName ?? fa.common.unknown)));
      return false;
    }
    toastError(fa.errors.title, error instanceof Error ? error.message : undefined);
    return false;
  }
}
