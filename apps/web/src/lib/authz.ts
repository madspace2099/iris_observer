import "server-only";

import { redirect } from "next/navigation";
import type { Role } from "@observer/metrics";
import type { Viewer } from "@observer/readmodels";
import { SURFACES } from "./routes";
import { dynamicRoute } from "./href";

/**
 * Route authorisation, enforced on the server.
 *
 * `SURFACES` declared which roles may open which screen, and nothing read it
 * except the navigation builder. A sales agent who typed
 * `/alpha/northgate/agents` was shown the whole identifiable team comparison,
 * because hiding a link is a layout decision and not an access control.
 *
 * Every project surface calls `requireSurface` before it reads anything.
 */

/**
 * Sends a reader who may not open this surface back to their briefing.
 *
 * A redirect rather than `notFound()`. The layout has already begun streaming
 * by the time a page body runs, so the 404 arrived as a blank document with a
 * 200 status — technically a refusal, and indistinguishable from a broken page.
 * A redirect lands the reader somewhere real and still never renders the screen.
 *
 * It discloses nothing: every role that reaches this point holds the project,
 * so the only fact revealed is one they already had.
 */
export function requireSurface(viewer: Viewer, key: string, root: string): void {
  const surface = SURFACES.find((s) => s.route.endsWith(`/${key}`));
  if (surface === undefined) return;
  if (!surface.requiresRole.includes(viewer.role)) redirect(dynamicRoute(`${root}/showroom`));
}

/**
 * Whether this role may see colleagues named beside one another.
 *
 * The product's own promise, made on the sign-in screen: an agent gets their
 * own patterns, their briefs and their follow-ups, and **no league table**. A
 * comparison that names Monika beside Akhilesh is a performance ranking however
 * it is captioned, and it is not a sales agent's to read.
 *
 * Aggregate, unnamed team figures are a different thing and stay permitted —
 * "you spend 2.2× the team's share of time in Shortlist" names nobody.
 */
export function mayCompareNamedColleagues(role: Role): boolean {
  return role === "developer" || role === "agency_manager" || role === "madspace_admin";
}

/**
 * The developers a viewer holds, for the portfolio switch.
 *
 * An agency manager works for more than one, and the shell offered no way to
 * move between them — the access existed and the navigation did not, so the
 * only route was typing a URL. Never aggregated: two developers are two
 * businesses, and one combined view would leak each to the other.
 */
export function holdsMultipleTenants(viewer: Viewer): boolean {
  return viewer.tenantIds.length > 1;
}
