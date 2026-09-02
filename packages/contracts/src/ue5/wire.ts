import { z } from "zod";

/**
 * THE UE5 WIRE LAYER — PRIMITIVES.
 *
 * This directory is the **transport encoding of the ingestion boundary that
 * ADR-0015 already fixed**, not a second analytics architecture. The pipeline
 * is unchanged:
 *
 * ```
 * UE5 wire event → [server derives identity] → source observation
 *                → adapter → canonical fact → projection → metric
 * ```
 *
 * `observation.ts` describes the *stored* first box. This describes what
 * travels over the wire to reach it, and `projection.ts` is the executable
 * proof that one becomes the other with no second store in between.
 *
 * ## Two rules govern every schema here
 *
 * **The envelope is closed; the properties bag is open.** Every envelope is a
 * `strictObject`, so an unexpected field is a rejection rather than a silent
 * omission — a plugin that sends `project_id` must find out at the developer's
 * desk, not by having it quietly ignored in production for a year. Event
 * `properties` stay open because their shape belongs to the per-event schema
 * registry (ADR-0013), which is a later milestone.
 *
 * **Nothing here is a security decision.** These schemas describe shape. Every
 * authorisation fact — tenant, project, source, environment — is derived by the
 * server from the activated credential and never read from a request body.
 * `identity.test.ts` is the proof.
 */

/* ============================================================ versioning */

/**
 * The version of this wire contract.
 *
 * Deliberately marked a candidate. It is a **proposal awaiting sign-off**, not
 * an approved interface, and `traceability.test.ts` fails if that claim is
 * quietly upgraded while OPEN decisions remain.
 */
export const UE5_CONTRACT_VERSION = "1.0.0-candidate.1" as const;

/** What the repository claims about the maturity of this contract. */
export const UE5_CONTRACT_STATUS = "PROPOSED" as const;

/**
 * Event-schema versions this contract describes.
 *
 * A single integer, not a semver string: the plugin has to compare it against
 * a server-supplied range on every activation, and integer comparison is the
 * one form of that check nobody gets wrong. `SUPPORTED_SCHEMA_VERSIONS` in
 * `version.ts` remains the application-level contract version; this is the
 * per-event registry generation.
 */
export const UE5_SCHEMA_VERSION_MIN = 1;
export const UE5_SCHEMA_VERSION_MAX = 1;

export const SchemaVersionSchema = z.int().min(1).max(4096);

/* ============================================================ primitives */

/**
 * An instant, always with an offset — the same rule the rest of the contract
 * uses (`ids.ts`). A timestamp without one is a bug, and on a showroom PC in a
 * country that changes its clocks twice a year it is a bug that only appears
 * in October.
 */
export const WireInstantSchema = z.iso.datetime({ offset: true });

/**
 * A client-generated identifier. UUID, because the plugin must be able to mint
 * one offline, before the first send, with no coordination (LOCKED §4.1).
 *
 * Note what this is *not*: the branded, prefixed identifiers in `ids.ts` are
 * Observer's own vocabulary for entities the server owns. The wire deliberately
 * uses bare UUIDs, so that nothing the client sends can ever be mistaken for a
 * server-issued identity.
 */
export const WireUuidSchema = z.uuid();

/**
 * THE IDENTIFIER QUESTION — DECIDED. `OPEN-14` is closed, and `PD-12` is
 * superseded by `PD-12a`.
 *
 * `WireUuidSchema` is `z.uuid()`, which enforces an RFC 4122 version nibble
 * (1–8) and variant nibble (8/9/a/b). **That strictness arrived from a schema
 * library's default, not from the approved architecture.**
 *
 * `PD-12` previously kept it, reasoning that `CoCreateGuid` backs `FGuid` on the
 * confirmed Windows-only V1 platform, so the bits are set in practice. That is
 * true and it is also the problem: **the guarantee rests on a platform accident
 * rather than on the contract.** Nothing in this repository enforces that Unreal
 * keeps routing through `CoCreateGuid`, and the first non-Windows target — or a
 * change inside the engine — begins silently rejecting valid event identifiers
 * at the ingestion boundary, roughly three times in four, at random.
 *
 * What is actually locked is narrower: a *stable, globally unique 128-bit event
 * identifier, generated once before queueing and preserved through retries*
 * (§4.1, §5.4). Nothing downstream reads the version bits. Nothing in the
 * security model depends on them. Deduplication is scoped to
 * `(source_id, event_id)`, so the collision domain is one installation rather
 * than the world, and 128 random bits are far beyond sufficient for that whether
 * or not six of them are pinned to a constant.
 *
 * So `CanonicalIdSchema` is now wired into the envelope. It is a **relaxation**
 * of what was accepted before, so no identifier that parsed yesterday stops
 * parsing today.
 *
 * ## Why lowercase, when the previous schema accepted either case
 *
 * This one direction *is* a narrowing, and it is deliberate. PostgreSQL's native
 * `uuid` type normalises its input to lowercase on output. An uppercase
 * `event_id` would therefore be stored, read back **altered**, and echoed in
 * `results[]` in a form the client never sent — so a UE outbox matching results
 * to pending entries by string would fail to pair them, and a successfully
 * stored event would stay pending for ever.
 *
 * Accepting only what round-trips unchanged is what makes native `uuid` storage
 * safe. `FGuid::NewGuid().ToString(EGuidFormats::DigitsWithHyphensLower)` emits
 * lowercase, so this costs the confirmed client nothing.
 */
export const CANONICAL_128_BIT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const CanonicalIdSchema = z
  .string()
  .regex(CANONICAL_128_BIT_ID, "must be a canonical lowercase hyphenated 128-bit identifier");

/** What the architecture actually requires of an event identifier. */
export const EVENT_ID_REQUIREMENT =
  "A stable, globally unique 128-bit identifier, generated once before queueing and preserved " +
  "through every retry. Version and variant semantics are not part of the requirement.";

/**
 * An event name, in the source's own vocabulary.
 *
 * Constrained to a dotted lowercase form so that a name is a legible key rather
 * than free text, and so the reserved `diagnostic.` namespace can be recognised
 * without a lookup. **No concrete business event names are fixed here** —
 * ADR-0013 defers the catalogue, and this contract does not pre-empt it.
 */
export const EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export const EventNameSchema = z
  .string()
  .min(3)
  .max(80)
  .regex(EVENT_NAME_PATTERN, "must be a dotted lower_snake_case name, e.g. section.entered");

/**
 * A short opaque token used for log correlation only.
 *
 * Never an identity, never an authorisation input, never stored as a fact.
 */
export const CorrelationIdSchema = z.uuid();

/* ================================================================ routes */

/**
 * THE V1 ROUTE PATHS, IN ONE PLACE.
 *
 * They lived as literals inside `buildOpenApiDocument()` and again as a separate
 * `ROUTES` const in the reference server — one fact in two places, where the
 * only place a divergence surfaces is a deployment rather than a test. A third
 * implementation had no way to reach either.
 *
 * Two forms, because two callers need different things and deriving one from the
 * other is what keeps them honest:
 *
 *   `OBSERVER_ROUTE_NAMES`  the OpenAPI path keys, relative to the server URL,
 *                           which already carries the prefix.
 *   `OBSERVER_ROUTES`       absolute paths, which is what an HTTP adapter
 *                           actually dispatches on.
 *
 * The `/functions/v1` prefix is part of the path, not decoration: it is where a
 * Supabase Edge Function is served from, so a local adapter that drops it passes
 * its own tests and fails against a deployment. The names are backend-owned
 * (`PD-13`); the UE side reads them from Project Settings and never hard-codes
 * them.
 */
export const OBSERVER_ROUTE_PREFIX = "/functions/v1" as const;

export const OBSERVER_ROUTE_NAMES = Object.freeze({
  activate: "/observer-activate",
  ingest: "/observer-ingest",
  heartbeat: "/observer-heartbeat",
} as const);

export const OBSERVER_ROUTES = Object.freeze({
  activate: `${OBSERVER_ROUTE_PREFIX}${OBSERVER_ROUTE_NAMES.activate}`,
  ingest: `${OBSERVER_ROUTE_PREFIX}${OBSERVER_ROUTE_NAMES.ingest}`,
  heartbeat: `${OBSERVER_ROUTE_PREFIX}${OBSERVER_ROUTE_NAMES.heartbeat}`,
} as const);

export type ObserverRouteKey = keyof typeof OBSERVER_ROUTES;
export type ObserverRoute = (typeof OBSERVER_ROUTES)[ObserverRouteKey];

/* ============================================================ metadata */

/**
 * What a build says about itself.
 *
 * Every field here is **informational**. None of it is identity and none of it
 * participates in an authorisation decision: a credential belongs to the
 * registered source, not to a build, so changing any of these must never
 * require reactivation. The backend records them so support can answer "which
 * build is this showroom running", and so a schema-support window can be
 * enforced later against something real.
 */
export const BuildMetadataSchema = z.strictObject({
  /** The IRIS application version, as the application spells it. */
  app_version: z.string().min(1).max(64),
  /** The Observer plugin version. */
  plugin_version: z.string().min(1).max(64),
  /** The packaged build, so two machines on the same version are separable. */
  build_id: z.string().min(1).max(128),
  /**
   * The Unreal Engine version this build was packaged with, e.g. `5.6`.
   *
   * Reported, never enforced. Which engine minors the plugin supports is an
   * Unreal support-matrix question; the backend's only interest is recording
   * what is in the field.
   */
  engine_version: z.string().min(1).max(32),
});
export type BuildMetadata = z.infer<typeof BuildMetadataSchema>;

/* ============================================================ environments */

/**
 * Deployment environments.
 *
 * A client may *report* which one it believes it is in. The stored value always
 * comes from the source record, because a misconfigured development build
 * declaring itself production is precisely the failure this must not permit.
 * See `activation.ts` for the reported/authoritative split.
 */
export const ENVIRONMENTS = ["production", "staging", "development", "demo"] as const;
export const EnvironmentSchema = z.enum(ENVIRONMENTS);
export type Environment = z.infer<typeof EnvironmentSchema>;

/**
 * Fold a client-reported environment to canonical case, without asserting it is
 * one of `ENVIRONMENTS`.
 *
 * The shipped UE client sends `"Development"` capitalised. Case folding alone
 * resolves the only mismatch the confirmed client actually has, and it is
 * deliberately separate from validation: a reported value outside the set is
 * carried and warned about, never a reason to reject an event. Nothing
 * authorises on it — the source record's environment is the authoritative one —
 * so refusing an event here would break delivery over a diagnostic.
 */
export function normaliseReportedEnvironment(reported: string): string {
  return reported.trim().toLowerCase();
}

/** Whether a reported environment matches the published vocabulary, case-folded. */
export function isCanonicalEnvironment(reported: string): boolean {
  return (ENVIRONMENTS as readonly string[]).includes(normaliseReportedEnvironment(reported));
}
