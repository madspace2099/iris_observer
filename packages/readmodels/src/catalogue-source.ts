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
  /**
   * For a unit whose move onto its CURRENT availability Observer witnessed — its
   * status differed between two syncs — the instant of the sync that first saw
   * it there, by unit code. The catalogue states no date for a status change
   * (REALPAD's pricelist has no per-flat time at all), so this is the only date
   * an availability change has, and it is late by up to one sync, never early.
   * Absent for a unit first seen already reserved or sold: the first sync sees
   * every historical sale at once (ADR-0039 §5, ADR-0049).
   */
  readonly statusObservedAt?: Readonly<Record<string, string>>;
}

export interface CatalogueSource {
  catalogueFor(project: ProjectSummary): Promise<DeliveredCatalogue | null>;
}
