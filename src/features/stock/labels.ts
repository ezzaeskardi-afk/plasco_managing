import type { MovementType } from '@/db/types';
import { fa } from '@/i18n/fa';

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  initial: fa.movements.initial,
  receive: fa.movements.receive,
  sale: fa.movements.sale,
  return_in: fa.movements.return_in,
  return_out: fa.movements.return_out,
  adjust: fa.movements.adjust,
  count: fa.movements.count,
  transfer_out: fa.movements.transfer_out,
  transfer_in: fa.movements.transfer_in,
  damage: fa.movements.damage,
};

export const FILTER_TYPES: ReadonlyArray<{ value: MovementType | 'all'; label: string }> = [
  { value: 'all', label: fa.movements.all },
  { value: 'receive', label: fa.movements.receive },
  { value: 'sale', label: fa.movements.sale },
  { value: 'transfer_out', label: fa.movements.transfer_out },
  { value: 'transfer_in', label: fa.movements.transfer_in },
  { value: 'adjust', label: fa.movements.adjust },
  { value: 'count', label: fa.movements.count },
  { value: 'damage', label: fa.movements.damage },
  { value: 'return_in', label: fa.movements.return_in },
  { value: 'return_out', label: fa.movements.return_out },
  { value: 'initial', label: fa.movements.initial },
];

export function movementTone(qty: number): string {
  if (qty > 0) return 'text-ok';
  if (qty < 0) return 'text-out';
  return 'text-crate';
}
