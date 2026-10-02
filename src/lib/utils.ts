import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Local epoch-ms helpers used by Jalali date filters. */
export function startOfDay(epochMs: number): number {
  const d = new Date(epochMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfDay(epochMs: number): number {
  const d = new Date(epochMs);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function addDays(epochMs: number, days: number): number {
  const d = new Date(epochMs);
  d.setDate(d.getDate() + days);
  return d.getTime();
}
