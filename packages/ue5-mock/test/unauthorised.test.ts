import { describe, expect, it } from "vitest";
import {
  REACTIVATION_INVARIANTS,
  UNAUTHORISED_OUTBOX_BEHAVIOUR,
  outboxStateForRequestFailure,
} from "@observer/contracts/ue5";
import {
  activated,
  activationRequest,
  batch,
  bearer,
  event,
  ingestBody,
  response,
} from "./helpers";

/**
 * 401 AND 403 — approved V1 behaviour, driven end to end.
 *
 * The rule that costs the most when it is missed: **an authorisation failure
 * acknowledges nothing.** No event is accepted, no event is deleted, and the
 * outbox is exactly as full afterwards as it was before. A plugin that cleared
 * its queue here would turn a five-minute operator task into permanent data
 * loss, and it would look like tidy error handling while doing it.
 *
 * The second half of the file is the case that only shows up after the operator
 * has fixed things: reactivation must not disturb what was already queued.
 * Credential rotation changes *authentication material*, not identity.
 */

describe("the published behaviour", () => {
  it("pauses delivery, preserves everything, and forbids self-recovery", () => {
    const joined = UNAUTHORISED_OUTBOX_BEHAVIOUR.join(" ");
    expect(joined).toMatch(/Immediately pause network delivery/);
    expect(joined).toMatch(/Preserve the entire durable outbox/);
    expect(joined).toMatch(/Continue bounded local capture/);
    expect(joined).toMatch(/Never reactivate automatically/);
    expect(joined).toMatch(/administrator entering a newly issued activation code/);
  });

  it("keeps 401 and 403 distinct, because the operator's remedy differs", () => {
    const joined = UNAUTHORISED_OUTBOX_BEHAVIOUR.join(" ");
    expect(joined).toMatch(/401 \(credential rejected, reactivation required\)/);
    expect(joined).toMatch(/403 \(source suspended\)/);
  });

  it("maps both to a retained queue and a stopped sender", () => {
    for (const status of [401, 403]) {
      const verdict = outboxStateForRequestFailure(status);
      expect(verdict.state, String(status)).toBe("pending");
      expect(verdict.sending, String(status)).toBe("stop");
      expect(verdict.mayBeErased, String(status)).toBe(false);
    }
  });
});

describe("a revoked credential — 401", () => {
  it("acknowledges nothing and deletes nothing", () => {
    const { backend, token, sourceId } = activated();
    const delivered = [event(), event()];
    expect(ingestBody(backend.ingest(bearer(token), batch(delivered))).accepted).toBe(2);

    backend.revokeCredentialFor(sourceId);

    const queued = [event(), event(), event()];
    const refused = response(backend.ingest(bearer(token), batch(queued)));
    expect(refused.status).toBe(401);
    expect(refused.body["code"]).toBe("unauthorised");

    /* Nothing new stored, and nothing previously stored lost. */
    expect(backend.storedCount(sourceId)).toBe(2);
    expect(refused.body).not.toHaveProperty("results");
  });

  it("keeps answering 401 rather than letting a client retry its way back in", () => {
    const { backend, token, sourceId } = activated();
    backend.revokeCredentialFor(sourceId);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(response(backend.ingest(bearer(token), batch([event()]))).status).toBe(401);
    }
    expect(backend.storedCount(sourceId)).toBe(0);
  });
});

describe("a suspended source — 403", () => {
  it("is a different answer with a different remedy", () => {
    const { backend, token, sourceId } = activated();
    backend.setSourceState(sourceId, "suspended");
    const refused = response(backend.ingest(bearer(token), batch([event()])));
    expect(refused.status).toBe(403);
    expect(refused.body["code"]).toBe("source_suspended");
    expect(backend.storedCount(sourceId)).toBe(0);
  });

  it("resumes cleanly once an operator lifts it, with no reactivation needed", () => {
    /*
     * The credential was never the problem, so it still works. This is exactly
     * why the two statuses have to stay distinguishable on the plugin's
     * diagnostic screen.
     */
    const { backend, token, sourceId } = activated();
    backend.setSourceState(sourceId, "suspended");
    expect(response(backend.ingest(bearer(token), batch([event()]))).status).toBe(403);

    backend.setSourceState(sourceId, "active");
    expect(ingestBody(backend.ingest(bearer(token), batch([event()]))).accepted).toBe(1);
  });
});

describe("reactivation does not disturb the queue", () => {
  it("keeps the same source and re-delivers held events without duplicating facts", () => {
    /*
     * The full operator story: some events delivered, credential revoked, more
     * events accumulate locally, operator issues a new code, delivery resumes.
     *
     * Two things must hold at the end. The three held events are stored exactly
     * once — they were never acknowledged, so they were genuinely new. And the
     * two earlier ones, resent because the plugin cannot know which reached the
     * server before the revocation, come back `duplicate` rather than becoming
     * second facts.
     */
    const { backend, token, sourceId } = activated();
    const delivered = [event(), event()];
    ingestBody(backend.ingest(bearer(token), batch(delivered)));

    backend.revokeCredentialFor(sourceId);
    const held = [event(), event(), event()];
    expect(response(backend.ingest(bearer(token), batch(held))).status).toBe(401);
    expect(backend.storedCount(sourceId)).toBe(2);

    const recovery = backend.issueActivationCode({ forSourceId: sourceId });
    const reactivated = response(
      backend.activate(activationRequest({ activation_code: recovery })),
    );
    expect(reactivated.status).toBe(200);
    expect(reactivated.body["status"]).toBe("reactivated");
    expect(reactivated.body["source_id"], "identity is unchanged").toBe(sourceId);

    const fresh = String(reactivated.body["source_token"]);
    const drained = ingestBody(backend.ingest(bearer(fresh), batch([...delivered, ...held])));

    expect(drained.duplicate, "the two already stored").toBe(2);
    expect(drained.accepted, "the three that were held").toBe(3);
    expect(backend.storedCount(sourceId)).toBe(5);
  });

  it("stores the held events under the same source they were captured for", () => {
    /*
     * The quiet one. If a reactivation swapped the credential and the queued
     * events silently followed it to a different source, a showroom's history
     * would move without anybody deciding that it should.
     */
    const { backend, token, sourceId } = activated();
    backend.revokeCredentialFor(sourceId);
    const held = event();
    response(backend.ingest(bearer(token), batch([held])));

    const recovery = backend.issueActivationCode({ forSourceId: sourceId });
    const fresh = String(
      response(backend.activate(activationRequest({ activation_code: recovery }))).body[
        "source_token"
      ],
    );
    ingestBody(backend.ingest(bearer(fresh), batch([held])));

    const stored = backend.storedEvent(sourceId, held["event_id"] as string);
    expect(stored?.sourceId).toBe(sourceId);
    expect(backend.sourceIdForToken(fresh)).toBe(sourceId);
  });

  it("publishes the invariants a plugin has to keep across reactivation", () => {
    const joined = REACTIVATION_INVARIANTS.join(" ");
    expect(joined).toMatch(/Queued events survive reactivation/);
    expect(joined).toMatch(/No queued event receives a new event_id/);
    expect(joined).toMatch(/authentication material, not source or event identity/);
  });
});
