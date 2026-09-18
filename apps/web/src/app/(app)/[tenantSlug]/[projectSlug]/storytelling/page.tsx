import { permanentRedirect } from "next/navigation";

import { dynamicRoute } from "@/lib/href";
import { presetFrom, withPeriod } from "@/lib/period";

/**
 * STORYTELLING IS NOW FEATURES.
 *
 * The analysis did not change and the route did not go away; the name did. What
 * this screen measures is which FEATURES of a building carry a buyer's
 * attention and which are opened and abandoned, and "Storytelling" described
 * the presentation rather than the subject.
 *
 * ## Why a redirect and not a deletion
 *
 * `reference-parity.test.ts` asserts that every route the reference served is
 * still served, and this is one of them. A redirect still serves it — which is
 * the point rather than a way around the test: the row a reader used yesterday,
 * the link in somebody's notes and the bookmark on a showroom PC all still lead
 * somewhere real, and they lead to the screen that answers the same question.
 *
 * `permanentRedirect` rather than `redirect`, because this is a rename and not
 * a temporary diversion: a 308 lets a browser and a crawler stop asking.
 *
 * ## The period survives the rename
 *
 * A reader reading the last 28 days must still be reading the last 28 days when
 * they land on Features. A redirect is a quiet place to drop a query parameter
 * and a quiet place for two screens to start measuring different spans.
 *
 * ## No guard, and why that is not an omission
 *
 * The project layout has already refused anybody who may not open this project.
 * This file resolves nothing and reads nothing; `requireSurface` runs on the
 * destination, as it does on every surface.
 */
export default async function StorytellingPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { tenantSlug, projectSlug } = await params;
  const period = presetFrom((await searchParams).period);
  permanentRedirect(dynamicRoute(withPeriod(`/${tenantSlug}/${projectSlug}/features`, period)));
}
