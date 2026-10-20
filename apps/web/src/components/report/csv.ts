import type { Language } from "@observer/readmodels";

/**
 * THE REPORT'S FIGURES AS A CSV FILE (ADR-0045).
 *
 * One row per figure the report page prints: the section it sits in, the
 * figure's label, the value as the page displays it, its denominator or the
 * section's sample with its noun, the period, the scope and the source chips.
 * The rows are `figures.ts`'s; this file only writes them, and computes
 * nothing.
 *
 * Three things a spreadsheet needs and a naive join gets wrong:
 *
 *   - a byte-order mark, so Excel reads UTF-8 and "Zsófia" and "stretnutí"
 *     arrive intact rather than as mojibake;
 *   - RFC 4180 quoting: a cell holding a comma, a quote or a line break is
 *     quoted and its quotes doubled, and lines end in CRLF;
 *   - a formula guard: a cell that begins with `=`, `+`, `-`, `@`, a tab or a
 *     carriage return is prefixed with an apostrophe, so a delta like "+18%"
 *     or a label somebody typed cannot run as a formula when the file is
 *     opened (CSV injection).
 */

export interface FigureRow {
  readonly section: string;
  readonly figure: string;
  /** As the page displays it. An absent value is its word ("Unavailable"), never 0. */
  readonly value: string;
  /** The figure's own denominator, the section's sample, or empty for a sentence. */
  readonly denominator: string;
  /** The source chips, in the read model's order. */
  readonly sources: string;
}

/** The file's own words: the column heads, and the labels of rows that are not a metric. */
export interface CsvWords {
  readonly columns: readonly [string, string, string, string, string, string, string];
  readonly reason: string;
  readonly finding: string;
  readonly note: string;
}

/* English is the product's; the Slovak and Hungarian are drafts for review (P2-17). */
export const CSV_WORDS: Readonly<Record<Language, CsvWords>> = {
  en: {
    columns: ["Section", "Figure", "Value", "Denominator or sample", "Period", "Scope", "Sources"],
    reason: "Reason",
    finding: "Finding",
    note: "Note",
  },
  sk: {
    columns: ["Sekcia", "Údaj", "Hodnota", "Menovateľ alebo vzorka", "Obdobie", "Rozsah", "Zdroje"],
    reason: "Dôvod",
    finding: "Zistenie",
    note: "Poznámka",
  },
  hu: {
    columns: ["Szakasz", "Adat", "Érték", "Nevező vagy minta", "Időszak", "Hatókör", "Források"],
    reason: "Indok",
    finding: "Megállapítás",
    note: "Megjegyzés",
  },
};

/** One cell: guarded against formula injection, then quoted where RFC 4180 requires it. */
export function csvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded;
}

/** The whole file: BOM, the heads in the report's language, then every row with its period and scope. */
export function toCsv(
  language: Language,
  period: string,
  scope: string,
  rows: readonly FigureRow[],
): string {
  const lines = [
    CSV_WORDS[language].columns,
    ...rows.map((row) => [
      row.section,
      row.figure,
      row.value,
      row.denominator,
      period,
      scope,
      row.sources,
    ]),
  ];
  return `\uFEFF${lines.map((line) => line.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

/** "Zsófia Barány" → "zsofia-barany": accents folded, anything else a hyphen. */
function ascii(part: string): string {
  return part
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** `shark-residence_zsofia-barany_year-to-date_hu.csv`: ASCII, so every browser keeps it. */
export function csvFilename(parts: readonly string[]): string {
  return `${parts
    .map(ascii)
    .filter((part) => part.length > 0)
    .join("_")}.csv`;
}
