import { failure, presentedCredential, type HandlerDeps, type SourceContext } from "./http";
import { parseToken, verifySecret } from "./secrets";

/**
 * THE AUTHENTICATION BOUNDARY — the one place a presented credential becomes a
 * source, for every endpoint that has one.
 *
 * ## Why ingestion and heartbeat share this rather than each doing it
 *
 * The two endpoints agree on nothing except who is allowed to call them, and
 * that agreement is the part an attacker probes. Written twice it survives until
 * the first hurried fix — and the fix that breaks it is never "authenticate
 * differently", it is a helpful extra: a message saying the credential expired,
 * a 403 on a source that no longer exists, a body field naming the selector that
 * was not found. Each of those is individually reasonable and each turns a
 * refusal into an answer to a question the caller was not entitled to ask.
 *
 * So there is one function, it returns either a context or a finished
 * `Response`, and the caller cannot reshape the refusal because it is handed one
 * already built.
 *
 * ## The two properties this file exists to defend
 *
 * **One:** every 401 is byte-identical. Absent header, malformed token, unknown
 * selector, wrong secret, superseded credential, revoked credential, expired
 * credential and archived source all produce the same status, the same code and
 * the same message, with nothing derived from the request inside it. A caller
 * holding a stolen or guessed token learns exactly one bit — "no" — and cannot
 * walk the selector space looking for the one that answers differently.
 *
 * **Two:** 401 and 403 are never collapsed, in either direction. They mean
 * different things to the operator on the other end — a suspended source is
 * resumed, a refused credential is reactivated — and `REQUEST_FAILURES` records
 * that distinction as policy. Collapsing them one way sends the operator down
 * the wrong path; collapsing them the other way is the leak above.
 *
 * ## Why a `SourceContext` and not the row
 *
 * The context is built from the resolved row's fields alone. Nothing that
 * arrived in the request body can reach it, because there is no code path from a
 * payload to this object — a batch carrying `tenant_id`, `project_id` or
 * `source_id` is inert here, not because those fields are stripped but because
 * nothing reads them. That is a stronger guarantee than validation, and it is
 * also why the row is never passed onwards whole: a caller holding a
 * `CredentialResolveRow` is holding the stored verifier.
 */

export type AuthOutcome =
  | { readonly ok: true; readonly context: SourceContext }
  | { readonly ok: false; readonly response: Response };

/**
 * The single refusal message, for every one of the eight ways to fail.
 *
 * Deliberately says nothing about which way. It names no selector, no source, no
 * state and no expiry, because each of those is the difference between a refusal
 * and an oracle. The client's own policy for `unauthorised` — retain the events,
 * stop sending, tell the operator — keys off the code and needs nothing more
 * from this string.
 */
const UNAUTHORISED_MESSAGE = "The presented credential was not accepted.";

/**
 * The suspension message, which may be specific *because* the caller has already
 * proved they hold this source's credential.
 *
 * Everything a 403 reveals — that the source exists, and that it is suspended —
 * is something the holder of a valid credential is entitled to know, and telling
 * them is what turns a stopped plugin into an operator action rather than a
 * support ticket.
 */
const SUSPENDED_MESSAGE =
  "This source is suspended. An operator must resume it before it can send.";

/**
 * The verifier an unknown selector is checked against.
 *
 * A lookup that misses has nothing to compare, so the obvious code returns
 * early — and an early return is a measurably faster answer than a full HMAC
 * plus a constant-time compare. That difference is precisely the oracle the
 * indistinguishable 401 was built to close: an attacker who cannot read the body
 * can still read the clock, and "this selector exists" is the one bit that makes
 * guessing the secret worth attempting.
 *
 * So a miss verifies against this instead. It is 64 hex characters, the width of
 * a real verifier, so `constantTimeEquals` takes its equal-length branch and the
 * presented secret still costs a full HMAC. Nothing can match it without a
 * preimage of SHA-256.
 *
 * It is exported so a test can assert this path was taken, rather than inferring
 * it from a timing measurement that would be flaky by construction. Publishing
 * it costs nothing: it is a value no credential can ever have.
 */
export const DECOY_VERIFIER = "deadbeef".repeat(8);

/** Built fresh each time, because a `Response` body may be read only once. */
function unauthorised(): Response {
  return failure("unauthorised", UNAUTHORISED_MESSAGE);
}

/**
 * Resolve a request to the source it is entitled to act as.
 *
 * The order below is the order the checks have to happen in, and each step that
 * could return early without doing the work of the step after it has been
 * written not to.
 */
export async function authenticateSource(
  request: Request,
  deps: HandlerDeps,
): Promise<AuthOutcome> {
  const presented = presentedCredential(request);
  if (presented === null) return { ok: false, response: unauthorised() };

  /*
   * A malformed token stops here, and unlike an unknown selector it stops
   * without a decoy. Nothing leaks by answering quickly: the caller composed the
   * malformed value themselves and learns only what they already knew. What
   * matters is that the body is identical to every other refusal, so the shape
   * of the answer still says nothing.
   */
  const parsed = parseToken(presented);
  if (parsed === null) return { ok: false, response: unauthorised() };

  const row = await deps.db.credentialResolve(parsed.selector);

  /*
   * THE VERIFICATION HAPPENS WHETHER OR NOT THE SELECTOR RESOLVED, and the two
   * branches join afterwards. Written as one call rather than as a comparison
   * nested inside `if (row !== null)`, because the nested version is one refactor
   * away from somebody deciding the decoy comparison is pointless and deleting
   * it — at which point the timing oracle is back and no test fails.
   *
   * `verifySecret` is the only comparison in this file. It re-derives the HMAC
   * from the presented secret and compares with `timingSafeEqual`; an `===` here
   * would leak the stored verifier a byte at a time, through timing, to a caller
   * who is allowed to retry.
   */
  const verified = verifySecret(
    "source_token",
    parsed.selector,
    parsed.secret,
    row?.verifier ?? DECOY_VERIFIER,
    deps.env,
  );
  if (row === null || !verified) return { ok: false, response: unauthorised() };

  /*
   * `superseded` and `revoked` are both plain refusals. A rotated credential is
   * not a lesser failure than a stolen one — the source has a *different* live
   * credential, and distinguishing the two would tell whoever holds this one
   * that rotation happened and that the source is worth attacking again.
   */
  if (row.credential_state !== "active") return { ok: false, response: unauthorised() };

  /*
   * A NULL EXPIRY MEANS NO EXPIRY — the approved V1 policy, written as an
   * explicit branch rather than as a comparison against a default. The
   * natural-looking `Date.parse(row.expires_at ?? "") <= now` treats an absent
   * expiry as `NaN`, and a `NaN` comparison is false in a way that happens to be
   * correct here and stops being correct the moment somebody inverts the
   * condition. Every credential minted without an expiry would then be refused,
   * everywhere, at once.
   *
   * An unreadable expiry fails closed. The facade formats this column, so a
   * value `Date.parse` cannot read means the row is not what this code believes
   * it is, and proceeding on a row it cannot read is the wrong instinct at an
   * authentication boundary.
   */
  if (row.expires_at !== null) {
    const expiresAt = Date.parse(row.expires_at);
    if (!Number.isFinite(expiresAt)) return { ok: false, response: unauthorised() };
    /* `<=`, because a credential is not valid during the instant it expires. */
    if (expiresAt <= deps.now().getTime()) return { ok: false, response: unauthorised() };
  }

  switch (row.source_state) {
    case "active":
      break;

    case "suspended":
      return { ok: false, response: failure("source_suspended", SUSPENDED_MESSAGE) };

    /*
     * ARCHIVED IS A 401, NOT A 403, and the asymmetry with `suspended` is the
     * decision rather than an oversight.
     *
     * Suspension is reversible; archival is terminal by construction.
     * `observer_source_set_state` refuses to move a source out of `archived` and
     * `observer_activation_issue` refuses to credential one, so the operator
     * action a 403 exists to prompt does not exist here — there is nothing to
     * resume, and the honest instruction is to create a new source, which is a
     * new identity and a new activation.
     *
     * That leaves only the cost. A 403 would confirm to whoever holds this token
     * that the source was real and that the credential verified, which is
     * exactly what the 401 on an unknown selector refuses to say. An operator
     * who archives a source means it to stop existing as far as the network is
     * concerned, so it answers like a source that never existed.
     *
     * `default` shares the branch deliberately: a state this code does not know
     * — added by a later migration, or corrupt — is refused rather than allowed,
     * because the alternative is a new state that silently authenticates until
     * somebody notices.
     */
    case "archived":
    default:
      return { ok: false, response: unauthorised() };
  }

  return {
    ok: true,
    context: {
      sourceId: row.source_id,
      accountId: row.account_id,
      projectId: row.project_id,
      environment: row.environment,
      displayLabel: row.display_label,
    },
  };
}
