import { toLatinDigits } from './normalizeFa';

// Thousand separators accepted from keyboards and spreadsheets.
const GROUP_SEPARATORS = /[\s\u00A0\u200C,،\u066C\u060C']/g;
// Decimal separators: Persian ٫ (U+066B) and the common dot.
const DECIMAL_SEPARATORS = /[\u066B.]/g;

/**
 * parseNumberInput: accepts Persian/Arabic/Latin digits and the separators
 * `,` `٬` `٫` and returns a number, or null when the text is not a number.
 */
export function parseNumberInput(raw: string | number | null | undefined): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (raw == null) return null;

  let text = toLatinDigits(String(raw)).trim();
  if (!text) return null;

  // Normalize minus signs.
  text = text.replace(/[\u2212\u2013\u2014]/g, '-');

  // Handle a decimal separator exactly once (first occurrence wins).
  const decimalIndex = text.search(DECIMAL_SEPARATORS);
  let integerPart = text;
  let fractionPart = '';
  if (decimalIndex >= 0) {
    integerPart = text.slice(0, decimalIndex);
    fractionPart = text.slice(decimalIndex + 1);
  }

  integerPart = integerPart.replace(GROUP_SEPARATORS, '');
  fractionPart = fractionPart.replace(GROUP_SEPARATORS, '').replace(DECIMAL_SEPARATORS, '');

  if (decimalIndex >= 0 && fractionPart === '' && integerPart === '') return null;
  if (decimalIndex >= 0 && fractionPart === '') return null;

  const normalized = decimalIndex >= 0 ? `${integerPart}.${fractionPart}` : integerPart;
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Parses and rounds to a non-negative integer (money / quantity input). */
export function parseIntegerInput(raw: string | number | null | undefined): number | null {
  const value = parseNumberInput(raw);
  if (value == null) return null;
  return Math.round(value);
}

export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.round(value), min), max);
}

export function isInt(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value);
}
