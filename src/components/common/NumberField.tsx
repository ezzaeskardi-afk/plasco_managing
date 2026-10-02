import type { ReactNode } from 'react';
import { Input, Label } from '@/components/ui/input';
import { cn } from '@/lib/utils';

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
  className?: string;
}) {
  return (
    <div className={cn('mb-4', className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          value={value}
          inputMode={decimal ? 'decimal' : 'numeric'}
          placeholder={placeholder ?? '۰'}
          onChange={(event) => onChange(event.target.value)}
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
