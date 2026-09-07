import { CATALOGUE_STATUSES, type CatalogueStatus } from "@observer/contracts";

/**
 * Status words, mapped by a person before a connector is switched on.
 *
 * A code Observer recognises on its own is one that literally spells a
 * canonical status (`reserved`, `sold`); everything else is the tenant's own
 * vocabulary and comes from the mapping table on the integrations screen
 * (ADR-0036 decision 4). What the table does not cover is `unknown`, never a
 * guess — and the raw word travels beside it so the gap can be closed.
 */
export type StatusMap = Readonly<Record<string, CatalogueStatus>>;

const CANONICAL = new Set<string>(CATALOGUE_STATUSES);

export function mapStatus(raw: string | null | undefined, map: StatusMap): CatalogueStatus {
  if (raw === null || raw === undefined) return "unknown";
  const key = raw.trim();
  const mapped = map[key] ?? map[key.toLowerCase()];
  if (mapped !== undefined) return mapped;
  const literal = key.toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  return CANONICAL.has(literal) ? (literal as CatalogueStatus) : "unknown";
}

/** The raw status as a non-empty label, so `statusRaw` can always be stored. */
export function rawStatus(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "(absent)";
  const text = String(raw).trim();
  return text.length === 0 ? "(absent)" : text;
}

/**
 * A number as a European spreadsheet or a Czech CRM writes it.
 *
 * `5 000 000`, `6,1`, `6.050.000,00` and plain `6050000` all read; anything
 * that is not clearly a number is null rather than zero, because a zero price
 * is a claim and an empty cell is not.
 */
export function readNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  let text = raw.replace(/[\s ]/g, "").trim();
  if (text.length === 0) return null;
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  if (lastComma > lastDot) {
    // Decimal comma: dots are thousands separators.
    text = text.replaceAll(".", "").replace(",", ".");
  } else if (lastDot > lastComma) {
    // Decimal point: commas are thousands separators.
    text = text.replaceAll(",", "");
  }
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function readInteger(raw: string | number | null | undefined): number | null {
  const value = readNumber(raw);
  return value === null || !Number.isInteger(value) ? null : value;
}

/** Compass codes as written, split on the separators the sources use. */
export function readOrientation(raw: string | readonly string[] | null | undefined): string[] {
  if (raw === null || raw === undefined) return [];
  const parts = Array.isArray(raw) ? raw : String(raw).split(/[,;/|]+/);
  return parts
    .map((p) => String(p).trim())
    .filter((p) => p.length > 0 && p.length <= 8)
    .slice(0, 8);
}

/** An ISO instant with an offset, or null — never a guessed timezone. */
export function readInstant(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const text = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(text))
    return null;
  return Number.isNaN(Date.parse(text)) ? null : text;
}

/** Sum of the parts that exist; null when none does. */
export function sumOrNull(parts: readonly (number | null)[]): number | null {
  const present = parts.filter((p): p is number => p !== null);
  return present.length === 0 ? null : present.reduce((a, b) => a + b, 0);
}

export function nonEmpty(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  return text.length === 0 ? null : text;
}
