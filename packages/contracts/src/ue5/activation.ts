import { z } from "zod";
import {
  BuildMetadataSchema,
  EnvironmentSchema,
  SchemaVersionSchema,
  WireUuidSchema,
} from "./wire";
import { LimitsSchema } from "./limits";

/**
 * ACTIVATION — how a packaged build becomes a registered source. PROPOSED.
 *
 * An operator creates a project source in Admin and issues a one-time,
 * short-lived activation code. The installation exchanges it exactly once for a
 * source-scoped credential, and the code is dead afterwards (LOCKED §3.1).
 * Everything the server will later treat as identity — tenant, project, source,
 * environment — is fixed here, on the server, from the operator's own record.
 *
 * ## Three field-level decisions that are not the obvious ones
 *
 * **There is no machine fingerprint.** An earlier draft hashed hardware to
 * detect repeat activation. It does detect it — and it also blocks the ordinary
 * case of reinstalling IRIS on the same showroom PC, because the hardware is
 * unchanged and the server answers 409 to a perfectly legitimate setup. A
 * hardware-derived, persistent identifier that creates support tickets is a bad
 * trade for a check that is not a security control in the first place: the code
 * is one-time, so the *code* cannot be replayed regardless. What remains is
 * `installation_nonce` — a random value the plugin generates once and keeps
 * beside its outbox. It catches the failure the brief actually names (a second
 * fresh code pasted into an installation that already holds a working
 * credential) without touching hardware, without an OS-specific API to port to
 * every platform in OPEN-7, and without turning a reinstall into an escalation.
 *
 * **There is no hostname hint.** It was Admin display convenience, and it was
 * the only field in the protocol capable of carrying a person's name into an
 * operational store — showroom machines are named after people more often than
 * anyone plans for. The operator names the source when they create it, and a
 * server-authored `display_label` comes back in the response instead. Untrusted
 * client text replaced by trusted server text, for the same benefit.
 *
 * **The response does not return `tenant_id` or `project_id`.** The plugin has
 * no operational use for either: it never sends them, and the server would
 * ignore them if it did. Returning them for a diagnostic screen buys a legible
 * label at the cost of placing two authoritative-looking identifiers inside a
 * client that some future implementer will, eventually, echo into an event. The
 * label is what the diagnostic screen actually needed.
 */

/* ================================================================ request */

/**
 * The activation code, as printed in Admin.
 *
 * Shape only. The security properties that matter are stated in
 * `docs/ue5-ingestion-contract.md`: at least 60 bits of entropy from a
 * cryptographic source, constant-time comparison, a strict per-source and
 * per-caller attempt limit, and one indistinguishable failure for unknown,
 * expired and consumed codes.
 *
 * The bound exists so that a megabyte of garbage is refused before anything
 * expensive happens. It does not describe the alphabet.
 */
export const ActivationCodeSchema = z.string().min(8).max(64);

export const ActivationRequestSchema = z.strictObject({
  activation_code: ActivationCodeSchema,

  /**
   * What this build believes it is. **Informational.** The stored environment
   * comes from the source record; a mismatch is a warning for the operator, not
   * a routing decision.
   */
  reported_environment: EnvironmentSchema,

  /**
   * A random value the plugin generates once and persists beside its outbox.
   *
   * Not a security control and not identity — a packaged application cannot
   * keep a secret, and this contract does not pretend otherwise. Its only job is
   * to let the server answer "this installation already has a live source"
   * instead of silently creating a second one (LOCKED §9.1).
   */
  installation_nonce: WireUuidSchema,

  build: BuildMetadataSchema,

  /**
   * Operating system, for the support matrix. Free text because the set is not
   * ours to enumerate; bounded because everything on the wire is.
   */
  os: z.string().min(1).max(96),
});
export type ActivationRequest = z.infer<typeof ActivationRequestSchema>;

/* ================================================================ success */

/**
 * Whether this activation created the source or re-credentialed an existing one.
 *
 * `reactivated` is the whole of the recovery mechanism: an operator issues a new
 * code for the *same* source, the plugin runs the ordinary flow, and the
 * previous credential dies. There is deliberately no token-refresh endpoint —
 * credential material reaches a device through exactly one door.
 */
export const ACTIVATION_OUTCOMES = ["activated", "reactivated"] as const;
export const ActivationOutcomeSchema = z.enum(ACTIVATION_OUTCOMES);
export type ActivationOutcome = z.infer<typeof ActivationOutcomeSchema>;

export const AcceptedSchemaVersionsSchema = z.strictObject({
  min: SchemaVersionSchema,
  max: SchemaVersionSchema,
});

export const ActivationSuccessSchema = z.strictObject({
  status: ActivationOutcomeSchema,

  /**
   * Which source this installation is, for support and for the operator.
   *
   * Informational to the plugin: never sent back, never placed in an event,
   * never part of an authorisation decision. The server derives the
   * authoritative source from the credential on every single request.
   */
  source_id: WireUuidSchema,

  /**
   * A human-readable name for this source, authored by the operator in Admin.
   *
   * What a diagnostic screen shows. Replaces both the client-supplied hostname
   * hint and the returned tenant/project identifiers.
   */
  display_label: z.string().min(1).max(120),

  /**
   * The authoritative environment, from the source record.
   *
   * Returned so the plugin can display it, and so a misconfigured build is
   * visible on a screen in the showroom rather than only in a server log.
   */
  environment: EnvironmentSchema,

  /** True exactly when the reported environment disagrees with the record. */
  environment_mismatch: z.boolean(),

  /**
   * The credential. Returned **once**, on this response, and never again.
   *
   * Opaque to the client: never parsed, split, decoded, or written to a log.
   */
  source_token: z.string().min(32).max(512),

  /**
   * When this credential stops working, or `null` — which is what it always is
   * in this candidate.
   *
   * The field exists precisely because the answer is "never". A client that
   * reads it and finds `null` knows no expiry is stated; if a policy is ever
   * introduced, the value arrives in a field the client already reads rather
   * than in a new one that breaks every build parsing this response strictly.
   * See `credential.ts` for why no expiry is proposed.
   */
  token_expires_at: z.iso.datetime({ offset: true }).nullable(),

  ingest_url: z.url(),
  heartbeat_url: z.url(),

  accepted_schema_versions: AcceptedSchemaVersionsSchema,
  limits: LimitsSchema,

  /**
   * When to re-read *configuration* — limits, accepted versions, URLs.
   *
   * Emphatically not a token lifetime. The credential does not expire; see
   * `credential.ts` for why an expiry would force a second door for credential
   * material to reach a device in exchange for nothing the brief asks for.
   */
  config_refresh_after: z.iso.datetime({ offset: true }),
});
export type ActivationSuccess = z.infer<typeof ActivationSuccessSchema>;

/* ================================================================ failure */

/**
 * Codes activation can fail with.
 *
 * `activation_failed` covers unknown, malformed-after-safe-parsing, expired,
 * revoked, already-consumed **and** tied-to-an-ineligible-source codes with one
 * indistinguishable answer. That is not tidiness: a response which separates
 * them tells anyone holding a guessed code whether a tenant, a project or a
 * source exists (LOCKED §9.1).
 *
 * ## `already_activated` was removed, and why that is a narrowing rather than a loss
 *
 * An earlier draft carried `already_activated`, answered it with `409`, and
 * populated `source_id` so an operator could find the existing source in Admin.
 * The docblock above it cited §9.1 for indistinguishability and then broke §9.1
 * two fields later.
 *
 * The cost was real: a `409` carrying a `source_id` turns a guessed code into an
 * **existence oracle**. It confirms that the code was genuine, that a source
 * exists, and hands over that source's identifier — to a caller who has, by
 * definition, not authenticated. Operator convenience is not worth an
 * unauthenticated enumeration path, and the operator already has a better route
 * to the same fact: they are signed in to Admin, where the source is listed.
 *
 * A second installation presenting a consumed code now receives exactly what an
 * attacker with a guessed code receives — `activation_failed`, `401`, no
 * `source_id`. Reactivation is the supported path, and it is initiated by an
 * operator issuing a fresh one-time code, never by the client asking.
 */
export const ACTIVATION_FAILURE_CODES = [
  "activation_failed",
  "malformed_request",
  "rate_limited",
  "unavailable",
] as const;
export const ActivationFailureCodeSchema = z.enum(ACTIVATION_FAILURE_CODES);
export type ActivationFailureCode = z.infer<typeof ActivationFailureCodeSchema>;

/**
 * Any non-success activation answer.
 *
 * `message` is for a human reading an installer screen. It carries no detail
 * about *why* a code failed, and nothing branches on it.
 */
export const ActivationFailureSchema = z.strictObject({
  status: z.literal("failed"),
  code: ActivationFailureCodeSchema,
  message: z.string().min(1).max(300),
  /**
   * **Always `null`.** Retained as a required key so that the failure body has
   * one fixed shape and a client cannot infer anything from a field's presence
   * or absence — including by measuring the response length.
   *
   * It previously carried the existing source for `already_activated`. That was
   * an unauthenticated existence oracle; see `ACTIVATION_FAILURE_CODES`.
   */
  source_id: z.null(),
  /** Present only for `rate_limited`. Seconds. */
  retry_after_seconds: z.int().min(1).max(86_400).nullable(),
});
export type ActivationFailure = z.infer<typeof ActivationFailureSchema>;

export const ActivationResponseSchema = z.union([ActivationSuccessSchema, ActivationFailureSchema]);
export type ActivationResponse = z.infer<typeof ActivationResponseSchema>;

/** The HTTP status each activation outcome is carried on. */
export const ACTIVATION_HTTP_STATUS: Readonly<Record<ActivationFailureCode | "ok", number>> =
  Object.freeze({
    ok: 200,
    activation_failed: 401,
    malformed_request: 400,
    rate_limited: 429,
    unavailable: 503,
  });
