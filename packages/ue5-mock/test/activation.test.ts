import { describe, expect, it } from "vitest";
import { FixedClock, MockObserverBackend } from "../src/backend";
import { activationRequest, activated, response, uuid } from "./helpers";

/**
 * ACTIVATION, THROUGH EVERY DOOR IT CAN GO WRONG.
 *
 * The property worth defending hardest is the one that reads like tidiness and
 * is not: **unknown, expired and consumed codes must be indistinguishable.** A
 * response that separates them tells anybody holding a guessed code whether a
 * tenant, a project or a source exists (LOCKED §9.1), and that is a
 * cross-tenant existence oracle built out of an error message.
 */

describe("first activation", () => {
  it("exchanges a code for a credential, once", () => {
    const { activation } = activated();
    expect(activation.status).toBe("activated");
    expect(activation.source_token.length).toBeGreaterThanOrEqual(32);
    expect(activation.display_label).toBe("Northgate · Showroom PC 1");
    expect(activation.environment).toBe("production");
    expect(activation.environment_mismatch).toBe(false);
  });

  it("states no limits, because none have been decided", () => {
    const { activation } = activated();
    for (const value of Object.values(activation.limits)) expect(value).toBeNull();
  });

  it("returns no tenant or project identifier", () => {
    const { activation } = activated();
    expect(Object.keys(activation)).not.toContain("tenant_id");
    expect(Object.keys(activation)).not.toContain("project_id");
  });

  it("says so when the build thinks it is somewhere else", () => {
    /*
     * A development build declaring itself production is the failure this
     * catches. The stored environment comes from the source record either way;
     * the flag is what puts it on a screen instead of only in a log.
     */
    const backend = new MockObserverBackend();
    const code = backend.issueActivationCode({ environment: "production" });
    const { body } = response(
      backend.activate(
        activationRequest({ activation_code: code, reported_environment: "development" }),
      ),
    );
    expect(body["environment"]).toBe("production");
    expect(body["environment_mismatch"]).toBe(true);
  });
});

describe("a code that cannot be used", () => {
  const backend = new MockObserverBackend();

  it("answers identically for unknown, expired and consumed", () => {
    /* Unknown. */
    const unknown = response(
      backend.activate(activationRequest({ activation_code: "OBS-FFFF-FFFF-FFFF" })),
    );

    /* Expired. */
    const expired = backend.issueActivationCode();
    backend.expireCode(expired);
    const expiredAnswer = response(
      backend.activate(activationRequest({ activation_code: expired })),
    );

    /* Consumed: activate once, then present the same code again. */
    const consumed = backend.issueActivationCode();
    response(backend.activate(activationRequest({ activation_code: consumed })));
    const consumedAnswer = response(
      backend.activate(activationRequest({ activation_code: consumed })),
    );

    for (const answer of [unknown, expiredAnswer, consumedAnswer]) {
      expect(answer.status).toBe(401);
      expect(answer.body).toEqual({
        status: "failed",
        code: "activation_failed",
        message: "The activation code could not be used.",
        source_id: null,
        retry_after_seconds: null,
      });
    }
  });

  it("expires a code by the clock, not by a flag alone", () => {
    const clock = new FixedClock("2026-09-01T09:00:00.000Z");
    const timed = new MockObserverBackend({ clock });
    const code = timed.issueActivationCode({ expiresInMs: 15 * 60_000 });
    clock.advance(16 * 60_000);
    expect(response(timed.activate(activationRequest({ activation_code: code }))).status).toBe(401);
  });

  it("refuses a request that is not a request", () => {
    const answer = response(backend.activate({ activation_code: "OBS-1111-2222-3333" }));
    expect(answer.status).toBe(400);
    expect(answer.body["code"]).toBe("malformed_request");
  });
});

describe("an installation that already has a source", () => {
  it("answers 409 and issues no token", () => {
    const backend = new MockObserverBackend();
    const nonce = uuid();
    const first = backend.issueActivationCode();
    const created = response(
      backend.activate(activationRequest({ activation_code: first, installation_nonce: nonce })),
    );
    expect(created.status).toBe(200);

    const second = backend.issueActivationCode();
    const clash = response(
      backend.activate(activationRequest({ activation_code: second, installation_nonce: nonce })),
    );

    expect(clash.status).toBe(409);
    expect(clash.body["code"]).toBe("already_activated");
    expect(clash.body["source_id"]).toBe(created.body["source_id"]);
    /* No token. This is what stops a second source per installation. */
    expect(clash.body).not.toHaveProperty("source_token");
  });

  it("does not burn the code it refused", () => {
    /*
     * Nothing was exchanged for it. Consuming it would make the operator issue
     * another code to fix a problem they have not been told about yet.
     */
    const backend = new MockObserverBackend();
    const nonce = uuid();
    response(
      backend.activate(
        activationRequest({
          activation_code: backend.issueActivationCode(),
          installation_nonce: nonce,
        }),
      ),
    );
    const spare = backend.issueActivationCode();
    expect(
      response(
        backend.activate(activationRequest({ activation_code: spare, installation_nonce: nonce })),
      ).status,
    ).toBe(409);
    /* Still usable by a different installation. */
    expect(
      response(
        backend.activate(activationRequest({ activation_code: spare, installation_nonce: uuid() })),
      ).status,
    ).toBe(200);
  });
});

describe("reactivation", () => {
  it("keeps the source and replaces the credential", () => {
    const { backend, sourceId, token } = activated();
    const recovery = backend.issueActivationCode({ forSourceId: sourceId });
    const again = response(backend.activate(activationRequest({ activation_code: recovery })));

    expect(again.status).toBe(200);
    expect(again.body["status"]).toBe("reactivated");
    expect(again.body["source_id"]).toBe(sourceId);
    expect(again.body["source_token"]).not.toBe(token);
  });

  it("kills the previous credential the moment the new one is issued", () => {
    const { backend, sourceId, token } = activated();
    const recovery = backend.issueActivationCode({ forSourceId: sourceId });
    response(backend.activate(activationRequest({ activation_code: recovery })));

    const refused = response(backend.ingest(`Bearer ${token}`, { batch_id: uuid() }));
    expect(refused.status).toBe(401);
    expect(refused.body["code"]).toBe("unauthorised");
  });

  it("is the only recovery path, and it needs an operator", () => {
    /*
     * There is no refresh endpoint and no stored fallback code. A plugin that
     * has lost its credential cannot get another one on its own, which is what
     * makes an extracted credential worth revoking.
     */
    const { backend, sourceId } = activated();
    backend.revokeCredentialFor(sourceId);
    const recovery = backend.issueActivationCode({ forSourceId: sourceId });
    expect(
      response(backend.activate(activationRequest({ activation_code: recovery }))).status,
    ).toBe(200);
  });

  it("refuses to resurrect an archived source, and does not admit it exists", () => {
    const { backend, sourceId } = activated();
    backend.setSourceState(sourceId, "archived");
    const recovery = backend.issueActivationCode({ forSourceId: sourceId });
    const answer = response(backend.activate(activationRequest({ activation_code: recovery })));
    expect(answer.status).toBe(401);
    expect(answer.body["source_id"]).toBeNull();
  });
});

describe("when the server is busy or broken", () => {
  it("rate limits with a Retry-After a client can obey", () => {
    const backend = new MockObserverBackend();
    backend.push({ kind: "rate_limit", retryAfterSeconds: 30 });
    const answer = response(backend.activate(activationRequest()));
    expect(answer.status).toBe(429);
    expect(answer.body["retry_after_seconds"]).toBe(30);
    expect(answer.headers["retry-after"]).toBe("30");
  });

  it("answers 503 without consuming anything", () => {
    const backend = new MockObserverBackend();
    const code = backend.issueActivationCode();
    backend.push({ kind: "unavailable" });
    expect(response(backend.activate(activationRequest({ activation_code: code }))).status).toBe(
      503,
    );
    /* The code survives, so the retry after backoff works. */
    expect(response(backend.activate(activationRequest({ activation_code: code }))).status).toBe(
      200,
    );
  });
});
