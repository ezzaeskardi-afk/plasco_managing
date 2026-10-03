/**
 * QR code of the published app address, so a phone can scan the install guide
 * instead of typing a link. The modules are frozen as digit strings (one row
 * each): qrPath() turns them into a single SVG path and installQr.test.ts
 * reads them back with an independent decoder (jsQR), so a typo or a changed
 * address can never ship as an unreadable code.
 */

/** Where the app is published for phones (GitHub Pages, gh-pages branch). */
export const SITE_URL = 'https://ezzaeskardi-afk.github.io/plasco_managing/';

/** Quiet zone the QR spec asks for; the SVG paints it white. */
export const QR_QUIET_ZONE = 4;

/** 33 x 33 modules, byte mode, error correction M. */
export const SITE_QR_ROWS: readonly string[] = [
  '111111100010110011111111001111111',
  '100000100111011111001100001000001',
  '101110101001010111100110001011101',
  '101110101110001110001010101011101',
  '101110101100000100100101001011101',
  '100000101101010111001000101000001',
  '111111101010101010101010101111111',
  '000000001001100100100111000000000',
  '101111100001010111000011101111100',
  '110110010100000010111101001101101',
  '011100110100000100101010000010100',
  '101000001000101100001110111011111',
  '011101111100100000110010110111011',
  '001100011100101111001001001001011',
  '111010110111011001110000011011010',
  '101011011011100010011110111101100',
  '110100110001101001110010110111001',
  '010000000100010011110001001101101',
  '100111111010001101001100111110110',
  '101010000101010111100111111111110',
  '100001110010011110010011110011001',
  '100111000010000101100101010000101',
  '101111111101111111001100010000110',
  '100110010011011100111110010101101',
  '100111101110010111010011111110000',
  '000000001001001010111011100010101',
  '111111100010011110100011101010110',
  '100000101010100100001101100011101',
  '101110101001001000100010111111011',
  '101110101010011110010100010011011',
  '101110101100110001001000011100100',
  '100000100101101010011100011011100',
  '111111101100001001000011111100010',
];

/** Side length in modules (without the quiet zone). */
export function qrSize(rows: readonly string[] = SITE_QR_ROWS): number {
  return rows.length;
}

/** Dark modules of the code as one SVG path, 1 unit per module. */
export function qrPath(rows: readonly string[] = SITE_QR_ROWS): string {
  let path = '';
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== '1') {
        x += 1;
        continue;
      }
      let run = 1;
      while (x + run < row.length && row[x + run] === '1') run += 1;
      path += 'M' + x + ' ' + y + 'h' + run + 'v1h-' + run + 'z';
      x += run;
    }
  });
  return path;
}
