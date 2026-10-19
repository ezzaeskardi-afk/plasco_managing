import type * as ExcelJS from 'exceljs';
import Papa from 'papaparse';

export type Row = Record<string, string>;

export class FileUnreadableError extends Error {
  constructor() {
    super('FileUnreadable');
    this.name = 'FileUnreadableError';
  }
}

type WorkbookCtor = typeof ExcelJS.Workbook;

/**
 * exceljs is CJS; Vite resolves the browser bundle, which may expose the API on
 * the default export. Accept either shape without falling back to `any`.
 */
async function loadExcel(): Promise<{ Workbook: WorkbookCtor }> {
  const mod: unknown = await import('exceljs');
  const candidates: unknown[] = [mod, (mod as { default?: unknown } | null)?.default];
  for (const candidate of candidates) {
    if (candidate && typeof (candidate as { Workbook?: unknown }).Workbook === 'function') {
      return candidate as { Workbook: WorkbookCtor };
    }
  }
  throw new FileUnreadableError();
}

export interface ParsedTable {
  headers: string[];
  rows: Row[];
}

/** Reads .csv with papaparse and .xlsx/.xlsm with exceljs (legacy .xls is not supported). */
export async function readTableFile(file: File): Promise<ParsedTable> {
  if (/\.csv$/i.test(file.name)) {
    const text = await file.text();
    const parsed = Papa.parse<Row>(text.replace(/^\uFEFF/, ''), {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (header) => header.trim(),
    });
    const headers = parsed.meta.fields?.filter(Boolean) ?? [];
    if (headers.length === 0) throw new FileUnreadableError();
    return { headers, rows: parsed.data };
  }

  const Excel = await loadExcel();
  const workbook = new Excel.Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new FileUnreadableError();
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new FileUnreadableError();

  const headers: string[] = [];
  sheet.getRow(1).eachCell((cell, col) => {
    headers[col - 1] = cell.text.trim();
  });

  const rows: Row[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: Row = {};
    let hasValue = false;
    row.eachCell((cell, col) => {
      const header = headers[col - 1];
      if (!header) return;
      const value = cell.text ?? '';
      record[header] = value;
      if (value.trim()) hasValue = true;
    });
    if (hasValue) rows.push(record);
  });

  return { headers: headers.filter(Boolean), rows };
}

export interface SheetSpec {
  name: string;
  /** Optional heading printed in a merged row above the table. */
  title?: string;
  header: readonly string[];
  rows: ReadonlyArray<ReadonlyArray<string | number>>;
}

const HEADER_FILL = 'FF0B7285';
const HEADER_INK = 'FFFFFFFF';
const GRID_LINE = 'FFDCE4E7';
const STRIPE_FILL = 'FFF3F8F9';

function solidFill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function hairline(argb: string): ExcelJS.Border {
  return { style: 'thin', color: { argb } };
}

/** Width per column from the longest cell or header text (Persian runs a little wider than Latin). */
function fitWidths(
  header: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<string | number>>,
): number[] {
  return header.map((title, index) => {
    let longest = title.length;
    for (const row of rows) {
      const cell = row[index];
      if (cell === undefined || cell === '') continue;
      const length = String(cell).length;
      if (length > longest) longest = length;
    }
    return Math.min(44, Math.max(10, Math.round(longest * 1.15) + 3));
  });
}

/**
 * Writes an .xlsx workbook: one styled, frozen, filterable table per sheet, RTL views,
 * banded rows, a brand-coloured header and thousands-separated numbers. Everything is
 * explicit cell formatting, so the file looks the same in Excel, WPS and LibreOffice.
 */
export async function buildWorkbook(sheets: readonly SheetSpec[]): Promise<Blob> {
  const Excel = await loadExcel();
  const workbook = new Excel.Workbook();
  workbook.creator = 'پلاسکو منیجینگ';

  sheets.forEach((spec, index) => {
    const startRow = spec.title ? 2 : 1;
    const columns = spec.header.length;
    const lastRow = startRow + spec.rows.length;
    const sheet = workbook.addWorksheet(spec.name, {
      views: [{ rightToLeft: true, state: 'frozen', ySplit: startRow }],
      properties: { defaultRowHeight: 22 },
      pageSetup: {
        paperSize: 9,
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        printTitlesRow: `${startRow}:${startRow}`,
        margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
      },
    });

    if (spec.title) {
      sheet.mergeCells(1, 1, 1, columns);
      const cell = sheet.getCell(1, 1);
      cell.value = spec.title;
      cell.font = { bold: true, size: 13, color: { argb: HEADER_INK } };
      cell.fill = solidFill(HEADER_FILL);
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getRow(1).height = 32;
    }

    if (spec.rows.length > 0) {
      sheet.addTable({
        name: `Table${index + 1}`,
        ref: `A${startRow}`,
        headerRow: true,
        style: {
          theme: 'TableStyleLight1',
          showRowStripes: false,
          showFirstColumn: false,
          showLastColumn: false,
          showColumnStripes: false,
        },
        columns: spec.header.map((name) => ({ name, filterButton: true })),
        rows: spec.rows.map((row) => [...row]),
      });
    } else {
      const header = sheet.getRow(startRow);
      spec.header.forEach((name, col) => {
        header.getCell(col + 1).value = name;
      });
    }

    const numeric = spec.header.map((_, col) => spec.rows.some((row) => typeof row[col] === 'number'));
    for (let rowIndex = startRow; rowIndex <= lastRow; rowIndex += 1) {
      const row = sheet.getRow(rowIndex);
      const isHeader = rowIndex === startRow;
      const isEvenData = !isHeader && (rowIndex - startRow) % 2 === 0;
      if (isHeader) row.height = 30;
      for (let col = 1; col <= columns; col += 1) {
        const cell = row.getCell(col);
        cell.border = {
          top: hairline(GRID_LINE),
          left: hairline(GRID_LINE),
          bottom: hairline(GRID_LINE),
          right: hairline(GRID_LINE),
        };
        if (isHeader) {
          cell.font = { bold: true, size: 11, color: { argb: HEADER_INK } };
          cell.fill = solidFill(HEADER_FILL);
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        } else {
          if (isEvenData) cell.fill = solidFill(STRIPE_FILL);
          if (numeric[col - 1]) {
            cell.numFmt = '#,##0';
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          } else {
            cell.alignment = { vertical: 'middle' };
          }
        }
      }
    }

    fitWidths(spec.header, spec.rows).forEach((width, col) => {
      sheet.getColumn(col + 1).width = width;
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** CSV with a UTF-8 BOM so Excel shows Persian correctly. */
export function buildCsv(header: readonly string[], rows: ReadonlyArray<ReadonlyArray<string | number>>): Blob {
  const csv = Papa.unparse(
    { fields: [...header], data: rows.map((row) => row.map((cell) => String(cell))) },
    { newline: '\r\n' },
  );
  return new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
}

/** Saves a blob, preferring the iOS-safe Share Sheet when the file is large. */
export async function saveBlob(blob: Blob, filename: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return 'shared';
    } catch {
      // Fall through to the download path when the user cancels or sharing fails.
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
