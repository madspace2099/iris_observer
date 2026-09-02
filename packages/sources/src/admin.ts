import { ENVIRONMENTS } from "@observer/contracts/ue5";

import type { Instant, ObserverDb, SourceOperationsRow, SourceStatusRow } from "./db";
import type { Clock } from "./http";
import { issueActivationCode as mintActivationCode, type EnvSource } from "./secrets";

/**
 * THE ADMIN CONTROL PLANE — everything an authorised operator does to a source,
 * as typed functions rather than as a route.
 *
 * ## Why this is a service layer and not a handler
 *
 * `http.ts` exists because three *unauthenticated or client-authenticated*
 * endpoints have to agree about how they refuse. Nothing in this file is
 * reachable by a client at all: the caller is a server action that has already
 * established who the operator is and which account they are acting for, and
 * the account it passes is the only thing standing between two tenants.
 *
 * Written as a route, that account would arrive as a request field and the
 * whole scoping story would rest on remembering never to read it from the body.
 * Written as a function, the account is an argument the caller must supply from
 * its session, and there is no request object here to accidentally read it from.
 *
 * The consequence for the caller is that a server action is four lines — build
 * the deps, call the operation, map the refusal to whatever the screen shows —
 * and every rule below is provable against a real Postgres without a socket.
 *
 * ## Every refusal is a value, and the interesting ones are identical
 *
 * No operation here throws to say "no". A thrown error carries a stack, gets
 * logged with its message, and is the single most common way a value that was
 * supposed to stay in one place ends up in a log aggregator. Refusals are
 * returned as {@link AdminRefusal}, which holds a closed code and at most the
 * NAME of an unusable field — never the value that field held.
 *
 * The refusals that matter most are the ones that are deliberately equal.
 * `unknown_source` is returned when the source does not exist, when it belongs
 * to another account, and when it is archived, because the underlying facades
 * return one boolean for all three and a service that reconstructed the
 * difference would be building an existence oracle for another tenant's
 * estate. The test suite asserts those refusals are byte-identical rather than
 * merely both false.
 *
 * ## What this file must never do with an activation code
 *
 * {@link ObserverAdmin.issueActivationCode} is the only place in the system
 * that holds a plaintext activation code, and it holds it for the length of one
 * return statement. It is not logged, not passed to `db`, not put in a refusal,
 * and not written to the audit trail — the database is handed a selector and an
 * HMAC and could not reproduce the code if it were dumped. The receipt carries
 * a `toJSON` that omits it, so the ordinary accident — an operator surface
 * stringifying a service result into a log line — cannot leak it either.
 */

/* --- what the services need ---------------------------------------------------- */

/**
 * The three things every operation needs, injected.
 *
 * Deliberately a subset of `HandlerDeps` rather than the same type: there is no
 * rate-limit hook because there is no anonymous caller to limit, and taking
 * `HandlerDeps` would invite somebody to pass a whole request context into a
 * layer that must not be able to see one.
 *
 * `now` is here for exactly one reason — activation expiry. A test that proved
 * the fifteen-minute default by sleeping would be a test that fails on a loaded
 * machine, so the clock is a function and the suite supplies a fixed one.
 */
export interface AdminDeps {
  readonly db: ObserverDb;
  readonly env: EnvSource;
  readonly now: Clock;
}

/* --- vocabularies --------------------------------------------------------------- */

/**
 * The source types the schema accepts.
 *
 * A copy of `project_sources_type_known` in migration `20260902090000`, and the
 * duplication is deliberate for the same reason `FACADE_NAMES` duplicates the
 * function names: the alternative is letting an operator's typo reach Postgres
 * and come back as a check-constraint violation, which is an exception where a
 * refusal belongs and — worse — an error whose DETAIL can carry the rejected
 * row. No contract package publishes this list; when one does, this should
 * import it instead.
 */
export const SOURCE_TYPES = [
  "showroom_ue5",
  "web_iris",
  "crm",
  "communication",
  "manual_admin",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/**
 * Why a code was issued. A server-side fact, never a client's choice.
 *
 * The client's activation request carries no purpose field and cannot: it
 * presents a code and learns whether it worked. The distinction exists so that
 * an operator reading the audit trail can tell a first activation from a
 * machine that was reimaged and came back — two events that produce identical
 * credential rows and mean very different things about the estate.
 *
 * It is an argument rather than something derived from whether the source
 * already holds a credential, because the derivation would be wrong in exactly
 * the case that matters: a source whose credential was revoked hours ago holds
 * none, and issuing its replacement is still a reactivation.
 */
export const ACTIVATION_PURPOSES = ["activation", "reactivation"] as const;
export type ActivationPurpose = (typeof ACTIVATION_PURPOSES)[number];

/**
 * How long an activation code may live.
 *
 * An activation code is accepted unauthenticated and mints a long-lived
 * credential, so its lifetime is the window in which a copy of it — pasted into
 * a chat, left in a ticket, read off a shoulder — is worth stealing. Short is
 * the entire point; the code is single-use and an operator can issue another in
 * a second.
 *
 * **Default 15 minutes.** Long enough to walk from a desk to the showroom PC
 * and paste it into the plugin, short enough that a code left in a message
 * thread is dead before the thread is read.
 *
 * **Ceiling 1 hour.** The longest any unauthenticated single-use secret should
 * sit in somebody's clipboard history. A remote install that genuinely needs
 * longer is a second code, not a longer one.
 *
 * **Floor 1 minute.** Not paranoia in the other direction: a 5-second code
 * fails at the client and looks exactly like a broken activation endpoint, so
 * the floor turns an operator's slip into a refusal they can read rather than
 * an outage somebody else has to diagnose.
 *
 * A `ttlSeconds` outside the range is REFUSED rather than clamped. Clamping
 * means an operator believes they issued an hour-long code and the client fails
 * at fifteen minutes — the divergence arrives as a bug report about activation
 * and costs an afternoon.
 */
export const ACTIVATION_TTL_DEFAULT_SECONDS = 900;
export const ACTIVATION_TTL_MIN_SECONDS = 60;
export const ACTIVATION_TTL_MAX_SECONDS = 3_600;

/* --- results -------------------------------------------------------------------- */

/**
 * Why an operation refused.
 *
 * `unknown_project` and `unknown_source` are each returned for several distinct
 * situations, and the conflation is the security property rather than
 * imprecision:
 *
 *   `unknown_project` — no such project, or it belongs to another account, or
 *     it has been archived.
 *   `unknown_source` — no such source, or it belongs to another account, or it
 *     is archived and therefore terminal, or (for `revokeCredential`) it holds
 *     no active credential to revoke.
 *
 * Telling those apart would require a second, differently-scoped query whose
 * only product is an answer to "does this id exist somewhere in the system",
 * which is precisely the question a tenant boundary exists to refuse.
 */
export type AdminRefusalCode = "invalid_input" | "unknown_project" | "unknown_source";

export interface AdminRefusal {
  readonly code: AdminRefusalCode;
  /**
   * Which argument was unusable, by NAME.
   *
   * Never the value. Half the arguments to this module are opaque tenant
   * identifiers and one of them is an operator's own account, and a refusal is
   * the thing most likely to be logged verbatim.
   */
  readonly field: string | null;
}

export type AdminResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly refusal: AdminRefusal };

const refuse = <T>(code: AdminRefusalCode, field: string | null = null): AdminResult<T> => ({
  ok: false,
  refusal: { code, field },
});

const succeed = <T>(value: T): AdminResult<T> => ({ ok: true, value });

/* --- the activation receipt ------------------------------------------------------ */

/** What an operator surface may keep about an issued code. No secret material. */
export interface ActivationReceipt {
  /** Public, indexed, and safe to display beside an audit entry. */
  readonly selector: string;
  readonly purpose: ActivationPurpose;
  readonly expiresAt: Instant;
}

/**
 * An issued activation code, plaintext included, exactly once.
 *
 * `toJSON` is not decoration. The failure this file is most likely to suffer is
 * not somebody printing `receipt.plaintext` — that is visible in review — but a
 * server action doing `logger.info({ result })` on the whole outcome, at which
 * point `JSON.stringify` walks into the plaintext. Defining `toJSON` makes the
 * serialised form of this object the receipt, so the accident produces a
 * selector and an expiry instead of a live credential.
 *
 * It is a narrowing of one common accident, not a guarantee. The caller still
 * has to hand `plaintext` straight to whatever shows it to the operator and
 * keep no other reference; nothing in a language with property access can
 * enforce that.
 */
export interface IssuedActivation extends ActivationReceipt {
  /** The only time this value exists on the server. Never logged, never stored. */
  readonly plaintext: string;
  readonly toJSON: () => ActivationReceipt;
}

/* --- inputs ---------------------------------------------------------------------- */

export interface CreateProjectInput {
  readonly account: string;
  readonly name: string;
  /** Unique per account, or null. Display metadata; never an identifier. */
  readonly slug: string | null;
}

export interface CreateSourceInput {
  readonly account: string;
  readonly project: string;
  readonly type: SourceType;
  /** AUTHORITATIVE for every event this source ever sends. */
  readonly environment: (typeof ENVIRONMENTS)[number];
  /** Server-authored. A source never names itself. */
  readonly label: string;
}

export interface IssueActivationCodeInput {
  readonly account: string;
  readonly source: string;
  readonly purpose: ActivationPurpose;
  /** Omitted means {@link ACTIVATION_TTL_DEFAULT_SECONDS}. */
  readonly ttlSeconds?: number;
}

export interface SourceInput {
  readonly account: string;
  readonly source: string;
}

export interface ProjectScopeInput {
  readonly account: string;
  readonly project: string;
}

export interface OperationsScopeInput {
  readonly account: string;
  /** Null means every project in the account. */
  readonly project: string | null;
}

/* --- validation ------------------------------------------------------------------ */

/**
 * Canonical 8-4-4-4-12, case-insensitive.
 *
 * Postgres would accept more than this (braces, unhyphenated) and would reject
 * anything else with `invalid input syntax for type uuid: "..."` — an exception
 * carrying the rejected value in its message, straight into whatever catches
 * it. Every id this module hands out came from `gen_random_uuid()`, so
 * insisting on the canonical form costs nothing and keeps a malformed id from
 * ever reaching the statement that would quote it back.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A non-empty, non-whitespace string within the column's ceiling. */
function badText(value: unknown, field: string, max: number): AdminRefusal | null {
  if (typeof value !== "string") return { code: "invalid_input", field };
  if (value.trim().length === 0) return { code: "invalid_input", field };
  if (value.length > max) return { code: "invalid_input", field };
  return null;
}

function badIdentifier(value: unknown, field: string): AdminRefusal | null {
  if (typeof value !== "string" || !UUID.test(value)) return { code: "invalid_input", field };
  return null;
}

/**
 * The account, which is the tenant boundary and therefore checked first
 * everywhere.
 *
 * Its ceiling is generous because `account_id` is opaque text from a verified
 * session and this module has no business knowing what shape another system's
 * identifiers take — only that an empty one, which would match nothing and
 * therefore silently scope to nothing, is a caller bug rather than a query.
 */
const badAccount = (value: unknown): AdminRefusal | null => badText(value, "account", 200);

/** The first refusal in the list, or null. Order is the order the fields are documented in. */
function firstProblem(problems: readonly (AdminRefusal | null)[]): AdminRefusal | null {
  for (const problem of problems) if (problem !== null) return problem;
  return null;
}

/* --- the services ----------------------------------------------------------------- */

export interface ObserverAdmin {
  createProject(input: CreateProjectInput): Promise<AdminResult<string>>;
  createSource(input: CreateSourceInput): Promise<AdminResult<string>>;
  issueActivationCode(input: IssueActivationCodeInput): Promise<AdminResult<IssuedActivation>>;
  suspendSource(input: SourceInput): Promise<AdminResult<null>>;
  resumeSource(input: SourceInput): Promise<AdminResult<null>>;
  archiveSource(input: SourceInput): Promise<AdminResult<null>>;
  revokeCredential(input: SourceInput): Promise<AdminResult<null>>;
  sourceStatus(input: ProjectScopeInput): Promise<AdminResult<readonly SourceStatusRow[]>>;
  sourceOperations(
    input: OperationsScopeInput,
  ): Promise<AdminResult<readonly SourceOperationsRow[]>>;
}

/**
 * Bind the operator services to a database, an environment and a clock.
 *
 * The returned object holds nothing but its dependencies, so it is safe to
 * build one per request or one per process — the same property `pgliteDb`
 * claims, and for the same reason: state here would be state that outlives a
 * tenant boundary.
 */
export function observerAdmin(deps: AdminDeps): ObserverAdmin {
  const { db, env, now } = deps;

  /**
   * Suspend, resume and archive are one function three times, because the
   * facade is one function and the account filter is the only part that must
   * not vary. Three separate bodies would be three places to forget it.
   */
  async function setState(input: SourceInput, state: string): Promise<AdminResult<null>> {
    const problem = firstProblem([
      badAccount(input.account),
      badIdentifier(input.source, "source"),
    ]);
    if (problem !== null) return { ok: false, refusal: problem };

    const moved = await db.sourceSetState({
      account: input.account,
      source: input.source,
      state,
    });
    /*
     * False covers "not yours", "no such source" and "already archived", and
     * the facade cannot tell us which. See AdminRefusalCode: that is the
     * design, not a limitation being papered over.
     */
    return moved ? succeed(null) : refuse<null>("unknown_source", "source");
  }

  return {
    async createProject(input) {
      const problem = firstProblem([
        badAccount(input.account),
        badText(input.name, "name", 200),
        input.slug === null ? null : badText(input.slug, "slug", 120),
      ]);
      if (problem !== null) return { ok: false, refusal: problem };

      /*
       * A slug already taken within the account raises a unique-violation here
       * rather than returning a refusal, and that is a deliberate limit on this
       * layer: interpreting a driver's error code would mean one branch for
       * PGlite's shape and another for PostgREST's, and the two implementations
       * of the port agreeing is the whole reason the port exists. An operator
       * surface that wants to offer "that slug is in use" should check for it
       * before calling, where it can also suggest a free one.
       */
      return succeed(
        await db.projectCreate({
          account: input.account,
          name: input.name,
          slug: input.slug,
        }),
      );
    },

    async createSource(input) {
      const problem = firstProblem([
        badAccount(input.account),
        badIdentifier(input.project, "project"),
        (SOURCE_TYPES as readonly string[]).includes(input.type)
          ? null
          : { code: "invalid_input", field: "type" },
        (ENVIRONMENTS as readonly string[]).includes(input.environment)
          ? null
          : { code: "invalid_input", field: "environment" },
        badText(input.label, "label", 200),
      ]);
      if (problem !== null) return { ok: false, refusal: problem };

      const sourceId = await db.sourceCreate({
        account: input.account,
        project: input.project,
        type: input.type,
        environment: input.environment,
        label: input.label,
      });

      /*
       * `observer_source_create` is `insert ... select ... where p.account_id =
       * p_account and p.status = 'active' returning source_id`, so a project
       * that is not this account's active project inserts nothing and a SQL
       * function with no returned row yields NULL. The port types that as
       * `string` because the happy path is a uuid; the null is real and this is
       * the only place that can see it.
       */
      const created: string | null = sourceId;
      return created === null ? refuse<string>("unknown_project", "project") : succeed(created);
    },

    async issueActivationCode(input) {
      const ttlSeconds = input.ttlSeconds ?? ACTIVATION_TTL_DEFAULT_SECONDS;
      const problem = firstProblem([
        badAccount(input.account),
        badIdentifier(input.source, "source"),
        (ACTIVATION_PURPOSES as readonly string[]).includes(input.purpose)
          ? null
          : { code: "invalid_input", field: "purpose" },
        Number.isSafeInteger(ttlSeconds) &&
        ttlSeconds >= ACTIVATION_TTL_MIN_SECONDS &&
        ttlSeconds <= ACTIVATION_TTL_MAX_SECONDS
          ? null
          : { code: "invalid_input", field: "ttlSeconds" },
      ]);
      if (problem !== null) return { ok: false, refusal: problem };

      /*
       * Minted BEFORE the write and thrown away if the write refuses. The
       * alternative — ask the database whether the source is issuable, then
       * mint, then write — is two round trips with a window in the middle, and
       * `observer_activation_issue` already decides eligibility inside the same
       * statement that records the code.
       *
       * This call throws `PepperMisconfiguredError` when a pepper is missing,
       * shared or obviously synthetic in a deployment. That is not a refusal:
       * refusals are things an operator did, and this is a host that must not
       * be issuing credentials at all. Its message carries a variable name and
       * a problem, never a pepper.
       */
      const code = mintActivationCode(env);
      const expiresAt = new Date(now().getTime() + ttlSeconds * 1000).toISOString();

      const written = await db.activationIssue({
        account: input.account,
        source: input.source,
        selector: code.selector,
        /* The HMAC. The plaintext below never crosses this boundary. */
        verifier: code.verifier,
        purpose: input.purpose,
        expiresAt,
      });

      if (!written) {
        /*
         * The source is not this account's, does not exist, or is archived —
         * `observer_activation_issue` matches only `active` and `suspended`, so
         * a suspended source DOES get a code. That is intentional and tested:
         * resuming is an operator action and the code is how the client comes
         * back afterwards, so refusing here would make a suspension a one-way
         * door in practice while pretending to be reversible.
         *
         * Nothing about `code` appears in this refusal, and the local binding
         * goes out of scope with the frame.
         */
        return refuse<IssuedActivation>("unknown_source", "source");
      }

      const receipt: ActivationReceipt = {
        selector: code.selector,
        purpose: input.purpose,
        expiresAt,
      };
      return succeed<IssuedActivation>({
        ...receipt,
        plaintext: code.plaintext,
        toJSON: () => receipt,
      });
    },

    suspendSource: (input) => setState(input, "suspended"),

    /*
     * Resume writes `active`, and the facade's `state <> 'archived'` guard is
     * what makes archival terminal — a resumed archive would resurrect a
     * credential lifecycle an operator deliberately ended, so it refuses with
     * the same `unknown_source` as everything else that cannot be acted on.
     */
    resumeSource: (input) => setState(input, "active"),

    archiveSource: (input) => setState(input, "archived"),

    async revokeCredential(input) {
      const problem = firstProblem([
        badAccount(input.account),
        badIdentifier(input.source, "source"),
      ]);
      if (problem !== null) return { ok: false, refusal: problem };

      const revoked = await db.credentialRevoke({
        account: input.account,
        source: input.source,
      });
      /*
       * False also covers "this source holds no active credential", which is a
       * harmless thing to tell the owner and an existence oracle to tell anyone
       * else. One boolean in, one refusal out.
       */
      return revoked ? succeed(null) : refuse<null>("unknown_source", "source");
    },

    async sourceStatus(input) {
      const problem = firstProblem([
        badAccount(input.account),
        badIdentifier(input.project, "project"),
      ]);
      if (problem !== null) return { ok: false, refusal: problem };

      /*
       * A project that is not this account's yields an empty list, not
       * `unknown_project`. A read has no side effect to withhold, and an empty
       * result is already indistinguishable from a real project with no
       * sources — which is exactly the answer another tenant should get.
       */
      return succeed(await db.sourceStatus({ account: input.account, project: input.project }));
    },

    async sourceOperations(input) {
      const problem = firstProblem([
        badAccount(input.account),
        input.project === null ? null : badIdentifier(input.project, "project"),
      ]);
      if (problem !== null) return { ok: false, refusal: problem };

      return succeed(await db.sourceOperations({ account: input.account, project: input.project }));
    },
  };
}
