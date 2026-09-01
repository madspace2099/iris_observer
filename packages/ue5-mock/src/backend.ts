import {
  ACTIVATION_HTTP_STATUS,
  ActivationRequestSchema,
  BatchFrameSchema,
  DEFAULT_CLOCK_POLICY,
  HARNESS_LIMITS,
  HeartbeatRequestSchema,
  UNSTATED_LIMITS,
  resolveLimits,
  serialisedBytes,
  validateEvent,
  type ActivationFailure,
  type ActivationSuccess,
  type BatchResponse,
  type BatchWarning,
  type ClockPolicy,
  type EffectiveLimits,
  type Environment,
  type EventRegistry,
  type EventResult,
  type HeartbeatRequest,
  type HeartbeatResponse,
  type Limits,
  type SourceState,
} from "@observer/contracts/ue5";
import { Deterministic } from "./ids";
import type { Directive, MockFixture } from "./scenarios";
import { MOCK_ONLY_FIXTURES } from "./scenarios";

/**
 * THE REFERENCE BACKEND — deterministic, local, and Supabase-free.
 *
 * One object that answers the three proposed endpoints exactly as the contract
 * describes them, so that our contract tests and Akhilesh's future UE5 transport
 * tests exercise the same protocol rather than two readings of the same
 * document.
 *
 * **What it is not.** Not a production implementation, not a preview of one, and
 * not a design for one. It has no database, no network egress, no cryptography
 * and no concurrency. Every identifier comes from a counter and every clock is
 * injected. Storage is a `Map`.
 *
 * **What it is for.** Reproducing, on demand and identically every time, the
 * situations a transport has to survive: a duplicate, a partial batch, a
 * revoked credential, a 429 that means wait, a 503 that means nothing was
 * stored, and the two transport drops that a client cannot tell apart.
 *
 * ## The one design decision worth arguing about
 *
 * **Deduplication is scoped to the source, not global.** Two reasons, and the
 * second is the one that settles it. Correctness: `event_id` is minted by a
 * client offline, so uniqueness across every installation in the world is an
 * assumption rather than a guarantee. Security: with a global index, a source
 * holding an extracted credential could submit a guessed `event_id` and learn
 * from a `duplicate` answer that some *other* source had sent it — a
 * cross-tenant existence oracle built out of a success response. Scoped
 * deduplication closes it, and `security.test.ts` proves it stays closed.
 */

export interface MockClock {
  now(): Date;
}

/** A clock that only moves when a test moves it. */
export class FixedClock implements MockClock {
  private current: number;
  constructor(start: Date | string = "2026-09-01T09:00:00.000Z") {
    this.current = typeof start === "string" ? Date.parse(start) : start.getTime();
  }
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current += ms;
  }
  set(at: Date | string): void {
    this.current = typeof at === "string" ? Date.parse(at) : at.getTime();
  }
}

export interface BackendOptions {
  /** Base for the URLs handed back at activation. Loopback in tests. */
  readonly baseUrl?: string;
  readonly clock?: FixedClock;
  readonly seed?: number;
  /** What the server *states* at activation. Null values by default: OPEN-12. */
  readonly statedLimits?: Limits;
  /** What the server actually enforces. Harness ceilings by default. */
  readonly enforcedLimits?: EffectiveLimits;
  readonly clockPolicy?: ClockPolicy;
  readonly registry?: EventRegistry | null;
  readonly acceptedSchemaVersions?: { readonly min: number; readonly max: number };
  /**
   * The prefix on generated activation codes. Cosmetic, and deliberately so.
   *
   * Akhilesh's UE build tests against `DEV-` codes; this harness mints `OBS-`.
   * **A prefix is not semantic to the contract** — the schema constrains length
   * and nothing else — so the mock lets a test pick one rather than forcing the
   * UE side to change something the protocol does not care about.
   */
  readonly codePrefix?: string;
  readonly fixture?: MockFixture;
}

export interface SourceRecord {
  readonly sourceId: string;
  readonly tenantId: string;
  readonly projectId: string;
  displayLabel: string;
  environment: Environment;
  state: SourceState;
  installationNonce: string | null;
}

interface CodeRecord {
  readonly code: string;
  /** Null for a code that will create a new source. */
  readonly forSourceId: string | null;
  readonly displayLabel: string;
  readonly environment: Environment;
  readonly tenantId: string;
  readonly projectId: string;
  state: "issued" | "consumed" | "expired" | "revoked";
  expiresAt: number;
}

interface CredentialRecord {
  readonly token: string;
  readonly sourceId: string;
  state: "active" | "superseded" | "revoked";
}

export interface StoredEvent {
  readonly sourceId: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly eventId: string;
  readonly eventName: string;
  readonly schemaVersion: number;
  readonly occurredAt: string;
  readonly ingestedAt: string;
  readonly sessionId: string | null;
  readonly sequence: number | null;
  readonly properties: Record<string, unknown>;
}

export type MockOutcome =
  | {
      readonly kind: "response";
      readonly status: number;
      readonly headers: Readonly<Record<string, string>>;
      readonly body: unknown;
    }
  /** No response reaches the client. `processed` says what the server did anyway. */
  | { readonly kind: "dropped"; readonly processed: boolean };

const json = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): MockOutcome => ({
  kind: "response",
  status,
  headers: { "content-type": "application/json", ...headers },
  body,
});

export class MockObserverBackend {
  private readonly ids: Deterministic;
  private readonly clock: FixedClock;
  private readonly baseUrl: string;
  private readonly statedLimits: Limits;
  private readonly enforced: EffectiveLimits;
  private readonly clockPolicy: ClockPolicy;
  private readonly registry: EventRegistry | null;
  private readonly acceptedSchemaVersions: { readonly min: number; readonly max: number };
  private readonly fixture: MockFixture;
  private readonly codePrefix: string;

  private readonly sources = new Map<string, SourceRecord>();
  private readonly codes = new Map<string, CodeRecord>();
  private readonly credentials = new Map<string, CredentialRecord>();
  private readonly events = new Map<string, StoredEvent>();
  private readonly heartbeats = new Map<string, HeartbeatRequest>();
  private readonly directives: Directive[] = [];

  private requestIndex = 0;

  constructor(options: BackendOptions = {}) {
    this.ids = new Deterministic(options.seed ?? 0x0b5e_2ef1);
    this.clock = options.clock ?? new FixedClock();
    this.baseUrl = options.baseUrl ?? "http://127.0.0.1:0/functions/v1";
    this.statedLimits = options.statedLimits ?? UNSTATED_LIMITS;
    this.enforced = options.enforcedLimits ?? resolveLimits(this.statedLimits, HARNESS_LIMITS);
    this.clockPolicy = options.clockPolicy ?? DEFAULT_CLOCK_POLICY;
    this.registry = options.registry ?? null;
    this.acceptedSchemaVersions = options.acceptedSchemaVersions ?? { min: 1, max: 1 };
    this.fixture = options.fixture ?? MOCK_ONLY_FIXTURES.none();
    this.codePrefix = options.codePrefix ?? "OBS";
  }

  /* ============================================================== operator */

  /**
   * Issue an activation code, as an operator would in Admin.
   *
   * Omitting `forSourceId` issues a code that will create a new source. Giving
   * one issues a code that re-credentials that source: the recovery and rotation
   * path, which is deliberately the same flow rather than a second endpoint.
   */
  issueActivationCode(
    options: {
      readonly forSourceId?: string;
      readonly displayLabel?: string;
      readonly environment?: Environment;
      readonly tenantId?: string;
      readonly projectId?: string;
      readonly expiresInMs?: number;
      readonly prefix?: string;
    } = {},
  ): string {
    const existing =
      options.forSourceId === undefined ? undefined : this.sources.get(options.forSourceId);
    const code = this.ids.activationCode(options.prefix ?? this.codePrefix);
    this.codes.set(code, {
      code,
      forSourceId: options.forSourceId ?? null,
      displayLabel: options.displayLabel ?? existing?.displayLabel ?? "Showroom PC",
      environment: options.environment ?? existing?.environment ?? "production",
      tenantId: options.tenantId ?? existing?.tenantId ?? "tnt_mockten0001",
      projectId: options.projectId ?? existing?.projectId ?? "prj_mockproj001",
      state: "issued",
      expiresAt: this.clock.now().getTime() + (options.expiresInMs ?? 15 * 60_000),
    });
    return code;
  }

  expireCode(code: string): void {
    const record = this.codes.get(code);
    if (record) record.state = "expired";
  }

  /**
   * Withdraw a code an operator issued and then thought better of.
   *
   * Answers exactly as an unknown or expired code does. A revoked code that
   * failed differently would tell the holder that it had once been real.
   */
  revokeCode(code: string): void {
    const record = this.codes.get(code);
    if (record) record.state = "revoked";
  }

  revokeCredentialFor(sourceId: string): void {
    for (const credential of this.credentials.values()) {
      if (credential.sourceId === sourceId && credential.state === "active") {
        credential.state = "revoked";
      }
    }
  }

  setSourceState(sourceId: string, state: SourceState): void {
    const source = this.sources.get(sourceId);
    if (source) source.state = state;
  }

  /* ============================================================ directives */

  /** Queue a forced outcome. Consumed by the next request, whichever it is. */
  push(...directives: readonly Directive[]): void {
    this.directives.push(...directives);
  }

  private takeDirective(): Directive | null {
    this.requestIndex += 1;
    const queued = this.directives.shift();
    if (queued !== undefined) return queued;
    return this.fixture.at(this.requestIndex);
  }

  /* =========================================================== inspection */

  storedEventIds(sourceId?: string): readonly string[] {
    return [...this.events.values()]
      .filter((event) => sourceId === undefined || event.sourceId === sourceId)
      .map((event) => event.eventId);
  }

  storedCount(sourceId?: string): number {
    return this.storedEventIds(sourceId).length;
  }

  storedEvent(sourceId: string, eventId: string): StoredEvent | undefined {
    return this.events.get(`${sourceId}::${eventId}`);
  }

  source(sourceId: string): SourceRecord | undefined {
    return this.sources.get(sourceId);
  }

  sourceIdForToken(token: string): string | null {
    return this.credentials.get(token)?.sourceId ?? null;
  }

  lastHeartbeat(sourceId: string): HeartbeatRequest | undefined {
    return this.heartbeats.get(sourceId);
  }

  /* ============================================================ activation */

  activate(body: unknown): MockOutcome {
    const directive = this.takeDirective();
    const forced = this.forcedActivationOutcome(directive);
    if (forced !== null) return forced;

    const parsed = ActivationRequestSchema.safeParse(body);
    if (!parsed.success) {
      return json(
        ACTIVATION_HTTP_STATUS.malformed_request,
        this.activationFailure("malformed_request", "The request could not be read."),
      );
    }
    const request = parsed.data;

    const code = this.codes.get(request.activation_code);
    const now = this.clock.now().getTime();
    const usable = code !== undefined && code.state === "issued" && code.expiresAt > now;

    if (code !== undefined && code.state === "issued" && code.expiresAt <= now) {
      code.state = "expired";
    }

    if (!usable || code === undefined) {
      /* Unknown, expired and consumed are one answer. LOCKED §9.1. */
      return json(
        ACTIVATION_HTTP_STATUS.activation_failed,
        this.activationFailure("activation_failed", "The activation code could not be used."),
      );
    }

    if (code.forSourceId === null) {
      const clash = [...this.sources.values()].find(
        (source) =>
          source.installationNonce === request.installation_nonce && source.state !== "archived",
      );
      if (clash !== undefined) {
        /*
         * The code is deliberately NOT consumed. Nothing was exchanged for it,
         * and burning it would make the operator issue another to fix a problem
         * the operator has not been told about yet.
         */
        return json(
          ACTIVATION_HTTP_STATUS.already_activated,
          this.activationFailure(
            "already_activated",
            "This installation is already registered. Ask an operator to rotate or retire it.",
            clash.sourceId,
          ),
        );
      }
      const source: SourceRecord = {
        sourceId: this.ids.uuid(),
        tenantId: code.tenantId,
        projectId: code.projectId,
        displayLabel: code.displayLabel,
        environment: code.environment,
        state: "active",
        installationNonce: request.installation_nonce,
      };
      this.sources.set(source.sourceId, source);
      code.state = "consumed";
      return json(200, this.mintCredential(source, "activated", request.reported_environment));
    }

    const source = this.sources.get(code.forSourceId);
    if (source === undefined || source.state === "archived") {
      /* Still indistinguishable: an archived source must not be discoverable. */
      return json(
        ACTIVATION_HTTP_STATUS.activation_failed,
        this.activationFailure("activation_failed", "The activation code could not be used."),
      );
    }

    /* A reimaged machine reactivating keeps the source and brings a new nonce. */
    source.installationNonce = request.installation_nonce;
    code.state = "consumed";
    for (const credential of this.credentials.values()) {
      if (credential.sourceId === source.sourceId && credential.state === "active") {
        credential.state = "superseded";
      }
    }
    return json(200, this.mintCredential(source, "reactivated", request.reported_environment));
  }

  private forcedActivationOutcome(directive: Directive | null): MockOutcome | null {
    switch (directive?.kind) {
      case "rate_limit":
        return json(
          ACTIVATION_HTTP_STATUS.rate_limited,
          this.activationFailure(
            "rate_limited",
            "Too many attempts.",
            null,
            directive.retryAfterSeconds,
          ),
          { "retry-after": String(directive.retryAfterSeconds) },
        );
      case "unavailable":
        return json(
          ACTIVATION_HTTP_STATUS.unavailable,
          this.activationFailure("unavailable", "Temporarily unavailable."),
        );
      case "drop_before_processing":
        return { kind: "dropped", processed: false };
      default:
        return null;
    }
  }

  private activationFailure(
    code: ActivationFailure["code"],
    message: string,
    sourceId: string | null = null,
    retryAfterSeconds: number | null = null,
  ): ActivationFailure {
    return {
      status: "failed",
      code,
      message,
      source_id: sourceId,
      retry_after_seconds: retryAfterSeconds,
    };
  }

  private mintCredential(
    source: SourceRecord,
    status: ActivationSuccess["status"],
    reportedEnvironment: Environment,
  ): ActivationSuccess {
    const token = this.ids.sourceToken();
    this.credentials.set(token, { token, sourceId: source.sourceId, state: "active" });
    return {
      status,
      source_id: source.sourceId,
      display_label: source.displayLabel,
      environment: source.environment,
      environment_mismatch: reportedEnvironment !== source.environment,
      source_token: token,
      ingest_url: `${this.baseUrl}/observer-ingest`,
      heartbeat_url: `${this.baseUrl}/observer-heartbeat`,
      token_expires_at: null,
      accepted_schema_versions: this.acceptedSchemaVersions,
      limits: this.statedLimits,
      config_refresh_after: new Date(this.clock.now().getTime() + 30 * 86_400_000).toISOString(),
    };
  }

  /* ============================================================= ingestion */

  ingest(authorization: string | null, body: unknown): MockOutcome {
    const directive = this.takeDirective();
    const batchId = readBatchId(body);

    const forced = this.forcedRequestOutcome(directive, batchId);
    if (forced !== null) return forced;

    const authorised = this.authorise(authorization, batchId);
    if (authorised.kind === "failed") return authorised.outcome;
    const source = authorised.source;

    const parsed = BatchFrameSchema.safeParse(body);
    if (!parsed.success) {
      return this.requestFailure(
        400,
        "malformed_request",
        "The batch envelope is not valid.",
        batchId,
      );
    }
    const batch = parsed.data;

    if (batch.events.length > this.enforced.maxBatchEvents) {
      return this.requestFailure(
        413,
        "batch_too_large",
        "Too many events. Split and retry.",
        batch.batch_id,
      );
    }
    if (serialisedBytes(batch) > this.enforced.maxBatchBytes) {
      return this.requestFailure(
        413,
        "batch_too_large",
        "Body too large. Split and retry.",
        batch.batch_id,
      );
    }

    const storageFailures = new Set(directive?.kind === "storage_error" ? directive.eventIds : []);

    const ingestedAt = this.clock.now().toISOString();
    const results: EventResult[] = [];
    const warnings = new Map<string, BatchWarning>();
    let accepted = 0;
    let duplicate = 0;
    let rejected = 0;

    for (const raw of batch.events) {
      const key = `${source.sourceId}::${raw.event_id}`;

      /* Deduplicate before validating: a replay is a replay, however it parses. */
      if (this.events.has(key)) {
        results.push({
          event_id: raw.event_id,
          status: "duplicate",
          code: null,
          retryable: null,
          detail: null,
        });
        duplicate += 1;
        continue;
      }

      if (storageFailures.has(raw.event_id)) {
        results.push({
          event_id: raw.event_id,
          status: "rejected",
          code: "storage_error",
          retryable: true,
          detail: "temporary storage failure",
        });
        rejected += 1;
        continue;
      }

      const verdict = validateEvent(raw, {
        limits: this.enforced,
        acceptedSchemaVersions: this.acceptedSchemaVersions,
        registry: this.registry,
        clock: this.clockPolicy,
        now: this.clock.now(),
      });

      if (!verdict.ok) {
        results.push({
          event_id: raw.event_id,
          status: "rejected",
          code: verdict.rejection.code,
          retryable: verdict.rejection.code === "storage_error",
          detail: verdict.rejection.detail,
        });
        rejected += 1;
        continue;
      }

      for (const warning of verdict.warnings) warnings.set(warning.code, warning);

      this.events.set(key, {
        sourceId: source.sourceId,
        tenantId: source.tenantId,
        projectId: source.projectId,
        eventId: verdict.event.event_id,
        eventName: verdict.event.event_name,
        schemaVersion: verdict.event.schema_version,
        occurredAt: verdict.event.occurred_at,
        ingestedAt,
        sessionId: verdict.event.session_id,
        sequence: verdict.event.sequence,
        properties: verdict.event.properties,
      });
      results.push({
        event_id: raw.event_id,
        status: "accepted",
        code: null,
        retryable: null,
        detail: null,
      });
      accepted += 1;
    }

    const response: BatchResponse = {
      batch_id: batch.batch_id,
      received: batch.events.length,
      accepted,
      duplicate,
      rejected,
      results,
      warnings: [...warnings.values()],
    };

    /*
     * Everything above already happened. This is the case a client cannot
     * distinguish from a drop before processing, and the reason `event_id` is
     * stable.
     */
    if (directive?.kind === "drop_after_processing") return { kind: "dropped", processed: true };

    return json(200, response);
  }

  /* ============================================================= heartbeat */

  heartbeat(authorization: string | null, body: unknown): MockOutcome {
    const directive = this.takeDirective();
    const forced = this.forcedRequestOutcome(directive, null);
    if (forced !== null) return forced;

    const authorised = this.authorise(authorization, null);
    if (authorised.kind === "failed") return authorised.outcome;

    const parsed = HeartbeatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return this.requestFailure(400, "malformed_request", "The heartbeat is not valid.", null);
    }
    this.heartbeats.set(authorised.source.sourceId, parsed.data);

    const response: HeartbeatResponse = {
      status: "ok",
      server_time: this.clock.now().toISOString(),
      config_stale: false,
    };
    return json(200, response);
  }

  /* ================================================================ shared */

  private forcedRequestOutcome(
    directive: Directive | null,
    batchId: string | null,
  ): MockOutcome | null {
    switch (directive?.kind) {
      case "rate_limit":
        return this.requestFailure(
          429,
          "rate_limited",
          "Slow down.",
          batchId,
          directive.retryAfterSeconds,
        );
      case "unavailable":
        return this.requestFailure(503, "unavailable", "Nothing was stored.", batchId);
      case "batch_too_large":
        return this.requestFailure(413, "batch_too_large", "Split and retry.", batchId);
      case "malformed_request":
        return this.requestFailure(
          400,
          "malformed_request",
          "The request could not be read.",
          batchId,
        );
      case "drop_before_processing":
        return { kind: "dropped", processed: false };
      default:
        return null;
    }
  }

  private authorise(
    authorization: string | null,
    batchId: string | null,
  ): { kind: "ok"; source: SourceRecord } | { kind: "failed"; outcome: MockOutcome } {
    const token = readBearer(authorization);
    const credential = token === null ? undefined : this.credentials.get(token);
    if (credential === undefined || credential.state !== "active") {
      return {
        kind: "failed",
        outcome: this.requestFailure(401, "unauthorised", "The credential was refused.", batchId),
      };
    }
    const source = this.sources.get(credential.sourceId);
    if (source === undefined) {
      return {
        kind: "failed",
        outcome: this.requestFailure(401, "unauthorised", "The credential was refused.", batchId),
      };
    }
    if (source.state !== "active") {
      return {
        kind: "failed",
        outcome: this.requestFailure(
          403,
          "source_suspended",
          source.state === "archived"
            ? "This source has been archived."
            : "This source is suspended.",
          batchId,
        ),
      };
    }
    return { kind: "ok", source };
  }

  private requestFailure(
    status: number,
    code:
      | "malformed_request"
      | "unauthorised"
      | "source_suspended"
      | "batch_too_large"
      | "rate_limited"
      | "unavailable",
    message: string,
    batchId: string | null,
    retryAfterSeconds: number | null = null,
  ): MockOutcome {
    return json(
      status,
      { code, message, batch_id: batchId, retry_after_seconds: retryAfterSeconds },
      retryAfterSeconds === null ? {} : { "retry-after": String(retryAfterSeconds) },
    );
  }
}

function readBearer(authorization: string | null): string | null {
  if (authorization === null) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

/** The batch id, if the body got far enough to have a readable one. */
function readBatchId(body: unknown): string | null {
  if (body === null || typeof body !== "object") return null;
  const candidate = (body as Record<string, unknown>)["batch_id"];
  return typeof candidate === "string" ? candidate : null;
}
