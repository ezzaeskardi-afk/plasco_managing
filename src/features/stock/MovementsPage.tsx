import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { EmptyState, Select } from '@/components/ui/misc';
import { Input, Label } from '@/components/ui/input';
import { listLocations, listMovements, listProducts } from '@/db/repos';
import type { MovementType } from '@/db/types';
import { formatJalali } from '@/domain/format';
import { fa } from '@/i18n/fa';
import { addDays, cn, endOfDay, startOfDay } from '@/lib/utils';
import { FILTER_TYPES } from './labels';
import { MovementRow } from './MovementRow';

type RangeKey = 'all' | 'today' | 'week' | 'month' | 'custom';

const RANGES: ReadonlyArray<{ value: RangeKey; label: string }> = [
  { value: 'all', label: fa.common.all },
  { value: 'today', label: fa.common.today },
  { value: 'week', label: fa.common.lastSevenDays },
  { value: 'month', label: fa.common.lastThirtyDays },
  { value: 'custom', label: `${fa.common.from} / ${fa.common.to}` },
];

export function MovementsPage() {
  const [type, setType] = useState<MovementType | 'all'>('all');
  const [locationId, setLocationId] = useState('');
  const [range, setRange] = useState<RangeKey>('week');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const products = useLiveQuery(() => listProducts(), []);
  const locations = useLiveQuery(() => listLocations(), []);

  const rangeWindow = useMemo(() => {
    const now = Date.now();
    if (range === 'today') return { from: startOfDay(now), to: endOfDay(now) };
    if (range === 'week') return { from: startOfDay(addDays(now, -7)), to: endOfDay(now) };
    if (range === 'month') return { from: startOfDay(addDays(now, -30)), to: endOfDay(now) };
    if (range === 'custom') {
      return {
        from: from ? startOfDay(new Date(from).getTime()) : undefined,
        to: to ? endOfDay(new Date(to).getTime()) : undefined,
      };
    }
    return { from: undefined, to: undefined };
  }, [range, from, to]);

  const movements = useLiveQuery(
    () =>
      listMovements({
        types: type === 'all' ? undefined : [type],
        locationId: locationId || undefined,
        from: rangeWindow.from,
        to: rangeWindow.to,
        limit: 500,
      }),
    [type, locationId, rangeWindow.from, rangeWindow.to],
  );

  const productMap = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products]);
  const locationMap = useMemo(
    () => new Map((locations ?? []).map((l) => [l.id, l.name])),
    [locations],
  );

  return (
    <div className="mx-auto max-w-[860px] pb-10">
      <div className="mb-3 flex flex-wrap gap-2">
        {FILTER_TYPES.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setType(option.value)}
            className={cn(
              'h-10 shrink-0 rounded-full border px-3 text-sm',
              type === option.value
                ? 'border-basin bg-basin text-basin-ink'
                : 'border-line bg-paper text-ink',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <Select
          value={locationId}
          onValueChange={setLocationId}
          allowEmpty
          placeholder={fa.products.filterLocation}
          options={(locations ?? []).map((l) => ({ value: l.id, label: l.name }))}
        />
        <Select
          value={range}
          onValueChange={(value) => setRange(value as RangeKey)}
          options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
        />
      </div>

      {range === 'custom' ? (
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="from">{fa.common.from}</Label>
            <Input
              id="from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
            {from ? (
              <p className="mt-1 text-[0.8rem] text-crate">
                {formatJalali(new Date(from).getTime())}
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="to">{fa.common.to}</Label>
            <Input id="to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            {to ? (
              <p className="mt-1 text-[0.8rem] text-crate">
                {formatJalali(new Date(to).getTime())}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {!movements ? (
        <p className="text-crate">{fa.common.loading}</p>
      ) : movements.length === 0 ? (
        <EmptyState message={fa.empty.movementsFiltered} />
      ) : (
        <ul className="overflow-hidden rounded-input border border-line bg-paper">
          {movements.map((movement) => (
            <MovementRow
              key={movement.id}
              movement={movement}
              locationName={locationMap.get(movement.locationId)}
              productName={productMap.get(movement.productId)?.name}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
