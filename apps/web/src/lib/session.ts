import { randomUUID } from "node:crypto";
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
 * An earlier version stored the viewer key in the cookie, so anybody could
 * become a MADSPACE administrator by editing one string. Now the cookie holds
 * an opaque identifier that means nothing outside the server's own table.
 *
 * Replacing this adapter means replacing this file. Nothing above it changes.
 */

export const SESSION_COOKIE = "observer_session";

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

interface SessionRecord {
  readonly viewerKey: ViewerKey;
  readonly createdAt: number;
  readonly expiresAt: number;
}

/**
 * Server-side session table.
 *
 * In memory, which is correct for a scenario adapter and wrong for production:
 * it does not survive a restart and does not span instances. Both are
 * deliberate, because a durable store here would be the beginning of an
 * authentication system nobody reviewed.
 */
const sessions = new Map<string, SessionRecord>();

function purgeExpired(now: number): void {
  for (const [id, record] of sessions) {
    if (record.expiresAt <= now) sessions.delete(id);
  }
}

/** Mints an opaque session. The returned value is the only thing the browser sees. */
export function createSession(viewerKey: ViewerKey): string {
  const now = Date.now();
  purgeExpired(now);
  const id = `obs_${randomUUID().replace(/-/g, "")}`;
  sessions.set(id, { viewerKey, createdAt: now, expiresAt: now + SESSION_TTL_MS });
  return id;
}

export function destroySession(id: string | undefined): void {
  if (id !== undefined) sessions.delete(id);
}

/**
 * Resolves a session identifier to a viewer.
 *
 * Returns null for anything the server did not issue, including a well-formed
 * guess and a value that used to be valid. The lookup never falls back to
 * interpreting the cookie's contents.
 */
export function resolveSession(id: string | undefined): Viewer | null {
  if (id === undefined) return null;
  const record = sessions.get(id);
  if (record === undefined) return null;
  if (record.expiresAt <= Date.now()) {
    sessions.delete(id);
    return null;
  }
  return viewerByKey(record.viewerKey) ?? null;
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

export function isKnownViewerKey(value: string): value is ViewerKey {
  return SIGN_IN_OPTIONS.some((option) => option.key === value);
}
