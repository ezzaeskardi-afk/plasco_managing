import * as ExcelJS from 'exceljs';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildWorkbook } from './spreadsheet';

function readBlob(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

async function loadWorkbook(blob: Blob): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await readBlob(blob));
  return workbook;
}

describe('buildWorkbook', () => {
  it('writes a titled RTL table with a frozen header, brand styling and number formats', async () => {
    const title = 'کالاها — پلاسکو منیجینگ — ۱۴۰۵/۷/۲۸';
    const blob = await buildWorkbook([
      {
        name: 'کالاها',
        title,
        header: ['کد', 'نام', 'قیمت خرید', 'موجودی'],
        rows: [
          ['P-00001', 'ظرف غذای بزرگ', 125000, 12],
          ['P-00002', 'سبد لباس', 0, 0],
        ],
      },
    ]);

    const workbook = await loadWorkbook(blob);
    const sheet = workbook.getWorksheet('کالاها');
    expect(sheet).toBeTruthy();
    if (!sheet) return;

    expect(sheet.getCell('A1').value).toBe(title);

    const headerCell = sheet.getCell('A2');
    expect(headerCell.value).toBe('کد');
    expect(headerCell.font?.bold).toBe(true);
    expect(headerCell.font?.color?.argb).toBe('FFFFFFFF');
    expect(headerCell.fill).toMatchObject({ type: 'pattern', fgColor: { argb: 'FF0B7285' } });

    expect(sheet.getCell('A3').value).toBe('P-00001');
    const priceCell = sheet.getCell('C3');
    expect(priceCell.value).toBe(125000);
    expect(priceCell.numFmt).toBe('#,##0');
    expect(sheet.getCell('D4').numFmt).toBe('#,##0');

    const view = sheet.views[0] as { rightToLeft?: boolean; state?: string; ySplit?: number };
    expect(view.rightToLeft).toBe(true);
    expect(view.state).toBe('frozen');
    expect(view.ySplit).toBe(2);

    expect(sheet.getColumn(2).width ?? 0).toBeGreaterThanOrEqual(10);

    const zip = unzipSync(new Uint8Array(await readBlob(blob)));
    const xml = strFromU8(zip['xl/tables/table1.xml'] ?? new Uint8Array());
    expect(xml).toContain('displayName="Table1"');
    expect(xml).toContain('ref="A2:D4"');
    expect(xml).toContain('autoFilter');
  });

  it('still writes a styled header when the sheet has no rows', async () => {
    const blob = await buildWorkbook([{ name: 'موجودی', header: ['موجودی'], rows: [] }]);
    const workbook = await loadWorkbook(blob);
    const sheet = workbook.getWorksheet('موجودی');
    expect(sheet?.getCell('A1').value).toBe('موجودی');
    expect(sheet?.getCell('A1').fill).toMatchObject({ fgColor: { argb: 'FF0B7285' } });
    const zip = unzipSync(new Uint8Array(await readBlob(blob)));
    expect(zip['xl/tables/table1.xml']).toBeUndefined();
  });
});
