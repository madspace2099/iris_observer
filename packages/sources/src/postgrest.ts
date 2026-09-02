/**
 * `ObserverDb` over PostgREST — the implementation a deployment actually runs.
 *
 * ## Why this file is so literal
 *
 * There is no client library here and no query builder. Every method is one
 * `POST` to `/rest/v1/rpc/<facade>` with a JSON object keyed by the SQL
 * parameter names, exactly as `apps/web/src/lib/ai/quota.ts` has been calling
 * `admit_ai_request` since the shared ceiling was written. That code is the
 * proof this shape works against the real project, so it is copied rather than
 * improved on: same headers, same lack of a schema profile header, same
 * "status only, never the body" treatment of a failure.
 *
 * The mapping from a method's argument to `p_whatever` is written out at each
 * call site rather than derived from the property names, because TypeScript
 * cannot check a string against a SQL signature. A renamed parameter compiles
 * perfectly and arrives as `PGRST202` — a 404 — at the first real request, so
 * the names are written once, in full, beside the facade they belong to, and
 * `postgrest-adapter.test.ts` hard-codes the same list read out of the
 * migrations.
 *
 * ## No schema profile header, deliberately
 *
 * Every facade below lives in `public` and does its work inside `observer`.
 * Asking PostgREST for the `observer` schema directly answers 406 — the schema
 * is not exposed, and making it exposed would be undoing the reason the facades
 * exist. `quota.ts` carries the full account of how that was discovered.
 *
 * ## What this module may emit
 *
 * Nothing but a status code and a facade name.
 *
 * There is no `console` call in this file and no error that carries a response
 * body, a request body or a `cause`. That is not tidiness: `activationIssue`,
 * `activationConsume` and every credential path take HMAC verifiers as
 * arguments, and a PostgREST error body can quote the failing statement — with
 * its arguments — straight back at the caller. An adapter that helpfully
 * included the body in its error message would write credential material into
 * whatever log caught the throw, from a module whose entire job is to move
 * credential material about. A test provokes a 500 on a call carrying a
 * verifier and asserts the verifier is absent from what comes out.
 */

import type {
  ActivationConsumeRow,
  CredentialResolveRow,
  CredentialStatusRow,
  EventAppendRow,
  FacadeName,
  HeartbeatFacts,
  Instant,
  ObserverDb,
  SourceOperationsRow,
  SourceStatusRow,
  StoredEventRow,
} from "./db";

/* --- configuration ------------------------------------------------------------ */

/**
 * The one call this module makes, as a type it can be handed.
 *
 * Narrower than `typeof globalThis.fetch` on purpose. The real signature is
 * overloaded over `string | URL | Request`, and a test double that implements
 * only the shape this adapter uses would not be assignable to it without a
 * cast — which is how a "fake fetch" ends up written as `as unknown as
 * typeof fetch` and stops type-checking the thing it exists to check.
 */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Where to call and what to present, plus the transport itself.
 *
 * `fetch` has no default, and the omission is the point. A timeout, a retry
 * budget, a circuit breaker and a request log are all properties of a
 * deployment rather than of the SQL contract, and every one of them can be
 * added by wrapping the function passed in here — so none of them are in this
 * file, and none of them will need to be. It is also what lets the adapter's
 * request shape be asserted exactly, with no network and no fixture server.
 *
 * A caller that wants the platform's own client passes
 * `(url, init) => globalThis.fetch(url, init)`. The arrow matters: an unbound
 * `globalThis.fetch` throws `Illegal invocation` in several runtimes because it
 * needs its receiver.
 */
export interface PostgrestConfig {
  /**
   * The project origin, e.g. `https://abcdefgh.supabase.co`.
   *
   * A trailing slash is tolerated and stripped. `supabase-env.ts` deliberately
   * forgives one when it validates `SUPABASE_URL`, on the grounds that it is
   * unambiguous and common — so the value that reaches here can carry it, and
   * concatenating naively would produce `//rest/v1/rpc/...`. That is a 404,
   * indistinguishable from a missing function and from a key whose role cannot
   * see one.
   */
  readonly url: string;
  /** `SUPABASE_SECRET_KEY`. Sent as two headers and named in nothing. */
  readonly key: string;
  readonly fetch: FetchLike;
}

/* --- the failure ------------------------------------------------------------- */

/**
 * A facade that answered with something other than success.
 *
 * The facade and the status, and nothing else. Both are machine identifiers
 * that cannot carry an argument: which door was knocked on, and what it said.
 * The pair is enough to act on — 401 is a key the project does not accept, 404
 * with a working URL is a signature mismatch or a missing grant, 406 is an
 * unexposed schema, 5xx is the function raising — and `quota.ts` documents each
 * of those from having paid for it.
 *
 * The response body is read by nobody. See the module docblock.
 */
export class PostgrestFacadeError extends Error {
  readonly facade: FacadeName;
  readonly status: number;

  constructor(facade: FacadeName, status: number) {
    super(`${facade} refused over PostgREST — HTTP ${status}`);
    this.name = "PostgrestFacadeError";
    this.facade = facade;
    this.status = status;
  }
}

/**
 * A facade that answered successfully with something this adapter cannot read.
 *
 * Separate from the status failure because the remedy is different: a 404 is a
 * deployment problem, whereas an array where a scalar was expected means the
 * SQL's return type and the port disagree, and no amount of retrying fixes it.
 * It also has to exist as its own throw, because the alternative — letting
 * `JSON.parse` fail or letting `undefined` propagate — surfaces as a
 * `SyntaxError` whose message quotes the body it choked on.
 */
export class PostgrestShapeError extends Error {
  readonly facade: FacadeName;

  constructor(facade: FacadeName, expectation: string) {
    super(`${facade} answered with something that is not ${expectation}`);
    this.name = "PostgrestShapeError";
    this.facade = facade;
  }
}

/* --- the one round trip -------------------------------------------------------- */

/**
 * Whatever a facade's argument object happens to be.
 *
 * `unknown` rather than a union of the scalar types the facades take, because
 * `observer_events_append` passes a whole array of caller-supplied events
 * through as one `jsonb` argument and `observer_heartbeat_record` passes an
 * object. Constraining this would only push a cast to every call site.
 */
type FacadeArguments = Readonly<Record<string, unknown>>;

async function call(
  config: PostgrestConfig,
  facade: FacadeName,
  args: FacadeArguments,
): Promise<unknown> {
  const response = await config.fetch(`${trimTrailingSlashes(config.url)}/rest/v1/rpc/${facade}`, {
    method: "POST",
    /*
     * `apikey` and `Authorization` both, carrying the same value.
     *
     * Not redundancy: Supabase's gateway routes on `apikey` and PostgREST
     * derives the Postgres role from the bearer token, so a request with only
     * one of them either never reaches PostgREST or reaches it as `anon` —
     * which has execute on none of these functions. This is the header set
     * `quota.ts` sends, unchanged, because it is the set known to work against
     * the real project.
     */
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });

  if (!response.ok) throw new PostgrestFacadeError(facade, response.status);

  /*
   * The parse failure is swallowed and replaced, not wrapped.
   *
   * A rejected `response.json()` carries the text it could not parse in its
   * message — `Unexpected token '<'...` quotes the document — and a proxy
   * answering 200 with an HTML error page is exactly when that happens. Passing
   * it through as a `cause` would put an arbitrary body one `String(error)`
   * away from a log line, which is the disclosure this module is written to
   * make impossible.
   */
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new PostgrestShapeError(facade, "JSON");
  }
}

/**
 * A facade declared `returns uuid` or `returns boolean`.
 *
 * ## The difference that will bite a reader
 *
 * PostgREST does not wrap a scalar. `observer_project_create` is
 * `returns uuid`, and the response body is the bare JSON string
 * `"7c9e…"` — not `[{"observer_project_create":"7c9e…"}]` and not
 * `[{"project_id":"7c9e…"}]`. A facade declared `returns table (...)`, on the
 * other hand, always answers with a JSON array of row objects, even when it
 * returns exactly nought or one row.
 *
 * So the two cannot share a code path, and which one a facade is, is decided by
 * its SQL return type rather than by anything visible from TypeScript. Reading
 * `rows[0]` from a scalar facade yields the string's first character; reading a
 * table facade as a scalar yields an array. Both are silent.
 */
async function callScalar<T>(
  config: PostgrestConfig,
  facade: FacadeName,
  args: FacadeArguments,
  ok: (value: unknown) => value is T,
  expectation: string,
): Promise<T> {
  const payload = await call(config, facade, args);
  if (!ok(payload)) throw new PostgrestShapeError(facade, expectation);
  return payload;
}

/** A facade declared `returns table (...)`. Always an array. See above. */
async function callRows<T>(
  config: PostgrestConfig,
  facade: FacadeName,
  args: FacadeArguments,
): Promise<readonly T[]> {
  const payload = await call(config, facade, args);
  /*
   * Trusted as `T[]` after the array check and no further.
   *
   * The column names and types are the migration's business, and re-validating
   * them here would be a second, drifting copy of the SQL's `returns table`
   * clause — the exact duplication ADR-0008's PGlite suite exists to avoid, by
   * running the real function and asserting on what it really returns.
   */
  if (!Array.isArray(payload)) throw new PostgrestShapeError(facade, "an array of rows");
  return payload as readonly T[];
}

/**
 * The first row, or null — for the three facades where no row is an answer.
 *
 * `observer_activation_consume` returns nothing for an unknown selector, a
 * wrong verifier, an expired code, a spent code and an ineligible source alike,
 * and the port's contract is that the caller cannot tell those apart. Turning
 * an empty array into `null` here is what preserves that: there is one absent
 * value rather than five distinguishable ones.
 */
function firstOrNull<T>(rows: readonly T[]): T | null {
  return rows[0] ?? null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/**
 * `https://x.supabase.co///` becomes `https://x.supabase.co`.
 *
 * Written as a loop rather than a regular expression with a `+` quantifier
 * because it runs on every request and a greedy backtracking pattern on a
 * caller-supplied string is not worth the two characters it saves.
 */
function trimTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url.charCodeAt(end - 1) === 0x2f) end -= 1;
  return url.slice(0, end);
}

/* --- the adapter -------------------------------------------------------------- */

/**
 * The port, spoken over HTTP.
 *
 * Returned as an object literal rather than a class because there is no state:
 * `config` is captured, nothing is cached, nothing is pooled, and a second
 * adapter for a second project is a second call to this function. The port
 * forbids transaction control precisely so that this can be true — every method
 * below is one round trip that either happened or did not.
 */
export function postgrestDb(config: PostgrestConfig): ObserverDb {
  return {
    /* --- control plane -------------------------------------------------- */

    projectCreate(input: {
      readonly account: string;
      readonly name: string;
      readonly slug: string | null;
    }): Promise<string> {
      return callScalar(
        config,
        "observer_project_create",
        { p_account: input.account, p_name: input.name, p_slug: input.slug },
        isString,
        "a project id",
      );
    },

    sourceCreate(input: {
      readonly account: string;
      readonly project: string;
      readonly type: string;
      readonly environment: string;
      readonly label: string;
    }): Promise<string> {
      return callScalar(
        config,
        "observer_source_create",
        {
          p_account: input.account,
          p_project: input.project,
          p_type: input.type,
          p_environment: input.environment,
          p_label: input.label,
        },
        isString,
        "a source id",
      );
    },

    sourceSetState(input: {
      readonly account: string;
      readonly source: string;
      readonly state: string;
    }): Promise<boolean> {
      return callScalar(
        config,
        "observer_source_set_state",
        { p_account: input.account, p_source: input.source, p_state: input.state },
        isBoolean,
        "a boolean",
      );
    },

    sourceStatus(input: {
      readonly account: string;
      readonly project: string;
    }): Promise<readonly SourceStatusRow[]> {
      return callRows<SourceStatusRow>(config, "observer_source_status", {
        p_account: input.account,
        p_project: input.project,
      });
    },

    /* --- activation ----------------------------------------------------- */

    activationIssue(input: {
      readonly account: string;
      readonly source: string;
      readonly selector: string;
      readonly verifier: string;
      readonly purpose: string;
      readonly expiresAt: Instant;
    }): Promise<boolean> {
      return callScalar(
        config,
        "observer_activation_issue",
        {
          p_account: input.account,
          p_source: input.source,
          p_selector: input.selector,
          p_verifier: input.verifier,
          p_purpose: input.purpose,
          p_expires_at: input.expiresAt,
        },
        isBoolean,
        "a boolean",
      );
    },

    /*
     * The four secret-derived strings, and the reason the port refuses to be a
     * generic `call(name, args)`.
     *
     * `p_code_verifier` and `p_cred_verifier` are both 64-character hex
     * digests. Swapping them type-checks, passes every unit test that does not
     * consume a code, and mints a credential whose stored verifier nobody can
     * present — an activation that reports success and produces a source that
     * can never authenticate. Naming each argument on its own line beside the
     * property it comes from is what makes that swap visible.
     *
     * The SQL abbreviates two of them to `p_cred_*` where the port spells
     * `credential*` in full. That asymmetry is real and is left alone: the
     * migration is deployed and the port is the vocabulary callers read.
     */
    async activationConsume(input: {
      readonly codeSelector: string;
      readonly codeVerifier: string;
      readonly credentialSelector: string;
      readonly credentialVerifier: string;
      readonly credentialExpiresAt: Instant | null;
    }): Promise<ActivationConsumeRow | null> {
      const rows = await callRows<ActivationConsumeRow>(config, "observer_activation_consume", {
        p_code_selector: input.codeSelector,
        p_code_verifier: input.codeVerifier,
        p_cred_selector: input.credentialSelector,
        p_cred_verifier: input.credentialVerifier,
        p_cred_expires_at: input.credentialExpiresAt,
      });
      return firstOrNull(rows);
    },

    async credentialResolve(selector: string): Promise<CredentialResolveRow | null> {
      const rows = await callRows<CredentialResolveRow>(config, "observer_credential_resolve", {
        p_selector: selector,
      });
      return firstOrNull(rows);
    },

    credentialRevoke(input: {
      readonly account: string;
      readonly source: string;
    }): Promise<boolean> {
      return callScalar(
        config,
        "observer_credential_revoke",
        { p_account: input.account, p_source: input.source },
        isBoolean,
        "a boolean",
      );
    },

    async credentialStatus(input: {
      readonly account: string;
      readonly source: string;
    }): Promise<CredentialStatusRow | null> {
      /*
       * The SQL orders by `created_at desc` and does not limit, so a source
       * with a superseded history answers with every credential it has ever
       * held. The port promises one row or none, and the newest is the one an
       * operator screen means by "the credential" — so the rest are dropped
       * here rather than the facade being asked to change.
       */
      const rows = await callRows<CredentialStatusRow>(config, "observer_credential_status", {
        p_account: input.account,
        p_source: input.source,
      });
      return firstOrNull(rows);
    },

    /* --- ingestion ------------------------------------------------------ */

    eventsAppend(input: {
      readonly source: string;
      readonly events: readonly unknown[];
    }): Promise<readonly EventAppendRow[]> {
      /*
       * One argument holding the whole batch, not one request per event.
       *
       * `observer_events_append` takes `p_events jsonb` and unnests it with
       * ordinality, which is what makes the per-event ordinals a property of
       * the database rather than of this adapter keeping two arrays aligned.
       * PostgREST maps a JSON array in a named argument onto `jsonb` directly,
       * so the array goes in as-is — no stringifying it first, which would
       * arrive as a `jsonb` *string* and make `jsonb_array_elements` raise.
       */
      return callRows<EventAppendRow>(config, "observer_events_append", {
        p_source: input.source,
        p_events: input.events,
      });
    },

    eventsForSource(input: {
      readonly account: string;
      readonly source: string;
      readonly limit: number;
    }): Promise<readonly StoredEventRow[]> {
      return callRows<StoredEventRow>(config, "observer_events_for_source", {
        p_account: input.account,
        p_source: input.source,
        p_limit: input.limit,
      });
    },

    /* --- operations ----------------------------------------------------- */

    heartbeatRecord(input: {
      readonly source: string;
      readonly facts: HeartbeatFacts;
    }): Promise<boolean> {
      /*
       * The facts travel as one `jsonb` argument rather than as fifteen named
       * ones. Every field of `HeartbeatFacts` is optional, so a flat signature
       * would be fifteen `p_*` parameters that all default to null — and
       * PostgREST resolves an RPC by the exact set of argument names supplied,
       * so a plugin that reported nine of them and a plugin that reported ten
       * would be looking for two different overloads.
       */
      return callScalar(
        config,
        "observer_heartbeat_record",
        { p_source: input.source, p_facts: input.facts },
        isBoolean,
        "a boolean",
      );
    },

    ingestionVerified(input: { readonly source: string }): Promise<boolean> {
      return callScalar(
        config,
        "observer_ingestion_verified",
        { p_source: input.source },
        isBoolean,
        "a boolean",
      );
    },

    sourceOperations(input: {
      readonly account: string;
      readonly project: string | null;
    }): Promise<readonly SourceOperationsRow[]> {
      /*
       * `p_project` is nullable here and nowhere else in the port, because the
       * operations screen has an "all projects" view and the alternative is a
       * second facade differing only in a `where` clause. Null is sent
       * explicitly rather than by omitting the key: PostgREST matches an RPC on
       * the argument names present, and dropping one asks for an overload that
       * does not exist.
       */
      return callRows<SourceOperationsRow>(config, "observer_source_operations", {
        p_account: input.account,
        p_project: input.project,
      });
    },
  };
}
