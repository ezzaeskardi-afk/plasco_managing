import { describe, expect, it } from 'vitest';
import { barcodeKeys, matchProductByBarcode, normalizeBarcode, parseBarcodeList } from './barcode';

type Row = { id: string; code: string; barcodes: string[] };

const product = (id: string, code: string, barcodes: string[] = []): Row => ({ id, code, barcodes });

describe('barcode', () => {
  it('scanned value becomes digits and latin letters', () => {
    // Space, hyphen and Persian digits all collapse into one shape.
    expect(normalizeBarcode(' 6001234567890 ')).toBe('6001234567890');
    expect(normalizeBarcode('۶۰۰۱۲۳۴۵۶۷۸۹۰')).toBe('6001234567890');
    expect(normalizeBarcode('600-12 AB')).toBe('60012ab');
    expect(normalizeBarcode('   ')).toBe('');
  });

  it('UPC-A and EAN-13 with a leading zero are the same barcode', () => {
    expect(new Set(barcodeKeys('600123456789'))).toEqual(new Set(['600123456789', '0600123456789']));
    expect(new Set(barcodeKeys('0600123456789'))).toEqual(new Set(['0600123456789', '600123456789']));
  });

  it('only the twelve and thirteen digit shapes are equivalent', () => {
    // The old rule trimmed any number of leading zeros; now only UPC-A ↔ EAN-13.
    expect(barcodeKeys('00123')).toEqual(['00123']);
    expect(barcodeKeys('6001234567890')).toEqual(['6001234567890']);
    expect(barcodeKeys('06001234567890')).toEqual(['06001234567890']);
  });

  it('list text is split, cleaned and deduplicated', () => {
    expect(parseBarcodeList('۱۱۱\n222, 111، 222')).toEqual(['111', '222']);
    expect(parseBarcodeList(' ,، \n')).toEqual([]);
  });

  it('product is found by its barcode even with persian digits', () => {
    const products = [product('p1', 'P-00001', ['6001234567890'])];
    expect(matchProductByBarcode(products, '6001234567890')?.id).toBe('p1');
    expect(matchProductByBarcode(products, '۶۰۰۱۲۳۴۵۶۷۸۹۰')?.id).toBe('p1');
  });

  it('twelve digit scan finds the thirteen digit row', () => {
    const products = [product('p1', 'P-00001', ['0600123456789'])];
    expect(matchProductByBarcode(products, '600123456789')?.id).toBe('p1');
  });

  it('numeric product code matches the other leading zero form', () => {
    expect(matchProductByBarcode([product('p1', '0600123456789')], '600123456789')?.id).toBe('p1');
    expect(matchProductByBarcode([product('p2', '600123456789')], '0600123456789')?.id).toBe('p2');
  });

  it('code of the product counts as a barcode', () => {
    const products = [product('p1', 'P-00042')];
    expect(matchProductByBarcode(products, 'p-00042')?.id).toBe('p1');
    expect(matchProductByBarcode(products, 'P-00042')?.id).toBe('p1');
  });

  it('unknown barcode and empty scan find nothing', () => {
    const products = [product('p1', 'P-00001', ['111'])];
    expect(matchProductByBarcode(products, '999')).toBeNull();
    expect(matchProductByBarcode(products, '   ')).toBeNull();
  });
});
