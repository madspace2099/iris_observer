import { redirect } from "next/navigation";

import { dynamicRoute } from "@/lib/href";
import { presetFrom, withPeriod } from "@/lib/period";
import { HOME_SEGMENT } from "@/lib/routes";

/**
 * THE BARE PROJECT URL, WHICH USED TO BE A 404.
 *
 * A project had a layout and no page, so `/alpha/northgate` rendered the whole
 * shell around nothing and Next answered with a not-found. The approved
 * design's own first navigation item pointed here, which is how the defect was
 * found: the flagship screen's first tab was broken on every project.
 *
 * It is a redirect rather than a screen, because there is nothing here that is
 * not already the home segment. Two pages answering one question is how they
 * drift apart.
 *
 * ## The period survives the hop
 *
 * A reader who was reading the last 28 days and followed a link to the bare
 * project URL must still be reading the last 28 days when they arrive. A
 * redirect that drops the query silently returns them to the quarter and lets
 * them compare two screens that measured different spans — a defect this
 * codebase has already fixed twice, and one a redirect is a particularly quiet
 * place to reintroduce.
 *
 * ## No guard here, and why that is not an omission
 *
 * The project layout runs first and has already refused anybody who may not
 * open this project, rendering forbidden and missing identically. This page
 * resolves nothing and reads nothing, so there is nothing here to protect: the
 * destination enforces its own surface, as every surface does.
 */
export default async function ProjectRoot({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { tenantSlug, projectSlug } = await params;
  const period = presetFrom((await searchParams).period);
  redirect(dynamicRoute(withPeriod(`/${tenantSlug}/${projectSlug}/${HOME_SEGMENT}`, period)));
}
