import type { ShowroomSession } from "@observer/contracts";
import type { ProjectSummary } from "./context";

/**
 * Where a project's showroom sessions may come from when a telemetry source
 * is connected, beside `CatalogueSource` and `DealSource`.
 *
 * Every other project in the product is entirely synthetic: `sessionsFor`
 * answering `null` is not a gap to fill, it is every project but the one(s)
 * a real source was configured for. A `DeliveredSessions` answer REPLACES
 * the synthetic sessions for that project wholesale — there is no merge,
 * because a project with a real source has nothing synthetic to merge with
 * (ADR-0036's rule for deals and the catalogue, carried over: the connector
 * is authoritative for what it delivers).
 */
export interface DeliveredSessions {
  readonly connector: string;
  readonly sessions: readonly ShowroomSession[];
  /** When the source last delivered this snapshot. */
  readonly fetchedAt: string;
  /**
   * The name each presenter is shown under, by the identifier the sessions carry.
   *
   * A showroom sends an identifier with a meeting and never a name: events hold
   * no personal data. The name is kept by administration beside the project and
   * joined here, at read time, so every meeting shows who presented it. An
   * identifier missing from this map has no name yet and is shown as itself.
   */
  readonly agentNames?: Readonly<Record<string, string>>;
}

export interface ShowroomSessionSource {
  sessionsFor(project: ProjectSummary): Promise<DeliveredSessions | null>;
}
