import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FIXTURE_PACK_DIRECTORY,
  committedFixtureFiles,
  generatedFixtureFiles,
} from "../../../../scripts/contracts/emit-fixtures";
import {
  CONFORMANCE_FIXTURES,
  DECLARED_SYNTHETIC_SECRETS,
  FIXTURE_ACTIVATION_CODE_STATES,
  FIXTURE_EVENT_IDS,
  FIXTURE_OUTBOX_ACTIONS,
  FIXTURE_SOURCE_TOKEN,
  FIXTURE_STATE_EFFECTS,
  HEARTBEAT_BODY_CEILING_BYTES,
  exchangeFixtures,
  exchangeNamed,
  fixtureNamed,
  fixtureNames,
  isExchangeFixture,
  type ExchangeFixture,
} from "../../src/ue5/fixtures";
import { classifyEventRejection } from "../../src/ue5/errors";
import { READ_MODEL_EXCLUSION_RULE, isDiagnosticEvent } from "../../src/ue5/diagnostic";
import { serialisedBytes } from "../../src/ue5/ingestion";
import { COMPONENT_SCHEMAS } from "../../src/ue5/openapi";
import { OBSERVER_ROUTES } from "../../src/ue5/wire";

/**
 * THE CONFORMANCE PACK IS TRUE, COMPLETE, AND SAFE TO PUBLISH.
 *
 * Three separate obligations, and this file keeps them apart because they fail
 * for different reasons:
 *
 *   **True.** Every response body in the pack validates against the schema this
 *   repository publishes, so a plugin author cannot be handed an example the
 *   contract would refuse. With exactly one exception, which must genuinely
 *   fail — a fixture labelled malformed that quietly validates teaches the
 *   opposite of what it claims to.
 *
 *   **Complete.** The four rules that are wrong in practice — a missing result,
 *   a foreign result id, two results for one id, and an unreadable `2xx` — are
 *   asserted by name and by value here rather than left to a reader to notice.
 *   They are the reason the pack exists.
 *
 *   **Safe.** The pack is a published document. A sweep asserts that the only
 *   credential-shaped values anywhere on its wire are the two declared synthetic
 *   ones, so a real token pasted in during a debugging session fails here rather
 *   than in `docs/`.
 *
 * Plus the drift check every generated artefact in this repository carries: the
 * committed files are regenerated in memory and compared byte for byte.
 *
 * ## A fourth obligation, added with `expectedBackendState`
 *
 *   **Coherent.** The client half and the backend half of a fixture must agree.
 *   An event whose outbox action is `remove` has to appear in `storedEventIds`,
 *   because removal is only ever justified by the server holding the fact; an
 *   event whose fate the response leaves undetermined has to be `retain`. Those
 *   two assertions are what stop the two halves drifting into a pack that
 *   teaches a plugin author to delete an event the server never stored, and they
 *   are asserted for every fixture rather than for the ones somebody remembered.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..", "..");

/**
 * Every fixture that is an HTTP exchange.
 *
 * Most of this file is about requests and responses, and the one `read-model`
 * fixture has neither. Narrowing once here rather than at twenty call sites is
 * what keeps the union honest — the alternative is a cast, and a cast in a test
 * that exists to check shapes would be checking nothing.
 */
const EXCHANGES: readonly ExchangeFixture[] = exchangeFixtures();

/* ============================================================ small helpers */

/** Every string reachable inside a value, at any depth. Keys are not included. */
function stringsIn(value: unknown): string[] {
  const found: string[] = [];
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const node = stack.pop();
    if (typeof node === "string") found.push(node);
    else if (Array.isArray(node)) for (const child of node) stack.push(child);
    else if (node !== null && typeof node === "object") {
      for (const child of Object.values(node)) stack.push(child);
    }
  }
  return found;
}

/**
 * Only what actually travels: headers and bodies, requests and responses.
 *
 * Deliberately not `name`, `description`, `why` or `notes`. Those are prose
 * about the wire rather than the wire itself, and a credential sweep that
 * included them would flag `ingest-lost-acknowledgement-replay` — a
 * thirty-four-character run of lowercase and hyphens — as opaque credential
 * material, which is exactly the kind of false positive that gets a scanner
 * switched off.
 */
function wireValues(fixture: ExchangeFixture): string[] {
  return [
    ...stringsIn(fixture.request.headers),
    ...stringsIn(fixture.request.body),
    ...stringsIn(fixture.response.headers),
    ...stringsIn(fixture.response.body),
    ...stringsIn(fixture.counterExample?.body),
  ];
}

const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * An opaque run of credential alphabet, long enough to be a secret.
 *
 * No colon and no whitespace, so ISO instants, URLs and prose are out; UUIDs are
 * excluded separately because the pack is full of them and every one is an
 * identifier rather than a secret.
 */
const OPAQUE_RUN = /^[A-Za-z0-9._~+/=-]{20,}$/;

function credentialShaped(value: string): string | null {
  const bare = value.startsWith("Bearer ") ? value.slice("Bearer ".length) : value;
  if (!OPAQUE_RUN.test(bare)) return null;
  if (CANONICAL_UUID.test(bare)) return null;
  return bare;
}

function parseAgainst(schemaName: string, body: unknown) {
  const schema = COMPONENT_SCHEMAS[schemaName];
  if (schema === undefined) throw new Error(`no published component named ${schemaName}`);
  return schema.safeParse(body);
}

const ROUTE_PATHS: readonly string[] = Object.values(OBSERVER_ROUTES);

/* ============================================================ completeness */

describe("the pack covers every scenario a conforming plugin must handle", () => {
  it("holds exactly the agreed cases, in the order a reader should meet them", () => {
    /*
     * Spelled out rather than counted. A count passes when somebody deletes the
     * foreign-result case and adds a second happy path, which is the substitution
     * this list exists to refuse.
     */
    expect(fixtureNames()).toEqual([
      "activation-success",
      "activation-failure",
      "activation-reactivation",
      "heartbeat-success",
      "heartbeat-unauthorised",
      "heartbeat-forbidden",
      "heartbeat-malformed",
      "heartbeat-oversized",
      "ingest-all-accepted",
      "ingest-all-duplicate",
      "ingest-mixed-result",
      "ingest-retryable-rejection",
      "ingest-non-retryable-rejection",
      "ingest-unknown-rejection-code-retryable-true",
      "ingest-unknown-rejection-code-retryable-false",
      "ingest-missing-result",
      "ingest-foreign-result-id",
      "ingest-conflicting-duplicate-result",
      "ingest-malformed-2xx-body",
      "ingest-batch-too-large",
      "ingest-rate-limited",
      "ingest-unavailable",
      "ingest-lost-acknowledgement-replay",
      "ingest-accepted-is-a-count-not-a-list",
      "diagnostic-test-accepted",
      "diagnostic-test-replay-duplicate",
      "diagnostic-excluded-from-business-metrics",
    ]);
  });

  it("carries exactly one fixture that is not an HTTP exchange", () => {
    /*
     * The read-model shape exists for one rule and must not become a place to
     * put anything awkward. A second one would need its own argument for why no
     * request demonstrates it.
     */
    const readModels = CONFORMANCE_FIXTURES.filter((fixture) => !isExchangeFixture(fixture));
    expect(readModels.map((fixture) => fixture.name)).toEqual([
      "diagnostic-excluded-from-business-metrics",
    ]);
    expect(EXCHANGES.length).toBe(CONFORMANCE_FIXTURES.length - 1);
  });

  it("names every fixture once, in a form that is also a filename", () => {
    const names = fixtureNames();
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name, name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("answers with every request-level status the contract publishes", () => {
    const statuses = new Set(EXCHANGES.map((fixture) => fixture.response.status));
    for (const status of [200, 400, 401, 403, 413, 429, 503]) {
      expect(statuses, `no fixture answers ${String(status)}`).toContain(status);
    }
  });
});

/* ============================================================ legibility */

describe("every fixture explains itself without the backend source", () => {
  it("carries a description and a one-line reason", () => {
    for (const fixture of CONFORMANCE_FIXTURES) {
      expect(fixture.description.length, fixture.name).toBeGreaterThan(30);
      expect(fixture.description, fixture.name).not.toContain("\n");
      /* `why` is rendered into a Markdown table cell, so a newline would break it. */
      expect(fixture.why, fixture.name).not.toContain("\n");
      expect(fixture.why.length, fixture.name).toBeGreaterThan(40);
      expect(fixture.why.length, fixture.name).toBeLessThan(240);
      for (const note of fixture.notes ?? []) {
        expect(note.length, `${fixture.name}: empty note`).toBeGreaterThan(20);
      }
    }
  });

  it("addresses a published route with a bearer exactly where one is required", () => {
    for (const fixture of EXCHANGES) {
      expect(fixture.request.method, fixture.name).toBe("POST");
      expect(ROUTE_PATHS, fixture.name).toContain(fixture.request.path);
      expect(fixture.request.headers["content-type"], fixture.name).toBe("application/json");

      const authorised = fixture.request.path !== OBSERVER_ROUTES.activate;
      /*
       * Activation is the one unauthenticated endpoint — it is how a credential
       * is obtained in the first place — and a fixture that presented one there
       * would teach an implementer to send a token it does not yet have.
       */
      expect(fixture.request.headers["authorization"], fixture.name).toBe(
        authorised ? `Bearer ${FIXTURE_SOURCE_TOKEN}` : undefined,
      );
    }
  });

  it("mirrors Retry-After into the header of the rate-limited answer alone", () => {
    for (const fixture of EXCHANGES) {
      const header = fixture.response.headers["retry-after"];
      if (fixture.response.status === 429) {
        expect(header, fixture.name).toBe("30");
        const body = fixture.response.body as { retry_after_seconds?: unknown };
        expect(body.retry_after_seconds, fixture.name).toBe(30);
      } else {
        expect(header, fixture.name).toBeUndefined();
      }
    }
  });
});

/* ============================================================ schema truth */

describe("every body in the pack is judged against the published schema", () => {
  it("names components that `openapi.json` actually publishes", () => {
    for (const fixture of EXCHANGES) {
      expect(Object.keys(COMPONENT_SCHEMAS), fixture.name).toContain(fixture.requestSchema);
      expect(Object.keys(COMPONENT_SCHEMAS), fixture.name).toContain(fixture.responseSchema);
    }
  });

  it("sends a request the contract would accept, except where refusal is the subject", () => {
    for (const fixture of EXCHANGES) {
      if (!fixture.requestValidates) continue;
      const parsed = parseAgainst(fixture.requestSchema, fixture.request.body);
      expect(parsed.success, `${fixture.name}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
    }
  });

  it("declares two malformed requests, and both genuinely fail", () => {
    const refused = EXCHANGES.filter((fixture) => !fixture.requestValidates);
    expect(refused.map((fixture) => fixture.name)).toEqual([
      "heartbeat-malformed",
      "heartbeat-oversized",
    ]);

    for (const fixture of refused) {
      /*
       * The assertion each of those two rests on. A request labelled malformed
       * that happens to validate would be teaching that the endpoint refuses
       * something it would in fact accept.
       */
      expect(parseAgainst(fixture.requestSchema, fixture.request.body).success, fixture.name).toBe(
        false,
      );
      /* And the answer to a malformed request is still a well-formed answer. */
      expect(fixture.response.status, fixture.name).toBe(400);
      expect(fixture.responseValidates, fixture.name).toBe(true);
    }
  });

  it("validates every response body but the one declared malformed", () => {
    for (const fixture of EXCHANGES) {
      if (!fixture.responseValidates) continue;
      const parsed = parseAgainst(fixture.responseSchema, fixture.response.body);
      expect(parsed.success, `${fixture.name}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
    }
  });

  it("declares exactly one malformed body, and that body genuinely fails", () => {
    const malformed = EXCHANGES.filter((fixture) => !fixture.responseValidates);
    expect(malformed.map((fixture) => fixture.name)).toEqual(["ingest-malformed-2xx-body"]);

    const fixture = malformed[0];
    expect(fixture).toBeDefined();
    if (fixture === undefined) return;
    /*
     * The assertion the whole fixture rests on. A body labelled malformed that
     * happens to validate would teach an implementer that an unreadable 200 is
     * readable after all.
     */
    const parsed = parseAgainst(fixture.responseSchema, fixture.response.body);
    expect(parsed.success).toBe(false);
    /* Still a 2xx: the point is that the STATUS is fine and the body is not. */
    expect(fixture.response.status).toBe(200);
  });
});

/* ============================================================ outbox actions */

describe("every submitted event has exactly one outbox action", () => {
  it("keys the actions by submitted event id, and by nothing else", () => {
    for (const fixture of EXCHANGES) {
      expect(Object.keys(fixture.expectedOutboxActions).sort(), fixture.name).toEqual(
        [...fixture.submittedEventIds].sort(),
      );
    }
  });

  it("never invents a fourth action, and in particular never discards", () => {
    for (const fixture of EXCHANGES) {
      for (const [eventId, action] of Object.entries(fixture.expectedOutboxActions)) {
        expect(FIXTURE_OUTBOX_ACTIONS, `${fixture.name}/${eventId}`).toContain(action);
      }
    }
  });

  it("submits no events on activation or heartbeat", () => {
    for (const fixture of EXCHANGES) {
      if (fixture.request.path === OBSERVER_ROUTES.ingest) continue;
      expect(fixture.submittedEventIds, fixture.name).toEqual([]);
      expect(fixture.expectedOutboxActions, fixture.name).toEqual({});
    }
  });

  it("removes an event only on a 200, because nothing else is an acknowledgement", () => {
    for (const fixture of EXCHANGES) {
      const removes = Object.values(fixture.expectedOutboxActions).includes("remove");
      if (removes) expect(fixture.response.status, fixture.name).toBe(200);
    }
  });

  it("retains every event of every non-2xx answer", () => {
    for (const fixture of EXCHANGES) {
      if (fixture.response.status < 300) continue;
      for (const [eventId, action] of Object.entries(fixture.expectedOutboxActions)) {
        expect(action, `${fixture.name}/${eventId}`).toBe("retain");
      }
    }
  });
});

/* ============================================================ the four */

describe("the four rules that are wrong in practice", () => {
  it("retains a submitted event the response said nothing about", () => {
    const fixture = exchangeNamed("ingest-missing-result");
    expect(fixture).toBeDefined();
    if (fixture === undefined) return;

    const reported = (fixture.response.body as { results: Array<{ event_id: string }> }).results;
    expect(reported.map((result) => result.event_id)).toEqual([FIXTURE_EVENT_IDS.first]);
    expect(fixture.submittedEventIds).toContain(FIXTURE_EVENT_IDS.second);
    /* Silence is retain. An implementation that acknowledged by count loses this. */
    expect(fixture.expectedOutboxActions[FIXTURE_EVENT_IDS.second]).toBe("retain");
    expect(fixture.expectedOutboxActions[FIXTURE_EVENT_IDS.first]).toBe("remove");
  });

  it("ignores a result whose event_id was never submitted, and acknowledges nothing with it", () => {
    const fixture = exchangeNamed("ingest-foreign-result-id");
    expect(fixture).toBeDefined();
    if (fixture === undefined) return;

    const reported = (fixture.response.body as { results: Array<{ event_id: string }> }).results;
    expect(reported.map((result) => result.event_id)).toContain(FIXTURE_EVENT_IDS.foreign);
    expect(fixture.submittedEventIds).not.toContain(FIXTURE_EVENT_IDS.foreign);

    /*
     * The load-bearing assertion: the foreign id appears nowhere in the outbox
     * decision. If it ever did, the pack would be teaching that a result can be
     * matched to a queued event it does not name.
     */
    expect(Object.keys(fixture.expectedOutboxActions)).not.toContain(FIXTURE_EVENT_IDS.foreign);
    expect(fixture.expectedOutboxActions[FIXTURE_EVENT_IDS.first]).toBe("remove");
    /* And the genuinely unreported event still retains — the two rules compose. */
    expect(fixture.expectedOutboxActions[FIXTURE_EVENT_IDS.second]).toBe("retain");
  });

  it("retains when two results contradict each other about one event", () => {
    const fixture = exchangeNamed("ingest-conflicting-duplicate-result");
    expect(fixture).toBeDefined();
    if (fixture === undefined) return;

    const reported = (fixture.response.body as { results: Array<{ event_id: string }> }).results;
    const forFirst = reported.filter((result) => result.event_id === FIXTURE_EVENT_IDS.first);
    expect(forFirst).toHaveLength(2);
    /* Fail safe: a redelivery costs a duplicate, a wrong acknowledgement costs the event. */
    expect(fixture.expectedOutboxActions[FIXTURE_EVENT_IDS.first]).toBe("retain");
    /* A contradiction about one event says nothing about another. */
    expect(fixture.expectedOutboxActions[FIXTURE_EVENT_IDS.second]).toBe("remove");
  });

  it("acknowledges zero events from a 2xx whose body does not validate", () => {
    const fixture = exchangeNamed("ingest-malformed-2xx-body");
    expect(fixture).toBeDefined();
    if (fixture === undefined) return;

    expect(fixture.submittedEventIds.length).toBeGreaterThan(0);
    for (const eventId of fixture.submittedEventIds) {
      expect(fixture.expectedOutboxActions[eventId], eventId).toBe("retain");
    }
    expect(Object.values(fixture.expectedOutboxActions)).not.toContain("remove");
  });
});

/* ============================================================ the anti-pattern */

describe("accepted is a count and not a list of ids", () => {
  const fixture = exchangeNamed("ingest-accepted-is-a-count-not-a-list");

  it("publishes a canonical body whose counters are integers", () => {
    expect(fixture).toBeDefined();
    if (fixture === undefined) return;
    const body = fixture.response.body as Record<string, unknown>;
    for (const counter of ["received", "accepted", "duplicate", "rejected"]) {
      expect(typeof body[counter], counter).toBe("number");
    }
    /* The acknowledgement is here, and only here. */
    expect(Array.isArray(body["results"])).toBe(true);
  });

  it("carries the accepted_ids shape as a counter-example that fails validation", () => {
    expect(fixture).toBeDefined();
    if (fixture === undefined) return;
    const counter = fixture.counterExample;
    expect(counter, "the anti-pattern fixture must carry a counter-example").toBeDefined();
    if (counter === undefined) return;

    const wrong = counter.body as Record<string, unknown>;
    expect(Array.isArray(wrong["accepted"])).toBe(true);
    expect(counter.whyItIsWrong).toContain("accepted_ids");

    /*
     * The counter-example lives beside a valid response rather than in place of
     * one, so the pack still holds exactly one deliberately invalid RESPONSE.
     * This body is invalid too, and proving it is the whole point of carrying it.
     */
    expect(parseAgainst("BatchResponse", counter.body).success).toBe(false);
    expect(parseAgainst("BatchResponse", fixture.response.body).success).toBe(true);
  });

  it("offers no field anywhere in BatchResponse that lists accepted ids", () => {
    /*
     * The divergence is live: a UE parser written against `accepted_ids` binds
     * cleanly to `accepted` and reads a number where it expects an array. There
     * is nothing else it could have meant to bind to, and this asserts that.
     */
    const schema = COMPONENT_SCHEMAS["BatchResponse"];
    expect(schema).toBeDefined();
    const shape = Object.keys((schema as unknown as { shape: object }).shape);
    expect(shape).toContain("accepted");
    expect(shape.filter((key) => key.endsWith("_ids"))).toEqual([]);
  });
});

/* ============================================================ the replay */

describe("a lost acknowledgement is recovered by resending the same bytes", () => {
  it("replays the accepted batch unchanged, batch_id and sent_at included", () => {
    const first = exchangeNamed("ingest-all-accepted");
    const replay = exchangeNamed("ingest-lost-acknowledgement-replay");
    expect(first).toBeDefined();
    expect(replay).toBeDefined();
    if (first === undefined || replay === undefined) return;

    /*
     * Deeply equal, not merely similar. "Resend the batch unchanged" is the
     * property, and a replay that re-minted its event_ids would turn the
     * duplicate answer below into two stored copies of every event.
     */
    expect(replay.request.body).toEqual(first.request.body);
    expect(replay.request.headers).toEqual(first.request.headers);
  });

  it("answers duplicate, which is a success and removes the events", () => {
    const replay = exchangeNamed("ingest-lost-acknowledgement-replay");
    expect(replay).toBeDefined();
    if (replay === undefined) return;

    const results = (replay.response.body as { results: Array<{ status: string }> }).results;
    expect(results.map((result) => result.status)).toEqual(["duplicate", "duplicate"]);
    for (const eventId of replay.submittedEventIds) {
      expect(replay.expectedOutboxActions[eventId], eventId).toBe("remove");
    }
  });
});

/* ============================================================ backend state */

describe("every fixture says what the backend must hold, and the two halves agree", () => {
  it("carries a backend state whose vocabulary is the published one", () => {
    for (const fixture of CONFORMANCE_FIXTURES) {
      const state = fixture.expectedBackendState;
      expect(state.precondition.length, fixture.name).toBeGreaterThan(20);
      expect(state.assertion.length, fixture.name).toBeGreaterThan(60);
      expect(FIXTURE_STATE_EFFECTS, fixture.name).toContain(state.connected);
      expect(FIXTURE_STATE_EFFECTS, fixture.name).toContain(state.ingestionVerified);
      expect(FIXTURE_ACTIVATION_CODE_STATES, fixture.name).toContain(state.activationCode);
      expect(state.activeCredentials, fixture.name).toBeGreaterThanOrEqual(0);
    }
  });

  it("never lists one event as both certainly stored and undetermined", () => {
    for (const fixture of CONFORMANCE_FIXTURES) {
      const { storedEventIds, undeterminedEventIds } = fixture.expectedBackendState;
      /*
       * The two lists are different claims — "the backend holds this" and "the
       * response does not say" — and an id in both would be the pack asserting
       * and disclaiming the same fact.
       */
      for (const id of undeterminedEventIds) {
        expect(storedEventIds, `${fixture.name}/${id}`).not.toContain(id);
      }
      /* A repeated id would be a second row the primary key cannot hold. */
      expect(new Set(storedEventIds).size, fixture.name).toBe(storedEventIds.length);
    }
  });

  it("removes an event only when the backend certainly holds it", () => {
    /*
     * The load-bearing cross-check. `remove` means "the server has this fact, so
     * the outbox row may be erased" — a fixture that removed an event it did not
     * also list as stored would be teaching a plugin author to delete on faith.
     */
    for (const fixture of EXCHANGES) {
      const stored = fixture.expectedBackendState.storedEventIds;
      for (const [eventId, action] of Object.entries(fixture.expectedOutboxActions)) {
        if (action !== "remove") continue;
        expect(stored, `${fixture.name}/${eventId} is removed but not stored`).toContain(eventId);
      }
    }
  });

  it("retains every event whose fate the response leaves undetermined", () => {
    for (const fixture of EXCHANGES) {
      for (const eventId of fixture.expectedBackendState.undeterminedEventIds) {
        expect(fixture.expectedOutboxActions[eventId], `${fixture.name}/${eventId}`).toBe("retain");
      }
    }
  });

  it("stores nothing it quarantined, because a rejected event is never written", () => {
    for (const fixture of EXCHANGES) {
      const state = fixture.expectedBackendState;
      for (const [eventId, action] of Object.entries(fixture.expectedOutboxActions)) {
        if (action !== "quarantine") continue;
        expect(state.storedEventIds, `${fixture.name}/${eventId}`).not.toContain(eventId);
        /* Nor undetermined: a per-event rejection is an unambiguous statement. */
        expect(state.undeterminedEventIds, `${fixture.name}/${eventId}`).not.toContain(eventId);
      }
    }
  });

  it("writes nothing at all when the request never got processed", () => {
    for (const fixture of EXCHANGES) {
      if (fixture.response.status < 300) continue;
      const state = fixture.expectedBackendState;
      /* Non-2xx means nothing was stored, and that is a backend claim as much as a client one. */
      expect(state.undeterminedEventIds, fixture.name).toEqual([]);
      expect(state.ingestionVerified, fixture.name).toBe("unchanged");
      expect(state.connected, fixture.name).toBe("unchanged");
    }
  });

  it("never names the foreign result id in any backend state", () => {
    for (const fixture of CONFORMANCE_FIXTURES) {
      const state = fixture.expectedBackendState;
      expect(state.storedEventIds, fixture.name).not.toContain(FIXTURE_EVENT_IDS.foreign);
      expect(state.undeterminedEventIds, fixture.name).not.toContain(FIXTURE_EVENT_IDS.foreign);
    }
  });

  it("keeps ACTIVATED, CONNECTED and INGESTION VERIFIED as three separate facts", () => {
    const activation = fixtureNamed("activation-success");
    const heartbeat = fixtureNamed("heartbeat-success");
    const ingestion = fixtureNamed("diagnostic-test-accepted");
    for (const fixture of [activation, heartbeat, ingestion]) expect(fixture).toBeDefined();
    if (activation === undefined || heartbeat === undefined || ingestion === undefined) return;

    /* A credential was issued. Nothing has been heard from the machine yet. */
    expect(activation.expectedBackendState.activationCode).toBe("consumed");
    expect(activation.expectedBackendState.activeCredentials).toBe(1);
    expect(activation.expectedBackendState.connected).toBe("unchanged");
    expect(activation.expectedBackendState.ingestionVerified).toBe("unchanged");

    /* A heartbeat succeeded. It proves reachability and says nothing about storage. */
    expect(heartbeat.expectedBackendState.connected).toBe("set");
    expect(heartbeat.expectedBackendState.ingestionVerified).toBe("unchanged");
    expect(heartbeat.expectedBackendState.storedEventIds).toEqual([]);

    /* An event reached storage. It proves the path and says nothing about right now. */
    expect(ingestion.expectedBackendState.ingestionVerified).toBe("set");
    expect(ingestion.expectedBackendState.connected).toBe("unchanged");
  });

  it("sets ingestion_verified_at once, and never again on a replay", () => {
    const first = fixtureNamed("ingest-all-accepted");
    const again = fixtureNamed("ingest-all-duplicate");
    const replay = fixtureNamed("ingest-lost-acknowledgement-replay");
    for (const fixture of [first, again, replay]) expect(fixture).toBeDefined();
    if (first === undefined || again === undefined || replay === undefined) return;

    expect(first.expectedBackendState.ingestionVerified).toBe("set");
    /*
     * Both replays leave it alone. The column records when the path was first
     * proved; a backend that advanced it on every duplicate would show an
     * operator a freshly commissioned installation every time an outbox drained.
     */
    expect(again.expectedBackendState.ingestionVerified).toBe("unchanged");
    expect(replay.expectedBackendState.ingestionVerified).toBe("unchanged");
    expect(again.expectedBackendState.storedEventIds).toEqual([
      FIXTURE_EVENT_IDS.first,
      FIXTURE_EVENT_IDS.second,
    ]);
  });

  it("never advances last_heartbeat_at for a heartbeat the endpoint refused", () => {
    for (const name of ["heartbeat-unauthorised", "heartbeat-forbidden", "heartbeat-malformed"]) {
      const fixture = fixtureNamed(name);
      expect(fixture, name).toBeDefined();
      if (fixture === undefined) continue;
      /*
       * The regression this exists for: a backend that recorded liveness before
       * checking the credential would show a healthy showroom that has in fact
       * been locked out, suspended, or sending payloads nobody can parse.
       */
      expect(fixture.expectedBackendState.connected, name).toBe("unchanged");
    }
  });
});

/* ============================================================ the unknown-code pair */

describe("an unrecognised rejection code quarantines whatever the server claimed", () => {
  const retryable = exchangeNamed("ingest-unknown-rejection-code-retryable-true");
  const notRetryable = exchangeNamed("ingest-unknown-rejection-code-retryable-false");

  it("publishes exactly two, differing only in the retryable flag", () => {
    expect(retryable).toBeDefined();
    expect(notRetryable).toBeDefined();
    if (retryable === undefined || notRetryable === undefined) return;

    const flagOf = (fixture: ExchangeFixture) => {
      const results = (fixture.response.body as { results: Array<Record<string, unknown>> })
        .results;
      const rejected = results.find((result) => result["status"] === "rejected");
      expect(rejected, fixture.name).toBeDefined();
      return rejected;
    };

    const first = flagOf(retryable);
    const second = flagOf(notRetryable);
    expect(first?.["code"]).toBe("quota_exhausted");
    expect(second?.["code"]).toBe(first?.["code"]);
    expect(first?.["event_id"]).toBe(second?.["event_id"]);
    /* The whole difference between the pair, and it must be the whole difference. */
    expect(first?.["retryable"]).toBe(true);
    expect(second?.["retryable"]).toBe(false);
  });

  it("resolves both to the same outbox action, which is the point of the pair", () => {
    expect(retryable).toBeDefined();
    expect(notRetryable).toBeDefined();
    if (retryable === undefined || notRetryable === undefined) return;

    expect(retryable.expectedOutboxActions).toEqual(notRetryable.expectedOutboxActions);
    expect(retryable.expectedOutboxActions[FIXTURE_EVENT_IDS.second]).toBe("quarantine");
    expect(notRetryable.expectedOutboxActions[FIXTURE_EVENT_IDS.second]).toBe("quarantine");
    /* And the backend held the same thing in both cases, so the flag changed nothing at all. */
    expect(retryable.expectedBackendState.storedEventIds).toEqual(
      notRetryable.expectedBackendState.storedEventIds,
    );
  });

  it("agrees with the classifier the contract actually ships", () => {
    /*
     * The fixtures are asserted against `classifyEventRejection` rather than
     * against a copy of its rule. A pack that agreed only with itself would keep
     * passing after somebody taught the classifier to trust `retryable: true`.
     */
    for (const claimed of [true, false, undefined]) {
      const policy = classifyEventRejection("quota_exhausted", claimed);
      expect(policy.known).toBe(false);
      expect(policy.retryable).toBe(false);
      expect(policy.outbox).toBe("quarantine");
      expect(policy.sending).toBe("continue");
    }
  });
});

/* ============================================================ the heartbeat refusals */

describe("the heartbeat endpoint refuses what it cannot honestly answer", () => {
  it("names malformed_request for a body past the byte ceiling, and not batch_too_large", () => {
    const fixture = exchangeNamed("heartbeat-oversized");
    expect(fixture).toBeDefined();
    if (fixture === undefined) return;

    const body = fixture.response.body as { code: string };
    /*
     * The code is the whole subject. `batch_too_large` is a 413 whose published
     * policy is retain_and_split, and a heartbeat has no batch — a plugin obeying
     * it would try to halve a liveness ping or quarantine one.
     */
    expect(body.code).toBe("malformed_request");
    expect(fixture.response.status).toBe(400);
    expect(fixture.expectedSending).toBe("continue");
  });

  it("carries a body that genuinely exceeds the ceiling it names", () => {
    const fixture = exchangeNamed("heartbeat-oversized");
    expect(fixture).toBeDefined();
    if (fixture === undefined) return;

    /*
     * Measured rather than asserted from the prose. A fixture whose "over-sized"
     * body quietly shrank below the ceiling would demonstrate nothing, and the
     * change that shrank it would be invisible in review.
     */
    expect(serialisedBytes(fixture.request.body)).toBeGreaterThan(HEARTBEAT_BODY_CEILING_BYTES);
    const message = (fixture.response.body as { message: string }).message;
    expect(message).toContain(String(HEARTBEAT_BODY_CEILING_BYTES));
  });

  it("refuses an instant without an offset, and echoes only the field name", () => {
    const fixture = exchangeNamed("heartbeat-malformed");
    expect(fixture).toBeDefined();
    if (fixture === undefined) return;

    const sentAt = (fixture.request.body as { sent_at: string }).sent_at;
    expect(sentAt).toBe("2026-01-01T09:15:30");
    /* No offset, so `WireInstantSchema` refuses it — the October bug, caught. */
    expect(sentAt).not.toMatch(/(Z|[+-]\d{2}:\d{2})$/);

    const body = fixture.response.body as { code: string; message: string; batch_id: null };
    expect(body.code).toBe("malformed_request");
    expect(body.message).toContain("sent_at");
    /* The value never crosses back. It arrived on a path nobody has authenticated. */
    expect(body.message).not.toContain(sentAt);
    /* A heartbeat has no batch to correlate, so the echo is honestly null. */
    expect(body.batch_id).toBeNull();
  });
});

/* ============================================================ the diagnostic namespace */

describe("a diagnostic proves the ingestion path and never counts as a fact", () => {
  it("sends diagnostic.test through the ordinary ingestion endpoint", () => {
    const fixture = exchangeNamed("diagnostic-test-accepted");
    expect(fixture).toBeDefined();
    if (fixture === undefined) return;

    expect(fixture.request.path).toBe(OBSERVER_ROUTES.ingest);
    const events = (fixture.request.body as { events: Array<Record<string, unknown>> }).events;
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event).toBeDefined();
    if (event === undefined) return;

    /* The canonical name. `diagnostics.ping` is a UE-side name and is not this one. */
    expect(event["event_name"]).toBe("diagnostic.test");
    expect(isDiagnosticEvent(String(event["event_name"]))).toBe(true);
    /* A diagnostic belongs to no visitor session, and the two are null together. */
    expect(event["session_id"]).toBeNull();
    expect(event["sequence"]).toBeNull();
    expect(fixture.expectedOutboxActions[FIXTURE_EVENT_IDS.diagnostic]).toBe("remove");
  });

  it("deduplicates a second press of the button exactly like any other event", () => {
    const accepted = exchangeNamed("diagnostic-test-accepted");
    const replay = exchangeNamed("diagnostic-test-replay-duplicate");
    expect(accepted).toBeDefined();
    expect(replay).toBeDefined();
    if (accepted === undefined || replay === undefined) return;

    expect(replay.submittedEventIds).toEqual(accepted.submittedEventIds);
    const results = (replay.response.body as { results: Array<{ status: string }> }).results;
    expect(results.map((result) => result.status)).toEqual(["duplicate"]);
    /* duplicate is a success, so the outbox row goes — and no second row appears. */
    expect(replay.expectedOutboxActions[FIXTURE_EVENT_IDS.diagnostic]).toBe("remove");
    expect(replay.expectedBackendState.storedEventIds).toEqual([FIXTURE_EVENT_IDS.diagnostic]);

    /*
     * A fresh batch_id and the same event_id. This is a second send rather than a
     * replay of lost bytes, which is what makes it a different fixture from
     * ingest-lost-acknowledgement-replay.
     */
    const first = accepted.request.body as { batch_id: string };
    const second = replay.request.body as { batch_id: string };
    expect(second.batch_id).not.toBe(first.batch_id);
  });

  it("states the read-model exclusion as the published rule and applies it to real rows", () => {
    const fixture = fixtureNamed("diagnostic-excluded-from-business-metrics");
    expect(fixture).toBeDefined();
    if (fixture === undefined || isExchangeFixture(fixture)) {
      expect.fail("diagnostic-excluded-from-business-metrics must be a read-model fixture");
    }

    const outcome = fixture.expectedReadModel;
    /* The rule itself, not a re-spelling of the prefix it happens to contain. */
    expect(outcome.exclusionRule).toBe(READ_MODEL_EXCLUSION_RULE);

    /*
     * The counted set is derived from the contract's own predicate rather than
     * copied from the fixture. A pack that only agreed with itself would keep
     * passing after somebody narrowed `isDiagnosticEvent` to one literal name.
     */
    const business = fixture.storedRows.filter((row) => !isDiagnosticEvent(row.event_name));
    const diagnostics = fixture.storedRows.filter((row) => isDiagnosticEvent(row.event_name));
    expect(outcome.countedEventIds).toEqual(business.map((row) => row.event_id));
    expect(outcome.excludedEventIds).toEqual(diagnostics.map((row) => row.event_id));

    /* Three rows stored, two counted — and the wrong answer is carried beside the right one. */
    expect(outcome.value).toBe(outcome.countedEventIds.length);
    expect(outcome.valueWithoutTheRule).toBe(fixture.storedRows.length);
    expect(outcome.valueWithoutTheRule).toBeGreaterThan(outcome.value);

    /* The excluded row is still on disk. Excluding is not deleting. */
    expect(fixture.expectedBackendState.storedEventIds).toEqual(
      fixture.storedRows.map((row) => row.event_id),
    );
  });
});

/* ============================================================ drift */

describe("the generated pack is current", () => {
  const files = generatedFixtureFiles();

  it("produces an index, a README and one document per fixture", () => {
    expect(files.has("index.json")).toBe(true);
    expect(files.has("README.md")).toBe(true);
    for (const name of fixtureNames()) {
      expect(files.has(`${name}.json`), name).toBe(true);
    }
    expect(files.size).toBe(CONFORMANCE_FIXTURES.length + 2);
  });

  it("matches every committed file, byte for byte", () => {
    for (const [relative, expected] of files) {
      const committed = readFileSync(join(FIXTURE_PACK_DIRECTORY, relative), "utf8");
      expect(committed, `${relative} is stale — run \`pnpm contracts:fixtures\``).toBe(expected);
    }
  });

  it("leaves nothing behind that the generator no longer produces", () => {
    expect(committedFixtureFiles()).toEqual([...files.keys()].sort());
  });

  it("produces identical output when run again", () => {
    /*
     * A clock or a random id in a generated artefact turns every regeneration
     * into a diff, and a drift test that fails for no reason is a drift test
     * somebody eventually deletes.
     */
    expect([...generatedFixtureFiles()]).toEqual([...files]);
  });

  it("reaches for no clock and no randomness in its sources", () => {
    for (const source of [
      "packages/contracts/src/ue5/fixtures.ts",
      "scripts/contracts/emit-fixtures.ts",
    ]) {
      const text = readFileSync(join(REPO_ROOT, source), "utf8");
      expect(/Date\.now|Math\.random|new Date\(/.test(text), source).toBe(false);
    }
  });
});

/* ============================================================ safe to publish */

describe("nothing in the pack is, or resembles, a real credential", () => {
  it("puts only the declared synthetic values on the wire", () => {
    const found = new Set<string>();
    for (const fixture of EXCHANGES) {
      for (const value of wireValues(fixture)) {
        const secret = credentialShaped(value);
        if (secret !== null) found.add(secret);
      }
    }
    expect([...found].sort()).toEqual([...DECLARED_SYNTHETIC_SECRETS].sort());
  });

  it("presents the same bearer everywhere it presents one", () => {
    for (const fixture of EXCHANGES) {
      const header = fixture.request.headers["authorization"];
      if (header === undefined) continue;
      expect(header, fixture.name).toBe(`Bearer ${FIXTURE_SOURCE_TOKEN}`);
    }
  });

  it("declares only values that could never work as credentials", () => {
    for (const secret of DECLARED_SYNTHETIC_SECRETS) {
      /* A real source token is `obs.<selector>.<secret>`: three dot-separated parts. */
      expect(secret.split(".").length, secret).toBeLessThan(3);
      expect(secret.toUpperCase(), secret).toContain("FIXTURE");
    }
  });

  it("trips none of the repository's own credential patterns", () => {
    /*
     * The same rules `pnpm audit:secrets` runs, applied to the generated text
     * rather than to the working tree. Reading the shared file rather than
     * restating the patterns is the point: two copies of a rule are two rules
     * that can drift.
     */
    const doc = JSON.parse(
      readFileSync(join(REPO_ROOT, "scripts", "release", "secret-patterns.json"), "utf8"),
    ) as { rules: Array<{ name: string; pattern: string; scopes: string[] }> };
    const rules = doc.rules
      .filter((rule) => rule.scopes.includes("audit"))
      .map((rule) => ({ name: rule.name, pattern: new RegExp(rule.pattern) }));
    expect(rules.length).toBeGreaterThan(4);

    for (const [relative, contents] of generatedFixtureFiles()) {
      for (const rule of rules) {
        expect(rule.pattern.test(contents), `${relative} matches ${rule.name}`).toBe(false);
      }
    }
  });
});
