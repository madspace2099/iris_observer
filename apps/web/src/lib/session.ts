import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Viewer } from "@observer/readmodels";
import { VIEWERS, viewerByKey, type ViewerKey } from "@observer/synthetic";

/**
 * Session handling.
 *
 * The structure is real — a signed-in identity, a session cookie, a redirect
 * when it is absent, and a sign-out — while the identity provider is not yet
 * connected. Screens call `requireViewer()` and are already written against
 * the shape they will have once authentication is wired up; nothing about them
 * changes when it is.
 */
export const SESSION_COOKIE = "observer_session";

export async function currentViewer(): Promise<Viewer | null> {
  const store = await cookies();
  const key = store.get(SESSION_COOKIE)?.value;
  if (key === undefined) return null;
  return viewerByKey(key) ?? null;
}

/** Every authenticated screen starts here. There is no unauthenticated read. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await currentViewer();
  if (viewer === null) redirect("/sign-in");
  return viewer;
}

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
