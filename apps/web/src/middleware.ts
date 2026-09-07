import { NextResponse, type NextRequest } from "next/server";

import { LAST_PROJECT_COOKIE } from "@/lib/cookie-names";

/**
 * REMEMBERING WHERE A READER WAS, SO SIGN-IN CAN OPEN THERE AGAIN.
 *
 * The one piece of state this application had never carried. Every server
 * component in `apps/web/src/app` is either stateless or reads the session
 * cookie `requireViewer` already sets — and neither can WRITE a cookie during
 * a normal page render, which Next.js reserves for Server Actions, Route
 * Handlers and middleware. "Which project was the reader last in" is
 * discovered from the URL on every navigation, not from a decision anybody
 * makes, so middleware — the one place that sees every request before a page
 * renders — is the only correct place to record it.
 *
 * ## What this does and does not know
 *
 * It reads two path segments and nothing else: no session, no viewer, no
 * repository call. `resolveLandingPath` (`lib/landing.ts`) is what turns the
 * recorded slugs back into a real destination, and it RE-VALIDATES them
 * against the signed-in account's actual grants before ever redirecting
 * anywhere — this file cannot tell a real project from a typo, and does not
 * try to.
 *
 * ## The matcher is a denylist of known non-project prefixes, not an allowlist
 *
 * Every project route is `/{tenantSlug}/{projectSlug}/...`, and tenant slugs
 * are data (`alpha`, `beta`, and whatever MADSPACE creates next) — there is no
 * fixed set of them to allow-list. So this excludes the paths that are
 * DEFINITELY not a project (sign-in, the account layer, MADSPACE, the design
 * labs, framework internals) and treats anything else with at least two
 * segments as a candidate. A path that turns out not to be a real project
 * costs one wasted cookie write; `resolveLandingPath` refuses to use it.
 */
const EXCLUDED =
  /^\/(sign-in|projects|settings|madspace|design-lab|lab|iris|api|_next|favicon\.ico|brand)(\/|$)/;

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  if (EXCLUDED.test(pathname)) return response;

  const [, tenantSlug, projectSlug] = pathname.split("/");
  if (tenantSlug === undefined || projectSlug === undefined || projectSlug === "") return response;

  response.cookies.set(LAST_PROJECT_COOKIE, `${tenantSlug}/${projectSlug}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    // A season, not a session — this should outlive a browser restart, which
    // is the whole point of remembering it, but not outlive genuine disuse.
    maxAge: 60 * 60 * 24 * 90,
  });
  return response;
}

export const config = {
  /*
   * Every request except the framework's own internals and static files —
   * matched broadly on purpose, because the exclusion above already does the
   * real filtering and a matcher that also tried to enumerate project routes
   * would be the same allowlist problem twice.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
