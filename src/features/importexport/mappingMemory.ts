import { db as defaultDb, type PlascoDb } from '@/db/dexie';
import { getSettings, setSettings } from '@/db/repos';
import type { SavedImportMapping } from '@/db/types';
import { IMPORT_FIELDS, importSignature, type ColumnMap, type ImportMode } from './importer';

/** Only the newest mappings stay; older company lists rarely come back. */
const MAX_MAPPINGS = 20;

/** Rebuilds a trusted ColumnMap out of a stored record, dropping unknown keys. */
export function toColumnMap(saved: Record<string, string>): ColumnMap {
  const map: ColumnMap = {};
  for (const field of IMPORT_FIELDS) {
    const header = saved[field];
    if (typeof header === 'string' && header) map[field] = header;
  }
  return map;
}

export async function findSavedMapping(
  headers: readonly string[],
  target: PlascoDb = defaultDb,
): Promise<SavedImportMapping | undefined> {
  const signature = importSignature(headers);
  if (!signature) return undefined;
  const settings = await getSettings(target);
  return (settings.importMappings ?? []).find((entry) => entry.signature === signature);
}

/**
 * Remembers the mapping (and the mode) of a file, so the second stage of a
 * company price list opens with everything already in place.
 */
export async function rememberMapping(
  input: {
    headers: readonly string[];
    map: ColumnMap;
    mode: ImportMode;
    label?: string;
  },
  target: PlascoDb = defaultDb,
): Promise<void> {
  const signature = importSignature(input.headers);
  if (!signature) return;

  const map: Record<string, string> = {};
  for (const field of IMPORT_FIELDS) {
    const header = input.map[field];
    if (header) map[field] = header;
  }

  const settings = await getSettings(target);
  const entry: SavedImportMapping = {
    signature,
    headers: [...input.headers],
    map,
    mode: input.mode,
    label: input.label,
    usedAt: Date.now(),
  };
  const others = (settings.importMappings ?? []).filter((item) => item.signature !== signature);
  await setSettings({ importMappings: [entry, ...others].slice(0, MAX_MAPPINGS) }, target);
}
