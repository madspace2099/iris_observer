import { z } from "zod";
import {
  CATALOGUE_STATUSES,
  CONNECTOR_KINDS,
  CompassSchema,
  DealStageSchema,
  type ConnectorKind,
} from "@observer/contracts";

/**
 * WHAT EACH CONNECTOR NEEDS TO BE TOLD, AND WHAT IT MUST NEVER BE TOLD HERE.
 *
 * A configuration is the non-secret half of a connection and is stored as
 * JSON in `observer.connector_configs`. Nothing in these schemas is a token or
 * a password: the credential has its own schema, its own sealed row and its
 * own door, and a configuration that could carry one would put a secret in a
 * column a screen renders.
 *
 * Every schema is strict. A field the connector does not know is refused
 * rather than stored, because a stored field somebody meant as a credential is
 * a credential in a config column.
 */

const StatusMapSchema = z.record(z.string().min(1).max(64), z.enum(CATALOGUE_STATUSES));
/** The tenant's compass codes → the eight points the product draws. `J=S`, `SV=NE`. */
const OrientationMapSchema = z.record(z.string().min(1).max(8), CompassSchema).default({});
const CurrencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/)
  .nullable();

const ColumnMappingSchema = z.strictObject({
  code: z.string().trim().min(1).max(64),
  externalId: z.string().trim().min(1).max(64).optional(),
  building: z.string().trim().min(1).max(64).optional(),
  floor: z.string().trim().min(1).max(64).optional(),
  rooms: z.string().trim().min(1).max(64).optional(),
  layout: z.string().trim().min(1).max(64).optional(),
  unitType: z.string().trim().min(1).max(64).optional(),
  interiorSqm: z.string().trim().min(1).max(64).optional(),
  exteriorSqm: z.string().trim().min(1).max(64).optional(),
  grossSqm: z.string().trim().min(1).max(64).optional(),
  priceWithVat: z.string().trim().min(1).max(64).optional(),
  priceWithoutVat: z.string().trim().min(1).max(64).optional(),
  currency: z.string().trim().min(1).max(64).optional(),
  orientation: z.string().trim().min(1).max(64).optional(),
  status: z.string().trim().min(1).max(64).optional(),
  availableFrom: z.string().trim().min(1).max(64).optional(),
  updatedAt: z.string().trim().min(1).max(64).optional(),
});

/**
 * The tenant's stage words → the seven canonical stages (ADR-0036 decision
 * 4). A word not in the table is carried raw and counted for this table,
 * never guessed.
 */
const StageMapSchema = z.record(z.string().min(1).max(200), DealStageSchema).default({});

/** Which column holds what in a deals board or a deals sheet. Id and stage are the minimum. */
const DealColumnFields = z.strictObject({
  externalId: z.string().trim().min(1).max(64),
  stage: z.string().trim().min(1).max(64),
  unitCode: z.string().trim().min(1).max(64).optional(),
  email: z.string().trim().min(1).max(64).optional(),
  phone: z.string().trim().min(1).max(64).optional(),
  stageEnteredAt: z.string().trim().min(1).max(64).optional(),
  openedAt: z.string().trim().min(1).max(64).optional(),
  updatedAt: z.string().trim().min(1).max(64).optional(),
});
const DealColumnsSchema = DealColumnFields.nullable().default(null);

/**
 * REALPAD's business-case export, by its stable header ids (`headermode=ids`),
 * which the published documents do not list: a person reads them off one
 * real export and types them here. `stage` is the Lifecycle column, `status`
 * the Status column whose WON and LOST the adapter maps by REALPAD's own
 * meaning; the rest are the fields every deals table shares.
 */
const RealpadDealColumnsSchema = DealColumnFields.extend({
  status: z.string().trim().min(1).max(64).optional(),
})
  .nullable()
  .default(null);

export const RealpadConfigSchema = z.strictObject({
  developerId: z.number().int().positive(),
  projectId: z.number().int().positive(),
  screenId: z.number().int().positive(),
  includeHidden: z.boolean().default(false),
  currency: CurrencySchema.default(null),
  orientationMap: OrientationMapSchema,
  /** Null until the export's header ids are known; no deal is read before that. */
  dealColumns: RealpadDealColumnsSchema,
  /** The tenant's Lifecycle ids. WON and LOST need no line: they are REALPAD's. */
  stageMap: StageMapSchema,
});

export const LomnioConfigSchema = z.strictObject({
  statusMap: StatusMapSchema.default({}),
  currency: CurrencySchema.default(null),
  orientationMap: OrientationMapSchema,
  /** Lomnio's `stage.code` words. The leads endpoint is fixed; only the words are the tenant's. */
  stageMap: StageMapSchema,
});

export const MondayConfigSchema = z.strictObject({
  boardId: z.string().trim().min(1).max(64),
  columns: ColumnMappingSchema,
  statusMap: StatusMapSchema.default({}),
  currency: CurrencySchema.default(null),
  orientationMap: OrientationMapSchema,
  /** Deals live on their own board, or on none: both are the client's to say. */
  dealsBoardId: z.string().trim().min(1).max(64).nullable().default(null),
  dealColumns: DealColumnsSchema,
  stageMap: StageMapSchema,
});

export const CsvConfigSchema = z.strictObject({
  columns: ColumnMappingSchema,
  statusMap: StatusMapSchema.default({}),
  currency: CurrencySchema.default(null),
  orientationMap: OrientationMapSchema,
  /** A second sheet, of deals, by its own headers. */
  dealColumns: DealColumnsSchema,
  stageMap: StageMapSchema,
});

export const CONFIG_SCHEMAS = {
  realpad: RealpadConfigSchema,
  lomnio: LomnioConfigSchema,
  monday: MondayConfigSchema,
  csv: CsvConfigSchema,
} as const;

export type RealpadConfig = z.infer<typeof RealpadConfigSchema>;
export type LomnioConfig = z.infer<typeof LomnioConfigSchema>;
export type MondayConfig = z.infer<typeof MondayConfigSchema>;
export type CsvConfig = z.infer<typeof CsvConfigSchema>;

/**
 * The secret half, as the operator pastes it and as it is sealed.
 *
 * Sealed as one JSON document, so a REALPAD login-and-password pair is one
 * ciphertext and not two rows that could be replaced out of step.
 */
export const RealpadCredentialSchema = z.strictObject({
  login: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(500),
  /**
   * The Data Takeout pair, when REALPAD issued the deals scope separately
   * from the pricelist one (ADR-0036: "optionally a second pair"). Absent,
   * the deals are fetched with the pricelist pair and REALPAD says whether
   * that pair may.
   */
  takeoutLogin: z.string().trim().min(1).max(200).nullable().default(null),
  takeoutPassword: z.string().min(1).max(500).nullable().default(null),
});
export const LomnioCredentialSchema = z.strictObject({
  token: z.string().trim().min(8).max(1000),
  /** Optional: only a project that pushes webhooks has one. */
  signingSecret: z.string().trim().min(8).max(500).nullable().default(null),
});
export const MondayCredentialSchema = z.strictObject({
  token: z.string().trim().min(8).max(2000),
});

export const CREDENTIAL_SCHEMAS = {
  realpad: RealpadCredentialSchema,
  lomnio: LomnioCredentialSchema,
  monday: MondayCredentialSchema,
  csv: null,
} as const;

export const CONNECTOR_NAMES: Readonly<Record<ConnectorKind, string>> = {
  realpad: "REALPAD",
  lomnio: "Lomnio",
  monday: "Monday",
  csv: "Spreadsheet (CSV)",
};

/** How the credential is described to the person pasting it, per connector. */
export const CREDENTIAL_WORDS: Readonly<Record<ConnectorKind, string>> = {
  realpad:
    "the pricelist login and password REALPAD support issued for this project, and the Data Takeout pair if deals were issued separately",
  lomnio: "the project's API token from Lomnio",
  monday: "an API token from the monday.com developer settings",
  csv: "nothing — a spreadsheet is uploaded, not connected",
};

/**
 * `key=value` per line, as an operator types a small mapping table.
 *
 * Blank lines and lines without `=` are skipped rather than refused: a stray
 * newline should not block a save, and a line that names nothing maps
 * nothing.
 */
export function parseMapLines(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const at = line.indexOf("=");
    if (at <= 0) continue;
    const key = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim();
    if (key.length > 0 && value.length > 0) out[key] = value;
  }
  return out;
}

/** The inverse, for a form that shows what is stored. A table not yet named is stored as null and shows as nothing. */
export function mapToLines(map: Record<string, unknown> | null | undefined): string {
  if (map === undefined || map === null) return "";
  return Object.entries(map)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

export function isConnectorKind(value: string): value is ConnectorKind {
  return (CONNECTOR_KINDS as readonly string[]).includes(value);
}

/** The last four characters of what a person would recognise their credential by. */
export function credentialTail(kind: ConnectorKind, credential: Record<string, unknown>): string {
  const key = kind === "realpad" ? "login" : "token";
  const value = credential[key];
  const text = typeof value === "string" ? value : "";
  return text.length >= 4 ? text.slice(-4) : text.padStart(4, "·");
}
