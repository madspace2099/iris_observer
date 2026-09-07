import { placementOf, type CatalogueUnit, type OrientationMap } from "@observer/contracts";
import type { RawUnit } from "./pulse";

/**
 * A DELIVERED CATALOGUE, IN THE SHAPE THE PULSE BUILDS FROM.
 *
 * The connectors deliver `CatalogueUnit`, which says honestly what a source
 * did not state. The pulse and the unit surfaces build from `RawUnit`, which
 * now says the same: a floor, a count, an area, a price or a compass point
 * the source left out is `null`, and every surface reads it as a word rather
 * than a figure. Only a status the surfaces have no word for keeps a unit off
 * them, and that unit is counted and named so the gap is on a screen.
 */

export interface UnplacedUnit {
  readonly code: string;
  readonly reason: string;
}

/** A drawn unit's stated gap, so a screen can count what the source left out. */
export interface UnitGap {
  readonly code: string;
  readonly gap: string;
}

export interface CatalogueOverlay {
  readonly units: RawUnit[];
  readonly unplaced: UnplacedUnit[];
  readonly gaps: UnitGap[];
}

export function rawUnitsFromCatalogue(
  delivered: readonly CatalogueUnit[],
  orientationMap: OrientationMap,
): CatalogueOverlay {
  const units: RawUnit[] = [];
  const unplaced: UnplacedUnit[] = [];
  const gaps: UnitGap[] = [];
  for (const unit of delivered) {
    const placed = placementOf(unit, orientationMap);
    if (!placed.ok) {
      unplaced.push({ code: unit.code, reason: placed.reasons.join(", ") });
      continue;
    }
    for (const gap of placed.gaps) gaps.push({ code: unit.code, gap });
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
  return { units, unplaced, gaps };
}
