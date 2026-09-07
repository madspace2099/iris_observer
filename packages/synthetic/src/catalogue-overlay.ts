import { placementOf, type CatalogueUnit, type OrientationMap } from "@observer/contracts";
import type { RawUnit } from "./pulse";

/**
 * A DELIVERED CATALOGUE, IN THE SHAPE THE PULSE BUILDS FROM.
 *
 * The connectors deliver `CatalogueUnit`, which says honestly what a source
 * did not state. The pulse and the unit surfaces build from `RawUnit`, which
 * assumes a floor, a count, an area, a price and a compass point on every
 * row, because the synthetic world always had them. Until those read models
 * learn to draw an absence, a unit that lacks one of them is not placed —
 * it is counted and named, so the gap is on a screen rather than filled.
 */

export interface UnplacedUnit {
  readonly code: string;
  readonly reason: string;
}

export interface CatalogueOverlay {
  readonly units: RawUnit[];
  readonly unplaced: UnplacedUnit[];
}

export function rawUnitsFromCatalogue(
  delivered: readonly CatalogueUnit[],
  orientationMap: OrientationMap,
): CatalogueOverlay {
  const units: RawUnit[] = [];
  const unplaced: UnplacedUnit[] = [];
  for (const unit of delivered) {
    const placed = placementOf(unit, orientationMap);
    if (!placed.ok) {
      unplaced.push({ code: unit.code, reason: placed.reasons.join(", ") });
      continue;
    }
    units.push({
      code: unit.code,
      block: unit.building ?? "",
      floor: placed.floor,
      rooms: placed.rooms,
      areaSqm: placed.areaSqm,
      orientation: placed.orientation,
      price: placed.price,
      status: placed.status,
    });
  }
  return { units, unplaced };
}
