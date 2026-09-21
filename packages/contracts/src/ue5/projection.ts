import type { DeviceId, InstallationId, ProjectId, TenantId } from "../ids";
import type { SourceObservation } from "../observation";
import type { EventEnvelope } from "./ingestion";
import type { Environment } from "./wire";

/**
 * ONE ARCHITECTURE, NOT TWO — the proof, in code.
 *
 * ADR-0015 fixed the ingestion boundary: clients submit immutable **source
 * observations**, and server-side adapters normalise those into canonical facts.
 * `observation.ts` describes the stored shape. Everything in this directory
 * describes what travels over the wire to produce it.
 *
 * The obvious risk in writing a wire contract at all is that it quietly becomes
 * a second analytics architecture with its own store, its own vocabulary and its
 * own eventual reconciliation problem. This module is the guard against that: a
 * total function from a UE5 wire event plus server-derived identity to the
 * existing `SourceObservation`. If the two ever diverge, this stops compiling.
 *
 * ## Where every field comes from
 *
 * | SourceObservation      | Source                                            |
 * | ---------------------- | ------------------------------------------------- |
 * | `observationId`        | client `event_id` — the idempotency key            |
 * | `sourceSchemaVersion`  | client `schema_version`, as the UE5 vocabulary     |
 * | `source`               | **constant** `showroom`                            |
 * | `sourceEventName`      | client `event_name`, carried and not interpreted   |
 * | `tenantId`             | **server**, from the credential                    |
 * | `projectId`            | **server**, from the credential                    |
 * | `installationId`       | **server**, from the source record                 |
 * | `deviceId`             | **server**, from the source record                 |
 * | `occurredAt`           | client `occurred_at`, never corrected              |
 * | `sequence`             | client `sequence` — see the amendment below        |
 * | `payload`              | client `properties`, untouched                     |
 *
 * Identity arrives as a **separate argument**, never read from the payload. That
 * is structural rather than a convention: there is no code path here through
 * which a property called `tenant_id` could reach `tenantId`, whatever a client
 * sends and whatever a future maintainer forgets.
 */

/**
 * Everything the server knows that the client does not get to say.
 *
 * Derived from the activated source credential on every request (LOCKED §3.2,
 * §4.2, §9.2). Nothing in this record has a client-supplied counterpart.
 */
export interface DerivedIdentity {
  readonly tenantId: TenantId;
  readonly projectId: ProjectId;
  /** The registered source, as a bare UUID on the wire side. */
  readonly sourceId: string;
  readonly installationId: InstallationId | null;
  readonly deviceId: DeviceId | null;
  /** From the source record, never from the client's reported value. */
  readonly environment: Environment;
}

/** The UE5 plugin is one source system, and the contract already names it. */
export const UE5_SOURCE_SYSTEM = "showroom" as const;

/**
 * How the UE5 registry generation is spelled in the stored observation.
 *
 * `sourceSchemaVersion` is "the submitting system's own event vocabulary", so it
 * records both which vocabulary and which generation of it: `ue5-1`.
 */
export function ue5SourceSchemaVersion(schemaVersion: number): string {
  return `ue5-${schemaVersion}`;
}

/**
 * The projection, with `sequence` still nullable.
 *
 * Structurally a `SourceObservation` except for the one field where the two
 * contracts genuinely disagree. Keeping it visible is the point: see
 * `toSourceObservation` for why it is not simply defaulted away.
 */
export type ProjectedObservation = Omit<SourceObservation, "sequence"> & {
  readonly sequence: number | null;
};

export function projectEvent(
  event: EventEnvelope,
  identity: DerivedIdentity,
): ProjectedObservation {
  return {
    observationId: event.event_id,
    sourceSchemaVersion: ue5SourceSchemaVersion(event.schema_version),
    source: UE5_SOURCE_SYSTEM,
    sourceEventName: event.event_name,

    /* Server-derived. Not reachable from the event, by construction. */
    tenantId: identity.tenantId,
    projectId: identity.projectId,
    installationId: identity.installationId,
    deviceId: identity.deviceId,

    occurredAt: event.occurred_at,
    sequence: event.sequence,
    payload: event.properties,
  };
}

/* ============================================== the one genuine disagreement */

export type SequenceAmendment =
  | { readonly ok: true; readonly observation: SourceObservation }
  | { readonly ok: false; readonly reason: "sequence_required_by_observation_contract" };

/**
 * Narrow a projection to the stored `SourceObservation`, or say why it cannot.
 *
 * **A real, unresolved contradiction, deliberately left visible.**
 * `SourceObservationSchema` requires a non-negative integer `sequence`. The UE5
 * wire contract needs it null for events that genuinely belong to no session —
 * application start before anyone arrives, heartbeat-adjacent diagnostics —
 * because inventing an ordering position for an event that has none is a lie a
 * read model will later believe.
 *
 * Three ways out, and this contract picks none of them:
 *
 *   1. make `SourceObservation.sequence` nullable — an amendment to
 *      `observation.ts` and therefore to ADR-0015's stored shape;
 *   2. keep it required and default non-session events to `0` — cheap, and
 *      exactly the kind of silent default that produces a wrong number two years
 *      later, because `0` sorts before every real event in the session it is not
 *      part of;
 *   3. require every event to carry a session, which is false to the domain.
 *
 * Recommended default is (1), and it is an amendment for review rather than
 * something a wire contract may decide on its own. Until then this function
 * refuses rather than invents, and `projection.test.ts` asserts the refusal.
 */
export function toSourceObservation(projection: ProjectedObservation): SequenceAmendment {
  if (projection.sequence === null) {
    return { ok: false, reason: "sequence_required_by_observation_contract" };
  }
  const { sequence, ...rest } = projection;
  return { ok: true, observation: { ...rest, sequence } };
}
