import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { SITE_QR_ROWS, SITE_URL, qrPath, qrSize } from './installQr';

/** Rasterize the frozen modules into the RGBA bitmap the decoder reads. */
function rasterize(scale = 5, margin = 4): { data: Uint8ClampedArray; width: number } {
  const size = qrSize();
  const width = (size + margin * 2) * scale;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  SITE_QR_ROWS.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      if (cell !== '1') return;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const pixel = ((y + margin) * scale + dy) * width + (x + margin) * scale + dx;
          data[pixel * 4] = 0;
          data[pixel * 4 + 1] = 0;
          data[pixel * 4 + 2] = 0;
          data[pixel * 4 + 3] = 255;
        }
      }
    });
  });
  return { data, width };
}

describe('install-page QR code', () => {
  it('reads back as the published address', () => {
    const { data, width } = rasterize();
    expect(jsQR(data, width, width)?.data).toBe(SITE_URL);
  });

  it('is a square module table the SVG path can draw', () => {
    const size = qrSize();
    expect(SITE_QR_ROWS).toHaveLength(size);
    expect(SITE_QR_ROWS.every((row) => row.length === size)).toBe(true);
    expect(qrPath()).toContain('M');
  });
});
