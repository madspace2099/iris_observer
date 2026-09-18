import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";

import { requireViewer } from "@/lib/session";
import { localControlPlaneEnabled } from "@/lib/sources/local-db";

export const metadata: Metadata = { title: "Design lab" };

/**
 * THE DESIGN LAB. DEVELOPMENT ONLY, AND OUTSIDE THE PRODUCT SHELL.
 *
 * Three visual directions for one screen, so a direction can be chosen by
 * looking rather than by describing. `docs/12-visual-autopsy.md` §5 sets the
 * order for visual work: audit, direction, isolated flagship prototype, visual
 * review, user selection, rollout. The previous pass went from audit straight to
 * rollout across six screens, which is the step this route exists to put back.
 *
 * ## Why it has its own layout
 *
 * It sits at the top level, NOT under /madspace, and that is the whole reason
 * for its path. A route nested under `/madspace` inherits that layout, and two
 * of the three directions then had to reach out of their own stylesheets to
 * hide a header they were proposing to replace. Moving the route removed the
 * need, and it removed an unfairness: one variant had escaped the shell and one
 * had not, so the reviewer would have been comparing a chrome difference
 * neither variant intended.
 *
 * It deliberately does NOT sit inside the MADSPACE shell. Two of the three
 * directions change the chrome itself: one keeps the frame dark, one turns the
 * whole surface to paper. A prototype rendered inside the chrome it is
 * proposing to replace can only ever show the middle of a screen, and the
 * relationship between the frame and the workspace is one of the things being
 * chosen.
 *
 * So each variant owns the whole viewport, and this layout carries nothing but
 * the gate.
 *
 * ## How it stays out of production
 *
 * `localControlPlaneEnabled()` requires a non-production `NODE_ENV` and an
 * explicit environment variable, and the role check is repeated here rather
 * than inherited: a layout is not a security boundary, because Next may render
 * a page without re-running an ancestor layout.
 *
 * `notFound()` rather than a message. A deployment should not have a route here
 * that explains itself; it should not have a route here.
 */
export default async function DesignLabLayout({ children }: { children: ReactNode }) {
  if (!localControlPlaneEnabled()) notFound();

  const viewer = await requireViewer();
  if (viewer.role !== "madspace_admin") redirect("/");

  return children;
}
