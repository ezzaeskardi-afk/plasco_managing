import { normalizeFa } from './normalizeFa';

/** Search - AGENTS.md section 6. Entry text is built in memory and rebuilt (debounced) on changes. */

export interface SearchDoc {
  id: string;
  name: string;
  variant?: string;
  family?: string;
  code: string;
  barcodes?: readonly string[];
  brandName?: string;
  categoryName?: string;
}

export interface SearchEntry {
  id: string;
  /** Normalized concatenation of every searchable field. */
  haystack: string;
  /** Unique tokens of the haystack, used for token-AND matching. */
  tokens: string[];
  nameN: string;
  codeN: string;
  barcodesN: string[];
}

export function buildEntry(doc: SearchDoc): SearchEntry {
  const nameN = normalizeFa(doc.name);
  const codeN = normalizeFa(doc.code);
  const barcodesN = (doc.barcodes ?? []).map((b) => normalizeFa(b)).filter(Boolean);
  const haystack = normalizeFa(
    [doc.name, doc.variant, doc.family, doc.code, doc.brandName, doc.categoryName, ...(doc.barcodes ?? [])]
      .filter(Boolean)
      .join(' '),
  );
  return {
    id: doc.id,
    haystack,
    tokens: Array.from(new Set(haystack.split(' ').filter(Boolean))),
    nameN,
    codeN,
    barcodesN,
  };
}

export function buildSearchIndex(docs: readonly SearchDoc[]): SearchEntry[] {
  return docs.map(buildEntry);
}

const SCORE = {
  barcodeExact: 1000,
  codeExact: 900,
  barcodePrefix: 820,
  codePrefix: 800,
  namePrefix: 700,
  tokenAll: 500,
} as const;

/**
 * Token-AND matching with ranking:
 * exact barcode/code > name prefix > token match. Returns product ids, best first.
 */
const collator = new Intl.Collator('fa');

export function searchIndex(entries: readonly SearchEntry[], query: string, limit = 60): string[] {
  const q = normalizeFa(query);
  if (!q) return [];
  const tokens = q.split(' ').filter(Boolean);
  const scored: Array<{ id: string; score: number; nameN: string }> = [];

  for (const entry of entries) {
    let score = 0;

    if (entry.codeN === q || entry.barcodesN.includes(q)) {
      score = entry.barcodesN.includes(q) ? SCORE.barcodeExact : SCORE.codeExact;
    } else if (entry.codeN.startsWith(q) || entry.barcodesN.some((b) => b.startsWith(q))) {
      score = entry.barcodesN.some((b) => b.startsWith(q)) ? SCORE.barcodePrefix : SCORE.codePrefix;
    } else if (entry.nameN.startsWith(q)) {
      score = SCORE.namePrefix;
    } else {
      let matched = 0;
      for (const token of tokens) {
        if (entry.tokens.some((t) => t.startsWith(token))) matched += 1;
      }
      if (matched === tokens.length) {
        score = SCORE.tokenAll + matched;
      }
    }

    if (score > 0) scored.push({ id: entry.id, score, nameN: entry.nameN });
  }

  scored.sort((a, b) => b.score - a.score || collator.compare(a.nameN, b.nameN));
  return scored.slice(0, limit).map((s) => s.id);
}
