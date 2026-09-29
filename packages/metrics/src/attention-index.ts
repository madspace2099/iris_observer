/**
 * THE ATTENTION INDEX — `project.attention_index`, computed once, here.
 *
 * A segment's share of the time spent looking at a population of units, over
 * its share of that population. Above one, the segment draws more attention
 * than its size in the stock would justify.
 *
 * The population is the stock the period ends with unsold: available, reserved
 * and pre-reserved units (the contract folds a pre-reservation into
 * `reserved`). A sold unit is in neither share. The same units stand in the
 * numerator and the denominator, and that is the whole point of this file: the
 * index used to be three computations on three populations — `/project`
 * counted looking time on every unit against available stock, `/units`
 * available looking time against available stock, the Ask pulse opening scores
 * against the whole building — so Northgate's two-room units read 1.41×, 1.39×
 * and a third figure, and the executive overview printed a fixed 2.1. Decided
 * 2026-09-27; every surface that states the index reads this function.
 *
 * "Unsold at the period's end" is the catalogue's status, which is the status
 * now. For a period that runs to today that is exact. For a completed period it
 * is the stock as the catalogue states it now: the catalogue carries no sale
 * date to wind it back, and the reading says so where it is stated.
 */

/** A unit of the stock, as the index needs it. */
export interface IndexUnit {
  readonly code: string;
  /** The catalogue's status; a pre-reservation arrives as `reserved`. */
  readonly status: "available" | "reserved" | "sold";
}

/** Looking time on one unit: in one meeting, or summed over a period. */
export interface IndexLook {
  readonly unitCode: string;
  readonly dwellSeconds: number;
}

export interface AttentionIndexReading {
  /**
   * The segment's share of looking time over its share of stock. Null where
   * either share has nothing under it — no unsold unit in the segment, or no
   * looking time on the population — because an index of nothing is not zero.
   */
  readonly index: number | null;
  /** Of the looking time on the unsold stock, the segment's part. */
  readonly attentionShare: number;
  /** Of the unsold units, the segment's part. */
  readonly stockShare: number;
  readonly segmentUnits: number;
  readonly populationUnits: number;
  readonly segmentSeconds: number;
  readonly populationSeconds: number;
}

/** Whether a unit is in the population the index is taken over: unsold stock. */
export function inIndexPopulation(unit: IndexUnit): boolean {
  return unit.status !== "sold";
}

/**
 * The index of the units `inSegment` picks out, over the population.
 *
 * Looking time on a unit the population does not hold (a sold unit, or a code
 * the catalogue does not carry) counts on neither side.
 */
export function attentionIndex<U extends IndexUnit>(
  units: readonly U[],
  looks: readonly IndexLook[],
  inSegment: (unit: U) => boolean,
): AttentionIndexReading {
  const population = units.filter(inIndexPopulation);
  const inPopulation = new Set(population.map((u) => u.code));
  const inSegmentCodes = new Set(population.filter(inSegment).map((u) => u.code));

  let populationSeconds = 0;
  let segmentSeconds = 0;
  for (const look of looks) {
    if (!inPopulation.has(look.unitCode)) continue;
    populationSeconds += look.dwellSeconds;
    if (inSegmentCodes.has(look.unitCode)) segmentSeconds += look.dwellSeconds;
  }

  const stockShare = population.length === 0 ? 0 : inSegmentCodes.size / population.length;
  const attentionShare = populationSeconds === 0 ? 0 : segmentSeconds / populationSeconds;
  return {
    index: stockShare === 0 || populationSeconds === 0 ? null : attentionShare / stockShare,
    attentionShare,
    stockShare,
    segmentUnits: inSegmentCodes.size,
    populationUnits: population.length,
    segmentSeconds,
    populationSeconds,
  };
}

/** The index as every surface prints it: two decimals and the sign, so no two screens round apart. */
export function attentionIndexDisplay(index: number): string {
  return `${index.toFixed(2)}×`;
}
