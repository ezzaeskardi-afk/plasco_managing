// Persian text normalization - AGENTS.md section 7.
// Used for search, dedupe and import matching. Never for display.

const ARABIC_TO_PERSIAN: ReadonlyArray<readonly [string, string]> = [
  ['\u064A', '\u06CC'], // ي -> ی
  ['\u0649', '\u06CC'], // ى -> ی
  ['\u0643', '\u06A9'], // ك -> ک
  ['\u06AA', '\u06A9'], // ڪ -> ک
];

// Arabic diacritics (harakat), tatweel and ZWNJ/ZWJ variants.
const DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
const ZWNJ = /[\u200B-\u200F\u202A-\u202E\uFEFF]/g;

const PERSIAN_DIGITS = '\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9';
const ARABIC_DIGITS = '\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669';

/** Converts Persian (۰-۹) and Arabic-Indic (٠-٩) digits to Latin digits. */
export function toLatinDigits(input: string): string {
  let out = '';
  for (const ch of input) {
    const p = PERSIAN_DIGITS.indexOf(ch);
    if (p >= 0) {
      out += String(p);
      continue;
    }
    const a = ARABIC_DIGITS.indexOf(ch);
    if (a >= 0) {
      out += String(a);
      continue;
    }
    out += ch;
  }
  return out;
}

/** Converts Latin digits to Persian digits for display. */
export function toPersianDigits(input: string | number): string {
  let out = '';
  for (const ch of String(input)) {
    const code = ch.charCodeAt(0);
    out += code >= 48 && code <= 57 ? PERSIAN_DIGITS[code - 48] : ch;
  }
  return out;
}

/**
 * normalizeFa: ي→ی, ك→ک, strip diacritics and tatweel, ZWNJ→space,
 * Persian and Arabic digits→Latin, lowercase Latin, collapse whitespace, trim.
 */
export function normalizeFa(input: string): string {
  if (!input) return '';
  let out = input.normalize('NFC');

  for (const [from, to] of ARABIC_TO_PERSIAN) {
    out = out.split(from).join(to);
  }

  out = out.replace(DIACRITICS, '').replace(ZWNJ, ' ');
  out = toLatinDigits(out);
  out = out.toLowerCase();
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}

/** Splits already-normalized text into unique tokens. */
export function normalizeTokens(input: string): string[] {
  const n = normalizeFa(input);
  if (!n) return [];
  return Array.from(new Set(n.split(' ').filter(Boolean)));
}
