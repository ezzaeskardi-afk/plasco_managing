export interface ErrorEntry {
  at: number;
  message: string;
  stack?: string;
  context?: string;
}

const KEY = 'plasco:error-log';
const MAX_ENTRIES = 50;

export function logError(entry: { message: string; stack?: string; context?: string }): void {
  try {
    const rows = readErrors();
    rows.unshift({ at: Date.now(), ...entry });
    localStorage.setItem(KEY, JSON.stringify(rows.slice(0, MAX_ENTRIES)));
  } catch {
    // Storage full or unavailable: never let logging break the app.
  }
}

export function readErrors(): ErrorEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ErrorEntry[];
  } catch {
    return [];
  }
}

export function clearErrors(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function errorsAsText(): string {
  return readErrors()
    .map((e) => `${new Date(e.at).toISOString()}${e.context ? ` [${e.context}]` : ''} ${e.message}${e.stack ? `\n${e.stack}` : ''}`)
    .join('\n\n');
}
