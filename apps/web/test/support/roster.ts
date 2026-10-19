import { SyntheticObserverRepository, VIEWERS } from "@observer/synthetic";
import type { RosterEntry } from "../../src/lib/ai/agent";

/**
 * A project's presenters, as the repository lists them for the default period.
 *
 * Read rather than written out, so an Ask context in a test carries the same
 * roster the gate would hand the router — and no test spells a presenter's
 * name the data does not hold.
 */
export async function rosterOf(
  tenantSlug: string,
  projectSlug: string,
): Promise<readonly RosterEntry[]> {
  const agents = await new SyntheticObserverRepository().listAgents({
    viewer: VIEWERS.madspace,
    tenantSlug,
    projectSlug,
    period: "quarter_to_date",
    language: "en",
  });
  return agents.map(({ agentId, name }) => ({ agentId, name }));
}
