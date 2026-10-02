import { Lock } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { formatCompact, formatFull, formatMoney } from '@/domain/format';
import { fa } from '@/i18n/fa';
import { cn } from '@/lib/utils';
import { useSettings } from '@/app/settings-context';

/** Big numeral; tapping swaps between the compact and the full value. */
export function KpiBlock({
  label,
  value,
  onClick,
  suffix,
}: {
  label: string;
  value: number;
  onClick?: () => void;
  suffix?: string;
}) {
  const [full, setFull] = useState(false);
  const text = full ? formatFull(value) : formatCompact(value);
  return (
    <button
      type="button"
      onClick={() => {
        setFull((prev) => !prev);
        onClick?.();
      }}
      className="flex flex-col items-start gap-1 rounded-input p-2 text-start"
    >
      <span className="text-[0.9rem] text-crate">{label}</span>
      <span className="tnum text-[2rem] font-extrabold leading-tight text-ink">
        {text}
        {suffix && !full ? <span className="ms-1 text-[0.9rem] font-medium text-crate">{suffix}</span> : null}
      </span>
    </button>
  );
}

/** Hides cost and profit numbers when the PIN lock is on. */
export function MoneyText({
  value,
  className,
  compact,
  showLabel = true,
}: {
  value: number;
  className?: string;
  compact?: boolean;
  showLabel?: boolean;
}) {
  const { costVisible, settings } = useSettings();
  if (!costVisible) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-crate', className)}>
        <Lock className="size-4" />
        <span aria-label={fa.settings.costLock}>•••</span>
      </span>
    );
  }
  const label = showLabel ? settings.currencyLabel : '';
  return (
    <span className={cn('tnum', className)}>
      {compact ? `${formatCompact(value)} ${label}`.trim() : formatMoney(value, label)}
    </span>
  );
}

export function Section({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('mb-6', className)}>
      {title ? (
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-title font-bold text-ink">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-input border border-line bg-paper p-4', className)}>{children}</div>
  );
}
