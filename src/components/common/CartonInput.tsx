import { Minus, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Input, Label } from '@/components/ui/input';
import { StepButton } from '@/components/common/QuantityInput';
import { formatQty } from '@/domain/format';
import { toPersianDigits } from '@/domain/normalizeFa';
import { parseIntegerInput } from '@/domain/numbers';
import { cartonPieces } from '@/domain/units';
import { fa } from '@/i18n/fa';

export interface CartonInputProps {
  /** Total pieces (single source of truth). */
  value: number;
  onChange: (pieces: number) => void;
  /** Pieces per carton already known from the product (۱ = not a carton item). */
  packSize: number;
  /** Fired when the user edits «تعداد در کارتن» themselves. */
  onPerCartonChange?: (size: number) => void;
  idPrefix?: string;
  steppers?: boolean;
}

/**
 * Stock comes in cartons: the shopkeeper types «تعداد کارتن» × «تعداد در کارتن»
 * plus loose «عدد»; only the total in pieces is stored (AGENTS.md section 6).
 * A product without a carton size just uses the «عدد» field.
 */
export function CartonInput({
  value,
  onChange,
  packSize,
  onPerCartonChange,
  idPrefix = 'qty',
  steppers = true,
}: CartonInputProps) {
  const [cartons, setCartons] = useState('');
  const [perCarton, setPerCarton] = useState(packSize > 1 ? String(packSize) : '');
  const [pieces, setPieces] = useState('');
  const lastValue = useRef<number | null>(null);

  const emit = (nextCartons: string, nextPerCarton: string, nextPieces: string) => {
    setCartons(nextCartons);
    setPerCarton(nextPerCarton);
    setPieces(nextPieces);
    const total = cartonPieces(
      parseIntegerInput(nextCartons) ?? 0,
      parseIntegerInput(nextPerCarton) ?? 0,
      parseIntegerInput(nextPieces) ?? 0,
    );
    lastValue.current = total;
    onChange(total);
  };

  // The steppers (and anything else) change the total from outside: split it
  // back into cartons + loose pieces so the fields keep adding up to it.
  useEffect(() => {
    if (lastValue.current === value) return;
    lastValue.current = value;
    const size = parseIntegerInput(perCarton);
    if (size != null && size >= 2) {
      const count = Math.floor(Math.max(0, value) / size);
      const loose = Math.max(0, value) - count * size;
      setCartons(count === 0 ? '' : String(count));
      setPieces(loose === 0 ? '' : String(loose));
    } else {
      setCartons('');
      setPieces(value > 0 ? String(value) : '');
    }
  }, [value, perCarton]);

  const bump = (delta: number) => {
    const next = Math.max(0, value + delta);
    const size = parseIntegerInput(perCarton);
    if (size != null && size >= 2) {
      const count = Math.floor(next / size);
      const loose = next - count * size;
      emit(count === 0 ? '' : String(count), perCarton, loose === 0 ? '' : String(loose));
    } else {
      emit('', perCarton, next === 0 ? '' : String(next));
    }
  };

  const cartonCount = parseIntegerInput(cartons) ?? 0;
  const perCount = parseIntegerInput(perCarton) ?? 0;
  const missingPer = cartonCount > 0 && perCount < 2;

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label htmlFor={`${idPrefix}-cartons`}>{fa.stock.cartons}</Label>
          <Input
            id={`${idPrefix}-cartons`}
            inputMode="numeric"
            value={cartons}
            placeholder="۰"
            onChange={(event) => emit(event.target.value, perCarton, pieces)}
          />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-per`}>{fa.stock.perCarton}</Label>
          <Input
            id={`${idPrefix}-per`}
            inputMode="numeric"
            value={perCarton}
            placeholder={packSize > 1 ? toPersianDigits(String(packSize)) : '۰'}
            onChange={(event) => {
              const raw = event.target.value;
              emit(cartons, raw, pieces);
              const parsed = parseIntegerInput(raw);
              if (parsed != null && parsed >= 1) onPerCartonChange?.(parsed);
            }}
          />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-pieces`}>{fa.stock.pieces}</Label>
          <Input
            id={`${idPrefix}-pieces`}
            inputMode="numeric"
            value={pieces}
            placeholder="۰"
            onChange={(event) => emit(cartons, perCarton, event.target.value)}
          />
        </div>
      </div>

      {missingPer ? (
        <p className="mt-2 text-[0.8rem] text-low">{fa.stock.perCartonNeeded}</p>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-crate">
          {fa.stock.liveTotal}:{' '}
          <span className="tnum font-extrabold text-ink">{formatQty(value)}</span>{' '}
          <span className="text-[0.9rem]">{fa.common.pieces}</span>
        </p>
        {steppers ? (
          <div className="flex items-center gap-2">
            <StepButton label={fa.stock.pieces} onClick={() => bump(-10)}>
              <Minus className="size-4" />
              <span className="tnum">۱۰</span>
            </StepButton>
            <StepButton label={fa.stock.pieces} onClick={() => bump(-1)}>
              <Minus className="size-4" />
            </StepButton>
            <StepButton label={fa.stock.pieces} onClick={() => bump(1)}>
              <Plus className="size-4" />
            </StepButton>
            <StepButton label={fa.stock.pieces} onClick={() => bump(10)}>
              <Plus className="size-4" />
              <span className="tnum">۱۰</span>
            </StepButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}
