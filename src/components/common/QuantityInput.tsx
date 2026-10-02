import { Minus, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Input, Label } from '@/components/ui/input';
import { fa } from '@/i18n/fa';
import { parseIntegerInput } from '@/domain/numbers';
import { splitPieces, piecesFrom } from '@/domain/units';
import { formatQty } from '@/domain/format';
import { cn } from '@/lib/utils';

export interface QuantityInputProps {
  /** Total pieces (single source of truth). */
  value: number;
  onChange: (pieces: number) => void;
  packSize: number;
  packLabel: string;
  /** Show ±1 / ±10 steppers that act on pieces. */
  steppers?: boolean;
  autoFocus?: boolean;
  idPrefix?: string;
}

/** The user types packs + pieces; only pieces are stored (AGENTS.md section 6). */
export function QuantityInput({
  value,
  onChange,
  packSize,
  packLabel,
  steppers = true,
  autoFocus,
  idPrefix = 'qty',
}: QuantityInputProps) {
  const { packs, pieces } = splitPieces(value, packSize);
  const single = packSize <= 1;

  const setPacks = (raw: string) => {
    const next = parseIntegerInput(raw) ?? 0;
    onChange(piecesFrom(Math.max(0, next), pieces, packSize));
  };
  const setPieces = (raw: string) => {
    const next = parseIntegerInput(raw) ?? 0;
    onChange(piecesFrom(packs, Math.max(0, next), packSize));
  };

  return (
    <div>
      <div className={cn('grid gap-3', single ? 'grid-cols-1' : 'grid-cols-2')}>
        {single ? null : (
          <div>
            <Label htmlFor={`${idPrefix}-packs`}>{packLabel}</Label>
            <Input
              id={`${idPrefix}-packs`}
              inputMode="numeric"
              value={packs === 0 ? '' : String(packs)}
              placeholder="۰"
              autoFocus={autoFocus}
              onChange={(e) => setPacks(e.target.value)}
            />
          </div>
        )}
        <div>
          <Label htmlFor={`${idPrefix}-pieces`}>{fa.stock.pieces}</Label>
          <Input
            id={`${idPrefix}-pieces`}
            inputMode="numeric"
            value={pieces === 0 ? '' : String(pieces)}
            placeholder="۰"
            autoFocus={autoFocus && single}
            onChange={(e) => setPieces(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-crate">
          {fa.stock.liveTotal}:{' '}
          <span className="tnum font-extrabold text-ink">{formatQty(value)}</span>{' '}
          <span className="text-[0.9rem]">{fa.common.pieces}</span>
        </p>
        {steppers ? (
          <div className="flex items-center gap-2">
            <StepButton label={fa.stock.pieces} onClick={() => onChange(Math.max(0, value - 10))}>
              <Minus className="size-4" />
              <span className="tnum">۱۰</span>
            </StepButton>
            <StepButton label={fa.stock.pieces} onClick={() => onChange(Math.max(0, value - 1))}>
              <Minus className="size-4" />
            </StepButton>
            <StepButton label={fa.stock.pieces} onClick={() => onChange(value + 1)}>
              <Plus className="size-4" />
            </StepButton>
            <StepButton label={fa.stock.pieces} onClick={() => onChange(value + 10)}>
              <Plus className="size-4" />
              <span className="tnum">۱۰</span>
            </StepButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StepButton({
  onClick,
  children,
  label,
}: {
  onClick: () => void;
  children: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-11 min-w-11 items-center justify-center gap-0.5 rounded-input border border-line bg-paper px-2 text-ink"
    >
      {children}
    </button>
  );
}
