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
  header: readonly string[];
  rows: ReadonlyArray<ReadonlyArray<string | number>>;
}

/** Writes an .xlsx workbook with RTL sheet views. */
export async function buildWorkbook(sheets: readonly SheetSpec[]): Promise<Blob> {
  const Excel = await loadExcel();
  const workbook = new Excel.Workbook();
  for (const spec of sheets) {
    const sheet = workbook.addWorksheet(spec.name, { views: [{ rightToLeft: true }] });
    sheet.addRow([...spec.header]);
    sheet.getRow(1).font = { bold: true };
    for (const row of spec.rows) sheet.addRow([...row]);
    spec.header.forEach((_, index) => {
      sheet.getColumn(index + 1).width = 18;
    });
  }
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
