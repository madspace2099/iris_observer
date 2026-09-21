import type { CatalogueUnit, ConnectorKind, OrientationMap } from "@observer/contracts";
import type { ProjectSummary } from "./context";

/**
 * Where a project's unit catalogue may come from when a CRM is connected.
 *
 * The repository asks before it builds a view. A `null` answer means no
 * connector has delivered a catalogue for this project and the repository
 * uses its own; anything else replaces the stock — and only the stock.
 * Observed attention comes from sessions, never from a catalogue, so a
 * delivered unit that no meeting has opened shows no attention rather than
 * an invented one (ADR-0036).
 */
export interface DeliveredCatalogue {
  readonly connector: ConnectorKind;
  readonly units: readonly CatalogueUnit[];
  /** The tenant's orientation codes → compass points, from the connector's configuration. */
  readonly orientationMap: OrientationMap;
}

export interface CatalogueSource {
  catalogueFor(project: ProjectSummary): Promise<DeliveredCatalogue | null>;
}
