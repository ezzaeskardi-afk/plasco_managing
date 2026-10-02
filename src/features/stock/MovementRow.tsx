import { Undo2 } from 'lucide-react';
import { useState } from 'react';
import type { Movement } from '@/db/types';
import { formatJalali, formatQty, formatTime } from '@/domain/format';
import { fa } from '@/i18n/fa';
import { toastError, toastSuccess } from '@/lib/toast';
import { AlreadyUndoneError, undoMovement } from '@/db/movements';
import { MOVEMENT_LABELS, movementTone } from './labels';

export function MovementRow({
  movement,
  locationName,
  productName,
  showUndo = true,
  onUndone,
}: {
  movement: Movement;
  locationName?: string;
  productName?: string;
  showUndo?: boolean;
  onUndone?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const undone = Boolean(movement.undoOf);

  return (
    <li className="flex min-h-16 items-center gap-3 border-b border-line px-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-ink">
          {MOVEMENT_LABELS[movement.type]}
          {productName ? <span className="text-crate"> · {productName}</span> : null}
        </p>
        <p className="truncate text-[0.8rem] text-crate">
          {formatJalali(movement.at)} · {formatTime(movement.at)}
          {locationName ? ` · ${locationName}` : ''}
          {movement.note ? ` · ${movement.note}` : ''}
          {undone ? ` · ${fa.movements.undoneBy}` : ''}
        </p>
      </div>
      <span className={`tnum shrink-0 font-extrabold ${movementTone(movement.qty)}`}>
        {movement.qty > 0 ? '+' : movement.qty < 0 ? '−' : ''}
        {formatQty(Math.abs(movement.qty))}
      </span>
      {showUndo && !undone ? (
        <button
          type="button"
          disabled={busy}
          aria-label={fa.actions.undo}
          onClick={async () => {
            setBusy(true);
            try {
              await undoMovement(movement.id);
              toastSuccess(fa.stock.undone);
              onUndone?.();
            } catch (error) {
              toastError(
                error instanceof AlreadyUndoneError ? fa.stock.undoFailed : fa.errors.title,
              );
            } finally {
              setBusy(false);
            }
          }}
          className="flex size-10 items-center justify-center rounded-input text-crate disabled:opacity-50"
        >
          <Undo2 className="size-5" />
        </button>
      ) : (
        <span className="w-10" />
      )}
    </li>
  );
}
