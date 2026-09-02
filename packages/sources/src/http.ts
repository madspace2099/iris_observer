import {
  OBSERVER_ROUTES,
  REQUEST_FAILURES,
  type RequestFailureCode,
  type RequestFailureBody,
} from "@observer/contracts/ue5";

import type { ObserverDb } from "./db";
import type { EnvSource } from "./secrets";

/**
 * What the three Observer endpoints share, so that they cannot disagree.
 *
 * ## Why this is not three files
 *
 * Activation, ingestion and heartbeat differ in almost everything they do and
 * agree on everything a client can observe when they refuse: the status code,
 * the body shape, which header carries a credential, and — the one that matters
 * most — the fact that `401` and `403` mean different things and must never be
 * collapsed into each other.
 *
 * Written three times, that agreement lasts until the first hurried fix. The
 * `409 already_activated` that `PD-27` removed got in exactly that way: one
 * endpoint grew a convenience the others did not have, and it leaked the
 * existence of a source to anybody holding a spent code.
 *
 * ## The handler shape, and why it is a plain function
 *
 * A handler is `(Request, HandlerDeps) => Promise<Response>` — the Fetch types,
 * not Next's, and not a framework's. Three things follow from that, and all
 * three were the point:
 *
 *   - `apps/web` route files become four lines that build the production deps
 *     and delegate, so there is no logic living in a place tests cannot reach;
 *   - the end-to-end proof can call the same function with a PGlite-backed
 *     `ObserverDb` and a real `Request`, and get a real `Response` with real
 *     status codes and headers, without a listening socket;
 *   - a socket-level test can still bind these to `node:http` when it wants to
 *     prove the wire itself, which `packages/ue5-mock` already does.
 *
 * `deps` is explicit rather than imported because the alternative is a module
 * that reads `process.env` at import time, which is untestable and, on a
 * serverless platform, evaluated at a moment nobody chose.
 */

/* --- what a handler is given --------------------------------------------------- */

/**
 * The clock, injected.
 *
 * Not decoration: activation codes expire, heartbeats record `last_seen_at`,
 * and a test that has to sleep to prove an expiry is a test that will one day
 * fail on a loaded machine. The production deps pass `() => new Date()`.
 */
export type Clock = () => Date;

/**
 * A rate-limit decision, kept as a hook rather than an implementation.
 *
 * The repository already has a shared ceiling in `apps/web/src/lib/ai` backed by
 * Postgres counters (ADR-0028), and activation is the endpoint that most needs
 * one — an unauthenticated route that reveals nothing is still a route somebody
 * can enumerate. Wiring that ceiling in is a separate piece of work with its own
 * migration; what belongs here is the seam, so the endpoint is written against
 * it now rather than retrofitted around it later.
 *
 * Returning a positive number means refuse with `rate_limited` and that many
 * seconds of `Retry-After`. Returning null means allow.
 */
export type RateLimitHook = (request: Request, route: string) => Promise<number | null>;

export interface HandlerDeps {
  readonly db: ObserverDb;
  readonly env: EnvSource;
  readonly now: Clock;
  readonly rateLimit?: RateLimitHook;
}

export type Handler = (request: Request, deps: HandlerDeps) => Promise<Response>;

/* --- the authenticated source ---------------------------------------------------- */

/**
 * Who is calling, derived entirely from the presented credential.
 *
 * Every field here comes from the database row the credential resolved to. None
 * of it can be influenced by the request body, and that is the whole security
 * property: a payload may contain `project_id`, `tenant_id` or `source_id` and
 * they are inert, because nothing reads them and there is no code path from a
 * payload value to this object.
 *
 * `environment` is the **registered** environment of the source. A client's
 * reported environment is carried separately as provenance and never reaches
 * here — a development build declaring itself production must change nothing.
 */
export interface SourceContext {
  readonly sourceId: string;
  readonly accountId: string;
  readonly projectId: string;
  readonly environment: string;
  readonly displayLabel: string;
}

/* --- refusing --------------------------------------------------------------------- */

const FAILURE_BY_CODE = new Map(REQUEST_FAILURES.map((d) => [d.code, d]));

/**
 * Build a whole-request refusal.
 *
 * The HTTP status is **looked up**, never passed in. Every request-level code
 * already carries its status in `REQUEST_FAILURES`, and letting a caller supply
 * one is how `unauthorised` eventually gets answered with a 403 somewhere: the
 * client's outbox policy keys off the code, its sending policy keys off the
 * status, and a pair that disagrees produces a client that stops sending for a
 * reason it will not report.
 *
 * `retry_after_seconds` is populated for `rate_limited` alone, and mirrored into
 * the header, because a client that has to parse the body to learn how long to
 * wait cannot back off correctly when the body is the thing that failed.
 */
export function failure(
  code: RequestFailureCode,
  message: string,
  options: {
    readonly batchId?: string | null;
    readonly retryAfterSeconds?: number | null;
  } = {},
): Response {
  const definition = FAILURE_BY_CODE.get(code);
  /* istanbul ignore next — unreachable while the code is typed against the enum. */
  if (definition === undefined) throw new Error(`unknown request failure code: ${code}`);

  const retryAfter = code === "rate_limited" ? (options.retryAfterSeconds ?? 60) : null;

  const body: RequestFailureBody = {
    code,
    /*
     * Truncated to the schema's ceiling here rather than trusted from the call
     * site. A message is the one field a caller composes freely, and the schema
     * would reject an over-long one at generation time while a handler would
     * happily send it.
     */
    message: message.slice(0, 300),
    batch_id: options.batchId ?? null,
    retry_after_seconds: retryAfter,
  };

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (retryAfter !== null) headers["retry-after"] = String(retryAfter);

  return new Response(JSON.stringify(body), { status: definition.httpStatus, headers });
}

/** A 2xx answer. Separate from {@link failure} so a success can never carry a failure body. */
export function ok(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/* --- reading the request ----------------------------------------------------------- */

/**
 * The presented bearer credential, or null.
 *
 * Strict on purpose. `Bearer` with exactly one space, and the scheme compared
 * case-insensitively because RFC 7235 says it is, while the token itself is
 * taken verbatim — lower-casing a token would silently break a credential whose
 * selector happens to contain an uppercase character.
 *
 * Every rejection here becomes an indistinguishable `401`. A malformed header
 * and an unknown credential must not be separable, or the difference becomes an
 * oracle for whether a selector exists.
 */
export function presentedCredential(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header === null) return null;
  /*
   * `?? null` rather than an assertion. The capture group cannot be absent when
   * the pattern matched, but `noUncheckedIndexedAccess` is right to insist the
   * compiler cannot know that, and a non-null assertion here would be the one
   * place in this file where a malformed header could throw instead of becoming
   * an indistinguishable 401.
   */
  return /^Bearer (\S+)$/i.exec(header.trim())?.[1] ?? null;
}

/**
 * The request body, refused before it is held if it exceeds the ceiling.
 *
 * Order matters and this is the first step of the documented validation order:
 * the byte ceiling is checked before the JSON parser ever sees the input, so a
 * hostile 100 MiB body costs a header read rather than a parse.
 *
 * `Content-Length` is a claim, not a fact, so the stream is counted as it
 * arrives and the ceiling is enforced on what actually turned up. A body that
 * lies low and then keeps coming is cut off at the same limit.
 */
export async function bodyWithinCeiling(
  request: Request,
  maxBytes: number,
): Promise<{ readonly ok: true; readonly text: string } | { readonly ok: false }> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const claimed = Number(declared);
    if (Number.isFinite(claimed) && claimed > maxBytes) return { ok: false };
  }

  const body = request.body;
  if (body === null) return { ok: true, text: "" };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { ok: false };
    }
    chunks.push(value);
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(joined) };
}

/**
 * Refuse anything that is not a POST.
 *
 * All three routes are POST-only. A GET reaching an ingestion endpoint is a
 * misconfiguration rather than an attack, but answering it with anything other
 * than a refusal invites a proxy to cache a route that must never be cached.
 */
export function requirePost(request: Request): Response | null {
  if (request.method === "POST") return null;
  return failure("malformed_request", "This route accepts POST only.");
}

/** The absolute paths, re-exported so an adapter has one import rather than two. */
export { OBSERVER_ROUTES };
