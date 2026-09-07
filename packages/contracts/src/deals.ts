import { z } from "zod";
import { ConnectorKindSchema } from "./catalogue";
import { DealStageSchema, type DealStage } from "./engagement";
import { InstantSchema, ProjectIdSchema, TenantIdSchema } from "./ids";

/**
 * THE CANONICAL DEAL, AS A CONNECTOR DELIVERS IT.
 *
 * A CRM records what was agreed; Observer records what happened
 * (`docs/01-foundation.md` §4). The deal ladder is the CRM's, authoritative,
 * and this product never puts its own opinion on a rung (ADR-0021). What a
 * connector can deliver is the CRM's current statement about each deal, in
 * the CRM's own words, and one shape has to hold that for every vendor:
 *
 * - **The stage is mapped, never guessed.** A Lomnio `stage.code`, a Monday
 *   status label, a spreadsheet column are the client's vocabulary; a person
 *   maps them to the seven canonical stages on the integrations screen
 *   (ADR-0036 decision 4). Until a word is mapped the deal carries
 *   `stage: null` beside its raw word, and the ladder says so rather than
 *   filing it under the friendliest rung.
 * - **No person travels in the stream.** The CRM's customer record has a name,
 *   an email and a phone. None of them is carried. `subjectKey` is a keyed
 *   hash of the email, or failing that the phone (`docs/01-foundation.md` §4
 *   rule 3: email first, phone second), so the same buyer across two syncs
 *   and two sources is the same key and nobody can read the key back.
 * - **Change is derived by diffing two snapshots.** REALPAD offers no
 *   per-record history and a spreadsheet none at all, so the stage change is
 *   the fact this contract produces: `deal.stage.changed`, whose event id is
 *   a hash of what changed and when (`dealEventKey`), so the same change
 *   delivered twice is one fact (ADR-0001).
 */

export const CrmDealSchema = z.strictObject({
  /** The CRM's own identifier for the deal. Stable across syncs. */
  externalId: z.string().min(1).max(128),
  /** The unit the deal is about, by catalogue code, when the source states one. */
  unitCode: z.string().min(1).max(64).nullable(),
  /** Keyed hash of the buyer's email, else phone. Never the value. Null when the source states neither. */
  subjectKey: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  /** The canonical stage the mapping produced, or null for a word not mapped yet. */
  stage: DealStageSchema.nullable(),
  /** The source's own word, untouched, so a mapping can be corrected from the row. */
  stageRaw: z.string().min(1).max(200),
  /** When the source says the deal entered its current stage, if it says. */
  stageEnteredAt: InstantSchema.nullable(),
  openedAt: InstantSchema.nullable(),
  updatedAt: InstantSchema.nullable(),
  /** The source's own closed flags, where it has them. Not derived from the stage. */
  won: z.boolean().nullable(),
  lost: z.boolean().nullable(),
});
export type CrmDeal = z.infer<typeof CrmDealSchema>;

export const DealSnapshotSchema = z.strictObject({
  tenantId: TenantIdSchema,
  projectId: ProjectIdSchema,
  connector: ConnectorKindSchema,
  fetchedAt: InstantSchema,
  deals: z.array(CrmDealSchema),
});
export type DealSnapshot = z.infer<typeof DealSnapshotSchema>;

/** The branded tenant, project and connector a snapshot belongs to. */
export type DealScope = Pick<DealSnapshot, "tenantId" | "projectId" | "connector">;

/* --- the fact: a stage changed ---------------------------------------------- */

export const DEAL_CHANGE_KINDS = ["opened", "stage_changed", "withdrawn"] as const;
export const DealChangeKindSchema = z.enum(DEAL_CHANGE_KINDS);
export type DealChangeKind = z.infer<typeof DealChangeKindSchema>;

/**
 * One `deal.stage.changed` fact, before it is given its id.
 *
 * `at` is when the source says the stage was entered, or the fetch instant
 * when it does not say; `observedAt` is always the fetch instant, so a reader
 * can tell a dated stage from one only known to have changed between two
 * pulls.
 */
export const DealChangeSchema = z.strictObject({
  kind: DealChangeKindSchema,
  externalId: z.string().min(1).max(128),
  unitCode: z.string().min(1).max(64).nullable(),
  subjectKey: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  from: DealStageSchema.nullable(),
  fromRaw: z.string().min(1).max(200).nullable(),
  to: DealStageSchema.nullable(),
  toRaw: z.string().min(1).max(200).nullable(),
  at: InstantSchema,
  observedAt: InstantSchema,
});
export type DealChange = z.infer<typeof DealChangeSchema>;

/** The fact as stored: the change and the id that makes it idempotent. */
export const DealStageChangeSchema = DealChangeSchema.extend({
  eventId: z.string().regex(/^[a-f0-9]{64}$/),
});
export type DealStageChange = z.infer<typeof DealStageChangeSchema>;

/**
 * What a stage change's event id is a hash of: the scope, the deal, the kind
 * of change, the word it moved to and when. The connector layer hashes this
 * with SHA-256; the contract only says what goes in. Two syncs that see the
 * same move produce the same key; a later move to the same word at a later
 * time is a new fact.
 */
export function dealEventKey(scope: DealScope, change: DealChange): string {
  return [
    "deal.stage.changed",
    scope.tenantId,
    scope.projectId,
    scope.connector,
    change.externalId,
    change.kind,
    change.toRaw ?? "",
    change.at,
  ].join("\u0000");
}

/**
 * The facts between two snapshots of the same connector.
 *
 * A deal in `next` and not in `previous` opened; one whose raw stage word
 * differs changed stage; one in `previous` and not in `next` was withdrawn
 * from the source. A deal whose word is the same is silent, even if the
 * mapping changed between the two syncs: the mapping is configuration, and a
 * remap is not something the CRM said.
 */
export function diffDeals(
  previous: readonly CrmDeal[],
  next: readonly CrmDeal[],
  fetchedAt: string,
): DealChange[] {
  const before = new Map(previous.map((d) => [d.externalId, d]));
  const after = new Map(next.map((d) => [d.externalId, d]));
  const changes: DealChange[] = [];
  const byId = (a: CrmDeal, b: CrmDeal) => a.externalId.localeCompare(b.externalId);

  for (const deal of [...after.values()].sort(byId)) {
    const was = before.get(deal.externalId);
    const at = deal.stageEnteredAt ?? fetchedAt;
    if (was === undefined) {
      changes.push({
        kind: "opened",
        externalId: deal.externalId,
        unitCode: deal.unitCode,
        subjectKey: deal.subjectKey,
        from: null,
        fromRaw: null,
        to: deal.stage,
        toRaw: deal.stageRaw,
        at,
        observedAt: fetchedAt,
      });
      continue;
    }
    if (was.stageRaw !== deal.stageRaw) {
      changes.push({
        kind: "stage_changed",
        externalId: deal.externalId,
        unitCode: deal.unitCode,
        subjectKey: deal.subjectKey,
        from: was.stage,
        fromRaw: was.stageRaw,
        to: deal.stage,
        toRaw: deal.stageRaw,
        at,
        observedAt: fetchedAt,
      });
    }
  }
  for (const deal of [...before.values()].sort(byId)) {
    if (after.has(deal.externalId)) continue;
    changes.push({
      kind: "withdrawn",
      externalId: deal.externalId,
      unitCode: deal.unitCode,
      subjectKey: deal.subjectKey,
      from: deal.stage,
      fromRaw: deal.stageRaw,
      to: null,
      toRaw: null,
      at: fetchedAt,
      observedAt: fetchedAt,
    });
  }
  return changes;
}

/**
 * Which canonical stage a source's word maps to, by the tenant's table.
 *
 * Exact first, then case-insensitive, then null: a word the table does not
 * name is carried raw and counted for the mapping table, never guessed.
 */
export function mapStage(
  raw: string,
  stageMap: Readonly<Record<string, DealStage>>,
): DealStage | null {
  const key = raw.trim();
  const exact = stageMap[key];
  if (exact !== undefined) return exact;
  const lower = key.toLowerCase();
  for (const [word, stage] of Object.entries(stageMap)) {
    if (word.trim().toLowerCase() === lower) return stage;
  }
  return null;
}
