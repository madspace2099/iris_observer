import type { Metadata } from "next";
import { Workspace } from "@/lab/Workspace";
import { repository } from "@/lib/repository";
import { viewerFor } from "@/lib/session";

export const metadata: Metadata = { title: "Concept A — narrative-first" };

/**
 * Concept A — narrative-first.
 *
 * Reads through the same `ObserverRepository` port as production. The
 * laboratory signs itself in as the developer viewer directly, because the
 * concept is about composition rather than about the session adapter.
 */
export default async function Page() {
  const query = {
    viewer: viewerFor("developer"),
    tenantSlug: "alpha",
    projectSlug: "northgate",
    period: "quarter_to_date",
  } as const;

  const [overview, pulse, ask] = await Promise.all([
    repository.getExecutiveOverview(query),
    repository.getProjectPulse(query),
    repository.getAskSession(query, null),
  ]);

  return <Workspace variant="narrative" overview={overview} pulse={pulse} ask={ask} />;
}
