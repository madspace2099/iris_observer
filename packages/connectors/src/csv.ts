import type { CatalogueUnit } from "@observer/contracts";
import { fieldReader, unitFromRecord, type RecordConfig } from "./record";

/**
 * THE MANUAL PATH, WHICH MUST ALWAYS WORK.
 *
 * `docs/01-foundation.md` §4 rule 2: a client without a supported CRM must
 * still be able to use the product. A spreadsheet exported to CSV is that
 * path. RFC 4180 as people actually produce it: quoted fields, doubled
 * quotes, CRLF or LF, a trailing newline or not, and a separator that is a
 * comma or — from a Hungarian or Czech Excel — a semicolon.
 */

export type CsvConfig = RecordConfig;

export interface CsvOutcome {
  readonly units: CatalogueUnit[];
  /** Rows that could not become a unit, by line number, with the reason. */
  readonly rejected: readonly { readonly line: number; readonly reason: string }[];
}

export function parseCsv(text: string, separator?: "," | ";"): string[][] {
  const sep = separator ?? detectSeparator(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] as string;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

function detectSeparator(text: string): "," | ";" {
  const head = text.split(/\r?\n/, 1)[0] ?? "";
  const commas = (head.match(/,/g) ?? []).length;
  const semicolons = (head.match(/;/g) ?? []).length;
  return semicolons > commas ? ";" : ",";
}

/**
 * Turns a sheet into units by the client's own column names.
 *
 * A row without a code is rejected by line number rather than dropped, so
 * the screen can say "row 14 has no unit code" instead of "we imported 47 of
 * 48". A duplicated code is rejected the same way: two rows claiming one
 * flat is a question for the person, not a coin toss for the importer.
 */
export function csvCatalogue(text: string, config: CsvConfig): CsvOutcome {
  const rows = parseCsv(text);
  const header = rows[0];
  if (header === undefined) return { units: [], rejected: [] };

  const index = new Map(header.map((h, i) => [h.trim().toLowerCase(), i] as const));
  const units: CatalogueUnit[] = [];
  const rejected: { line: number; reason: string }[] = [];
  const seen = new Set<string>();

  rows.slice(1).forEach((row, i) => {
    const line = i + 2;
    const read = fieldReader(config.columns, (name) => {
      const at = index.get(name.trim().toLowerCase());
      return at === undefined ? null : row[at];
    });
    const unit = unitFromRecord(read, config);
    if ("reason" in unit) {
      rejected.push({ line, reason: unit.reason });
      return;
    }
    if (seen.has(unit.code)) {
      rejected.push({ line, reason: `duplicate unit code ${unit.code}` });
      return;
    }
    seen.add(unit.code);
    units.push(unit);
  });

  return { units, rejected };
}
