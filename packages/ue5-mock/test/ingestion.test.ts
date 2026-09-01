import { describe, expect, it } from "vitest";
import { MockObserverBackend } from "../src/backend";
import { HARNESS_LIMITS } from "@observer/contracts/ue5";
import { activated, batch, bearer, event, ingestBody, response, uuid } from "./helpers";

/**
 * INGESTION, ACROSS THE OUTCOMES A TRANSPORT HAS TO SURVIVE.
 *
 * The rule everything here checks, from one side or the other:
 *
 *   **The HTTP status says whether the batch was processed. It never says
 *   whether the events were accepted.**
 *
 * So a batch in which every event was rejected is a `200`, and a `503` stores
 * nothing at all. Get those two backwards and a client either loses data that
 * was never stored or duplicates data that was.
 */

describe("a batch that is entirely fine", () => {
  it("accepts every event and says so in the counters", () => {
    const { backend, token, sourceId } = activated();
    const body = ingestBody(backend.ingest(bearer(token), batch([event(), event(), event()])));

    expect(body.received).toBe(3);
    expect(body.accepted).toBe(3);
    expect(body.duplicate).toBe(0);
    expect(body.rejected).toBe(0);
    expect(body.results.every((result) => result.status === "accepted")).toBe(true);
    expect(backend.storedCount(sourceId)).toBe(3);
  });

  it("answers in submission order, one result per event", () => {
    /*
     * Order is contract. A client matching results by position — which is the
     * obvious implementation — must not be silently wrong.
     */
    const { backend, token } = activated();
    const events = [event(), event(), event(), event()];
    const body = ingestBody(backend.ingest(bearer(token), batch(events)));
    expect(body.results.map((result) => result.event_id)).toEqual(
      events.map((one) => one["event_id"]),
    );
  });

  it("processes an empty batch and refuses to call it a heartbeat", () => {
    const { backend, token } = activated();
    const body = ingestBody(backend.ingest(bearer(token), batch([])));
    expect(body.received).toBe(0);
    expect(body.results).toEqual([]);
    /* `received: 0` cannot distinguish liveness from a client bug. Hence §7. */
  });
});

describe("a batch that is partly wrong", () => {
  it("accepts, duplicates and rejects inside one response", () => {
    const { backend, token } = activated();
    const known = event();

    ingestBody(backend.ingest(bearer(token), batch([known])));

    const mixed = ingestBody(
      backend.ingest(bearer(token), batch([known, event(), event({ event_name: "NOT A NAME" })])),
    );

    expect(mixed.received).toBe(3);
    expect(mixed.accepted).toBe(1);
    expect(mixed.duplicate).toBe(1);
    expect(mixed.rejected).toBe(1);
    expect(mixed.results.map((r) => r.status)).toEqual(["duplicate", "accepted", "rejected"]);
    expect(mixed.results[2]?.code).toBe("malformed_event");
    expect(mixed.results[2]?.retryable).toBe(false);
  });

  it("returns 200 even when every single event was rejected", () => {
    /*
     * The case that separates the two layers. The batch *was* processed; the
     * events were not accepted. A non-2xx here would tell the client nothing was
     * stored — true, but it would also invite a resend of events that will be
     * rejected identically for ever.
     */
    const { backend, token } = activated();
    const outcome = backend.ingest(
      bearer(token),
      batch([event({ event_name: "Bad" }), event({ occurred_at: "whenever" })]),
    );
    const body = ingestBody(outcome);
    expect(response(outcome).status).toBe(200);
    expect(body.accepted).toBe(0);
    expect(body.rejected).toBe(2);
  });

  it("names the reason for each rejection without repeating the payload", () => {
    const { backend, token } = activated();
    const body = ingestBody(
      backend.ingest(
        bearer(token),
        batch([
          event({ schema_version: 9 }),
          event({ properties: { project_id: "prj_hostile" } }),
          event({ properties: { to: "nobody@example.invalid" } }),
        ]),
      ),
    );
    expect(body.results.map((r) => r.code)).toEqual([
      "unsupported_version",
      "reserved_property",
      "pii_suspected",
    ]);
    expect(JSON.stringify(body)).not.toContain("nobody@example.invalid");
  });

  it("refuses an event too large without splitting it", () => {
    const { backend, token } = activated();
    const body = ingestBody(
      backend.ingest(
        bearer(token),
        batch([event({ properties: { blob: "x".repeat(HARNESS_LIMITS.maxEventBytes) } })]),
      ),
    );
    expect(body.results[0]?.code).toBe("event_too_large");
    expect(body.results[0]?.retryable).toBe(false);
  });

  it("marks a transient storage failure as the one retryable rejection", () => {
    const { backend, token, sourceId } = activated();
    const doomed = event();
    const fine = event();
    backend.push({ kind: "storage_error", eventIds: [doomed["event_id"] as string] });

    const body = ingestBody(backend.ingest(bearer(token), batch([doomed, fine])));
    expect(body.results[0]?.code).toBe("storage_error");
    expect(body.results[0]?.retryable).toBe(true);
    expect(body.results[1]?.status).toBe("accepted");

    /* It was not stored, so the retry is an accept rather than a duplicate. */
    expect(backend.storedEvent(sourceId, doomed["event_id"] as string)).toBeUndefined();
    const retry = ingestBody(backend.ingest(bearer(token), batch([doomed])));
    expect(retry.results[0]?.status).toBe("accepted");
  });
});

describe("a batch that is not processed at all", () => {
  it("rejects an unparseable envelope with 400 and stores nothing", () => {
    const { backend, token, sourceId } = activated();
    const answer = response(backend.ingest(bearer(token), { batch_id: uuid(), events: "lots" }));
    expect(answer.status).toBe(400);
    expect(answer.body["code"]).toBe("malformed_request");
    expect(backend.storedCount(sourceId)).toBe(0);
  });

  it("refuses identity smuggled onto the batch envelope", () => {
    const { backend, token } = activated();
    const answer = response(
      backend.ingest(bearer(token), { ...batch([event()]), project_id: "prj_hostile" }),
    );
    expect(answer.status).toBe(400);
  });

  it("answers 413 when the batch is over the ceiling in force", () => {
    const { backend, token, sourceId } = activated();
    const many = Array.from({ length: HARNESS_LIMITS.maxBatchEvents + 1 }, () => event());
    const answer = response(backend.ingest(bearer(token), batch(many)));
    expect(answer.status).toBe(413);
    expect(answer.body["code"]).toBe("batch_too_large");
    /* Nothing at all was stored: it is the whole batch that failed. */
    expect(backend.storedCount(sourceId)).toBe(0);
  });

  it("answers 429 with a Retry-After and stores nothing", () => {
    const { backend, token, sourceId } = activated();
    backend.push({ kind: "rate_limit", retryAfterSeconds: 5 });
    const answer = response(backend.ingest(bearer(token), batch([event(), event()])));
    expect(answer.status).toBe(429);
    expect(answer.headers["retry-after"]).toBe("5");
    expect(backend.storedCount(sourceId)).toBe(0);
  });

  it("answers 503 and guarantees nothing was stored", () => {
    const { backend, token, sourceId } = activated();
    backend.push({ kind: "unavailable" });
    expect(response(backend.ingest(bearer(token), batch([event()]))).status).toBe(503);
    expect(backend.storedCount(sourceId)).toBe(0);
  });

  it("echoes the batch id so a client can correlate the failure", () => {
    const { backend, token } = activated();
    const body = batch([event()]);
    backend.push({ kind: "unavailable" });
    const answer = response(backend.ingest(bearer(token), body));
    expect(answer.body["batch_id"]).toBe(body["batch_id"]);
  });
});

describe("credentials and source state", () => {
  it("refuses an unknown credential", () => {
    const { backend } = activated();
    const answer = response(backend.ingest(bearer("obs_not_a_real_token"), batch([event()])));
    expect(answer.status).toBe(401);
    expect(answer.body["code"]).toBe("unauthorised");
  });

  it("refuses a missing Authorization header", () => {
    const { backend } = activated();
    expect(response(backend.ingest(null, batch([event()]))).status).toBe(401);
  });

  it("refuses a revoked credential on the very next request", () => {
    const { backend, token, sourceId } = activated();
    expect(ingestBody(backend.ingest(bearer(token), batch([event()]))).accepted).toBe(1);
    backend.revokeCredentialFor(sourceId);
    expect(response(backend.ingest(bearer(token), batch([event()]))).status).toBe(401);
  });

  it("distinguishes a suspended source from a rejected credential", () => {
    /*
     * 401 and 403 lead an operator to different remedies: reactivate, or resume.
     * A plugin that shows one message for both sends them down the wrong path.
     */
    const { backend, token, sourceId } = activated();
    backend.setSourceState(sourceId, "suspended");
    const answer = response(backend.ingest(bearer(token), batch([event()])));
    expect(answer.status).toBe(403);
    expect(answer.body["code"]).toBe("source_suspended");
  });

  it("keeps an archived source permanently refused", () => {
    const { backend, token, sourceId } = activated();
    backend.setSourceState(sourceId, "archived");
    expect(response(backend.ingest(bearer(token), batch([event()]))).status).toBe(403);
  });
});

describe("warnings", () => {
  it("flags a clock that looks wrong without rejecting the event", () => {
    const { backend, token } = activated();
    const body = ingestBody(
      backend.ingest(bearer(token), batch([event({ occurred_at: "2026-06-01T09:00:00.000Z" })])),
    );
    expect(body.accepted).toBe(1);
    expect(body.warnings.map((warning) => warning.code)).toContain("late_arrival");
  });

  it("reports each warning kind once, however many events raised it", () => {
    const { backend, token } = activated();
    const stale = () => event({ occurred_at: "2026-06-01T09:00:00.000Z" });
    const body = ingestBody(backend.ingest(bearer(token), batch([stale(), stale(), stale()])));
    expect(body.warnings.filter((warning) => warning.code === "late_arrival")).toHaveLength(1);
  });
});

describe("the diagnostic event", () => {
  it("travels the ordinary path and is stored like anything else", () => {
    const { backend, token, sourceId } = activated();
    const body = ingestBody(
      backend.ingest(
        bearer(token),
        batch([
          event({
            event_name: "diagnostic.test",
            properties: { reason: "activation_check", note: null },
          }),
        ]),
      ),
    );
    expect(body.accepted).toBe(1);
    const stored = backend.storedEventIds(sourceId);
    expect(stored).toHaveLength(1);
  });

  it("refuses an invented name in the reserved namespace", () => {
    const { backend, token } = activated();
    const body = ingestBody(
      backend.ingest(bearer(token), batch([event({ event_name: "diagnostic.ping" })])),
    );
    expect(body.results[0]?.code).toBe("schema_unknown");
  });
});

describe("the mock does only what it is told", () => {
  it("has no built-in failure pattern", () => {
    /*
     * Twenty batches, no directives, no fixture: twenty successes. A mock that
     * failed on its own schedule would teach whoever read it that the schedule
     * was protocol.
     */
    const { backend, token } = activated();
    for (let index = 0; index < 20; index += 1) {
      expect(ingestBody(backend.ingest(bearer(token), batch([event()]))).accepted).toBe(1);
    }
  });

  it("consumes one queued directive per request, in order", () => {
    const { backend, token } = activated();
    backend.push({ kind: "rate_limit", retryAfterSeconds: 1 }, { kind: "unavailable" });
    expect(response(backend.ingest(bearer(token), batch([event()]))).status).toBe(429);
    expect(response(backend.ingest(bearer(token), batch([event()]))).status).toBe(503);
    expect(response(backend.ingest(bearer(token), batch([event()]))).status).toBe(200);
  });

  it("names a recurring pattern as scaffolding when one is asked for", async () => {
    const { MOCK_ONLY_FIXTURES } = await import("../src/scenarios");
    const fixture = MOCK_ONLY_FIXTURES.rateLimitEveryNth(3);
    expect(fixture.name).toBe("rate_limit_every_3th");

    const backend = new MockObserverBackend({ fixture });
    const code = backend.issueActivationCode();
    /* Request 1 and 2 pass, request 3 is limited. Activation counts as one. */
    expect(fixture.at(3)?.kind).toBe("rate_limit");
    expect(fixture.at(1)).toBeNull();
    expect(code.startsWith("OBS-")).toBe(true);
  });
});
