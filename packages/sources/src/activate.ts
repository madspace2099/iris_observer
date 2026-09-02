import { createHmac } from "node:crypto";

import {
  ACTIVATION_HTTP_STATUS,
  APPROVED_BACKEND_CEILINGS,
  ActivationRequestSchema,
  EnvironmentSchema,
  OBSERVER_ROUTES,
  UE5_SCHEMA_VERSION_MAX,
  UE5_SCHEMA_VERSION_MIN,
  type ActivationFailure,
  type ActivationFailureCode,
  type ActivationSuccess,
  type Limits,
} from "@observer/contracts/ue5";
import { z } from "zod";

import type { ActivationConsumeRow } from "./db";
import { bodyWithinCeiling, ok, requirePost, type Handler, type HandlerDeps } from "./http";
import {
  ACTIVATION_CODE_PEPPER,
  PepperMisconfiguredError,
  describePepper,
  issueSourceToken,
  parseToken,
  type EnvSource,
} from "./secrets";

/**
 * ACTIVATION — the one unauthenticated door, and the only one that ever emits
 * credential material.
 *
 * ## The property the whole file is arranged around
 *
 * A caller holding a guessed code must learn **nothing**. Not whether the code
 * ever existed, not whether it expired rather than being spent, not whether the
 * source behind it is suspended, and above all not that a source exists at all.
 * `PD-27` removed the `409 already_activated` that used to answer a spent code
 * with the existing `source_id`, because that turned a guess into an
 * unauthenticated existence oracle — see `ACTIVATION_FAILURE_CODES` in
 * `activation.ts` for the full account.
 *
 * So every one of the six ways an exchange can fail — unknown selector, a code
 * that does not parse, expired, already consumed, revoked, and a code tied to a
 * source that is no longer eligible — is answered by {@link refused}, which
 * takes no arguments. It cannot be given a `source_id`, it cannot be given a
 * reason, and there is no second call site that could grow one. The database
 * helps: `observer_activation_consume` returns `null` for all six, so there is
 * not even a distinction reaching this file to leak.
 *
 * ## Nothing here logs
 *
 * Deliberately, and it is worth stating rather than leaving as an absence. The
 * values passing through this function are an activation code, a derived
 * verifier and a freshly minted token; there is no log line that could carry a
 * useful diagnostic without also carrying one of those. The audit rows the
 * migration writes — `code_consumed`, `credential_issued`, with a boolean and
 * no secret — are the record of what happened here.
 *
 * ## Why the refusal bodies are not built with `failure()`
 *
 * `http.ts` builds `RequestFailureBody`, which is the shape ingestion and
 * heartbeat answer with. Activation has its own envelope: `ActivationFailure`
 * carries `status: "failed"` and a **required, always-null** `source_id`, kept
 * as a required key precisely so that no client can infer anything from a
 * field's presence — including by measuring the response length. Answering an
 * activation with the ingestion envelope would break a client parsing
 * `ActivationResponseSchema` strictly, so the shared helper is used for the
 * *decisions* (`requirePost`, `bodyWithinCeiling`) and this file renders them.
 */

/* --- what this endpoint states ------------------------------------------------- */

/**
 * The largest activation request that will be read, in bytes.
 *
 * The biggest request the schema can describe is around 800 bytes: a code of at
 * most 128 characters, a UUID, an OS string of 96, four build strings totalling
 * under 300, and the JSON around them. 4 KiB is five times that — room for a
 * longer code or a field this contract has not grown yet — and still small
 * enough that a hostile body costs a header read rather than a parse.
 *
 * Nothing about ingestion's ceilings applies here. An activation request is one
 * indivisible object, not a batch, and the number that bounds it has no reason
 * to track a number that bounds two hundred events.
 */
export const ACTIVATION_REQUEST_BYTE_CEILING = 4_096;

/**
 * Where a deployment tells clients to send their events.
 *
 * `OBSERVER_ROUTES` are paths, and `ActivationSuccessSchema` requires absolute
 * URLs, so an origin has to come from somewhere. A deployment sets this; the
 * fallback is the origin the client just reached us on.
 *
 * The fallback is derived from the request, which is ultimately a client-
 * controlled `Host`, and that is acceptable here in a way it would not be
 * elsewhere: the only thing a caller achieves by forging it is being told to
 * send *its own* events to an origin it chose. It cannot redirect anybody
 * else's, because every activation response goes only to the caller that
 * presented the code. A deployment still sets the variable, so the answer does
 * not depend on a proxy's header handling.
 */
export const OBSERVER_PUBLIC_ORIGIN = "OBSERVER_PUBLIC_ORIGIN";

/**
 * What the server states at activation, and why it is no longer six nulls.
 *
 * A null means "the server states no limit; use your configured default" — it
 * has never meant unlimited. `docs/ue5-ingestion-contract.md` §8 still says the
 * server states nothing, and that sentence is older than the table three
 * paragraphs above it, which records the backend ceilings as **APPROVED**
 * (`P-23`, and `PD-29` for the two structural ones).
 *
 * Stating null while refusing at 200 events, 8 MiB and 64 KiB means a client
 * discovers the ceiling by being refused at it. Since the ingestion endpoint
 * enforces exactly `APPROVED_BACKEND_CEILINGS`, stating them is what lets a
 * client split *before* the 413 rather than after — which is the entire purpose
 * of a negotiated limit.
 *
 * `min_send_interval_ms` stays null because no floor between requests has been
 * approved, and inventing one here would be exactly the desk-invented number
 * OPEN-12 exists to prevent.
 */
const STATED_LIMITS: Limits = Object.freeze({
  max_batch_events: APPROVED_BACKEND_CEILINGS.maxBatchEvents,
  max_batch_bytes: APPROVED_BACKEND_CEILINGS.maxBatchBytes,
  max_event_bytes: APPROVED_BACKEND_CEILINGS.maxEventBytes,
  max_property_depth: APPROVED_BACKEND_CEILINGS.maxPropertyDepth,
  max_property_count: APPROVED_BACKEND_CEILINGS.maxPropertyCount,
  min_send_interval_ms: null,
});

/** The event-schema generation window this deployment accepts. */
const ACCEPTED_SCHEMA_VERSIONS = Object.freeze({
  min: UE5_SCHEMA_VERSION_MIN,
  max: UE5_SCHEMA_VERSION_MAX,
});

/**
 * When a client should re-read its configuration. Thirty days.
 *
 * Matched to `packages/ue5-mock`, which states the same interval, rather than
 * chosen on its own merits. Two implementations of one contract handing a
 * plugin different refresh cadences is how a showroom's diagnostic screen
 * starts disagreeing with the harness the plugin was tested against, and the
 * value is not load-bearing enough to be worth that.
 *
 * Emphatically not a token lifetime; the credential does not expire.
 */
const CONFIG_REFRESH_MS = 30 * 86_400_000;

/**
 * The display label's ceiling on the wire.
 *
 * `project_sources.display_label` is checked at 1–200 characters by the spine
 * migration and `ActivationSuccessSchema` bounds it at 120, so an operator can
 * name a source in Admin such that this endpoint cannot answer at all. Truncated
 * here rather than trusted, for the reason `failure()` gives about its own
 * message: the schema would reject an over-long value at generation time while
 * a handler would happily send it, and a source that cannot be activated
 * because of its *name* is an outage with no visible cause.
 */
const DISPLAY_LABEL_CEILING = 120;

/* --- the messages, which say nothing ------------------------------------------- */

/**
 * The single generic refusal's wording, identical to the reference mock's.
 *
 * `message` is for a human reading an installer screen; nothing branches on it,
 * and it must not narrow down which of the six causes applied.
 */
const REFUSED_MESSAGE = "The activation code could not be used.";
const MALFORMED_MESSAGE = "The request could not be read.";
const RATE_LIMITED_MESSAGE = "Too many activation attempts.";
const UNAVAILABLE_MESSAGE = "Activation is temporarily unavailable.";

/* --- the request, as this endpoint can actually receive it --------------------- */

/**
 * `ActivationRequestSchema`, with the one bound it cannot currently express.
 *
 * ## The conflict, stated plainly
 *
 * `ActivationCodeSchema` is `z.string().min(8).max(64)`. A code minted by
 * `issueActivationCode` is `obs.<22 chars>.<43 chars>` — **70 characters**,
 * because base64url of 16 and 32 random bytes is 22 and 43. Every genuinely
 * issued code is therefore six characters over the contract's ceiling, so
 * validating against it unmodified makes this endpoint refuse every real
 * activation with a `400` and succeed for nothing.
 *
 * The bound is widened here, in the handler, rather than reached across into a
 * contract package this task may not edit. 128 is chosen against `parseToken`'s
 * own limits — it accepts a 16–128 character selector and a 32–256 character
 * secret — so the wire bound stays comfortably above what the issuer mints
 * while still refusing anything that could be an attack rather than a code.
 *
 * **This is a contract defect and it belongs in `activation.ts`.** The handover
 * names it: `ActivationCodeSchema` should bound the value the issuer actually
 * produces, and until it does, the number in this file and the number in that
 * one disagree.
 *
 * Everything else is inherited, including the strictness. `.extend` on a
 * `strictObject` keeps the closed envelope, which is what makes `tenant_id`,
 * `project_id` and `source_id` structurally unsendable rather than merely
 * ignored — a plugin that tries finds out at the developer's desk.
 */
const WireActivationRequestSchema = ActivationRequestSchema.extend({
  activation_code: z.string().min(8).max(128),
});

/* --- refusing ------------------------------------------------------------------- */

/**
 * Build an activation failure body and its response.
 *
 * The HTTP status is looked up from `ACTIVATION_HTTP_STATUS` rather than passed
 * in, for the reason `failure()` gives: a client's installer screen keys off
 * the code and its retry behaviour keys off the status, and a pair that
 * disagrees produces a plugin that stops for a reason it cannot report.
 */
function answer(
  code: ActivationFailureCode,
  message: string,
  retryAfterSeconds: number | null = null,
): Response {
  const body: ActivationFailure = {
    status: "failed",
    code,
    message,
    /*
     * Not a parameter, and never one. A failure body that *can* carry a source
     * identifier is one refactor away from carrying one, and making it
     * unreachable is cheaper than trusting every future caller to pass null.
     */
    source_id: null,
    retry_after_seconds: retryAfterSeconds,
  };

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (retryAfterSeconds !== null) headers["retry-after"] = String(retryAfterSeconds);

  return new Response(JSON.stringify(body), {
    status: ACTIVATION_HTTP_STATUS[code],
    headers,
  });
}

/**
 * THE SINGLE GENERIC FAILURE. One call, no arguments, six causes.
 *
 * Unknown, unparseable, expired, consumed, revoked and tied-to-an-ineligible-
 * source all arrive here, and the bytes they produce are identical because
 * there is nothing to vary. A test asserts that byte identity, because the
 * property is not "the same code" but "the same response" — a difference in
 * message length is as good an oracle as a difference in status.
 */
function refused(): Response {
  return answer("activation_failed", REFUSED_MESSAGE);
}

/* --- deriving the code's verifier ----------------------------------------------- */

/**
 * The domain separator `secrets.ts` mixes into an activation code's HMAC.
 *
 * ## This constant is duplicated, and that is a defect with a deadline
 *
 * `secrets.ts` holds the same string in a module-private `DOMAIN`, and computes
 * the verifier in a module-private `verifierFor`. What it exports is
 * `verifySecret`, which *compares* a presented secret against a verifier the
 * caller already holds — and this endpoint cannot use that, because
 * `observer_activation_consume` takes the derived verifier as an argument and
 * does the comparison inside its one atomic statement. The migration is
 * explicit about why: selecting the row, comparing in TypeScript and then
 * updating reopens exactly the race that one conditional `update ... returning`
 * closes, so twenty-five simultaneous exchanges of one code all see `issued`.
 *
 * So the caller must derive rather than verify, and `secrets.ts` exports no way
 * to. The fix is one exported function there; until it lands, the spelling of
 * this constant has to agree with a constant nothing in that file will fail
 * over. What makes the gap survivable is `activate.test.ts`: it mints codes
 * with the real `issueActivationCode` and consumes them through this handler,
 * so a drift between the two spellings is a red test rather than a showroom
 * that cannot activate.
 */
const ACTIVATION_CODE_DOMAIN = "observer.activation-code.v1";

/**
 * The stored verifier for a presented code, or a throw if the pepper is unusable.
 *
 * Mirrors `pepperFor` in `secrets.ts` using the pieces that file does export:
 * the variable name and `describePepper`. Refusing to derive anything under a
 * misconfigured pepper is the same fail-closed rule `assertPeppersUsable`
 * states — a deployment either holds a real secret or mints nothing, because a
 * fallback that works is worse than one that fails.
 */
function activationCodeVerifier(selector: string, secret: string, env: EnvSource): string {
  const verdict = describePepper(ACTIVATION_CODE_PEPPER, env);
  if (!verdict.ok) throw new PepperMisconfiguredError(ACTIVATION_CODE_PEPPER, verdict.problem);
  const pepper = env[ACTIVATION_CODE_PEPPER] ?? "";

  return createHmac("sha256", pepper)
    .update(`${ACTIVATION_CODE_DOMAIN}${selector}${secret}`)
    .digest("hex");
}

/* --- the endpoint URLs ----------------------------------------------------------- */

interface EndpointUrls {
  readonly ingest: string;
  readonly heartbeat: string;
}

/**
 * The absolute URLs a client will use from here on.
 *
 * Built **before** the code is spent. A misconfigured origin throws, and a
 * throw after `activationConsume` would have burned a one-time code to answer
 * `503` — the operator then has to issue another one to recover from a typo in
 * an environment variable. Computing it first makes a broken deployment refuse
 * every activation while spending none of them.
 *
 * A trailing slash is tolerated, as `postgrest.ts` tolerates one on
 * `SUPABASE_URL`: it is unambiguous, it is common, and concatenating naively
 * would produce `//functions/v1/...`, which is a 404 nobody can read.
 */
function endpointUrls(request: Request, env: EnvSource): EndpointUrls {
  const configured = env[OBSERVER_PUBLIC_ORIGIN];
  const base =
    configured === undefined || configured.trim().length === 0
      ? new URL(request.url).origin
      : configured.trim().replace(/\/+$/, "");

  return {
    ingest: new URL(OBSERVER_ROUTES.ingest, base).toString(),
    heartbeat: new URL(OBSERVER_ROUTES.heartbeat, base).toString(),
  };
}

/* --- the handler ------------------------------------------------------------------ */

/**
 * Exchange a one-time activation code for a source-scoped credential.
 *
 * The order below is the documented validation order, and each step is cheaper
 * than the one after it: method, byte ceiling, parse, shape, rate limit, then
 * the two round trips that cost something.
 */
export const handleActivate: Handler = async (request, deps) => {
  /*
   * The POST-only decision is `requirePost`'s, so that the three endpoints
   * cannot drift apart on it; the *rendering* is this endpoint's, because its
   * refusal envelope is not the shared one. Both answer 400 `malformed_request`
   * — a GET reaching this route is a misconfiguration, and answering it with
   * anything cacheable invites a proxy to cache a route that must never be.
   */
  if (requirePost(request) !== null) return answer("malformed_request", MALFORMED_MESSAGE);

  /*
   * Over the ceiling is `malformed_request`, not `batch_too_large`.
   *
   * `batch_too_large` is the only failure whose fix is arithmetic: its policy is
   * `retain_and_split`, halve the batch and try again. An activation request is
   * one indivisible object — there is nothing to halve, and a client obeying
   * that policy would loop for ever splitting a thing that has no parts. It is
   * also not in `ACTIVATION_FAILURE_CODES`, which is the contract already
   * saying so. What actually happened is that the client built a request this
   * endpoint cannot read, which is `malformed_request`: quarantine it, do not
   * retry, and make it visible as the plugin bug it is.
   */
  const body = await bodyWithinCeiling(request, ACTIVATION_REQUEST_BYTE_CEILING);
  if (!body.ok) return answer("malformed_request", MALFORMED_MESSAGE);

  let payload: unknown;
  try {
    payload = JSON.parse(body.text);
  } catch {
    /* The parser's own message quotes the body it choked on. It goes nowhere. */
    return answer("malformed_request", MALFORMED_MESSAGE);
  }

  const parsed = WireActivationRequestSchema.safeParse(payload);
  /*
   * No `parsed.error` in the response. Zod's issue list names paths and
   * received values, and a client that sent `source_id` would be told the
   * server knows what a `source_id` is — a small oracle, and free to remove.
   */
  if (!parsed.success) return answer("malformed_request", MALFORMED_MESSAGE);
  const activation = parsed.data;

  /*
   * The limiter runs after the structural checks and before anything is spent.
   *
   * After, because a malformed request is a plugin bug rather than an attempt
   * on a code, and burning a caller's budget on its own typo makes the endpoint
   * harder to integrate against without making it safer — an enumerator sends
   * well-formed requests anyway. Before the exchange, because the thing worth
   * limiting is attempts against codes, and a limiter that runs afterwards has
   * already let the guess happen.
   */
  if (deps.rateLimit !== undefined) {
    const retryAfter = await deps.rateLimit(request, OBSERVER_ROUTES.activate);
    if (retryAfter !== null && retryAfter > 0) {
      /* Clamped to the schema's own window, so the body cannot fail generation. */
      const seconds = Math.min(86_400, Math.max(1, Math.floor(retryAfter)));
      return answer("rate_limited", RATE_LIMITED_MESSAGE, seconds);
    }
  }

  /*
   * A code that does not parse is one of the six, not a `400`.
   *
   * It passed the schema, so the request is well-formed; what failed is the
   * *credential*, and the contract puts "malformed-after-safe-parsing" inside
   * `activation_failed` for the obvious reason — separating it would tell a
   * caller that their guess had the wrong *shape*, which is the first bit of an
   * enumeration.
   */
  const code = parseToken(activation.activation_code);
  if (code === null) return refused();

  let claim: ActivationConsumeRow | null;
  let credential: ReturnType<typeof issueSourceToken>;
  let urls: EndpointUrls;
  try {
    urls = endpointUrls(request, deps.env);

    /*
     * Minted before the exchange because the port takes the new credential's
     * selector and verifier as arguments: the database stores what the
     * application derived, and never sees the plaintext. The twenty-four losers
     * of a race each mint one too and each write nothing, which costs two HMACs
     * and is the price of the write being one statement.
     */
    credential = issueSourceToken(deps.env);

    claim = await deps.db.activationConsume({
      codeSelector: code.selector,
      codeVerifier: activationCodeVerifier(code.selector, code.secret, deps.env),
      credentialSelector: credential.selector,
      credentialVerifier: credential.verifier,
      /*
       * V1 states no credential expiry, and `credential.ts` argues the case:
       * an expiry would force a second door for credential material to reach a
       * device, in exchange for nothing the brief asks for. The column is
       * nullable so introducing one later is a policy change.
       */
      credentialExpiresAt: null,
    });
  } catch {
    /*
     * A misconfigured pepper, an unreachable database, an origin that is not a
     * URL. The caught value is dropped rather than inspected: every one of
     * these carries a message that names configuration, and `unavailable` is
     * the honest answer to all of them — nothing was stored, back off and retry.
     */
    return answer("unavailable", UNAVAILABLE_MESSAGE);
  }

  if (claim === null) return refused();

  return ok(success(claim, activation.reported_environment, credential.plaintext, urls, deps));
};

/**
 * The success body.
 *
 * Every field comes from the row the database returned or from what this
 * deployment states. Nothing is echoed from the request except
 * `reported_environment`, and that is used only to compute a boolean — the
 * authoritative environment is the source record's, because a development build
 * declaring itself production must change nothing.
 *
 * `account_id` and `project_id` are on `claim` and are read by nothing here.
 * The row carries them because the *service* needs them to build an
 * authenticated context; the response omits them because a client has no use
 * for either and learning them is a small escalation for anybody holding a
 * stolen code.
 */
function success(
  claim: ActivationConsumeRow,
  reportedEnvironment: string,
  plaintext: string,
  urls: EndpointUrls,
  deps: HandlerDeps,
): ActivationSuccess {
  /*
   * Parsed rather than cast. The column is constrained to the same four values
   * by the spine migration, so this cannot fail against a healthy database —
   * and an `as Environment` would turn the day it does into a response that
   * fails the client's own strict parse, rather than into a 503.
   */
  const environment = EnvironmentSchema.parse(claim.environment);

  return {
    /*
     * `purpose` is the operator's own record of what they issued the code for,
     * and the only thing that distinguishes a first activation from a recovery.
     * Both take the identical code path — the migration supersedes whatever was
     * active and there is simply nothing to supersede the first time — so this
     * is a label on what happened, never a branch a client selected.
     */
    status: claim.purpose === "reactivation" ? "reactivated" : "activated",
    source_id: claim.source_id,
    display_label: claim.display_label.slice(0, DISPLAY_LABEL_CEILING),
    environment,
    environment_mismatch: reportedEnvironment !== environment,
    /* The plaintext's one and only appearance. It is not held anywhere else. */
    source_token: plaintext,
    token_expires_at: null,
    ingest_url: urls.ingest,
    heartbeat_url: urls.heartbeat,
    accepted_schema_versions: ACCEPTED_SCHEMA_VERSIONS,
    limits: STATED_LIMITS,
    config_refresh_after: new Date(deps.now().getTime() + CONFIG_REFRESH_MS).toISOString(),
  };
}
