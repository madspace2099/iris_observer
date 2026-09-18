import { z } from "zod";

/**
 * THE ERROR TAXONOMY — one closed vocabulary, and a policy for everything outside it.
 *
 * Two layers, and keeping them apart is the single most important thing in this
 * contract:
 *
 *   **Request level** — did the batch get processed at all? Carried on the HTTP
 *   status. A non-2xx means *nothing* in that request was stored, so the whole
 *   batch is safe to resend.
 *
 *   **Event level** — what happened to each individual event? Carried per event
 *   inside a `200`. A batch in which every single event was rejected is still a
 *   `200`, because the batch *was* processed.
 *
 * Conflating the two is how a client either loses a batch that was never stored
 * or replays one that was. Everything below exists to make the two layers
 * impossible to confuse.
 *
 * ## Unknown codes
 *
 * The vocabulary is closed, and it will still grow. A client compiled today will
 * one day receive a code that did not exist when it was built, and what it does
 * then is a contract decision rather than an implementation detail:
 *
 *   **An unrecognised code is non-retryable and quarantines, whatever the
 *   server says about `retryable`.**
 *
 * The server's `retryable` flag is deliberately overridden in that one case. A
 * client that retries an event it cannot interpret is a client that retries
 * forever, and an infinite loop is a worse failure than a quarantined event an
 * operator can see. `classifyEventRejection` is where that rule lives, and
 * `errors.test.ts` is where it is proved.
 *
 * ## `detail` is not a control surface
 *
 * Every response may carry a human-readable `detail`. It is for a support
 * engineer reading a log. It may change wording between releases, it may be
 * translated, and **nothing may ever branch on it.** Branch on `code`.
 */

/* ====================================================== what a client does next */

/**
 * What happens to the events involved.
 *
 * `retain` and `quarantine` are the two that matter and they are opposites:
 * retained events are still trying to be delivered, quarantined events have
 * stopped trying and are kept for diagnosis. Neither is ever "discard" — LOCKED
 * §5.4 forbids silent loss, and a quarantined event is still on disk with a
 * reason attached.
 */
export const OUTBOX_ACTIONS = [
  /** Keep in the send queue. It will be retried. */
  "retain",
  /** Keep on disk with its reason, but stop trying. Never retried. */
  "quarantine",
  /** Keep, but split the batch smaller before the next attempt. */
  "retain_and_split",
] as const;
export const OutboxActionSchema = z.enum(OUTBOX_ACTIONS);
export type OutboxAction = (typeof OUTBOX_ACTIONS)[number];

/** What happens to the sending loop itself. */
export const SENDING_STATES = [
  /** Carry on. */
  "continue",
  /** Wait — `Retry-After` if given, otherwise bounded backoff with jitter. */
  "backoff",
  /** Stop entirely. Only an operator action can restart sending. */
  "stop",
] as const;
export const SendingStateSchema = z.enum(SENDING_STATES);
export type SendingState = (typeof SENDING_STATES)[number];

/** The complete instruction a client derives from any single failure. */
export interface FailurePolicy {
  readonly retryable: boolean;
  readonly outbox: OutboxAction;
  readonly sending: SendingState;
  /** Whether a human has to do something before this can ever succeed. */
  readonly operatorRequired: boolean;
  /** Why this policy is what it is. Documentation, never parsed. */
  readonly rationale: string;
}

/* ============================================================ request level */

export const REQUEST_FAILURE_CODES = [
  "malformed_request",
  "unauthorised",
  "source_suspended",
  "batch_too_large",
  "rate_limited",
  "unavailable",
] as const;
export const RequestFailureCodeSchema = z.enum(REQUEST_FAILURE_CODES);
export type RequestFailureCode = (typeof REQUEST_FAILURE_CODES)[number];

export interface RequestFailureDefinition extends FailurePolicy {
  readonly code: RequestFailureCode;
  readonly httpStatus: number;
  readonly meaning: string;
}

export const REQUEST_FAILURES: readonly RequestFailureDefinition[] = Object.freeze([
  {
    code: "malformed_request",
    httpStatus: 400,
    meaning: "The batch envelope could not be parsed, or carried a forbidden field.",
    retryable: false,
    outbox: "quarantine",
    sending: "continue",
    operatorRequired: false,
    rationale:
      "The client built the request wrongly. Resending it unchanged produces the same 400 " +
      "for ever, so the batch is quarantined with its reason and sending carries on with " +
      "the next one. This is a plugin bug and it must be visible as one.",
  },
  {
    code: "unauthorised",
    httpStatus: 401,
    meaning: "The credential is unknown, malformed, revoked or superseded.",
    retryable: false,
    outbox: "retain",
    sending: "stop",
    operatorRequired: true,
    rationale:
      "The events are not the problem, so they are kept. Retrying with a credential the " +
      "server has just refused cannot succeed and looks exactly like an attack, so sending " +
      "stops until an operator reactivates the source.",
  },
  {
    code: "source_suspended",
    httpStatus: 403,
    meaning: "The credential is valid; the source is suspended or archived.",
    retryable: false,
    outbox: "retain",
    sending: "stop",
    operatorRequired: true,
    rationale:
      "Distinct from 401 on purpose. The operator's next action is different — a suspended " +
      "source is resumed, a rejected credential is reactivated — and a plugin that shows one " +
      "message for both sends the operator down the wrong path.",
  },
  {
    code: "batch_too_large",
    httpStatus: 413,
    meaning: "Over the batch event count or byte ceiling in force.",
    retryable: true,
    outbox: "retain_and_split",
    sending: "continue",
    operatorRequired: false,
    rationale:
      "The only failure whose fix is arithmetic. Halve the batch and try again. A single " +
      "event that is itself too large is an event-level rejection instead, because splitting " +
      "cannot help it and an event must never be split.",
  },
  {
    code: "rate_limited",
    httpStatus: 429,
    meaning: "Too many requests. Retry-After states how long to wait.",
    retryable: true,
    outbox: "retain",
    sending: "backoff",
    operatorRequired: false,
    rationale:
      "`Retry-After` is authoritative and overrides any local backoff schedule. A client " +
      "that backs off less than the server asked for is the reason the server asked.",
  },
  {
    code: "unavailable",
    httpStatus: 503,
    meaning: "The backend could not process the request.",
    retryable: true,
    outbox: "retain",
    sending: "backoff",
    operatorRequired: false,
    rationale:
      "Nothing was stored. Bounded exponential backoff with jitter — without jitter, every " +
      "showroom that lost the same deployment returns at the same instant.",
  },
]);

/* ============================================================== event level */

export const EVENT_REJECTION_CODES = [
  "malformed_event",
  "schema_unknown",
  "schema_invalid",
  "unsupported_version",
  "event_too_large",
  "reserved_property",
  "clock_out_of_range",
  "pii_suspected",
  "storage_error",
] as const;
export const EventRejectionCodeSchema = z.enum(EVENT_REJECTION_CODES);
export type EventRejectionCode = (typeof EVENT_REJECTION_CODES)[number];

export interface EventRejectionDefinition extends FailurePolicy {
  readonly code: EventRejectionCode;
  readonly meaning: string;
}

export const EVENT_REJECTIONS: readonly EventRejectionDefinition[] = Object.freeze([
  {
    code: "malformed_event",
    meaning: "The event envelope is unparseable, or a required envelope field is missing.",
    retryable: false,
    outbox: "quarantine",
    sending: "continue",
    operatorRequired: false,
    rationale:
      "A plugin bug: the event never had the shape the envelope requires. Time does not fix " +
      "it and neither does a retry, so it is quarantined with the offending field named.",
  },
  {
    code: "schema_unknown",
    meaning: "This event name is not registered at this schema version.",
    retryable: false,
    outbox: "quarantine",
    sending: "continue",
    operatorRequired: true,
    rationale:
      "Either the plugin is ahead of the registry or the name is wrong. Both need a human, " +
      "and a quarantined event with the offending name attached is what tells them which.",
  },
  {
    code: "schema_invalid",
    meaning: "Properties do not satisfy the registered contract for this event.",
    retryable: false,
    outbox: "quarantine",
    sending: "continue",
    operatorRequired: false,
    rationale:
      "A plugin bug one level deeper than malformed: the envelope is right and the payload is " +
      "wrong for this event name. Retrying resends the same wrong payload, so it is quarantined.",
  },
  {
    code: "unsupported_version",
    meaning: "The schema version is outside the range the server accepts.",
    retryable: false,
    outbox: "quarantine",
    sending: "continue",
    operatorRequired: true,
    rationale:
      "The build is outside the support window. Only an upgrade changes the answer, so the " +
      "plugin should say so on its diagnostic screen rather than accumulate silently.",
  },
  {
    code: "event_too_large",
    meaning: "The serialised event exceeds the per-event ceiling.",
    retryable: false,
    outbox: "quarantine",
    sending: "continue",
    operatorRequired: false,
    rationale:
      "An event is never split. Splitting one would either invent a second event_id — " +
      "breaking idempotency — or reuse the first, producing two facts from one.",
  },
  {
    code: "reserved_property",
    meaning: "A property key is reserved: identity, server-assigned, or the observer namespace.",
    retryable: false,
    outbox: "quarantine",
    sending: "continue",
    operatorRequired: false,
    rationale:
      "This is the identity-creep guard. Silently dropping such a key would let a plugin " +
      "believe for a year that it was setting `project_id`. Rejecting it means somebody finds " +
      "out on the first run.",
  },
  {
    code: "clock_out_of_range",
    meaning: "occurred_at falls outside the acceptance window in force.",
    retryable: false,
    outbox: "quarantine",
    sending: "continue",
    operatorRequired: true,
    rationale:
      "The code exists; the window is OPEN-3 and no policy is proposed here. The reference " +
      "implementation defaults to accepting and flagging, because a showroom offline longer " +
      "than an invented bound would otherwise lose its whole backlog to a clock rule rather " +
      "than to a data problem.",
  },
  {
    code: "pii_suspected",
    meaning: "A property matched a forbidden-content heuristic.",
    retryable: false,
    outbox: "quarantine",
    sending: "continue",
    operatorRequired: true,
    rationale:
      "LOCKED §5.6: no raw personal data in event properties. The quarantine record stores " +
      "the offending key and never the offending value — a diagnostic that copies the value " +
      "has moved the leak rather than stopped it.",
  },
  {
    code: "storage_error",
    meaning: "A transient failure while writing this event.",
    retryable: true,
    outbox: "retain",
    sending: "continue",
    operatorRequired: false,
    rationale:
      "The only retryable event-level code, and the only one where the event is fine and the " +
      "backend is not. Everything else is a property of the event itself.",
  },
]);

/* ============================================================ classification */

const REQUEST_BY_CODE: ReadonlyMap<string, RequestFailureDefinition> = new Map(
  REQUEST_FAILURES.map((definition) => [definition.code, definition]),
);

const REQUEST_BY_STATUS: ReadonlyMap<number, RequestFailureDefinition> = new Map(
  REQUEST_FAILURES.map((definition) => [definition.httpStatus, definition]),
);

const EVENT_BY_CODE: ReadonlyMap<string, EventRejectionDefinition> = new Map(
  EVENT_REJECTIONS.map((definition) => [definition.code, definition]),
);

/**
 * The policy for an unrecognised code.
 *
 * Conservative on every axis except one: sending continues. An unknown code
 * attached to a single event says nothing about the credential, and stopping the
 * whole outbox because one event was refused for an unfamiliar reason would turn
 * a small unknown into a total outage.
 */
export const UNKNOWN_CODE_POLICY: FailurePolicy = Object.freeze({
  retryable: false,
  outbox: "quarantine",
  sending: "continue",
  operatorRequired: true,
  rationale:
    "A code this build does not understand. Quarantine and surface it: retrying something " +
    "unintelligible loops for ever, and discarding it loses data the operator needed to see.",
});

/**
 * The policy for an unrecognised HTTP status.
 *
 * Retain rather than quarantine, and back off. A status the client does not
 * recognise still tells it one thing that matters: the response was not a `200`,
 * so no per-event results exist, so nothing was acknowledged, so nothing may be
 * deleted.
 */
export const UNKNOWN_STATUS_POLICY: FailurePolicy = Object.freeze({
  retryable: true,
  outbox: "retain",
  sending: "backoff",
  operatorRequired: false,
  rationale:
    "Not a 200, therefore nothing was acknowledged, therefore nothing may leave the outbox. " +
    "Backing off is safe; deleting is not.",
});

export function isKnownEventRejectionCode(code: string): code is EventRejectionCode {
  return EVENT_BY_CODE.has(code);
}

export function isKnownRequestFailureCode(code: string): code is RequestFailureCode {
  return REQUEST_BY_CODE.has(code);
}

/**
 * What to do about one rejected event.
 *
 * `serverRetryable` is what the server claimed. For a known code it must agree
 * with the contract, and a disagreement is a server bug — resolved conservatively
 * here and reported through `disagreement` so it is visible rather than obeyed.
 * For an unknown code it is ignored entirely; see the module note.
 */
export function classifyEventRejection(
  code: string,
  serverRetryable?: boolean,
): FailurePolicy & { readonly known: boolean; readonly disagreement: boolean } {
  const known = EVENT_BY_CODE.get(code);
  if (!known) {
    return { ...UNKNOWN_CODE_POLICY, known: false, disagreement: false };
  }
  const disagreement = serverRetryable !== undefined && serverRetryable !== known.retryable;
  /* Conservative resolution: only ever downgrade to non-retryable, never up. */
  const retryable = known.retryable && serverRetryable !== false;
  return {
    retryable,
    outbox: retryable ? known.outbox : "quarantine",
    sending: known.sending,
    operatorRequired: known.operatorRequired || disagreement,
    rationale: known.rationale,
    known: true,
    disagreement,
  };
}

/** What to do about a whole request that did not come back `200`. */
export function classifyRequestFailure(
  httpStatus: number,
  code?: string,
): FailurePolicy & { readonly known: boolean } {
  const byCode = code === undefined ? undefined : REQUEST_BY_CODE.get(code);
  if (byCode) return { ...definitionPolicy(byCode), known: true };

  const byStatus = REQUEST_BY_STATUS.get(httpStatus);
  if (byStatus) return { ...definitionPolicy(byStatus), known: true };

  /*
   * Any other 4xx is treated as the client's fault and quarantined: a 404 from
   * a misconfigured URL, or a 415 from a proxy that rewrote the content type,
   * will not improve by being sent again a thousand times.
   */
  if (httpStatus >= 400 && httpStatus < 500) {
    return {
      retryable: false,
      outbox: "quarantine",
      sending: "continue",
      operatorRequired: true,
      rationale: "An unrecognised 4xx. The request is wrong; repeating it cannot make it right.",
      known: false,
    };
  }
  return { ...UNKNOWN_STATUS_POLICY, known: false };
}

function definitionPolicy(definition: FailurePolicy): FailurePolicy {
  return {
    retryable: definition.retryable,
    outbox: definition.outbox,
    sending: definition.sending,
    operatorRequired: definition.operatorRequired,
    rationale: definition.rationale,
  };
}

/**
 * A transport failure with no HTTP response at all.
 *
 * Timeouts, resets, DNS failures, a lost connection halfway through the response
 * body. **The client cannot tell whether the server processed the batch**, and
 * this is the case the stable `event_id` exists for: retain everything, resend
 * the whole batch, and let the server answer `duplicate` for whatever it already
 * has. See `docs/ue5-integration-handoff.md` for the worked example.
 */
export const TRANSPORT_FAILURE_POLICY: FailurePolicy = Object.freeze({
  retryable: true,
  outbox: "retain",
  sending: "backoff",
  operatorRequired: false,
  rationale:
    "No response means no acknowledgement, and no acknowledgement means the events stay. " +
    "Whether the server stored them is unknowable from here and does not need to be known: " +
    "a stable event_id makes the resend safe either way.",
});
