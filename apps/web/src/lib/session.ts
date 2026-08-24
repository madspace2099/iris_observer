import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Viewer } from "@observer/readmodels";
import { VIEWERS, viewerByKey, type ViewerKey } from "@observer/synthetic";

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
 * What it gives up is server-side revocation. Signing out clears the cookie,
 * and the token expires on its own, but a copy taken beforehand stays valid
 * until then. That is a real limitation of a stateless token and is recorded in
 * ADR-0022 rather than glossed over — a scenario selector over synthetic data
 * can carry it; production authentication cannot, and will not be built on this.
 */
export function createSession(viewerKey: ViewerKey): string {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const nonce = randomUUID().replace(/-/g, "").slice(0, 16);
  const payload = `${viewerKey}.${expiresAt}.${nonce}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * Sign-out.
 *
 * There is no table to delete from. The caller clears the cookie; this exists
 * so the call site reads the same as it will once real sessions are revocable,
 * and so replacing this adapter stays a change to one file.
 */
export function destroySession(id: string | undefined): void {
  void id;
}

/**
 * Resolves a token to a viewer.
 *
 * Returns null for anything this server did not sign, for anything expired, and
 * for anything malformed. The signature is compared in constant time, so the
 * comparison cannot be used to guess a valid one byte at a time.
 */
export function resolveSession(token: string | undefined): Viewer | null {
  if (token === undefined) return null;

  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [viewerKey, expiresAt, nonce, signature] = parts as [string, string, string, string];

  const expected = sign(`${viewerKey}.${expiresAt}.${nonce}`);
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) return null;

  return viewerByKey(viewerKey) ?? null;
}

export async function currentViewer(): Promise<Viewer | null> {
  const store = await cookies();
  return resolveSession(store.get(SESSION_COOKIE)?.value);
}

/** Every authenticated screen starts here. There is no unauthenticated read. */
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

export const SIGN_IN_OPTIONS: readonly { key: ViewerKey; viewer: Viewer; blurb: string }[] = [
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
    blurb: "Runs the meetings. Gets briefs and follow-ups, and no league table.",
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

export function isKnownViewerKey(value: string): value is ViewerKey {
  return SIGN_IN_OPTIONS.some((option) => option.key === value);
}
