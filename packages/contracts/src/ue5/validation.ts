import type { BatchWarning, EventEnvelope } from "./ingestion";
import {
  EventEnvelopeSchema,
  depthOf,
  isReservedPropertyKey,
  serialisedBytes,
  widestObject,
} from "./ingestion";
import type { EventRejectionCode } from "./errors";
import type { EffectiveLimits } from "./limits";
import { DIAGNOSTIC_TEST_EVENT, isDiagnosticEvent } from "./diagnostic";
import { safeDetail, scanForForbiddenContent } from "./privacy";

/**
 * THE VALIDATION BOUNDARY — one event in, one verdict out.
 *
 * Shared by the reference implementation and by the contract tests, so that what
 * the mock enforces and what the contract claims cannot drift apart. It is also
 * what UE-OBS-005 is written against: the plugin should apply the same rules
 * locally before queueing, so a malformed event is caught at the source instead
 * of surviving a round trip to be quarantined.
 *
 * ## The order of the checks is part of the contract
 *
 * Cheapest and most certain first, with two deliberate departures.
 *
 * **Depth precedes size**, because the size check is itself recursive and a
 * deeply nested payload crashes it. See the comment where that happens.
 *
 * **Forbidden content precedes the registry lookup**, so an event carrying a
 * leaked email address under an unregistered name is reported as
 * `pii_suspected` rather than as `schema_unknown`. The registry problem is a
 * configuration mistake; the other one is a person's email address in a place it
 * must never be, and that is the finding an operator needs to see.
 *
 * ## Why three ceilings share one code
 *
 * Bytes, nesting depth and object breadth all answer `event_too_large`. They
 * have the same cause (an event past a limit), the same remedy (fix the
 * producer) and the same prohibition (an event is never split). Three codes
 * would be three things for a plugin to branch on where one suffices, and the
 * `detail` says which ceiling it was.
 */

/* ====================================================== the published order */

/**
 * THE VALIDATION ORDER, AS DATA — because UE-OBS-005 is being written now.
 *
 * Akhilesh is implementing the Local Validator and PII Privacy Guard against
 * this, and a prose list in a handoff document drifts from the function that
 * enforces it within two revisions. So the order is published here, rendered
 * into `docs/ue5-contract/validation-order.md`, and walked by a test that makes
 * each step fire in turn.
 *
 * Three stages, and the split matters for what the plugin can actually do:
 *
 *   `structural`  shape, size and consistency. **Implementable locally**, with
 *                 no server knowledge at all.
 *   `privacy`     reserved identity keys and forbidden content.
 *                 **Implementable locally**, and the whole point of doing it
 *                 locally is that a rejected value never leaves the machine.
 *   `semantic`    the event registry and the clock window. **Server only** — a
 *                 plugin holds neither the registry nor server time, and a
 *                 client that guessed at either would reject good events.
 *
 * A plugin that implements the first two stages before an event enters the
 * outbox turns a round trip into an assertion at the call site, and never
 * queues an event that was always going to be quarantined.
 */
export type ValidationStage = "structural" | "privacy" | "semantic";

export interface ValidationStep {
  readonly order: number;
  readonly stage: ValidationStage;
  readonly name: string;
  /** What the step checks, in the words a plugin author would use. */
  readonly checks: readonly string[];
  readonly rejection: EventRejectionCode;
  /** Whether a plugin can perform this check before queueing. */
  readonly local: boolean;
  readonly note: string;
}

export const LOCAL_VALIDATION_ORDER: readonly ValidationStep[] = Object.freeze([
  {
    order: 1,
    stage: "structural",
    name: "nesting depth",
    checks: ["maximum property depth, measured on the unparsed value"],
    rejection: "event_too_large",
    local: true,
    note:
      "First, and this order was earned: the size check serialises, serialisation recurses, " +
      "and a deeply nested payload therefore crashes the guard meant to refuse it. Measure " +
      "depth iteratively before anything walks the structure.",
  },
  {
    order: 2,
    stage: "structural",
    name: "serialised size",
    checks: ["maximum serialised size in UTF-8 bytes", "the value can be serialised at all"],
    rejection: "event_too_large",
    local: true,
    note: "A value JSON cannot represent answers malformed_event rather than event_too_large.",
  },
  {
    order: 3,
    stage: "structural",
    name: "envelope shape",
    checks: [
      "event_id is a UUID",
      "event_name is canonical dotted lower_snake_case",
      "schema_version is an integer",
      "occurred_at is UTC with an offset and millisecond precision",
      "properties is an object",
      "no field outside the envelope",
    ],
    rejection: "malformed_event",
    local: true,
    note: "The envelope is closed. An unexpected field is a rejection, never a silent drop.",
  },
  {
    order: 4,
    stage: "structural",
    name: "session and sequence consistency",
    checks: ["session_id and sequence are both present or both null"],
    rejection: "malformed_event",
    local: true,
    note: "A sequence without a session orders nothing; a session without one cannot be ordered.",
  },
  {
    order: 5,
    stage: "structural",
    name: "schema version range",
    checks: ["schema_version falls inside accepted_schema_versions from activation"],
    rejection: "unsupported_version",
    local: true,
    note: "Local because the accepted range was handed to the plugin at activation.",
  },
  {
    order: 6,
    stage: "structural",
    name: "property breadth",
    checks: ["maximum keys at any single object level"],
    rejection: "event_too_large",
    local: true,
    note: "The last structural step, so the privacy stage that follows is contiguous.",
  },
  {
    order: 7,
    stage: "privacy",
    name: "reserved identity keys",
    checks: [
      "no tenant, project or source identifier at any depth",
      "no server-assigned key such as ingested_at",
      "no observer_ or __ namespace",
      "matched case-insensitively across snake_case and camelCase",
    ],
    rejection: "reserved_property",
    local: true,
    note:
      "Rejected rather than ignored. Silently dropping the key lets a plugin believe for a " +
      "year that it was setting project_id.",
  },
  {
    order: 8,
    stage: "privacy",
    name: "forbidden content",
    checks: [
      "email addresses",
      "telephone numbers",
      "activation codes and Observer source credentials",
      "known secret-shaped values",
      "key names that hold personal data by definition",
    ],
    rejection: "pii_suspected",
    local: true,
    note:
      "A guardrail against accidents, not a guarantee. The schema registry is the stronger " +
      "future control. The finding names the key and never carries the value.",
  },
  {
    order: 9,
    stage: "semantic",
    name: "event registry",
    checks: ["event_name is registered at this schema_version"],
    rejection: "schema_unknown",
    local: false,
    note: "Server only: the plugin does not hold the registry, and guessing would reject good events.",
  },
  {
    order: 10,
    stage: "semantic",
    name: "clock window",
    checks: ["occurred_at falls inside the acceptance window in force"],
    rejection: "clock_out_of_range",
    local: false,
    note:
      "Server only, and the window itself is OPEN-3. The default policy accepts and flags; " +
      "rejection is something a deployment switches on deliberately.",
  },
]);

/** The steps a plugin can run before an event ever enters the outbox. */
export function locallyEnforceableSteps(): readonly ValidationStep[] {
  return LOCAL_VALIDATION_ORDER.filter((step) => step.local);
}

/* ============================================================ clock policy */

/**
 * What to do with an `occurred_at` that looks wrong.
 *
 * **OPEN-3.** No window is proposed. The default here accepts and flags, because
 * a rejecting window is the option that can lose a genuinely offline showroom's
 * entire backlog to a clock rule rather than to a data problem — and a reference
 * implementation must not quietly encode an undecided policy as if it were
 * settled.
 */
export type ClockPolicy =
  | { readonly kind: "accept_and_flag" }
  | {
      readonly kind: "reject_outside";
      /** How far ahead of server time is tolerated. */
      readonly maxFutureMs: number;
      /** How far behind is tolerated. Null means no past bound at all. */
      readonly maxPastMs: number | null;
    };

export const DEFAULT_CLOCK_POLICY: ClockPolicy = Object.freeze({ kind: "accept_and_flag" });

/* =============================================================== registry */

/**
 * Which event names exist, per schema version.
 *
 * Null means the registry has not been built yet, which is the true state today
 * (ADR-0013 defers the catalogue). With a null registry any well-formed name is
 * accepted, and that is recorded as a fact about the current milestone rather
 * than smuggled in as a permanent permissiveness.
 */
export interface EventRegistry {
  readonly version: number;
  readonly names: ReadonlySet<string>;
}

export interface ValidationContext {
  readonly limits: EffectiveLimits;
  readonly acceptedSchemaVersions: { readonly min: number; readonly max: number };
  readonly registry: EventRegistry | null;
  readonly clock: ClockPolicy;
  /** Server time, injected so a test is deterministic and a server is honest. */
  readonly now: Date;
}

export interface EventRejection {
  readonly code: EventRejectionCode;
  readonly detail: string;
}

export type ValidationVerdict =
  | { readonly ok: true; readonly event: EventEnvelope; readonly warnings: readonly BatchWarning[] }
  | { readonly ok: false; readonly rejection: EventRejection };

/* ============================================================== validation */

export function validateEvent(raw: unknown, context: ValidationContext): ValidationVerdict {
  const warnings: BatchWarning[] = [];

  /*
   * DEPTH BEFORE SIZE, AND THIS ORDER WAS EARNED.
   *
   * The obvious first check is the byte count: cheap, certain, refuses a
   * megabyte before anything walks it. It is also, on its own, the exact denial
   * of service it was meant to prevent — `JSON.stringify` recurses, so five
   * thousand nested arrays crash the validator inside the guard. A test found
   * that, which is why it is written down here rather than discovered in a
   * showroom.
   *
   * `depthOf` is iterative and cannot overflow, so it goes first and makes
   * everything after it safe. Depth is measured on the raw value, before the
   * schema has confirmed anything about its shape, because a hostile payload is
   * precisely one that has not been confirmed.
   */
  const depth = depthOf(raw);
  if (depth > context.limits.maxPropertyDepth + 2) {
    /* +2 for the envelope and the properties bag the payload sits inside. */
    return reject(
      "event_too_large",
      `properties nest ${depth} deep, past ${context.limits.maxPropertyDepth}`,
    );
  }

  let bytes: number;
  try {
    bytes = serialisedBytes(raw);
  } catch {
    /* A structure JSON cannot represent never arrived over a JSON wire. */
    return reject("malformed_event", "the event is not serialisable");
  }
  if (bytes > context.limits.maxEventBytes) {
    return reject(
      "event_too_large",
      `${bytes} bytes exceeds the ${context.limits.maxEventBytes} byte ceiling`,
    );
  }

  const parsed = EventEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first === undefined ? "envelope" : first.path.join(".") || "envelope";
    const why = first === undefined ? "did not match the envelope" : first.message;
    return reject("malformed_event", `${where}: ${why}`);
  }
  const event = parsed.data;

  /* Sequence and session travel together or not at all. */
  if ((event.session_id === null) !== (event.sequence === null)) {
    return reject(
      "malformed_event",
      "session_id and sequence must both be present or both be null",
    );
  }

  if (
    event.schema_version < context.acceptedSchemaVersions.min ||
    event.schema_version > context.acceptedSchemaVersions.max
  ) {
    return reject(
      "unsupported_version",
      `schema_version ${event.schema_version} is outside ${context.acceptedSchemaVersions.min}..${context.acceptedSchemaVersions.max}`,
    );
  }

  const propertyDepth = depthOf(event.properties);
  if (propertyDepth > context.limits.maxPropertyDepth) {
    return reject(
      "event_too_large",
      `properties nest ${propertyDepth} deep, past ${context.limits.maxPropertyDepth}`,
    );
  }
  const widest = widestObject(event.properties);
  if (widest > context.limits.maxPropertyCount) {
    return reject(
      "event_too_large",
      `an object carries ${widest} keys, past ${context.limits.maxPropertyCount}`,
    );
  }

  /* ------------------------------------------- the privacy guard begins here */

  /*
   * The identity-creep guard, at every level of the payload rather than only at
   * the top: a `context: { project_id }` is exactly as wrong as a top-level one,
   * and rather more likely to be written by accident.
   *
   * It opens the privacy stage rather than closing the structural one, so that
   * the two stages are contiguous and UE-OBS-005 can implement them as two
   * passes rather than as a checklist interleaved with size arithmetic.
   */
  const reserved = findReservedKey(event.properties);
  if (reserved !== null) {
    return reject(
      "reserved_property",
      `${reserved} is reserved; tenant, project and source are derived from the credential`,
    );
  }

  /* Before the registry lookup. See the module note. */
  const findings = scanForForbiddenContent(event.properties);
  if (findings.length > 0) {
    return reject("pii_suspected", safeDetail(findings));
  }

  const registryVerdict = checkRegistry(event, context);
  if (registryVerdict !== null) return { ok: false, rejection: registryVerdict };

  const clockVerdict = checkClock(event, context, warnings);
  if (clockVerdict !== null) return { ok: false, rejection: clockVerdict };

  return { ok: true, event, warnings };
}

function reject(code: EventRejectionCode, detail: string): ValidationVerdict {
  return { ok: false, rejection: { code, detail } };
}

function findReservedKey(value: unknown): string | null {
  const stack: Array<{ path: string; node: unknown }> = [{ path: "", node: value }];
  const seen = new WeakSet<object>();
  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined) break;
    const node = frame.node;
    if (node === null || typeof node !== "object") continue;
    if (seen.has(node)) continue;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach((child, index) => stack.push({ path: `${frame.path}[${index}]`, node: child }));
      continue;
    }
    for (const [key, child] of Object.entries(node)) {
      const path = frame.path === "" ? key : `${frame.path}.${key}`;
      if (isReservedPropertyKey(key)) return path;
      stack.push({ path, node: child });
    }
  }
  return null;
}

function checkRegistry(event: EventEnvelope, context: ValidationContext): EventRejection | null {
  /* The diagnostic namespace is always known: it is infrastructure, not catalogue. */
  if (isDiagnosticEvent(event.event_name)) {
    return event.event_name === DIAGNOSTIC_TEST_EVENT
      ? null
      : {
          code: "schema_unknown",
          detail: `${event.event_name} is in the reserved diagnostic namespace but is not a defined diagnostic event`,
        };
  }
  const registry = context.registry;
  if (registry === null) return null;
  if (registry.names.has(event.event_name)) return null;
  return {
    code: "schema_unknown",
    detail: `${event.event_name} is not registered at schema_version ${event.schema_version}`,
  };
}

function checkClock(
  event: EventEnvelope,
  context: ValidationContext,
  warnings: BatchWarning[],
): EventRejection | null {
  const occurred = Date.parse(event.occurred_at);
  const skewMs = occurred - context.now.getTime();

  if (context.clock.kind === "accept_and_flag") {
    /*
     * Flagged, never corrected (LOCKED §4.1). One hour ahead is the threshold
     * for *mentioning* it, not for acting on it: a clock ahead of the server has
     * no legitimate cause beyond small skew, whereas a clock behind it is what a
     * showroom that has been offline for a fortnight looks like.
     */
    if (skewMs > 3_600_000) {
      warnings.push({
        code: "future_skew",
        detail: `occurred_at is ${Math.round(skewMs / 60_000)} minutes ahead of server time`,
      });
    } else if (skewMs < -7 * 86_400_000) {
      warnings.push({
        code: "late_arrival",
        detail: `occurred_at is ${Math.round(-skewMs / 86_400_000)} days behind server time`,
      });
    }
    return null;
  }

  if (skewMs > context.clock.maxFutureMs) {
    return { code: "clock_out_of_range", detail: "occurred_at is too far ahead of server time" };
  }
  if (context.clock.maxPastMs !== null && -skewMs > context.clock.maxPastMs) {
    return { code: "clock_out_of_range", detail: "occurred_at is too far behind server time" };
  }
  return null;
}
