import { stackLevel, stockState } from '@/domain/valuation';
import { cn } from '@/lib/utils';

const BAR_WIDTHS = ['w-full', 'w-[82%]', 'w-[64%]', 'w-[46%]'];

/**
 * Signature element (AGENTS.md section 8): up to four stacked bars, like nested basins.
 * Colour never carries the meaning alone: the number is always rendered next to it.
 */
export function StockStack({
  total,
  minStock,
  className,
}: {
  total: number;
  minStock?: number;
  className?: string;
}) {
  const level = stackLevel(total, minStock);
  const state = stockState(total, minStock);
  const filled = { ok: 'bg-crate', low: 'bg-low', out: 'bg-out' }[state];

  return (
    <div
      className={cn('flex w-9 flex-col-reverse items-center gap-[3px]', className)}
      aria-hidden="true"
    >
      {[0, 1, 2, 3].map((index) => {
        const active = index < level;
        return (
          <span
            key={index}
            className={cn(
              'h-[4px] rounded-full',
              BAR_WIDTHS[index],
              active ? filled : 'border border-dashed border-line',
            )}
          />
        );
      })}
    </div>
  );
}
