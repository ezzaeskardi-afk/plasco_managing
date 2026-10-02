import { toPersianDigits } from './normalizeFa';

// Display only - storage is always a raw integer (AGENTS.md section 6).
const numberFormat = new Intl.NumberFormat('fa-IR');

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return numberFormat.format(value);
}

/** Money is an integer in the user's unit (default Toman). */
export function formatMoney(value: number, currencyLabel = 'تومان'): string {
  if (!Number.isFinite(value)) return '—';
  const text = formatNumber(value);
  return currencyLabel ? `${text} ${currencyLabel}` : text;
}

export function formatQty(value: number): string {
  return formatNumber(value);
}

export interface CompactParts {
  value: string;
  suffix: string;
}

const COMPACT_UNITS: ReadonlyArray<readonly [number, string]> = [
  [1_000_000_000, 'میلیارد'],
  [1_000_000, 'میلیون'],
  [1_000, 'هزار'],
];

/**
 * Compact Persian number: ۱۲٫۴ هزار / ۳ میلیون / ۱٫۱ میلیارد.
 * One decimal, trailing zero trimmed. Below 1000 the plain number is returned.
 */
export function compactParts(value: number): CompactParts {
  if (!Number.isFinite(value)) return { value: '—', suffix: '' };
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  for (const [scale, label] of COMPACT_UNITS) {
    if (abs >= scale) {
      const scaled = abs / scale;
      const rounded = Math.round(scaled * 10) / 10;
      // 999.9 thousand would round to 1000: promote it one step up.
      if (rounded >= 1000 && scale < 1_000_000_000) {
        const next = COMPACT_UNITS.find(([s]) => s === scale * 1000);
        if (next) {
          const promoted = Math.round((abs / next[0]) * 10) / 10;
          return { value: sign + toPersianDigits(String(promoted).replace('.', '٫')), suffix: next[1] };
        }
      }
      const text = Number.isInteger(rounded)
        ? String(rounded)
        : String(rounded).replace('.', '٫');
      return { value: sign + toPersianDigits(text), suffix: label };
    }
  }
  return { value: sign + toPersianDigits(String(Math.round(abs * 10) / 10).replace('.', '٫')), suffix: '' };
}

export function formatCompact(value: number, withSuffix = true): string {
  const { value: v, suffix } = compactParts(value);
  if (!withSuffix || !suffix) return v;
  return `${v} ${suffix}`;
}

/** Full, grouped value - used for tooltips and detail rows. */
export function formatFull(value: number): string {
  return formatNumber(value);
}

const jalaliShort = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const jalaliLong = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

const jalaliTime = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  hour: '2-digit',
  minute: '2-digit',
});

export function formatJalali(epochMs: number): string {
  if (!Number.isFinite(epochMs)) return '—';
  return jalaliShort.format(new Date(epochMs));
}

export function formatJalaliLong(epochMs: number): string {
  if (!Number.isFinite(epochMs)) return '—';
  return jalaliLong.format(new Date(epochMs));
}

export function formatTime(epochMs: number): string {
  if (!Number.isFinite(epochMs)) return '—';
  return jalaliTime.format(new Date(epochMs));
}

/** Two-digit padding that keeps Latin digits (inputs, codes). */
export function pad(n: number, width: number): string {
  return String(Math.trunc(Math.abs(n))).padStart(width, '0');
}
