import { describe, expect, it } from 'vitest';
import { normalizeFa, normalizeTokens, toLatinDigits, toPersianDigits } from './normalizeFa';
import { parseIntegerInput, parseNumberInput } from './numbers';
import { compactParts, formatCompact, formatMoney, formatNumber } from './format';
import { describePieces, piecesFrom, splitPieces } from './units';
import { stackLevel, stockAlerts, stockState, valuate } from './valuation';
import { buildSearchIndex, searchIndex } from './search';
import { formatProductCode, parseProductCode } from './codes';
import type { Product, StockLevel } from '../db/types';

const product = (over: Partial<Product>): Product => ({
  id: over.id ?? 'p1',
  code: 'P-00001',
  name: 'ظرف',
  nameN: 'ظرف',
  barcodes: [],
  packLabel: 'کارتن',
  packSize: 12,
  buyPrice: 1000,
  retailPrice: 1500,
  active: true,
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

describe('normalizeFa', () => {
  it('maps Arabic yeh/kaf to Persian', () => {
    expect(normalizeFa('\u0643\u062A\u0627\u0628 \u064A')).toBe('\u06A9\u062A\u0627\u0628 \u06CC');
  });

  it('strips diacritics and tatweel', () => {
    expect(normalizeFa('\u0645\u064F\u0631\u0640\u062A\u0628\u064E\u0629')).toBe('مرتبة');
  });

  it('turns ZWNJ into a space and collapses whitespace', () => {
    expect(normalizeFa('\u062F\u0633\u062A\u200C\u0645\u0627\u0644   \u0628\u0632\u0631\u06AF')).toBe(
      'دست مال بزرگ',
    );
  });

  it('converts Persian and Arabic digits to Latin', () => {
    expect(normalizeFa('\u06F1\u06F2\u06F3')).toBe('123');
    expect(normalizeFa('\u0664\u0665\u0666')).toBe('456');
    expect(toLatinDigits('\u06F9\u0668')).toBe('98');
  });

  it('lowercases Latin and trims', () => {
    expect(normalizeFa('  RED 10L  ')).toBe('red 10l');
  });

  it('returns empty for empty input', () => {
    expect(normalizeFa('')).toBe('');
    expect(normalizeTokens('   ')).toEqual([]);
  });

  it('deduplicates tokens', () => {
    expect(normalizeTokens('ظرف ظرف بزرگ')).toEqual(['ظرف', 'بزرگ']);
  });

  it('renders Persian digits for display', () => {
    expect(toPersianDigits('P-00012')).toBe('P-\u06F0\u06F0\u06F0\u06F1\u06F2');
  });
});

describe('parseNumberInput', () => {
  it('reads Persian digits', () => {
    expect(parseNumberInput('\u06F1\u06F2\u06F3\u06F4')).toBe(1234);
  });

  it('reads Arabic digits', () => {
    expect(parseNumberInput('\u0661\u0662\u0663')).toBe(123);
  });

  it('accepts group separators', () => {
    expect(parseNumberInput('1,250,000')).toBe(1250000);
    expect(parseNumberInput('1\u066C250\u066C000')).toBe(1250000);
    expect(parseNumberInput('1 250 000')).toBe(1250000);
  });

  it('accepts Persian decimal separator', () => {
    expect(parseNumberInput('\u06F1\u066B\u06F5')).toBe(1.5);
  });

  it('returns null for junk and empties', () => {
    expect(parseNumberInput('')).toBeNull();
    expect(parseNumberInput('  ')).toBeNull();
    expect(parseNumberInput('abc')).toBeNull();
    expect(parseNumberInput(null)).toBeNull();
    expect(parseNumberInput(undefined)).toBeNull();
    expect(parseNumberInput('12.')).toBeNull();
  });

  it('rounds integers for money and quantity', () => {
    expect(parseIntegerInput('12\u066B6')).toBe(13);
  });
});

describe('format', () => {
  it('formats money with the currency label', () => {
    expect(formatMoney(1250000)).toContain('\u062A\u0648\u0645\u0627\u0646');
    expect(formatMoney(1250000)).toMatch(/\u06F1/);
  });

  it('formats plain numbers in Persian digits', () => {
    expect(formatNumber(12)).toBe('\u06F1\u06F2');
  });

  it('compacts thousands, millions and billions', () => {
    expect(formatCompact(999)).toBe('\u06F9\u06F9\u06F9');
    expect(formatCompact(1200)).toBe('\u06F1\u066B\u06F2 \u0647\u0632\u0627\u0631');
    expect(formatCompact(3_000_000)).toBe('\u06F3 \u0645\u06CC\u0644\u06CC\u0648\u0646');
    expect(formatCompact(1_100_000_000)).toBe('\u06F1\u066B\u06F1 \u0645\u06CC\u0644\u06CC\u0627\u0631\u062F');
  });

  it('promotes a value that would round up to 1000', () => {
    const { value, suffix } = compactParts(999_950);
    expect(value).toBe('\u06F1');
    expect(suffix).toBe('\u0645\u06CC\u0644\u06CC\u0648\u0646');
  });
});

describe('units', () => {
  it('computes pieces from packs', () => {
    expect(piecesFrom(2, 4, 12)).toBe(28);
  });

  it('treats packSize 1 as pieces only', () => {
    expect(piecesFrom(0, 7, 1)).toBe(7);
    expect(splitPieces(7, 1)).toEqual({ packs: 0, pieces: 7 });
  });

  it('splits totals back into packs and pieces', () => {
    expect(splitPieces(28, 12)).toEqual({ packs: 2, pieces: 4 });
    expect(splitPieces(24, 12)).toEqual({ packs: 2, pieces: 0 });
  });

  it('describes a quantity', () => {
    expect(describePieces(28, 12, '\u06A9\u0627\u0631\u062A\u0646')).toBe('2 \u06A9\u0627\u0631\u062A\u0646 + 4');
    expect(describePieces(24, 12, '\u06A9\u0627\u0631\u062A\u0646')).toBe('2 \u06A9\u0627\u0631\u062A\u0646');
    expect(describePieces(5, 1, '\u06A9\u0627\u0631\u062A\u0646')).toBe('5');
  });
});

describe('stock state and stack level', () => {
  it('is out at zero or below', () => {
    expect(stockState(0)).toBe('out');
    expect(stockState(-3)).toBe('out');
    expect(stackLevel(0)).toBe(0);
    expect(stackLevel(-3)).toBe(0);
  });

  it('is low at or under minStock', () => {
    expect(stockState(5, 5)).toBe('low');
    expect(stockState(6, 5)).toBe('ok');
  });

  it('is ok when minStock is missing or zero', () => {
    expect(stockState(1)).toBe('ok');
    expect(stockState(1, 0)).toBe('ok');
    expect(stockState(1, undefined)).toBe('ok');
  });

  it('uses thresholds without minStock', () => {
    expect([9, 10, 49, 50, 199, 200].map((n) => stackLevel(n))).toEqual([1, 2, 2, 3, 3, 4]);
  });

  it('uses the minStock ratio when set', () => {
    expect(stackLevel(10, 10)).toBe(1);
    expect(stackLevel(20, 10)).toBe(2);
    expect(stackLevel(40, 10)).toBe(3);
    expect(stackLevel(41, 10)).toBe(4);
  });
});

describe('valuation', () => {
  const levels: StockLevel[] = [
    { productId: 'p1', locationId: 'l1', qty: 10, updatedAt: 0 },
    { productId: 'p1', locationId: 'l2', qty: 5, updatedAt: 0 },
    { productId: 'p2', locationId: 'l1', qty: 0, updatedAt: 0 },
    { productId: 'p3', locationId: 'l2', qty: -4, updatedAt: 0 },
  ];

  it('sums pieces, cost and retail and skips inactive products', () => {
    const products = [
      product({ id: 'p1', buyPrice: 1000, retailPrice: 1500, brandId: 'b1', categoryId: 'c1' }),
      product({ id: 'p2', buyPrice: 500, retailPrice: 900 }),
      product({ id: 'p3', buyPrice: 100, retailPrice: 200 }),
      product({ id: 'p4', active: false, buyPrice: 9999, retailPrice: 9999 }),
      product({ id: 'p5', deletedAt: 5, buyPrice: 9999, retailPrice: 9999 }),
    ];
    const v = valuate(products, levels);
    expect(v.pieces).toBe(15);
    expect(v.skuCount).toBe(1);
    expect(v.productCount).toBe(3);
    expect(v.cost).toBe(15000);
    expect(v.retail).toBe(22500);
    expect(v.potentialProfit).toBe(7500);
    expect(v.byLocation.find((g) => g.id === 'l1')?.pieces).toBe(10);
    expect(v.byBrand.find((g) => g.id === 'b1')?.retail).toBe(22500);
    expect(v.byCategory.find((g) => g.id === 'c1')?.cost).toBe(15000);
  });

  it('clamps negative totals to zero', () => {
    const v = valuate([product({ id: 'p3', buyPrice: 100, retailPrice: 200 })], levels);
    expect(v.pieces).toBe(0);
    expect(v.cost).toBe(0);
    expect(v.skuCount).toBe(0);
  });

  it('handles an empty catalogue', () => {
    const v = valuate([], []);
    expect(v.pieces).toBe(0);
    expect(v.potentialProfit).toBe(0);
    expect(v.byLocation).toEqual([]);
  });

  it('orders low-stock rows by the cost value of the missing pieces', () => {
    const products = [
      product({ id: 'p1', minStock: 20, buyPrice: 1_000 }),
      product({ id: 'p2', minStock: 100, buyPrice: 9_000, name: 'سطل' }),
    ];
    const stock = [
      { productId: 'p1', locationId: 'l1', qty: 10, updatedAt: 0 },
      { productId: 'p2', locationId: 'l1', qty: 95, updatedAt: 0 },
    ];
    const { low } = stockAlerts(products, stock);
    expect(low.map((row) => row.product.id)).toEqual(['p2', 'p1']);
  });

  it('lists low and out products', () => {
    const products = [
      product({ id: 'p1', minStock: 20 }),
      product({ id: 'p2' }),
      product({ id: 'p3', name: 'سطل' }),
    ];
    const { low, out } = stockAlerts(products, levels);
    expect(low.map((r) => r.product.id)).toEqual(['p1']);
    expect(out.map((r) => r.product.id).sort()).toEqual(['p2', 'p3']);
  });
});

describe('search', () => {
  const index = buildSearchIndex([
    { id: 'a', name: 'ظرف غذای ۱۰ لیتری', code: 'P-00001', barcodes: ['6260001112223'], brandName: 'بازن' },
    { id: 'b', name: 'سطل رنگی', variant: 'قرمز', code: 'P-00002', brandName: 'زیباسازان' },
    { id: 'c', name: 'ظرف کوچک', code: 'P-00003', barcodes: ['999'] },
  ]);

  it('returns nothing for an empty query', () => {
    expect(searchIndex(index, '')).toEqual([]);
    expect(searchIndex(index, '   ')).toEqual([]);
  });

  it('matches despite Arabic yeh and kaf', () => {
    const idx = buildSearchIndex([{ id: 'x', name: 'ظرف', code: 'P-9', brandName: 'بازن' }]);
    expect(searchIndex(idx, '\u0638\u0631\u0641')).toEqual(['x']);
  });

  it('ranks an exact barcode first', () => {
    expect(searchIndex(index, '6260001112223')[0]).toBe('a');
  });

  it('ranks an exact code first', () => {
    expect(searchIndex(index, 'p-00002')[0]).toBe('b');
  });

  it('matches tokens with AND', () => {
    expect(searchIndex(index, 'ظرف قرمز').length).toBe(0);
    expect(searchIndex(index, 'ظرف کو')).toEqual(['c']);
  });

  it('finds by brand name', () => {
    expect(searchIndex(index, 'زیباسازان')).toEqual(['b']);
  });

  it('ranks a name prefix above a token match', () => {
    expect(searchIndex(index, 'ظرف')[0]).toBe('a');
  });

  it('respects the limit', () => {
    expect(searchIndex(index, 'ظرف', 1)).toHaveLength(1);
  });
});

describe('codes', () => {
  it('pads the sequence', () => {
    expect(formatProductCode(1)).toBe('P-00001');
    expect(formatProductCode(123456)).toBe('P-123456');
  });

  it('parses back', () => {
    expect(parseProductCode('P-00042')).toBe(42);
    expect(parseProductCode('X-1')).toBeNull();
    expect(parseProductCode('P-')).toBeNull();
  });
});
