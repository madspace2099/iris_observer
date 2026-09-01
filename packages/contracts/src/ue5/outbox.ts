import {
  TRANSPORT_FAILURE_POLICY,
  classifyEventRejection,
  classifyRequestFailure,
  type SendingState,
} from "./errors";
import type { EventOutcome } from "./ingestion";

/**
 * THE DURABLE OUTBOX — observable state semantics. PROPOSED.
 *
 * UE-OBS-006 is being written now, and it needs to know what state each event
 * must be in after every possible answer, independently of numbers nobody has
 * decided yet. So this file states the semantics and leaves the limits alone.
 *
 * **The internal representation is the plugin's business.** A single status
 * column, two files, an index and a tombstone log — any of those is fine. What
 * is contract is the *observable behaviour*: given a response, does the event
 * still get delivered, is it retried, and can it be lost.
 *
 * ## Everything here is derived, not restated
 *
 * The state for any situation comes from `errors.ts` rather than from a second
 * table beside it. A hand-maintained list would agree with the error model on
 * the day it was written and quietly stop agreeing afterwards — which is the
 * failure this whole package is arranged to prevent.
 *
 * ## The one rule that outranks the others
 *
 * **Nothing is ever silently lost.** Every state below either keeps trying or
 * keeps the event on disk with a reason attached. There is no discard, and a
 * queue ceiling that drops an event must count it and report it (LOCKED §5.4).
 */

export const OUTBOX_STATES = [
  /** Waiting to be sent. The starting state, and where retries return to. */
  "pending",
  /** Handed to the transport, no answer yet. Optional — see the note below. */
  "in_flight",
  /** The server stored it. Delivery is finished. */
  "accepted",
  /** The server already had it. Delivery is finished, and this is a success. */
  "duplicate",
  /** Kept on disk with a reason, never retried. Needs a human. */
  "quarantined",
  /** Kept in the queue after a retryable failure. Will be tried again. */
  "retained",
] as const;
export type OutboxState = (typeof OUTBOX_STATES)[number];

/**
 * `in_flight` is optional, and saying so is the point.
 *
 * An implementation that distinguishes it can report a stall; one that does not
 * simply treats an unanswered send as still `pending`. **Both are correct**, and
 * the difference is invisible to the server — which is why it is named as
 * optional rather than left for somebody to infer.
 *
 * What is *not* optional: an event in flight when the process dies must come
 * back as `pending`, never as delivered. A crash is not an acknowledgement.
 */
export const IN_FLIGHT_IS_OPTIONAL = true;

/** States in which the event will be presented for delivery again. */
export const DELIVERABLE_STATES: readonly OutboxState[] = Object.freeze([
  "pending",
  "in_flight",
  "retained",
]);

/** States in which delivery is finished, one way or another. */
export const TERMINAL_STATES: readonly OutboxState[] = Object.freeze([
  "accepted",
  "duplicate",
  "quarantined",
]);

export interface OutboxVerdict {
  readonly state: OutboxState;
  /** Whether the event will be offered to the transport again. */
  readonly retried: boolean;
  /** Whether it leaves the pending-delivery set. Never means deleted. */
  readonly removedFromPendingDelivery: boolean;
  /** Whether the row may be erased from disk entirely. */
  readonly mayBeErased: boolean;
  readonly sending: SendingState;
  readonly reason: string;
}

function verdict(
  state: OutboxState,
  sending: SendingState,
  reason: string,
  mayBeErased = false,
): OutboxVerdict {
  return {
    state,
    retried: (DELIVERABLE_STATES as readonly string[]).includes(state),
    removedFromPendingDelivery: (TERMINAL_STATES as readonly string[]).includes(state),
    mayBeErased,
    sending,
    reason,
  };
}

/**
 * What happens to one event, given its per-event result inside a `200`.
 *
 * `code` and `serverRetryable` are present exactly when the status is
 * `rejected`. An unrecognised code is quarantined whatever the server claimed
 * about retryability — see `errors.ts` for why that override exists.
 */
export function outboxStateForEventResult(
  status: EventOutcome,
  code?: string,
  serverRetryable?: boolean,
): OutboxVerdict {
  if (status === "accepted") {
    return verdict("accepted", "continue", "the server stored it", true);
  }
  if (status === "duplicate") {
    /*
     * A success, and the one most often implemented as a failure. The fact is
     * stored, so it was delivered. A plugin that retries duplicates never
     * drains its outbox.
     */
    return verdict("duplicate", "continue", "the server already had it", true);
  }

  const policy = classifyEventRejection(code ?? "", serverRetryable);
  return policy.retryable
    ? verdict("retained", policy.sending, "a transient failure on the server side")
    : verdict(
        "quarantined",
        policy.sending,
        policy.known
          ? "a deterministic rejection: resending it unchanged cannot succeed"
          : "a rejection code this build does not understand",
      );
}

/** What happens to every event in a batch that did not come back `200`. */
export function outboxStateForRequestFailure(httpStatus: number, code?: string): OutboxVerdict {
  const policy = classifyRequestFailure(httpStatus, code);
  if (policy.outbox === "quarantine") {
    return verdict("quarantined", policy.sending, "the request itself was wrong");
  }
  return verdict(
    "pending",
    policy.sending,
    policy.outbox === "retain_and_split"
      ? "over a ceiling: split the batch and try again"
      : "nothing was stored, so nothing was acknowledged",
  );
}

/**
 * What happens when no response arrives at all.
 *
 * Timeout, reset, DNS failure, a connection lost halfway through the body. The
 * client cannot know whether the server processed the batch — and does not need
 * to, because a stable `event_id` makes the resend safe either way.
 */
export function outboxStateForTransportFailure(): OutboxVerdict {
  return verdict(
    "pending",
    TRANSPORT_FAILURE_POLICY.sending,
    "no answer arrived, so nothing was acknowledged",
  );
}

/* ============================================================ the two lists */

/**
 * Situations in which the event **stays** and will be delivered later.
 *
 * Published as prose because this is the list a reviewer reads, and as a test
 * because it is the list an implementation gets wrong.
 */
export const EVENT_REMAINS_LOCALLY: readonly string[] = Object.freeze([
  "it has never been sent",
  "the request timed out",
  "the connection was lost",
  "429 rate limited",
  "any 5xx",
  "an unrecognised whole-request failure",
  "the client did not receive an acknowledgement",
  "a per-event storage_error, which is the one retryable rejection",
]);

/** Situations in which the event leaves the pending-delivery set. */
export const EVENT_LEAVES_PENDING_DELIVERY: readonly string[] = Object.freeze([
  "the server explicitly accepted it",
  "the server explicitly acknowledged it as a duplicate",
]);

/**
 * Situations in which the event is **preserved but never retried**.
 *
 * Preserved, not deleted. A quarantined event with its reason attached is what
 * tells an operator that a build is emitting something the contract refuses; a
 * deleted one tells them nothing and loses the evidence.
 */
export const EVENT_PRESERVED_NOT_RETRIED: readonly string[] = Object.freeze([
  "a deterministic, non-retryable validation rejection",
  "a rejection code this build does not recognise",
  "an unsupported contract version needing an operator or a developer",
  "a 400 on the whole request, which is a plugin bug",
]);

/* ============================================================== on restart */

/**
 * What must still be true after the application is killed and restarted.
 *
 * The fourth one is the quiet one. If a reactivation swaps the credential and
 * the queued events silently follow it to a different source, a showroom's
 * history moves between sources without anybody deciding that it should.
 */
export const RESTART_INVARIANTS: readonly string[] = Object.freeze([
  "Unacknowledged events are recoverable: anything not accepted or acknowledged duplicate is offered again.",
  "No event receives a new event_id. Regenerating one turns a safe replay into a second fact.",
  "Replay stays safe: resending what was already sent answers duplicate, never a second accept.",
  "The credential and source association an event was captured under does not silently change.",
  "Quarantined events survive with their reason; a restart is not a way to clear them.",
  "An event that was in flight when the process died returns as pending, never as delivered.",
]);

/**
 * Behaviour after `401` or `403`, still PROPOSED.
 *
 * Akhilesh has not yet confirmed the operational and UX side of this, so it
 * stays a proposal rather than being written up as though it were agreed. What
 * is not negotiable is the second line: the events are not the problem.
 */
export const UNAUTHORISED_OUTBOX_BEHAVIOUR: readonly string[] = Object.freeze([
  "Stop network delivery.",
  "Retain the outbox in full.",
  "Continue bounded local capture, so an authorisation problem does not also become a data gap.",
  "Surface the unauthorised state as an operator-visible diagnostic, with 401 and 403 distinct.",
  "Never reactivate automatically.",
]);
