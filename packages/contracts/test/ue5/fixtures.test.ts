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
  FIXTURE_EVENT_IDS,
  FIXTURE_OUTBOX_ACTIONS,
  FIXTURE_SOURCE_TOKEN,
  fixtureNamed,
  fixtureNames,
  type ConformanceFixture,
} from "../../src/ue5/fixtures";
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
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..", "..");

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
function wireValues(fixture: ConformanceFixture): string[] {
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
      "ingest-all-accepted",
      "ingest-all-duplicate",
      "ingest-mixed-result",
      "ingest-retryable-rejection",
      "ingest-non-retryable-rejection",
      "ingest-unknown-rejection-code",
      "ingest-missing-result",
      "ingest-foreign-result-id",
      "ingest-conflicting-duplicate-result",
      "ingest-malformed-2xx-body",
      "ingest-batch-too-large",
      "ingest-rate-limited",
      "ingest-unavailable",
      "ingest-lost-acknowledgement-replay",
      "ingest-accepted-is-a-count-not-a-list",
    ]);
  });

  it("names every fixture once, in a form that is also a filename", () => {
    const names = fixtureNames();
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name, name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("covers all four request-level refusals and both authorisation stops", () => {
    const statuses = new Set(CONFORMANCE_FIXTURES.map((fixture) => fixture.response.status));
    for (const status of [200, 401, 403, 413, 429, 503]) {
      expect(statuses, `no fixture answers ${status}`).toContain(status);
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
    for (const fixture of CONFORMANCE_FIXTURES) {
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
    for (const fixture of CONFORMANCE_FIXTURES) {
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
    for (const fixture of CONFORMANCE_FIXTURES) {
      expect(Object.keys(COMPONENT_SCHEMAS), fixture.name).toContain(fixture.requestSchema);
      expect(Object.keys(COMPONENT_SCHEMAS), fixture.name).toContain(fixture.responseSchema);
    }
  });

  it("sends a request the contract would accept", () => {
    for (const fixture of CONFORMANCE_FIXTURES) {
      const parsed = parseAgainst(fixture.requestSchema, fixture.request.body);
      expect(parsed.success, `${fixture.name}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
    }
  });

  it("validates every response body but the one declared malformed", () => {
    for (const fixture of CONFORMANCE_FIXTURES) {
      if (!fixture.responseValidates) continue;
      const parsed = parseAgainst(fixture.responseSchema, fixture.response.body);
      expect(parsed.success, `${fixture.name}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
    }
  });

  it("declares exactly one malformed body, and that body genuinely fails", () => {
    const malformed = CONFORMANCE_FIXTURES.filter((fixture) => !fixture.responseValidates);
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
    for (const fixture of CONFORMANCE_FIXTURES) {
      expect(Object.keys(fixture.expectedOutboxActions).sort(), fixture.name).toEqual(
        [...fixture.submittedEventIds].sort(),
      );
    }
  });

  it("never invents a fourth action, and in particular never discards", () => {
    for (const fixture of CONFORMANCE_FIXTURES) {
      for (const [eventId, action] of Object.entries(fixture.expectedOutboxActions)) {
        expect(FIXTURE_OUTBOX_ACTIONS, `${fixture.name}/${eventId}`).toContain(action);
      }
    }
  });

  it("submits no events on activation or heartbeat", () => {
    for (const fixture of CONFORMANCE_FIXTURES) {
      if (fixture.request.path === OBSERVER_ROUTES.ingest) continue;
      expect(fixture.submittedEventIds, fixture.name).toEqual([]);
      expect(fixture.expectedOutboxActions, fixture.name).toEqual({});
    }
  });

  it("removes an event only on a 200, because nothing else is an acknowledgement", () => {
    for (const fixture of CONFORMANCE_FIXTURES) {
      const removes = Object.values(fixture.expectedOutboxActions).includes("remove");
      if (removes) expect(fixture.response.status, fixture.name).toBe(200);
    }
  });

  it("retains every event of every non-2xx answer", () => {
    for (const fixture of CONFORMANCE_FIXTURES) {
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
    const fixture = fixtureNamed("ingest-missing-result");
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
    const fixture = fixtureNamed("ingest-foreign-result-id");
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
    const fixture = fixtureNamed("ingest-conflicting-duplicate-result");
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
    const fixture = fixtureNamed("ingest-malformed-2xx-body");
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
  const fixture = fixtureNamed("ingest-accepted-is-a-count-not-a-list");

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
    const first = fixtureNamed("ingest-all-accepted");
    const replay = fixtureNamed("ingest-lost-acknowledgement-replay");
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
    const replay = fixtureNamed("ingest-lost-acknowledgement-replay");
    expect(replay).toBeDefined();
    if (replay === undefined) return;

    const results = (replay.response.body as { results: Array<{ status: string }> }).results;
    expect(results.map((result) => result.status)).toEqual(["duplicate", "duplicate"]);
    for (const eventId of replay.submittedEventIds) {
      expect(replay.expectedOutboxActions[eventId], eventId).toBe("remove");
    }
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
    for (const fixture of CONFORMANCE_FIXTURES) {
      for (const value of wireValues(fixture)) {
        const secret = credentialShaped(value);
        if (secret !== null) found.add(secret);
      }
    }
    expect([...found].sort()).toEqual([...DECLARED_SYNTHETIC_SECRETS].sort());
  });

  it("presents the same bearer everywhere it presents one", () => {
    for (const fixture of CONFORMANCE_FIXTURES) {
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
