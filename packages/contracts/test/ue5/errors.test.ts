import { describe, expect, it } from "vitest";
import {
  EVENT_REJECTIONS,
  EVENT_REJECTION_CODES,
  REQUEST_FAILURES,
  REQUEST_FAILURE_CODES,
  TRANSPORT_FAILURE_POLICY,
  classifyEventRejection,
  classifyRequestFailure,
  isKnownEventRejectionCode,
} from "../../src/ue5/errors";

/**
 * THE ERROR TAXONOMY, INCLUDING THE CODES THAT DO NOT EXIST YET.
 *
 * Two properties carry most of the weight:
 *
 *   1. **Retention beats tidiness.** No failure anywhere in this table ever
 *      results in an event being discarded. Quarantine keeps it with a reason;
 *      retain keeps it in the queue. There is no third option, and a table that
 *      grew one would fail here.
 *
 *   2. **An unknown code fails closed.** A build shipped today will meet a code
 *      invented next year, and the only safe reading of "I do not understand
 *      this" is "do not retry it, and let a human see it".
 */

describe("the two vocabularies stay disjoint", () => {
  it("shares no code between request level and event level", () => {
    /*
     * The whole design rests on a reader being able to tell which layer a code
     * belongs to. One name appearing in both would make that impossible.
     */
    const overlap = REQUEST_FAILURE_CODES.filter((code) =>
      (EVENT_REJECTION_CODES as readonly string[]).includes(code),
    );
    expect(overlap).toEqual([]);
  });

  it("defines every code exactly once", () => {
    expect(new Set(REQUEST_FAILURES.map((f) => f.code)).size).toBe(REQUEST_FAILURES.length);
    expect(new Set(EVENT_REJECTIONS.map((r) => r.code)).size).toBe(EVENT_REJECTIONS.length);
  });

  it("gives every code a stated reason for its policy", () => {
    for (const definition of [...REQUEST_FAILURES, ...EVENT_REJECTIONS]) {
      expect(definition.rationale.length, definition.code).toBeGreaterThan(40);
      expect(definition.meaning.length, definition.code).toBeGreaterThan(10);
    }
  });
});

describe("nothing in the taxonomy ever discards an event", () => {
  it("only ever retains, quarantines, or splits", () => {
    for (const definition of [...REQUEST_FAILURES, ...EVENT_REJECTIONS]) {
      expect(["retain", "quarantine", "retain_and_split"], definition.code).toContain(
        definition.outbox,
      );
    }
  });

  it("retains rather than quarantines whenever the events are not at fault", () => {
    /* 401, 403, 429, 503: the credential or the backend is the problem. */
    for (const code of [
      "unauthorised",
      "source_suspended",
      "rate_limited",
      "unavailable",
    ] as const) {
      const failure = REQUEST_FAILURES.find((f) => f.code === code);
      expect(failure?.outbox, code).toBe("retain");
    }
  });

  it("stops sending exactly on the two authorisation failures", () => {
    const stopping = REQUEST_FAILURES.filter((f) => f.sending === "stop").map((f) => f.code);
    expect(stopping.sort()).toEqual(["source_suspended", "unauthorised"]);
  });
});

describe("retryability is a property of the event, not the mood", () => {
  it("makes storage_error the only retryable event-level code", () => {
    const retryable = EVENT_REJECTIONS.filter((r) => r.retryable).map((r) => r.code);
    expect(retryable).toEqual(["storage_error"]);
  });

  it("keeps the client's classification agreeing with the table", () => {
    for (const rejection of EVENT_REJECTIONS) {
      const policy = classifyEventRejection(rejection.code, rejection.retryable);
      expect(policy.known, rejection.code).toBe(true);
      expect(policy.retryable, rejection.code).toBe(rejection.retryable);
      expect(policy.disagreement, rejection.code).toBe(false);
    }
  });

  it("obeys a server that downgrades a retryable code, and says nothing was hidden", () => {
    const policy = classifyEventRejection("storage_error", false);
    expect(policy.retryable).toBe(false);
    expect(policy.outbox).toBe("quarantine");
    expect(policy.disagreement).toBe(true);
    expect(policy.operatorRequired).toBe(true);
  });

  it("refuses to be talked into retrying a code the contract calls final", () => {
    /*
     * A server claiming `schema_invalid` is retryable is a server bug. Believing
     * it would mean resending a malformed event for ever, so the contract wins
     * and the disagreement is surfaced instead of obeyed.
     */
    const policy = classifyEventRejection("schema_invalid", true);
    expect(policy.retryable).toBe(false);
    expect(policy.disagreement).toBe(true);
    expect(policy.operatorRequired).toBe(true);
  });
});

describe("a code this build has never heard of", () => {
  const FUTURE = "quantum_desync_detected";

  it("is not in the known set", () => {
    expect(isKnownEventRejectionCode(FUTURE)).toBe(false);
  });

  it("is quarantined and never retried", () => {
    const policy = classifyEventRejection(FUTURE);
    expect(policy.known).toBe(false);
    expect(policy.retryable).toBe(false);
    expect(policy.outbox).toBe("quarantine");
    expect(policy.operatorRequired).toBe(true);
  });

  it("stays non-retryable even when the server insists it is retryable", () => {
    /*
     * The single most important line in this file. `retryable: true` on a code
     * the client cannot interpret is an instruction to loop for ever on an event
     * it has no way to fix.
     */
    const policy = classifyEventRejection(FUTURE, true);
    expect(policy.retryable).toBe(false);
    expect(policy.outbox).toBe("quarantine");
  });

  it("stays non-retryable when the server calls it non-retryable, and reports no disagreement", () => {
    /*
     * The agreeing half of the pair, and it is not the trivial case it looks
     * like. The answer is right for the wrong reason if the flag was believed:
     * `disagreement` is false because there is no contract policy for this code
     * to disagree *with*, not because the client and the server were found to
     * concur. An unknown code has no second opinion to record.
     */
    const policy = classifyEventRejection(FUTURE, false);
    expect(policy.retryable).toBe(false);
    expect(policy.outbox).toBe("quarantine");
    expect(policy.operatorRequired).toBe(true);
    expect(policy.disagreement).toBe(false);
  });

  it("answers the two flags identically, having read neither of them", () => {
    /*
     * THE PAIR IS THE PROPERTY. EITHER CASE ALONE IS ONLY HALF OF IT.
     *
     * Taken separately, each of the two tests above is satisfiable by a client
     * that reads the flag and happens to land on the same answer — one that
     * clamped `true` down to non-retryable, and one that simply obeyed `false`.
     * Such a client passes both and is still wrong, because its behaviour is a
     * function of a field a future backend controls.
     *
     * That is the failure this asserts against. A backend that starts sending a
     * code this build has never heard of must not be able to move an already
     * deployed client by flipping `retryable`, in either direction: not into a
     * loop by claiming true, and not into a quarantine it would have reached
     * anyway by claiming false. The flag is ignored, and "ignored" is only
     * demonstrable by showing that both values, and no value at all, produce one
     * indistinguishable policy.
     */
    const insisted = classifyEventRejection(FUTURE, true);
    const conceded = classifyEventRejection(FUTURE, false);

    expect(insisted.retryable).toBe(conceded.retryable);
    expect(insisted.outbox).toBe(conceded.outbox);
    expect(insisted.operatorRequired).toBe(conceded.operatorRequired);
    /* Whole-policy equality, so a field added to the type joins this claim. */
    expect(insisted).toEqual(conceded);
    expect(conceded, "and saying nothing at all is the same answer again").toEqual(
      classifyEventRejection(FUTURE),
    );
  });

  it("does not stop the whole outbox over one unfamiliar event", () => {
    /* Conservative about the event, not about the connection. */
    expect(classifyEventRejection(FUTURE).sending).toBe("continue");
  });
});

describe("a status this build has never heard of", () => {
  it("keeps the events and backs off on an unrecognised 5xx", () => {
    const policy = classifyRequestFailure(507);
    expect(policy.known).toBe(false);
    expect(policy.outbox).toBe("retain");
    expect(policy.sending).toBe("backoff");
  });

  it("quarantines an unrecognised 4xx rather than looping on it", () => {
    /* A 404 from a mistyped URL does not improve with a thousand attempts. */
    const policy = classifyRequestFailure(404);
    expect(policy.retryable).toBe(false);
    expect(policy.outbox).toBe("quarantine");
    expect(policy.operatorRequired).toBe(true);
  });

  it("maps every known status to its documented policy", () => {
    for (const failure of REQUEST_FAILURES) {
      const byStatus = classifyRequestFailure(failure.httpStatus);
      expect(byStatus.known, String(failure.httpStatus)).toBe(true);
      expect(byStatus.outbox, String(failure.httpStatus)).toBe(failure.outbox);
      const byCode = classifyRequestFailure(0, failure.code);
      expect(byCode.sending, failure.code).toBe(failure.sending);
    }
  });
});

describe("no response at all", () => {
  it("retains everything, because nothing was acknowledged", () => {
    expect(TRANSPORT_FAILURE_POLICY.outbox).toBe("retain");
    expect(TRANSPORT_FAILURE_POLICY.retryable).toBe(true);
    expect(TRANSPORT_FAILURE_POLICY.sending).toBe("backoff");
  });
});
