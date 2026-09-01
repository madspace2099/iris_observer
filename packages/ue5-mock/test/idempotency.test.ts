import { describe, expect, it } from "vitest";
import { activated, batch, bearer, event, ingestBody, response } from "./helpers";

/**
 * THE STABLE `event_id`, AND THE SEVEN WAYS IT HAS TO EARN ITS KEEP.
 *
 * LOCKED §5.4 and §5.5: replaying an accepted `event_id` must never create a
 * second fact. That sentence sounds like a database constraint and is really a
 * statement about what a client is allowed not to know.
 *
 * The case that matters most is the last one. **A client cannot tell the
 * difference between "the server never saw my batch" and "the server stored my
 * batch and the acknowledgement was lost."** No amount of client-side care
 * closes that gap — it is a property of networks, not of code. What closes it is
 * that the client does not need to know: it resends, and the server answers
 * `duplicate` for whatever it already holds.
 *
 * Every case below is driven through the reference backend, so what is asserted
 * is behaviour rather than intent.
 */

describe("1. the first time an event is sent", () => {
  it("is accepted and stored once", () => {
    const { backend, token, sourceId } = activated();
    const one = event();
    const body = ingestBody(backend.ingest(bearer(token), batch([one])));
    expect(body.results[0]?.status).toBe("accepted");
    expect(backend.storedCount(sourceId)).toBe(1);
  });
});

describe("2. the same event, sent again", () => {
  it("comes back duplicate and stores nothing new", () => {
    const { backend, token, sourceId } = activated();
    const one = event();
    ingestBody(backend.ingest(bearer(token), batch([one])));
    const again = ingestBody(backend.ingest(bearer(token), batch([one])));

    expect(again.results[0]?.status).toBe("duplicate");
    expect(again.duplicate).toBe(1);
    expect(again.accepted).toBe(0);
    expect(backend.storedCount(sourceId)).toBe(1);
  });

  it("is a success for the client, so the event leaves the outbox", () => {
    /*
     * The point that gets implemented wrongly. `duplicate` is not a failure and
     * not a warning: the fact is stored, therefore it was delivered, therefore
     * the outbox entry is finished. A plugin that retries duplicates never
     * drains.
     */
    const { backend, token } = activated();
    const one = event();
    ingestBody(backend.ingest(bearer(token), batch([one])));
    const again = ingestBody(backend.ingest(bearer(token), batch([one])));
    expect(again.results[0]?.code).toBeNull();
    expect(again.results[0]?.retryable).toBeNull();
  });
});

describe("3. the same event inside a different batch", () => {
  it("is still a duplicate — the batch id means nothing to dedup", () => {
    const { backend, token, sourceId } = activated();
    const one = event();
    const first = batch([one]);
    const second = batch([one]);
    expect(first["batch_id"]).not.toBe(second["batch_id"]);

    ingestBody(backend.ingest(bearer(token), first));
    const again = ingestBody(backend.ingest(bearer(token), second));
    expect(again.results[0]?.status).toBe("duplicate");
    expect(backend.storedCount(sourceId)).toBe(1);
  });

  it("deduplicates within one batch too", () => {
    /* A crashed outbox can replay the same entry twice into one flush. */
    const { backend, token, sourceId } = activated();
    const one = event();
    const body = ingestBody(backend.ingest(bearer(token), batch([one, one])));
    expect(body.results.map((r) => r.status)).toEqual(["accepted", "duplicate"]);
    expect(backend.storedCount(sourceId)).toBe(1);
  });
});

describe("4. a duplicate mixed in with new events", () => {
  it("resolves each event on its own merits", () => {
    const { backend, token, sourceId } = activated();
    const known = event();
    ingestBody(backend.ingest(bearer(token), batch([known])));

    const mixed = ingestBody(backend.ingest(bearer(token), batch([event(), known, event()])));
    expect(mixed.results.map((r) => r.status)).toEqual(["accepted", "duplicate", "accepted"]);
    expect(mixed.accepted).toBe(2);
    expect(mixed.duplicate).toBe(1);
    expect(backend.storedCount(sourceId)).toBe(3);
  });
});

describe("5. a retry after an ambiguous transport failure", () => {
  it("is safe whichever way the ambiguity resolves", () => {
    /*
     * The client sees the same thing in both branches below: no response. It
     * cannot know which happened, and — this is the whole point — it does not
     * have to. It resends, and the totals are identical either way.
     */
    const dropped = activated();
    dropped.backend.push({ kind: "drop_before_processing" });
    const first = dropped.backend.ingest(bearer(dropped.token), batch([event()]));
    expect(first.kind).toBe("dropped");

    const stored = activated();
    stored.backend.push({ kind: "drop_after_processing" });
    const second = stored.backend.ingest(bearer(stored.token), batch([event()]));
    expect(second.kind).toBe("dropped");

    /* Indistinguishable from the client's side. */
    expect(first.kind).toBe(second.kind);
  });
});

describe("6. a retry after a 503, where nothing was stored", () => {
  it("accepts the resent events, because they are genuinely new", () => {
    const { backend, token, sourceId } = activated();
    const events = [event(), event()];

    backend.push({ kind: "unavailable" });
    const failed = response(backend.ingest(bearer(token), batch(events)));
    expect(failed.status).toBe(503);
    expect(backend.storedCount(sourceId), "a 503 stores nothing").toBe(0);

    const retry = ingestBody(backend.ingest(bearer(token), batch(events)));
    expect(retry.accepted).toBe(2);
    expect(retry.duplicate).toBe(0);
    expect(backend.storedCount(sourceId)).toBe(2);
  });
});

describe("7. a retry after the server processed the batch and the answer was lost", () => {
  it("comes back all duplicate, and stores nothing a second time", () => {
    /*
     * The case that makes the stable `event_id` worth its cost. Everything was
     * stored; the acknowledgement never arrived; the client is obliged to
     * resend because it has no acknowledgement to act on. Without the stable id
     * every showroom would double-count on every dropped connection — and a
     * dropped connection is not an exotic failure, it is Tuesday.
     */
    const { backend, token, sourceId } = activated();
    const events = [event(), event(), event()];

    backend.push({ kind: "drop_after_processing" });
    const lost = backend.ingest(bearer(token), batch(events));
    expect(lost.kind).toBe("dropped");
    if (lost.kind === "dropped") expect(lost.processed).toBe(true);
    expect(backend.storedCount(sourceId), "the server did store them").toBe(3);

    const retry = ingestBody(backend.ingest(bearer(token), batch(events)));
    expect(retry.duplicate).toBe(3);
    expect(retry.accepted).toBe(0);
    expect(backend.storedCount(sourceId), "and stored nothing twice").toBe(3);
  });

  it("keeps the stored facts identical to what was first sent", () => {
    const { backend, token, sourceId } = activated();
    const one = event({ properties: { unit_code: "A-402", duration_ms: 94_000 } });

    backend.push({ kind: "drop_after_processing" });
    backend.ingest(bearer(token), batch([one]));
    const stored = backend.storedEvent(sourceId, one["event_id"] as string);

    /* A resend that carried different properties must not overwrite anything. */
    ingestBody(
      backend.ingest(
        bearer(token),
        batch([{ ...one, properties: { unit_code: "B-101", duration_ms: 1 } }]),
      ),
    );
    expect(backend.storedEvent(sourceId, one["event_id"] as string)).toEqual(stored);
    expect(stored?.properties).toEqual({ unit_code: "A-402", duration_ms: 94_000 });
  });
});

describe("the two drops, side by side", () => {
  it("differ only in what the server did, never in what the client saw", () => {
    const before = activated();
    before.backend.push({ kind: "drop_before_processing" });
    const a = before.backend.ingest(bearer(before.token), batch([event()]));

    const after = activated();
    after.backend.push({ kind: "drop_after_processing" });
    const b = after.backend.ingest(bearer(after.token), batch([event()]));

    expect(a).toEqual({ kind: "dropped", processed: false });
    expect(b).toEqual({ kind: "dropped", processed: true });
    expect(before.backend.storedCount(before.sourceId)).toBe(0);
    expect(after.backend.storedCount(after.sourceId)).toBe(1);
  });
});

describe("replay much later", () => {
  it("is still a duplicate a fortnight afterwards", () => {
    /*
     * There is no time window on deduplication in this contract, and inventing
     * one would be inventing OPEN-1. The one thing that could break this is a
     * retention policy deleting the accepted event and with it the record that
     * enforces uniqueness — which is exactly why OPEN-1 must be settled *before*
     * any retention policy is allowed to delete anything, and not before then.
     */
    const { backend, token, sourceId } = activated();
    const one = event();
    ingestBody(backend.ingest(bearer(token), batch([one])));

    for (let day = 0; day < 14; day += 1) {
      const again = ingestBody(backend.ingest(bearer(token), batch([one])));
      expect(again.results[0]?.status, `day ${day}`).toBe("duplicate");
    }
    expect(backend.storedCount(sourceId)).toBe(1);
  });
});
