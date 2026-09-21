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

  it("states no token expiry, in a field that could carry one later", () => {
    expect(activated().activation.token_expires_at).toBeNull();
  });

  it("mints whatever code prefix a test asks for, because a prefix is not semantic", () => {
    /*
     * Akhilesh's UE build tests against `DEV-` codes and this harness mints
     * `OBS-`. The schema constrains length and nothing else, so the harness
     * bends rather than asking the UE side to change something the protocol
     * does not care about.
     */
    const dev = new MockObserverBackend({ codePrefix: "DEV" });
    const code = dev.issueActivationCode();
    expect(code.startsWith("DEV-")).toBe(true);
    const answer = response(dev.activate(activationRequest({ activation_code: code })));
    expect(answer.status).toBe(200);
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

  it("answers a revoked code exactly as it answers an unknown one", () => {
    /*
     * The fourth case, added with the rest. An operator who withdraws a code
     * must not thereby create a signal: a revoked code that failed differently
     * would tell whoever holds it that it had once been real, and therefore
     * that the source it belonged to exists.
     */
    const revoked = backend.issueActivationCode();
    backend.revokeCode(revoked);
    const answer = response(backend.activate(activationRequest({ activation_code: revoked })));
    expect(answer.status).toBe(401);
    expect(answer.body).toEqual({
      status: "failed",
      code: "activation_failed",
      message: "The activation code could not be used.",
      source_id: null,
      retry_after_seconds: null,
    });
  });

  it("never returns a source_id for a code that cannot be used", () => {
    /*
     * The correction, pinned — and now stronger than when it was written.
     *
     * This test used to defend a narrower claim: that `409 already_activated`
     * was reachable only from a VALID code meeting an installation that already
     * had a live source, so an unusable code could never be handed a source
     * identifier. That branch no longer exists at all. `409` is not an
     * activation outcome, `already_activated` is not a code, and
     * `ActivationFailureSchema.source_id` is typed `z.null()`.
     *
     * The assertion is kept rather than deleted because it guards the property
     * the removal was for: nothing a caller can send makes a failure carry a
     * source identifier.
     */
    const consumed = backend.issueActivationCode();
    response(backend.activate(activationRequest({ activation_code: consumed })));
    const revoked = backend.issueActivationCode();
    backend.revokeCode(revoked);
    const expired = backend.issueActivationCode();
    backend.expireCode(expired);

    for (const code of [consumed, revoked, expired, "OBS-FFFF-FFFF-FFF0"]) {
      const answer = response(backend.activate(activationRequest({ activation_code: code })));
      expect(answer.status, code).toBe(401);
      expect(answer.body["source_id"], code).toBeNull();
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

describe("installation_nonce is not an authorisation input", () => {
  /*
   * THIS BLOCK ASSERTS THE INVERSE OF WHAT IT USED TO.
   *
   * There was an installation-clash branch: a second code presented from an
   * `installation_nonce` that already had a source answered `409
   * already_activated` and returned that source's id, deliberately without
   * consuming the code.
   *
   * It is gone, for two independent reasons.
   *
   * It was an unauthenticated existence oracle. A caller holding a guessed code
   * learned that the code was genuine, that a source existed, and its
   * identifier — while failing to authenticate. LOCKED §9.1 requires every
   * activation failure to be indistinguishable, and the branch broke it for
   * operator convenience the operator did not need: they are signed in to Admin,
   * where the source is already listed.
   *
   * And it authorised on `installation_nonce`. The architecture defines that
   * value as operational metadata and never an authorisation input, so a
   * client-supplied field deciding an outcome was a category error regardless of
   * the oracle.
   */

  it("lets a valid code activate whichever installation presents it", () => {
    const backend = new MockObserverBackend();
    const nonce = uuid();

    const first = response(
      backend.activate(
        activationRequest({
          activation_code: backend.issueActivationCode(),
          installation_nonce: nonce,
        }),
      ),
    );
    expect(first.status).toBe(200);

    /* Same installation, a second freshly issued code. A one-time code is
     * one-time; it is not scoped to whoever has not used one yet. */
    const second = response(
      backend.activate(
        activationRequest({
          activation_code: backend.issueActivationCode(),
          installation_nonce: nonce,
        }),
      ),
    );
    expect(second.status).toBe(200);
    expect(second.body["source_id"]).not.toBe(first.body["source_id"]);
  });

  it("answers a consumed code identically however it is presented", () => {
    /*
     * The indistinguishability that replaced the clash branch. A replayed code
     * and a code that never existed produce byte-identical failures, from a
     * known installation and an unknown one alike.
     */
    const backend = new MockObserverBackend();
    const code = backend.issueActivationCode();
    const nonce = uuid();

    expect(
      response(
        backend.activate(activationRequest({ activation_code: code, installation_nonce: nonce })),
      ).status,
    ).toBe(200);

    const replayedSameInstallation = response(
      backend.activate(activationRequest({ activation_code: code, installation_nonce: nonce })),
    );
    const replayedOtherInstallation = response(
      backend.activate(activationRequest({ activation_code: code, installation_nonce: uuid() })),
    );
    const neverExisted = response(
      backend.activate(activationRequest({ activation_code: "OBS-0000-0000-0000" })),
    );

    for (const answer of [replayedSameInstallation, replayedOtherInstallation, neverExisted]) {
      expect(answer.status).toBe(401);
      expect(answer.body["code"]).toBe("activation_failed");
      expect(answer.body["source_id"], "no existence oracle").toBeNull();
      expect(answer.body).not.toHaveProperty("source_token");
    }

    expect(JSON.stringify(replayedSameInstallation.body)).toBe(JSON.stringify(neverExisted.body));
    expect(JSON.stringify(replayedOtherInstallation.body)).toBe(JSON.stringify(neverExisted.body));
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
