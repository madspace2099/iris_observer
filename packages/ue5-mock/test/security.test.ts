import { describe, expect, it } from "vitest";
import { MockObserverBackend } from "../src/backend";
import {
  activated,
  activationRequest,
  batch,
  bearer,
  event,
  ingestBody,
  response,
  uuid,
} from "./helpers";

/**
 * THE THREAT MODEL, EXERCISED RATHER THAN ASSERTED.
 *
 * The premise the approved architecture already accepts: **a packaged Unreal
 * application cannot keep a secret.** Anyone with the binary eventually has the
 * token. Nothing here depends on pretending otherwise. What it depends on is
 * that an extracted token is *narrow, revocable and observable* — and each of
 * those is a property that can be tested.
 *
 * The one finding worth reading twice is the existence oracle. A `duplicate`
 * answer is a success response, and a success response that depends on what some
 * *other* tenant has stored is a cross-tenant information leak wearing the
 * clothes of a feature.
 */

describe("an extracted credential is narrow", () => {
  it("can append to its own source and nothing else", () => {
    const backend = new MockObserverBackend();
    const a = activated(backend);
    const b = activated(backend);

    ingestBody(backend.ingest(bearer(a.token), batch([event()])));
    expect(backend.storedCount(a.sourceId)).toBe(1);
    expect(backend.storedCount(b.sourceId)).toBe(0);
  });

  it("cannot become another source by claiming to be one", () => {
    /*
     * The direct attempt. Identity is derived from the credential and there is
     * no field on the wire that changes it, so the event is refused outright
     * rather than accepted under the wrong tenant.
     */
    const backend = new MockObserverBackend();
    const a = activated(backend);
    const b = activated(backend);

    const forged = ingestBody(
      backend.ingest(
        bearer(a.token),
        batch([event({ properties: { source_id: b.sourceId, tenant_id: "tnt_victim" } })]),
      ),
    );
    expect(forged.results[0]?.status).toBe("rejected");
    expect(forged.results[0]?.code).toBe("reserved_property");
    expect(backend.storedCount(b.sourceId)).toBe(0);
  });

  it("cannot read anything", () => {
    /* The contract has no read operation. There is nothing to attack. */
    const backend = new MockObserverBackend();
    const { token } = activated(backend);
    expect(response(backend.ingest(bearer(token), batch([]))).body).not.toHaveProperty("events");
  });
});

describe("a duplicate answer must not become an existence oracle", () => {
  it("does not reveal that another source stored the same event id", () => {
    /*
     * THE FINDING. With a globally unique `event_id` index, a holder of any
     * credential could submit a guessed id and read the answer: `duplicate`
     * means some other installation sent it, `accepted` means nobody did. That
     * is a cross-tenant existence oracle built out of a success response, and it
     * costs an attacker one request.
     *
     * Scoping deduplication to the source closes it. Two sources submitting the
     * same id both get `accepted`, and each stores its own fact.
     */
    const backend = new MockObserverBackend();
    const a = activated(backend);
    const b = activated(backend);

    const shared = event();
    expect(ingestBody(backend.ingest(bearer(a.token), batch([shared]))).accepted).toBe(1);

    const other = ingestBody(backend.ingest(bearer(b.token), batch([shared])));
    expect(other.results[0]?.status, "b learns nothing about a").toBe("accepted");
    expect(backend.storedCount(a.sourceId)).toBe(1);
    expect(backend.storedCount(b.sourceId)).toBe(1);
  });
});

describe("activation cannot be used to enumerate anything", () => {
  it("answers the same for a code that never existed and one that was used", () => {
    const backend = new MockObserverBackend();
    const real = backend.issueActivationCode();
    response(backend.activate(activationRequest({ activation_code: real })));

    const used = response(backend.activate(activationRequest({ activation_code: real })));
    const invented = response(
      backend.activate(activationRequest({ activation_code: "OBS-ZZZZ-ZZZZ-ZZZZ" })),
    );
    expect(used.status).toBe(invented.status);
    expect(used.body).toEqual(invented.body);
  });

  it("never names a tenant, project or source in a failure", () => {
    const backend = new MockObserverBackend();
    const answer = response(
      backend.activate(activationRequest({ activation_code: "OBS-0000-0000-0001" })),
    );
    const serialised = JSON.stringify(answer.body);
    expect(serialised).not.toMatch(/tnt_|prj_/);
    expect(answer.body["source_id"]).toBeNull();
  });

  it("hides an archived source behind the same answer as a bad code", () => {
    const backend = new MockObserverBackend();
    const { sourceId } = activated(backend);
    backend.setSourceState(sourceId, "archived");
    const recovery = backend.issueActivationCode({ forSourceId: sourceId });
    const answer = response(backend.activate(activationRequest({ activation_code: recovery })));
    expect(answer.status).toBe(401);
    expect(answer.body["source_id"]).toBeNull();
  });

  it("can be rate limited without revealing which guess was closer", () => {
    const backend = new MockObserverBackend();
    backend.push({ kind: "rate_limit", retryAfterSeconds: 60 });
    const answer = response(
      backend.activate(activationRequest({ activation_code: "OBS-AAAA-BBBB-CCCC" })),
    );
    expect(answer.status).toBe(429);
    expect(JSON.stringify(answer.body)).not.toContain("activation_failed");
  });
});

describe("revocation is the control that matters", () => {
  it("takes effect on the very next request", () => {
    const { backend, token, sourceId } = activated();
    ingestBody(backend.ingest(bearer(token), batch([event()])));
    backend.revokeCredentialFor(sourceId);
    expect(response(backend.ingest(bearer(token), batch([event()]))).status).toBe(401);
  });

  it("cannot be undone by the client", () => {
    /*
     * No refresh endpoint, no stored fallback code, no self-service recovery.
     * A revoked build stays revoked until an operator issues a new code.
     */
    const { backend, token, sourceId } = activated();
    backend.revokeCredentialFor(sourceId);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(response(backend.ingest(bearer(token), batch([event()]))).status).toBe(401);
    }
  });

  it("supersedes the old credential the moment a new one is minted", () => {
    const { backend, token, sourceId } = activated();
    const recovery = backend.issueActivationCode({ forSourceId: sourceId });
    const fresh = response(backend.activate(activationRequest({ activation_code: recovery })));

    expect(response(backend.ingest(bearer(token), batch([event()]))).status).toBe(401);
    expect(
      ingestBody(backend.ingest(bearer(String(fresh.body["source_token"])), batch([event()])))
        .accepted,
    ).toBe(1);
  });
});

describe("payload abuse", () => {
  it("refuses a deeply nested payload instead of crashing on it", () => {
    const { backend, token } = activated();
    let nested: unknown = "bottom";
    for (let index = 0; index < 4_000; index += 1) nested = { deeper: nested };

    const body = ingestBody(
      backend.ingest(bearer(token), batch([event({ properties: { nested } })])),
    );
    expect(body.results[0]?.code).toBe("event_too_large");
  });

  it("refuses a flood of duplicates without storing any of them twice", () => {
    const { backend, token, sourceId } = activated();
    const one = event();
    ingestBody(backend.ingest(bearer(token), batch([one])));
    const flood = ingestBody(
      backend.ingest(bearer(token), batch(Array.from({ length: 200 }, () => one))),
    );
    expect(flood.duplicate).toBe(200);
    expect(backend.storedCount(sourceId)).toBe(1);
  });

  it("keeps a leaked credential out of the response it caused", () => {
    const { backend, token } = activated();
    const body = ingestBody(
      backend.ingest(bearer(token), batch([event({ properties: { debug_token: token } })])),
    );
    expect(body.results[0]?.code).toBe("pii_suspected");
    expect(JSON.stringify(body)).not.toContain(token);
  });

  it("refuses an invented diagnostic name, so the namespace cannot be squatted", () => {
    const { backend, token } = activated();
    const body = ingestBody(
      backend.ingest(bearer(token), batch([event({ event_name: "diagnostic.flood" })])),
    );
    expect(body.results[0]?.code).toBe("schema_unknown");
  });
});

describe("nothing sensitive appears in a response", () => {
  it("never echoes a token, a code or a nonce", () => {
    const backend = new MockObserverBackend();
    const code = backend.issueActivationCode();
    const nonce = uuid();
    const activation = response(
      backend.activate(activationRequest({ activation_code: code, installation_nonce: nonce })),
    );
    /* The token is returned once, here, and that is the only time. */
    const token = String(activation.body["source_token"]);

    const ingest = response(backend.ingest(bearer(token), batch([event()])));
    const serialised = JSON.stringify(ingest.body);
    expect(serialised).not.toContain(token);
    expect(serialised).not.toContain(code);
    expect(serialised).not.toContain(nonce);
  });
});
