import "server-only";

import { redirect } from "next/navigation";
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

/*
 * WHERE `mayCompareNamedColleagues` USED TO BE.
 *
 * It answered false for a sales agent. It was the written form of a rule the
 * three enforcement points stated for themselves — the route, the read model
 * and the comparison tool each carried their own role check rather than calling
 * this — so it documented the doctrine without guarding anything.
 *
 * ADR-0029 reversed the rule: the boundary is the project, not the role, and
 * the project grant is checked before any of those three is reached, by
 * `requireSurface` above and by the repository's project context.
 *
 * A predicate that can only answer true is not a control, so it was removed
 * rather than left returning one. What it protected is protected still, one
 * layer down and by the check that was always doing the work.
 *
 * Two things ADR-0029 did not open, recorded here because this is where a
 * reader will look for them: nothing belonging to another project, at any
 * scope; and not the IRIS rating, account administration, credentials, billing
 * or a buyer's personal data, none of which is a colleague's working figure.
 */

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
