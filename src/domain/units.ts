/** Pack helpers - AGENTS.md section 6: storage is always pieces. */

export interface PacksAndPieces {
  packs: number;
  pieces: number;
}

/** packs × packSize + pieces. Both arguments are non-negative integers. */
export function piecesFrom(packs: number, pieces: number, packSize: number): number {
  const size = Number.isFinite(packSize) && packSize >= 1 ? Math.round(packSize) : 1;
  const p = Number.isFinite(packs) ? Math.round(packs) : 0;
  const q = Number.isFinite(pieces) ? Math.round(pieces) : 0;
  return p * size + q;
}

/**
 * Splits a total piece count into packs + pieces.
 * packSize = 1 always yields `pieces` only, so single-piece goods show a plain number.
 */
export function splitPieces(total: number, packSize: number): PacksAndPieces {
  const size = Number.isFinite(packSize) && packSize >= 1 ? Math.round(packSize) : 1;
  const value = Number.isFinite(total) ? Math.round(total) : 0;
  if (size <= 1) return { packs: 0, pieces: value };
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  return { packs: sign * Math.floor(abs / size), pieces: sign * (abs % size) };
}

/** Short Persian-ish text for a quantity, e.g. "۳ کارتن + ۴". */
export function describePieces(total: number, packSize: number, packLabel: string): string {
  const { packs, pieces } = splitPieces(total, packSize);
  if (packSize <= 1) return String(total);
  if (packs === 0) return String(pieces);
  if (pieces === 0) return `${packs} ${packLabel}`;
  return `${packs} ${packLabel} + ${pieces}`;
}
