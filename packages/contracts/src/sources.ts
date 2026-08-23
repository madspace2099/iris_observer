import { z } from "zod";

/**
 * Every fact Observer holds came from somewhere, and each source is
 * authoritative for a different slice of reality. Recording the source on the
 * record itself is what makes a cross-source timeline auditable — and what
 * lets a screen say honestly that a number is incomplete because one source is
 * disconnected, instead of quietly reporting a smaller figure.
 *
 * Ownership is specified in `docs/06-ownership.md`.
 */
export const SOURCE_SYSTEMS = [
  /** The public online viewer. Owns observed online behaviour. */
  "webiris",
  /** The Unreal Engine showroom application. Owns in-meeting behaviour. */
  "showroom",
  /** The developer's CRM. Owns contact, appointment and deal-stage facts. */
  "crm",
  /** The unit catalogue. Owns unit attributes, price and availability. */
  "catalogue",
  /** Observer itself. Owns normalised timelines, metrics and intelligence. */
  "observer",
] as const;

export const SourceSystemSchema = z.enum(SOURCE_SYSTEMS);
export type SourceSystem = z.infer<typeof SourceSystemSchema>;

/**
 * A pointer to the same real-world thing in another system.
 *
 * Cross-references are explicit records rather than a foreign key sitting in a
 * column, because the mapping is many-to-many in practice: one Observer
 * contact can correspond to two CRM records that nobody has merged yet, and a
 * CRM record can be reachable under both an internal id and an external email.
 * Flattening that into one column is how duplicate-contact bugs start.
 */
export const SourceReferenceSchema = z.strictObject({
  system: SourceSystemSchema,
  /** Which kind of record this points at, in that system's own vocabulary. */
  entity: z.string().min(1).max(64),
  /** The identifier as that system spells it. Never parsed, only carried. */
  externalId: z.string().min(1).max(256),
  /**
   * Which connector produced the mapping, so a bad sync run can be traced and
   * reversed without touching mappings made by hand or by another connector.
   */
  connector: z.string().min(1).max(64).optional(),
  observedAt: z.iso.datetime({ offset: true }),
  /**
   * Whether a human confirmed the mapping. An automatic match on a shared
   * email is useful, but it is not the same claim as a person confirming that
   * two records are the same buyer, and the difference must survive in data.
   */
  confirmed: z.boolean().default(false),
});
export type SourceReference = z.infer<typeof SourceReferenceSchema>;
