import { toast } from 'sonner';
import { fa } from '@/i18n/fa';

/** Rule 13: every stock-changing or destructive action offers Undo. */
export function toastUndo(message: string, onUndo: () => unknown): void {
  toast(message, {
    duration: 7000,
    action: {
      label: fa.actions.undo,
      onClick: () => {
        void Promise.resolve(onUndo())
          .then(() => toast.success(fa.stock.undone))
          .catch(() => toast.error(fa.stock.undoFailed));
      },
    },
  });
}

/**
 * A toast that offers something to do right now — unlike `toastUndo`, which walks
 * back what just happened. The caller owns the action.
 */
export function toastAction(
  message: string,
  description: string,
  label: string,
  onClick: () => unknown,
): void {
  toast(message, {
    duration: 9000,
    description,
    action: { label, onClick: () => void onClick() },
  });
}

export function toastError(message: string, description?: string): void {
  toast.error(message, { description });
}

export function toastSuccess(message: string, description?: string): void {
  toast.success(message, { description });
}
