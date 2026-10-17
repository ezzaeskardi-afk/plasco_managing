import type { ChangeEvent, ReactNode } from 'react';
import { useLayoutEffect, useRef } from 'react';
import { Input, Label } from '@/components/ui/input';
import { formatNumber } from '@/domain/format';
import { parseIntegerInput } from '@/domain/numbers';
import { cn } from '@/lib/utils';

const DIGIT = /[0-9\u06F0-\u06F9\u0660-\u0669]/;

/** How many digits sit to the right of the caret (separators don't count). */
function digitsRightOf(text: string, caret: number): number {
  let count = 0;
  for (let i = caret; i < text.length; i += 1) {
    if (DIGIT.test(text[i])) count += 1;
  }
  return count;
}

/** The caret position that keeps `digitsRight` digits on its right side. */
function caretFromRight(text: string, digitsRight: number): number {
  let seen = 0;
  for (let i = text.length - 1; i >= 0; i -= 1) {
    if (!DIGIT.test(text[i])) continue;
    if (seen === digitsRight) return i + 1;
    seen += 1;
  }
  return 0;
}

/** Never `type="number"`: the shop types Persian digits (AGENTS.md section 7). */
export function NumberField({
  id,
  label,
  value,
  onChange,
  placeholder,
  suffix,
  error,
  hint,
  decimal,
  group,
  className,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  suffix?: ReactNode;
  error?: string;
  hint?: string;
  decimal?: boolean;
  /** Group thousands while typing (۲٬۱۰۰٬۰۰۰) and keep the caret on its digit. */
  group?: boolean;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const caretRight = useRef<number | null>(null);

  // Runs after the formatted value has reached the DOM, before paint: put the
  // caret back in front of the same digit it was in front of before.
  useLayoutEffect(() => {
    const right = caretRight.current;
    if (right == null) return;
    caretRight.current = null;
    const input = boxRef.current?.querySelector('input');
    if (!input) return;
    const position = caretFromRight(input.value, right);
    input.setSelectionRange(position, position);
  }, [value]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    if (!group) {
      onChange(raw);
      return;
    }
    const parsed = parseIntegerInput(raw);
    if (parsed == null || parsed < 0) {
      // Not a number yet (mid-edit, minus sign, junk): keep exactly what was
      // typed and let the form's validation say the rest.
      onChange(raw);
      return;
    }
    caretRight.current = digitsRightOf(raw, event.target.selectionStart ?? raw.length);
    onChange(formatNumber(parsed));
  };

  return (
    <div className={cn('mb-4', className)}>
      <Label htmlFor={id}>{label}</Label>
      <div ref={boxRef} className="relative">
        <Input
          id={id}
          value={value}
          inputMode={decimal ? 'decimal' : 'numeric'}
          placeholder={placeholder ?? '۰'}
          onChange={handleChange}
          aria-invalid={error ? true : undefined}
          className={cn(error && 'border-out', suffix && 'pe-16')}
        />
        {suffix ? (
          <span className="pointer-events-none absolute inset-y-0 end-3 my-auto flex items-center text-crate">
            {suffix}
          </span>
        ) : null}
      </div>
      {error ? <p className="mt-1 text-[0.8rem] text-out">{error}</p> : null}
      {!error && hint ? <p className="mt-1 text-[0.8rem] text-crate">{hint}</p> : null}
    </div>
  );
}
