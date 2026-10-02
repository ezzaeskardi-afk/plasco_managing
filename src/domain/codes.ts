import { pad } from './format';

export const PRODUCT_CODE_PREFIX = 'P-';
export const PRODUCT_CODE_WIDTH = 5;

/** Auto code: P-00001. Never reused once assigned. */
export function formatProductCode(seq: number): string {
  return `${PRODUCT_CODE_PREFIX}${pad(seq, PRODUCT_CODE_WIDTH)}`;
}

/** Reverse of formatProductCode; null when the code does not follow the scheme. */
export function parseProductCode(code: string): number | null {
  const match = /^P-(\d{1,10})$/.exec(code.trim());
  if (!match) return null;
  return Number(match[1]);
}
