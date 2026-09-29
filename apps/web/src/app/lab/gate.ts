import { notFound, redirect } from "next/navigation";

import { requireViewer } from "@/lib/session";
import { localControlPlaneEnabled } from "@/lib/sources/local-db";

/**
 * The laboratory's gate: the one `/design-lab` has, for the same reason.
 *
 * `/lab` rendered on every deployment, without a session, and said of itself
 * that it held internal working drawings (measured on the production address,
 * 2026-09-29). A deployment should not have a route here at all, so it answers
 * `notFound()` unless `localControlPlaneEnabled()`, and a signed-in account
 * that is not MADSPACE goes home. Called by the layout and again by every page,
 * because a layout is not a security boundary: Next may render a page without
 * re-running an ancestor layout.
 */
export async function labGate(): Promise<void> {
  if (!localControlPlaneEnabled()) notFound();
  const viewer = await requireViewer();
  if (viewer.role !== "madspace_admin") redirect("/");
}
