import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Viewer } from "@observer/readmodels";
import { VIEWERS, type ViewerKey } from "@observer/synthetic";
import { accountById, viewerForAccount, type Account } from "@/lib/accounts";

/**
 * The scenario session adapter.
 *
 * **This is not production authentication and must not be described as such.**
 * There is no identity provider, no password, no second factor and no account
 * lifecycle. What it does provide is the *shape* those things will plug into:
 * a server-issued session, an opaque cookie, expiry, sign-out, and a single
 * `requireViewer()` that every screen goes through.
 *
 * The security property it does hold, and the one that matters while the data
 * is synthetic, is that **the browser cannot grant itself a tenant or a role**.
 * An earlier version stored the viewer key in the cookie in plain text, so
 * anybody could become a MADSPACE administrator by editing one string. The
 * cookie now carries a signed token: the key is visible, and altering it breaks
 * the signature.
 *
 * Replacing this adapter means replacing this file. Nothing above it changes.
 */

export const SESSION_COOKIE = "observer_session";

/**
 * Re-exported for discoverability beside `SESSION_COOKIE` — this is the other
 * cookie the product carries. The actual constant lives in `cookie-names.ts`,
 * a file with no import in it, because `middleware.ts` (Edge runtime) and this
 * file (`node:crypto`, Node-only) cannot safely import from each other, and
 * both need the name.
 */
export { LAST_PROJECT_COOKIE } from "./cookie-names";

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

/**
 * The signing secret.
 *
 * `OBSERVER_SESSION_SECRET` when it is set. Otherwise a value derived from the
 * deployment id, which is **not secret** — and that is stated rather than
 * hidden, because of what a forged token would actually buy: the ability to
 * pick a profile from a screen where every profile is already freely
 * selectable, over data that is entirely synthetic.
 *
 * Real authentication is a pre-production gate (`docs/11-preproduction-gates.md`).
 * Until it lands, signing is defence in depth against a *shape* of mistake, not
 * protection of anything.
 */
function signingSecret(): string {
  const configured = process.env["OBSERVER_SESSION_SECRET"];
  if (configured !== undefined && configured.length > 0) return configured;
  return `observer-dev.${process.env["VERCEL_DEPLOYMENT_ID"] ?? process.env["VERCEL_GIT_COMMIT_SHA"] ?? "local"}`;
}

function sign(payload: string): string {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

/**
 * Mints a session token.
 *
 * **Stateless, and it has to be.** An earlier version kept a Map of session ids
 * on the server. That worked on one process and failed completely on Vercel:
 * every request can land on a different lambda instance, so the session created
 * by the sign-in action was invisible to the next page load and to `/api/ask` —
 * which is why Ask Observer answered "could not reach its analysis layer".
 *
 * The token carries the viewer key and an expiry, signed with HMAC-SHA256. It
 * still holds the property that matters: **the browser cannot grant itself a
 * role**, because editing the key invalidates the signature.
 *
 * Being stateless still means no server-side record of an issued token by
 * default — `destroySession` below adds a narrow, explicit exception (a
 * revoked nonce, held only until its token would have expired anyway, only on
 * the instance that saw the sign-out) rather than reintroducing the session
 * table this replaced. That exception does not survive a redeploy or reach a
 * different warm instance; recorded plainly in ADR-0022 rather than glossed
 * over — a scenario selector over synthetic data can carry that gap,
 * production authentication cannot, and will not be built on this.
 */
export function createAccountSession(accountId: string): string {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const nonce = randomUUID().replace(/-/g, "").slice(0, 16);
  const payload = `${accountId}.${expiresAt}.${nonce}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * Tokens signed out before their own expiry.
 *
 * A stateless, self-verifying token has no server-side record to delete, so a
 * copy taken before sign-out — a shared machine, a proxy log, a browser that
 * synced history mid-session — stayed valid for the rest of its 8-hour life
 * even after the legitimate holder signed out. This closes that gap the
 * cheapest way that is still real: the token's own nonce, held until it would
 * have expired anyway, so the set can never grow past one entry per
 * concurrently-live session actually signed out.
 *
 * **In-process only, and that is a real limit, not an oversight** — the same
 * one `lib/accounts.ts`'s login throttle states for the same reason. A
 * serverless deployment spreads requests across many warm instances, so a
 * revocation recorded on one instance is invisible to another: real
 * protection against the common case (the same browser, the same warm lambda,
 * signing out and the captured copy being tried moments later), no guarantee
 * against an attacker who reaches a different instance. Replacing this
 * adapter's statelessness (see the module docblock) is what closes that
 * properly; until then this is strictly better than not checking at all.
 */
const revokedNonces = new Map<string, number>();

/** Drops nonces whose token would have expired anyway — nothing to protect by keeping them. */
function pruneRevoked(now: number): void {
  for (const [nonce, expiresAt] of revokedNonces) {
    if (expiresAt <= now) revokedNonces.delete(nonce);
  }
}

/**
 * Sign-out.
 *
 * Revokes the token's own nonce for the remainder of its natural life, then
 * clears the cookie as before. Malformed input revokes nothing rather than
 * throwing: a caller signing out with an already-invalid token has nothing to
 * revoke, and sign-out must never fail.
 */
export function destroySession(token: string | undefined): void {
  if (token === undefined) return;
  const parts = token.split(".");
  if (parts.length !== 4) return;
  const [, expiresAt, nonce] = parts as [string, string, string, string];
  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry) || nonce.length === 0) return;

  const now = Date.now();
  pruneRevoked(now);
  if (expiry > now) revokedNonces.set(nonce, expiry);
}

/**
 * Resolves a token to the ACCOUNT that signed in.
 *
 * Returns null for anything this server did not sign, for anything expired, for
 * anything malformed, and for any account the directory no longer holds. The
 * signature is compared in constant time, so the comparison cannot be used to
 * guess a valid one byte at a time.
 *
 * What it deliberately does NOT return is a role. The token carries an account
 * identifier; the capacity that account holds is looked up on the server. An
 * earlier version put the viewer key in the token, which meant the only thing
 * standing between a reader and an administrator's view was a signature. Now
 * there is nothing in the cookie to promote.
 */
export function resolveSession(token: string | undefined): Account | null {
  if (token === undefined) return null;

  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [accountId, expiresAt, nonce, signature] = parts as [string, string, string, string];

  const expected = sign(`${accountId}.${expiresAt}.${nonce}`);
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) return null;

  /*
   * Signed out before its own expiry. See `destroySession` — the entry is
   * only ever this token's own nonce, deliberately revoked, on this instance.
   */
  if (revokedNonces.has(nonce)) return null;

  /*
   * A validly signed token for an account that no longer exists is not a
   * session. With the synthetic directory switched off this is every token,
   * which is the fail-closed posture the directory promises.
   */
  return accountById(accountId);
}

/** The account this request is signed in as, if any. */
export async function currentAccount(): Promise<Account | null> {
  const store = await cookies();
  return resolveSession(store.get(SESSION_COOKIE)?.value);
}

/** Every signed-in surface starts here. There is no unauthenticated read. */
export async function requireAccount(): Promise<Account> {
  const account = await currentAccount();
  if (account === null) redirect("/sign-in");
  return account;
}

/**
 * The capacity the signed-in account holds.
 *
 * Kept as the name every screen already calls, so the twelve protected pages
 * did not have to change when the account layer arrived beneath them. What
 * changed is where the answer comes from: an account, on the server, rather
 * than a key in a cookie.
 */
export async function currentViewer(): Promise<Viewer | null> {
  const account = await currentAccount();
  return account === null ? null : await viewerForAccount(account);
}

export async function requireViewer(): Promise<Viewer> {
  const viewer = await currentViewer();
  if (viewer === null) redirect("/sign-in");
  return viewer;
}

/** Cookie attributes, in one place so the sign-in and sign-out agree. */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  secure: process.env.NODE_ENV === "production",
  maxAge: SESSION_TTL_MS / 1000,
} as const;

/**
 * The design laboratory's profile list — NOT A SIGN-IN.
 *
 * It was called `SIGN_IN_OPTIONS` while a profile picker stood at `/sign-in`
 * and minting a session was what choosing one did. Neither is true: the way in
 * is `/sign-in` then `/projects`, and the only page that reads this list is
 * `/lab/sign-in`, which is internal, MADSPACE-only and renders a component
 * rather than authenticating anybody.
 *
 * The blurbs describe what each capacity sees, because a picker that says only
 * "Sales agent" makes a reader guess at the difference between the entries.
 */
export const LAB_PROFILES: readonly { key: ViewerKey; viewer: Viewer; blurb: string }[] = [
  {
    key: "developer",
    viewer: VIEWERS.developer,
    blurb: "Buys Observer. Sees every project in their own portfolio, and no one else's.",
  },
  {
    key: "agencyManager",
    viewer: VIEWERS.agencyManager,
    blurb:
      "Sells for two competing developers. Sees each project separately, never the two together.",
  },
  {
    key: "salesAgent",
    viewer: VIEWERS.salesAgent,
    blurb: "Runs the meetings. Sees their own project's team, and no other project.",
  },
  {
    key: "madspace",
    viewer: VIEWERS.madspace,
    blurb: "MADSPACE operations. Administration is a separate surface, not a nav item.",
  },
];

/**
 * The viewer behind a sign-in option.
 *
 * Exists so surfaces outside the session flow — the design laboratory — can
 * name a role without importing the synthetic package and stepping around the
 * composition root (ADR-0007).
 */
export function viewerFor(key: ViewerKey): Viewer {
  return VIEWERS[key];
}

/** Used by the design laboratory, which renders a viewer without a session. */
export function isKnownViewerKey(value: string): value is ViewerKey {
  return LAB_PROFILES.some((option) => option.key === value);
}
