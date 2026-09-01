import { describe, expect, it } from "vitest";
import {
  DELIVERABLE_STATES,
  EVENT_LEAVES_PENDING_DELIVERY,
  EVENT_PRESERVED_NOT_RETRIED,
  EVENT_REMAINS_LOCALLY,
  OUTBOX_STATES,
  RESTART_INVARIANTS,
  TERMINAL_STATES,
  UNAUTHORISED_OUTBOX_BEHAVIOUR,
  outboxStateForEventResult,
  outboxStateForRequestFailure,
  outboxStateAfterRetryExhaustion,
  outboxStateForTransportFailure,
  OUTBOX_CAPACITY_RULES,
} from "../../src/ue5/outbox";
import { EVENT_REJECTIONS, REQUEST_FAILURES } from "../../src/ue5/errors";

/**
 * THE DURABLE OUTBOX, AS OBSERVABLE BEHAVIOUR.
 *
 * UE-OBS-006 is being written against this, so the states have to be exact even
 * though the limits are not. The property that outranks the rest, and the one
 * every case below is really testing:
 *
 *   **An event is never lost, and never leaves the queue without an explicit
 *   acknowledgement from the server.**
 *
 * A crash is not an acknowledgement. A 503 is not an acknowledgement. A
 * connection dying mid-response is not an acknowledgement. Only `accepted` and
 * `duplicate` are.
 */

describe("the state set", () => {
  it("splits cleanly into deliverable and terminal, with nothing left over", () => {
    const covered = [...DELIVERABLE_STATES, ...TERMINAL_STATES].sort();
    expect(covered).toEqual([...OUTBOX_STATES].sort());
    for (const state of DELIVERABLE_STATES) {
      expect(TERMINAL_STATES, state).not.toContain(state);
    }
  });
});

describe("only an acknowledgement removes an event", () => {
  it("finishes delivery on accepted", () => {
    const verdict = outboxStateForEventResult("accepted");
    expect(verdict.state).toBe("accepted");
    expect(verdict.removedFromPendingDelivery).toBe(true);
    expect(verdict.retried).toBe(false);
    expect(verdict.mayBeErased).toBe(true);
  });

  it("finishes delivery on duplicate, because a duplicate is a success", () => {
    /*
     * The one most often implemented as a failure. The fact is stored, so it was
     * delivered. A plugin that retries duplicates never drains.
     */
    const verdict = outboxStateForEventResult("duplicate");
    expect(verdict.state).toBe("duplicate");
    expect(verdict.removedFromPendingDelivery).toBe(true);
    expect(verdict.mayBeErased).toBe(true);
  });

  it("keeps everything when no answer arrives at all", () => {
    const verdict = outboxStateForTransportFailure();
    expect(verdict.state).toBe("pending");
    expect(verdict.retried).toBe(true);
    expect(verdict.mayBeErased).toBe(false);
    expect(verdict.sending).toBe("backoff");
  });

  it("erases nothing that was not acknowledged", () => {
    /* The invariant, swept across every situation the contract defines. */
    const situations = [
      outboxStateForTransportFailure(),
      ...REQUEST_FAILURES.map((failure) => outboxStateForRequestFailure(failure.httpStatus)),
      ...EVENT_REJECTIONS.map((rejection) =>
        outboxStateForEventResult("rejected", rejection.code, rejection.retryable),
      ),
      outboxStateForEventResult("rejected", "a_code_from_next_year"),
    ];
    for (const verdict of situations) {
      expect(verdict.mayBeErased, verdict.reason).toBe(false);
    }
  });
});

describe("whole-request failures", () => {
  it("keeps the batch pending on 429, 503 and 413", () => {
    for (const status of [429, 503, 413]) {
      const verdict = outboxStateForRequestFailure(status);
      expect(verdict.state, String(status)).toBe("pending");
      expect(verdict.retried, String(status)).toBe(true);
    }
  });

  it("keeps the batch pending on 401 and 403 while sending stops", () => {
    /*
     * The rule that gets omitted in a hurry and costs the most. A plugin that
     * clears its outbox on an authorisation failure turns a five-minute
     * operator task into permanent data loss, silently.
     */
    for (const status of [401, 403]) {
      const verdict = outboxStateForRequestFailure(status);
      expect(verdict.state, String(status)).toBe("pending");
      expect(verdict.sending, String(status)).toBe("stop");
      expect(verdict.mayBeErased, String(status)).toBe(false);
    }
  });

  it("quarantines the batch on 400, because the request itself is wrong", () => {
    const verdict = outboxStateForRequestFailure(400);
    expect(verdict.state).toBe("quarantined");
    expect(verdict.retried).toBe(false);
    expect(verdict.sending).toBe("continue");
  });

  it("keeps and backs off on a status this build has never seen", () => {
    const verdict = outboxStateForRequestFailure(507);
    expect(verdict.state).toBe("pending");
    expect(verdict.sending).toBe("backoff");
  });
});

describe("per-event rejections", () => {
  it("retains only the one retryable code", () => {
    const retained = EVENT_REJECTIONS.filter(
      (rejection) =>
        outboxStateForEventResult("rejected", rejection.code, rejection.retryable).state ===
        "retained",
    );
    expect(retained.map((rejection) => rejection.code)).toEqual(["storage_error"]);
  });

  it("quarantines every deterministic rejection", () => {
    for (const rejection of EVENT_REJECTIONS) {
      if (rejection.retryable) continue;
      const verdict = outboxStateForEventResult("rejected", rejection.code, rejection.retryable);
      expect(verdict.state, rejection.code).toBe("quarantined");
      expect(verdict.retried, rejection.code).toBe(false);
    }
  });

  it("quarantines a code from the future, whatever the server says about retryability", () => {
    for (const claimed of [true, false, undefined]) {
      const verdict = outboxStateForEventResult("rejected", "quantum_desync", claimed);
      expect(verdict.state, String(claimed)).toBe("quarantined");
      expect(verdict.reason).toContain("does not understand");
    }
  });
});

describe("the lists a reviewer reads", () => {
  it("names every situation in which the event stays", () => {
    for (const phrase of ["never been sent", "timed out", "429", "5xx", "acknowledgement"]) {
      expect(EVENT_REMAINS_LOCALLY.join(" | "), phrase).toContain(phrase);
    }
  });

  it("names exactly two ways an event leaves pending delivery", () => {
    expect(EVENT_LEAVES_PENDING_DELIVERY).toHaveLength(2);
    expect(EVENT_LEAVES_PENDING_DELIVERY.join(" ")).toContain("accepted");
    expect(EVENT_LEAVES_PENDING_DELIVERY.join(" ")).toContain("duplicate");
  });

  it("keeps preserved-not-retried distinct from deleted", () => {
    expect(EVENT_PRESERVED_NOT_RETRIED.length).toBeGreaterThan(2);
    expect(EVENT_PRESERVED_NOT_RETRIED.join(" ")).not.toMatch(/delete|discard|erase/i);
  });
});

describe("what survives a restart", () => {
  it("forbids a new event_id above all", () => {
    /*
     * Regenerating the identifier turns a safe replay into a second fact, and
     * it is the single most damaging thing a restart can do.
     */
    expect(RESTART_INVARIANTS.join(" ")).toContain("No event receives a new event_id");
  });

  it("returns an in-flight event to pending rather than treating it as delivered", () => {
    expect(RESTART_INVARIANTS.join(" ")).toMatch(/in flight.*returns as pending/i);
  });

  it("does not let a reactivation silently move history to another source", () => {
    expect(RESTART_INVARIANTS.join(" ")).toMatch(/credential and source association/i);
  });
});

describe("retry attempts are not a retention limit", () => {
  it("preserves the event when the attempt sequence is exhausted", () => {
    /*
     * The obvious misreading of "Max Retry Attempts = 5" — five failures and the
     * event is deleted — would void the durable outbox contract in exactly the
     * circumstances it exists for. A showroom offline all afternoon fails far
     * more than five times before anybody notices.
     */
    const verdict = outboxStateAfterRetryExhaustion();
    expect(verdict.state).toBe("retained");
    expect(verdict.mayBeErased).toBe(false);
    expect(verdict.removedFromPendingDelivery).toBe(false);
    expect(verdict.reason).toMatch(/never erased/);
  });
});

describe("capacity", () => {
  it("enforces the ceiling in bytes, never by an assumed event count", () => {
    expect(OUTBOX_CAPACITY_RULES.join(" ")).toMatch(
      /bytes actually used, never by an assumed event count/,
    );
  });

  it("is bounded, counted and silent about content", () => {
    const joined = OUTBOX_CAPACITY_RULES.join(" ");
    expect(joined).toMatch(/never allowed to grow without limit/);
    expect(joined).toMatch(/counted and exposed through diagnostics, never silent/);
    expect(joined).toMatch(/never the content of the event/);
  });

  it("names the four diagnostics an operator needs", () => {
    expect(OUTBOX_CAPACITY_RULES.join(" ")).toMatch(
      /bytes used, event count, oldest pending age, and the configured ceiling/,
    );
  });
});

describe("after 401 or 403 — approved V1 behaviour", () => {
  it("keeps the outbox and stops the network, without automatic recovery", () => {
    const joined = UNAUTHORISED_OUTBOX_BEHAVIOUR.join(" ");
    expect(joined).toMatch(/pause network delivery/i);
    expect(joined).toMatch(/Preserve the entire durable outbox/);
    expect(joined).toMatch(/Never reactivate automatically/);
    expect(joined).toMatch(/bounded local capture/);
  });

  it("requires an administrator with a newly issued code, not a retry loop", () => {
    expect(UNAUTHORISED_OUTBOX_BEHAVIOUR.join(" ")).toMatch(
      /administrator entering a newly issued activation code/,
    );
  });
});
