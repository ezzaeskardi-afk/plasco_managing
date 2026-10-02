import * as SelectPrimitive from '@radix-ui/react-select';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { Check, ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'ok' | 'low' | 'out' | 'basin';
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-frost text-crate',
    ok: 'bg-frost text-ok',
    low: 'bg-frost text-low',
    out: 'bg-frost text-out',
    basin: 'bg-frost text-basin',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.8rem] leading-6',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  id,
}: {
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  label: string;
  id?: string;
}) {
  return (
    <SwitchPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={label}
      className="relative h-8 w-14 shrink-0 rounded-full border border-line bg-frost data-[state=checked]:bg-basin"
    >
      <SwitchPrimitive.Thumb className="block size-6 translate-x-1 rounded-full bg-paper shadow-none transition-none data-[state=checked]:-translate-x-7" />
    </SwitchPrimitive.Root>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder = 'انتخاب کنید',
  id,
  allowEmpty,
  emptyLabel = 'همه',
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  id?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  className?: string;
}) {
  const items = allowEmpty ? [{ value: '__all__', label: emptyLabel }, ...options] : options;
  return (
    <SelectPrimitive.Root
      value={value === '' && allowEmpty ? '__all__' : value}
      onValueChange={(next) => onValueChange(next === '__all__' ? '' : next)}
    >
      <SelectPrimitive.Trigger
        id={id}
        className={cn(
          'flex h-12 w-full items-center justify-between gap-2 rounded-input border border-line bg-paper px-3 text-start text-ink data-[placeholder]:text-crate',
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown className="size-5 text-crate" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-[min(60dvh,320px)] w-[var(--radix-select-trigger-width)] overflow-y-auto rounded-input border border-line bg-paper p-1"
        >
          <SelectPrimitive.Viewport>
            {items.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className="flex h-11 cursor-default items-center justify-between rounded-[8px] px-3 text-ink data-[highlighted]:bg-frost"
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator>
                  <Check className="size-4 text-basin" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex gap-1 rounded-input border border-line bg-paper p-1"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'h-10 flex-1 rounded-[8px] px-3 text-sm',
            value === option.value ? 'bg-basin text-basin-ink' : 'text-crate',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  message,
  action,
}: {
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
      <p className="max-w-[26rem] text-crate">{message}</p>
      {action}
    </div>
  );
}
