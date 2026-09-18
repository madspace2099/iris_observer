import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { OBSERVER_ROUTES } from "@observer/contracts/ue5";

import type { Instant, ObserverDb } from "../src/db";
import type { HandlerDeps } from "../src/http";
import { pgliteDb, type SqlQuery } from "../src/pglite";
import type * as SecretsModule from "../src/secrets";
import type { EnvSource, SecretClass } from "../src/secrets";
import {
  ACTIVATION_CODE_PEPPER,
  SOURCE_TOKEN_PEPPER,
  SOURCE_TOKEN_PREFIX,
  issueActivationCode,
  issueSourceToken,
  parseToken,
} from "../src/secrets";
import { authenticateSource, DECOY_VERIFIER } from "../src/authenticate";
import {
  closeSuiteDatabases,
  closeTestDatabases,
  openDatabase,
} from "../../../supabase/test/support/pglite";

afterEach(closeTestDatabases);
afterAll(closeSuiteDatabases);

/**
 * THE AUTHENTICATION BOUNDARY, AGAINST REAL CREDENTIALS IN A REAL POSTGRES.
 *
 * ## Why this file boots a database rather than stubbing `credentialResolve`
 *
 * A stub returns whatever row the test author imagined, and the rows that matter
 * here are the ones the SQL actually produces: a credential the migration marked
 * `superseded` when the next activation replaced it, a `revoked` state written by
 * `observer_credential_revoke`, an `expires_at` rendered by `to_char` rather than
 * by `Date.prototype.toISOString`. Every one of those is a string this boundary
 * has to interpret correctly to answer 401, and a stub would let a wrong
 * interpretation pass for ever.
 *
 * So every credential below was minted by `issueSourceToken`, stored through
 * `observer_activation_consume`, and is presented as a real `Authorization`
 * header on a real `Request`.
 *
 * ## The property most of this file is about
 *
 * Not "does a good token work" — one test covers that — but **do all the bad
 * ones fail the same way**. Nine distinct causes reach `unauthorised`, and the
 * moment any of them answers differently, in status, code, message or body
 * shape, the refusal becomes a way to ask questions: does this selector exist,
 * did this credential once work, is this source still real. `answers every 401
 * cause with one indistinguishable response` is the assertion the rest of the
 * file supports.
 *
 * ## What is faked, and why it is only this
 *
 * `verifySecret` is wrapped — not replaced — so the file can assert *which*
 * verifier the boundary compared against and that the verdict is the boundary's
 * only source of truth. The real implementation still runs underneath. Nothing
 * else is mocked: the database, the tokens, the peppers, the HMAC and the
 * constant-time compare are all genuine.
 */

/**
 * Every call the boundary made into `verifySecret`, and an optional override for
 * its verdict.
 *
 * **The presented secret is deliberately not recorded.** The test needs to know
 * which stored verifier was compared against, never what was compared with it,
 * and a harness that keeps plaintext secrets in a module-level array is one
 * failed assertion away from printing one.
 */
const verification = vi.hoisted(() => ({
  calls: [] as { readonly secretClass: string; readonly storedVerifier: string }[],
  /** `null` means "let the real implementation decide", which is the default. */
  verdict: null as boolean | null,
}));

vi.mock("../src/secrets", async (importOriginal) => {
  const actual = await importOriginal<typeof SecretsModule>();
  return {
    ...actual,
    /* Real HMAC, real constant-time compare, plus a record that it happened. */
    verifySecret: (
      secretClass: SecretClass,
      selector: string,
      presentedSecret: string,
      storedVerifier: string,
      source: EnvSource,
    ): boolean => {
      verification.calls.push({ secretClass, storedVerifier });
      const real = actual.verifySecret(
        secretClass,
        selector,
        presentedSecret,
        storedVerifier,
        source,
      );
      return verification.verdict ?? real;
    },
  };
});

/*
 * The five migrations of the source spine, named rather than globbed, as
 * `analytics-events.test.ts` and the adapter test both do. The last one is not
 * optional even though this file never reads a timestamp it changes: it
 * redefines facades the earlier four created, so applying four of five leaves a
 * database that is nobody's deployment.
 */
const MIGRATIONS = resolve(import.meta.dirname, "../../../supabase/migrations");
const FILES = [
  "20260902090000_observer_source_identity_spine.sql",
  "20260902093000_observer_activation_and_credentials.sql",
  "20260902100000_observer_analytics_events.sql",
  "20260902110000_observer_source_operations.sql",
  "20260902120000_observer_instant_precision_and_ingest_mark.sql",
  "20260902130000_observer_credential_resolve_precision.sql",
];

const ACCOUNT = "acct_northgate";

/**
 * Two peppers, obviously synthetic and obviously long.
 *
 * `VITEST` is what lets `describePepper` accept low-entropy material at all, and
 * nothing sets it on Preview or Production — so copying this bag into a
 * deployment refuses to mint anything rather than running on a known key.
 */
const ENV: EnvSource = {
  VITEST: "1",
  [ACTIVATION_CODE_PEPPER]: "activation-pepper-for-the-authenticate-test-only",
  [SOURCE_TOKEN_PEPPER]: "source-token-pepper-for-the-authenticate-test-only",
};

/** A fixed instant, so nothing here depends on when the suite runs. */
const EXPIRY: Instant = "2030-01-01T00:00:00.000Z";
const BEFORE_EXPIRY = new Date("2029-12-31T23:59:59.000Z");
const AT_EXPIRY = new Date(EXPIRY);
const AFTER_EXPIRY = new Date("2030-01-01T00:00:01.000Z");

/**
 * Base64url-shaped, long enough for `parseToken`, and unmistakably not random.
 *
 * `parseToken` insists on 16..128 selector characters and 32..256 secret
 * characters from the base64url alphabet, so a value that reads as English has
 * to be padded to reach the floor — which is exactly what makes it safe to have
 * in a test: no real selector or secret looks like this.
 */
const UNISSUED_SELECTOR = "selector-that-was-never-issued-to-anybody";
const WRONG_SECRET = "secret-that-was-never-issued-to-any-source-at-all";

type Database = Awaited<ReturnType<typeof openDatabase>>;

let pg: Database;
let db: ObserverDb;

const query: SqlQuery = async (sql, params) => pg.query(sql, [...params]);

/** The production shape, with the clock as the only thing a test varies. */
function depsAt(now: Date = new Date()): HandlerDeps {
  return { db, env: ENV, now: () => now };
}

/** A source under this account, and the token that speaks for it. */
async function activate(
  label: string,
  environment: string,
  expiresAt: Instant | null,
): Promise<{ readonly source: string; readonly token: string; readonly verifier: string }> {
  const project = await db.projectCreate({ account: ACCOUNT, name: `P ${label}`, slug: null });
  const source = await db.sourceCreate({
    account: ACCOUNT,
    project,
    type: "showroom_ue5",
    environment,
    label,
  });

  const code = issueActivationCode(ENV);
  await db.activationIssue({
    account: ACCOUNT,
    source,
    selector: code.selector,
    verifier: code.verifier,
    purpose: "activation",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  });

  const minted = issueSourceToken(ENV);
  const claim = await db.activationConsume({
    codeSelector: code.selector,
    codeVerifier: code.verifier,
    credentialSelector: minted.selector,
    credentialVerifier: minted.verifier,
    credentialExpiresAt: expiresAt,
  });
  expect(claim, "the fixture itself must not be the thing that failed").not.toBeNull();

  return { source, token: minted.plaintext, verifier: minted.verifier };
}

/** A POST at the ingestion route, which is one of the two routes this guards. */
function request(authorization: string | null, body: unknown = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (authorization !== null) headers["authorization"] = authorization;
  return new Request(`https://observer.test${OBSERVER_ROUTES.ingest}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const bearer = (token: string): string => `Bearer ${token}`;

/** The same selector, a different secret — the wrong-secret case, exactly. */
function withSecret(token: string, secret: string): string {
  const parsed = parseToken(token);
  expect(parsed, "the fixture minted a token this parser accepts").not.toBeNull();
  return `${SOURCE_TOKEN_PREFIX}.${parsed?.selector ?? ""}.${secret}`;
}

/** The refusal a test asserts on, without the outcome union in every line. */
async function refusalFor(request_: Request, deps: HandlerDeps = depsAt()): Promise<Response> {
  const outcome = await authenticateSource(request_, deps);
  expect(outcome.ok, "this request was expected to be refused").toBe(false);
  if (outcome.ok) throw new Error("unreachable: the assertion above already failed");
  return outcome.response;
}

/* The fixtures. Each is its own source, so no case can perturb another. */
let live: Awaited<ReturnType<typeof activate>>;
let other: Awaited<ReturnType<typeof activate>>;
let rotated: Awaited<ReturnType<typeof activate>>;
let revoked: Awaited<ReturnType<typeof activate>>;
let expiring: Awaited<ReturnType<typeof activate>>;
let suspended: Awaited<ReturnType<typeof activate>>;
let archived: Awaited<ReturnType<typeof activate>>;

beforeAll(async () => {
  pg = await openDatabase("suite");
  /*
   * The three Supabase roles the migrations revoke from and grant to. PGlite has
   * none of them, and a `revoke ... from anon` against a role that does not
   * exist is an error rather than a no-op.
   */
  await pg.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
  `);
  for (const name of FILES) await pg.exec(readFileSync(join(MIGRATIONS, name), "utf8"));
  db = pgliteDb(query);

  live = await activate("Atrium PC", "development", null);
  other = await activate("Mezzanine PC", "production", null);

  rotated = await activate("Rotated PC", "production", null);
  /* A second activation supersedes the first credential, which `rotated` holds. */
  await activate2(rotated.source);

  revoked = await activate("Revoked PC", "production", null);
  await db.credentialRevoke({ account: ACCOUNT, source: revoked.source });

  expiring = await activate("Expiring PC", "production", EXPIRY);

  suspended = await activate("Suspended PC", "production", null);
  await db.sourceSetState({ account: ACCOUNT, source: suspended.source, state: "suspended" });

  archived = await activate("Archived PC", "production", null);
  await db.sourceSetState({ account: ACCOUNT, source: archived.source, state: "archived" });
});

/** Issue and spend a second code against an existing source, superseding its credential. */
async function activate2(source: string): Promise<void> {
  const code = issueActivationCode(ENV);
  await db.activationIssue({
    account: ACCOUNT,
    source,
    selector: code.selector,
    verifier: code.verifier,
    purpose: "reactivation",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  });
  const minted = issueSourceToken(ENV);
  const claim = await db.activationConsume({
    codeSelector: code.selector,
    codeVerifier: code.verifier,
    credentialSelector: minted.selector,
    credentialVerifier: minted.verifier,
    credentialExpiresAt: null,
  });
  expect(claim, "the rotation fixture must actually rotate").not.toBeNull();
}

beforeEach(() => {
  verification.calls = [];
  verification.verdict = null;
});

describe("a credential the database recognises resolves to the source it names", () => {
  it("authenticates a live credential and returns the source it was minted for", async () => {
    const outcome = await authenticateSource(request(bearer(live.token)), depsAt());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.context.sourceId).toBe(live.source);
    expect(outcome.context.accountId).toBe(ACCOUNT);
    expect(outcome.context.displayLabel).toBe("Atrium PC");
    expect(outcome.context.projectId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("carries the registered environment, never one the caller declares", async () => {
    /*
     * `live` is registered as `development`. A build that says it is production
     * — which is the honest mistake, not the attack — must not become production
     * by saying so, because every downstream read of `environment` is scoped by
     * it and one mislabelled source poisons a real dashboard.
     */
    const outcome = await authenticateSource(
      request(bearer(live.token), {
        environment: "production",
        app: { environment: "production" },
      }),
      depsAt(),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.context.environment).toBe("development");
  });

  it("treats a null expiry as no expiry, however far the clock has moved", async () => {
    /*
     * The approved V1 policy, and the one an inverted comparison silently
     * breaks: `live` was minted with no expiry, so a clock a thousand years on
     * must change nothing. If this ever fails, every unexpiring credential in
     * the estate has just stopped working at once.
     */
    const outcome = await authenticateSource(
      request(bearer(live.token)),
      depsAt(new Date("2999-01-01T00:00:00.000Z")),
    );
    expect(outcome.ok).toBe(true);
  });

  it("accepts a credential that has not yet reached its expiry", async () => {
    const outcome = await authenticateSource(
      request(bearer(expiring.token)),
      depsAt(BEFORE_EXPIRY),
    );
    expect(outcome.ok).toBe(true);
  });
});

describe("one source's token can never yield another source's context", () => {
  it("returns each source's own identity for each source's own token", async () => {
    const first = await authenticateSource(request(bearer(live.token)), depsAt());
    const second = await authenticateSource(request(bearer(other.token)), depsAt());
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(first.context.sourceId).toBe(live.source);
    expect(second.context.sourceId).toBe(other.source);
    expect(first.context.sourceId).not.toBe(second.context.sourceId);
    expect(first.context.projectId).not.toBe(second.context.projectId);
  });

  it("ignores tenant_id, project_id and source_id in the request body entirely", async () => {
    /*
     * The payload names the *other* source, in all three of the shapes a client
     * might plausibly send. The guarantee is not that these are stripped — it is
     * that no code path exists from a body to a `SourceContext`, so the context
     * is identical to the one an empty body produces.
     */
    const forged = await authenticateSource(
      request(bearer(live.token), {
        tenant_id: "acct_someone_else",
        account_id: "acct_someone_else",
        project_id: other.source,
        source_id: other.source,
        events: [{ source_id: other.source }],
      }),
      depsAt(),
    );
    const plain = await authenticateSource(request(bearer(live.token)), depsAt());

    expect(forged.ok && plain.ok).toBe(true);
    if (!forged.ok || !plain.ok) return;
    expect(forged.context).toEqual(plain.context);
    expect(forged.context.sourceId).toBe(live.source);
    expect(forged.context.accountId).toBe(ACCOUNT);
  });

  it("refuses one source's selector presented with another source's secret", async () => {
    const otherSecret = parseToken(other.token)?.secret ?? "";
    const response = await refusalFor(request(bearer(withSecret(live.token, otherSecret))));
    expect(response.status).toBe(401);
  });
});

describe("every unusable credential is refused the same way", () => {
  /**
   * Every cause that must end in an indistinguishable 401.
   *
   * Built as data rather than as nine separate tests because the property is
   * about the *set*: any one of them answering differently is the bug, and a
   * per-cause test cannot see that.
   *
   * Each entry is a thunk, and the callers below await them one at a time. One
   * PGlite instance is one Postgres with one connection, so nine refusals
   * started at once would interleave nine `credentialResolve` calls on it for no
   * benefit — the property under test is about the answers, not the timing.
   */
  const causes: readonly { readonly cause: string; readonly refuse: () => Promise<Response> }[] = [
    { cause: "no Authorization header at all", refuse: () => refusalFor(request(null)) },
    {
      cause: "a scheme that is not Bearer",
      refuse: () => refusalFor(request("Basic bm90LWEtdG9rZW4=")),
    },
    {
      cause: "a bearer value that is not a source token",
      refuse: () => refusalFor(request("Bearer not-a-source-token")),
    },
    {
      cause: "a well-formed token whose selector was never issued",
      refuse: () =>
        refusalFor(request(bearer(`${SOURCE_TOKEN_PREFIX}.${UNISSUED_SELECTOR}.${WRONG_SECRET}`))),
    },
    {
      cause: "a live credential presented with the wrong secret",
      refuse: () => refusalFor(request(bearer(withSecret(live.token, WRONG_SECRET)))),
    },
    {
      cause: "a credential superseded by a rotation",
      refuse: () => refusalFor(request(bearer(rotated.token))),
    },
    {
      cause: "a credential an operator revoked",
      refuse: () => refusalFor(request(bearer(revoked.token))),
    },
    {
      cause: "a credential whose expiry has passed",
      refuse: () => refusalFor(request(bearer(expiring.token)), depsAt(AFTER_EXPIRY)),
    },
    {
      cause: "a valid credential on an archived source",
      refuse: () => refusalFor(request(bearer(archived.token))),
    },
  ];

  it("answers every 401 cause with a byte-identical status and body", async () => {
    /*
     * THE ANTI-ENUMERATION GUARANTEE, asserted as one comparison.
     *
     * Nine causes, one answer. If a later change makes the expired credential
     * say "expired", or the archived source answer 403, or the unknown selector
     * omit a null field the others carry, this collapses to more than one
     * distinct string and the set below names which cause diverged.
     */
    const answered: { readonly cause: string; readonly signature: string }[] = [];
    for (const { cause, refuse } of causes) {
      const response = await refuse();
      const contentType = response.headers.get("content-type") ?? "";
      answered.push({
        cause,
        signature: `${String(response.status)} ${contentType} ${await response.text()}`,
      });
    }

    const distinct = new Set(answered.map((a) => a.signature));
    expect(
      distinct.size,
      `these causes did not agree: ${answered.map((a) => a.cause).join(", ")}`,
    ).toBe(1);

    const [signature] = [...distinct];
    expect(signature).toBe(
      `401 application/json ${JSON.stringify({
        code: "unauthorised",
        message: "The presented credential was not accepted.",
        batch_id: null,
        retry_after_seconds: null,
      })}`,
    );
  });

  it("says nothing in a refusal about which cause it was", async () => {
    /*
     * The message is fixed, so this cannot fail while the test above passes —
     * and that is the point of writing it separately. It states the rule that a
     * future author would otherwise have to infer from a JSON literal: the
     * refusal may not name a selector, a state, an expiry or a source.
     */
    for (const { refuse } of causes) {
      const body = await (await refuse()).text();
      for (const leak of [
        "expire",
        "revoke",
        "supersede",
        "archiv",
        "suspend",
        "selector",
        "unknown",
        live.source,
        rotated.source,
        archived.source,
      ]) {
        expect(body.includes(leak), "a refusal named the cause").toBe(false);
      }
    }
  });

  it("refuses the boundary instant of an expiry, rather than allowing it", async () => {
    /*
     * `<=` and not `<`. A credential is not valid during the second it expires,
     * and the off-by-one is only ever visible at exactly this instant.
     */
    expect((await refusalFor(request(bearer(expiring.token)), depsAt(AT_EXPIRY))).status).toBe(401);
  });
});

describe("401 and 403 are never collapsed into one another", () => {
  it("answers 403 source_suspended for a valid credential on a suspended source", async () => {
    const response = await refusalFor(request(bearer(suspended.token)));
    expect(response.status).toBe(403);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      code: "source_suspended",
      batch_id: null,
      retry_after_seconds: null,
    });
  });

  it("answers 401 unauthorised, not 403, for a valid credential on an archived source", async () => {
    /*
     * The one asymmetry in the state handling, asserted because it looks like a
     * bug to anybody who has not read the reasoning. Archival is terminal — the
     * migration refuses to move a source out of it and refuses to credential one
     * — so there is no operator action for a 403 to prompt, and confirming that
     * the source exists and the credential verified is a leak with nothing
     * bought for it.
     */
    const response = await refusalFor(request(bearer(archived.token)));
    expect(response.status).toBe(401);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ code: "unauthorised" });
  });

  it("never answers a credential problem with 403", async () => {
    for (const token of [rotated.token, revoked.token, archived.token]) {
      expect((await refusalFor(request(bearer(token)))).status).not.toBe(403);
    }
  });

  it("never answers a suspended source with 401", async () => {
    expect((await refusalFor(request(bearer(suspended.token)))).status).not.toBe(401);
  });
});

describe("the stored verifier is compared in constant time and never leaves the boundary", () => {
  it("verifies against a decoy when the selector resolves to nothing", async () => {
    /*
     * THE TIMING PROPERTY, ASSERTED STRUCTURALLY.
     *
     * A statistical timing test would be flaky on any machine that also runs a
     * browser, so this asserts the shape instead: an unknown selector performs
     * exactly the same single verification as a known one, against a verifier of
     * the same width. The two paths therefore cost the same HMAC and the same
     * constant-time compare, and "does this selector exist" stops being readable
     * from a clock.
     */
    await refusalFor(
      request(bearer(`${SOURCE_TOKEN_PREFIX}.${UNISSUED_SELECTOR}.${WRONG_SECRET}`)),
    );
    expect(verification.calls).toHaveLength(1);
    expect(verification.calls[0]?.secretClass, "never the activation-code pepper").toBe(
      "source_token",
    );
    expect(verification.calls[0]?.storedVerifier).toBe(DECOY_VERIFIER);

    verification.calls = [];
    await refusalFor(request(bearer(withSecret(live.token, WRONG_SECRET))));
    expect(verification.calls, "the known-selector path does the same work, once").toHaveLength(1);
    /*
     * Compared, never printed. The adapter test makes the same choice for the
     * same reason: proving the right verifier reached the comparison is worth a
     * boolean, and a verifier in a failure message is worth nothing.
     */
    expect(verification.calls[0]?.storedVerifier === live.verifier).toBe(true);
  });

  it("does no verification at all for a credential it never had to look up", async () => {
    /*
     * The complement, and the reason the decoy is not simply applied everywhere:
     * an absent or unparseable header is refused on material the caller composed
     * themselves, so there is no selector to be secretive about and nothing to
     * equalise.
     */
    await refusalFor(request(null));
    await refusalFor(request("Bearer not-a-source-token"));
    expect(verification.calls).toHaveLength(0);
  });

  it("takes its verdict from verifySecret alone, never from its own comparison", async () => {
    /*
     * The mutation this catches is somebody "simplifying" the constant-time
     * compare into `row.verifier === derived`. With the verdict forced, a
     * boundary that consults `verifySecret` follows it in both directions and a
     * boundary that compares for itself cannot.
     */
    verification.verdict = false;
    expect((await refusalFor(request(bearer(live.token)))).status, "a forced no is obeyed").toBe(
      401,
    );

    verification.verdict = true;
    const forced = await authenticateSource(
      request(bearer(withSecret(live.token, WRONG_SECRET))),
      depsAt(),
    );
    expect(forced.ok, "a forced yes is obeyed, so nothing else is deciding").toBe(true);
  });

  it("puts no verifier and no presented secret in any response it builds", async () => {
    const secret = parseToken(live.token)?.secret ?? "";
    const bodies: string[] = [];
    for (const authorization of [
      bearer(withSecret(live.token, WRONG_SECRET)),
      bearer(suspended.token),
      bearer(revoked.token),
    ]) {
      bodies.push(await (await refusalFor(request(authorization))).text());
    }

    for (const body of bodies) {
      expect(body.includes(live.verifier), "a stored verifier reached a response").toBe(false);
      expect(body.includes(suspended.verifier)).toBe(false);
      expect(body.includes(revoked.verifier)).toBe(false);
      expect(body.includes(secret), "a presented secret was echoed").toBe(false);
      expect(body.includes(WRONG_SECRET)).toBe(false);
    }
  });

  it("returns no row, and therefore no verifier, to its caller", async () => {
    /*
     * A `SourceContext` and not the resolved row, because the row's first column
     * is the verifier and a context that carried it would put one in every
     * handler, every log line built from a handler, and every test snapshot.
     */
    const outcome = await authenticateSource(request(bearer(live.token)), depsAt());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(Object.keys(outcome.context).sort()).toEqual([
      "accountId",
      "displayLabel",
      "environment",
      "projectId",
      "sourceId",
    ]);
  });
});
