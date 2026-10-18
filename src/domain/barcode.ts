import { normalizeFa } from './normalizeFa';

/**
 * Barcode matching — the same rule as the Android app: barcode first, product
 * code second.
 *
 * A camera read may come back with Persian digits, spaces or hyphens, and the
 * same barcode can be stored as 12 digits (UPC-A) or 13 digits with a leading
 * zero (EAN-13); only those two shapes describe one product, so only those two
 * shapes are checked.
 */
export function normalizeBarcode(raw: string): string {
  return normalizeFa(raw).replace(/[^\p{L}\p{N}]/gu, '');
}

/** Every shape a barcode may have been stored as (only UPC-A ↔ EAN-13). */
export function barcodeKeys(raw: string): string[] {
  const value = normalizeBarcode(raw);
  if (!value) return [];
  const keys = new Set([value]);
  if (value.length === 12) keys.add(`0${value}`);
  else if (value.length === 13 && value.startsWith('0')) keys.add(value.slice(1));
  return [...keys];
}

/** Multi-line or comma/space separated text → unique barcode list. */
export function parseBarcodeList(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\n,،;\t ]+/)
        .map(normalizeBarcode)
        .filter(Boolean),
    ),
  ];
}

/** The product this barcode (or product code) belongs to; null when nothing matches. */
export function matchProductByBarcode<T extends { barcodes: string[]; code: string }>(
  products: T[],
  raw: string,
): T | null {
  const keys = barcodeKeys(raw);
  if (keys.length === 0) return null;
  const byBarcode = products.find((product) =>
    product.barcodes.some((barcode) => keys.includes(normalizeBarcode(barcode))),
  );
  if (byBarcode) return byBarcode;
  // The product code is checked in every shape too: a 12-digit read must find
  // the 13-digit leading-zero code and vice versa.
  return products.find((product) => keys.includes(normalizeBarcode(product.code))) ?? null;
}
