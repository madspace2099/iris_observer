import { permanentRedirect } from "next/navigation";

import { dynamicRoute } from "@/lib/href";
import { presetFrom, withPeriod } from "@/lib/period";

/**
 * PEOPLE BECAME SALES AGENTS, SO THIS ROUTE HANDS ITS READERS ON.
 *
 * This screen used to render a stated "Arrives in M3" panel. That was the right
 * answer while `People` was a navigation item with nothing behind it — an
 * honest "not yet" is more useful than a fabricated chart, and M2 shipped two
 * surfaces at final quality rather than five at placeholder quality.
 *
 * It is the wrong answer now, for two reasons that arrived together.
 *
 * ADR-0033 renamed the section: `People` covered agents and contacts, and
 * `Sales Agents` claims only the first. The agent half of what this route
 * promised is built, at `/{tenant}/{project}/agents`, with a detail screen
 * behind it. Leaving a second URL saying "arrives later" beside a finished
 * screen tells a reader the finished screen is not the one they wanted.
 *
 * And the product brief is explicit that a core area may not be a wall. A
 * placeholder is a wall whichever way it is worded.
 *
 * ## What this deliberately does NOT claim
 *
 * That contacts have a home. They do not, and ADR-0033 recorded that as an open
 * question rather than closing it. Sending this URL to Sales Agents is not an
 * answer to where a contact timeline lives; it is a refusal to keep a signpost
 * pointing at an empty room. When contacts arrive they get their own surface
 * and their own decision.
 *
 * The period travels, because a reader who chose "Last 28 days" and then
 * followed a link that dropped it would compare two screens measuring different
 * spans without being told.
 */
export default async function PeopleMoved({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenantSlug, projectSlug } = await params;
  const query = await searchParams;
  const raw = query["period"];
  const period = presetFrom(Array.isArray(raw) ? raw[0] : raw);

  permanentRedirect(dynamicRoute(withPeriod(`/${tenantSlug}/${projectSlug}/agents`, period)));
}
