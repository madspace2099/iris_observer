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
   * For a unit now reserved or sold whose move OFF the market Observer
   * witnessed — between two syncs, from a status the tenant's mapping knows
   * (available, pre-reserved, …) to reserved or sold, with the CRM's own word
   * changing too — that move, by unit code. The catalogue states no date for a
   * status change (REALPAD's pricelist has no per-flat time at all), so two
   * syncs are the only dates it has: the move came after `seenBefore` and at or
   * before `at`. A reserved flat later sold keeps its reservation's move.
   * Absent for a unit first seen already reserved or sold, and for one whose
   * earlier status was a word nobody had mapped: a mapping added or fixed is
   * not a sale (ADR-0039 §5, ADR-0049).
   */
  readonly statusChanges?: Readonly<Record<string, CatalogueStatusChange>>;
}

/** A witnessed move onto reserved or sold: between two syncs, never at an instant. */
export interface CatalogueStatusChange {
  /** The sync that first saw the flat reserved or sold. */
  readonly at: string;
  /** What it moved to then; a reserved flat may since have been sold. */
  readonly to: "reserved" | "sold";
  /** The newest sync Observer knows of before `at`: the move came after it. */
  readonly seenBefore: string;
}

export interface CatalogueSource {
  catalogueFor(project: ProjectSummary): Promise<DeliveredCatalogue | null>;
}
