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

export function toastError(message: string, description?: string): void {
  toast.error(message, { description });
}

export function toastSuccess(message: string, description?: string): void {
  toast.success(message, { description });
}
