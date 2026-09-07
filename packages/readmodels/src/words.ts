/**
 * The words a surface shows where a catalogue stated nothing.
 *
 * A delivered catalogue does not state a floor, a room count, an area, an
 * aspect or a price for every unit, and the read models carry each as `null`
 * rather than a number the source never gave. These are the words that stand
 * where the figure would have: one vocabulary, shared by every screen and by
 * the sentences Ask Observer builds, so a reader meets "not stated" and never
 * a zero, a dash or the string "null".
 */

export const NOT_STATED = "Not stated";

/** "2 rooms", "1 room", or the word for a count the catalogue did not state. */
export function roomsWord(rooms: number | null): string {
  if (rooms === null) return "Rooms not stated";
  return `${String(rooms)} ${rooms === 1 ? "room" : "rooms"}`;
}

/** "63 m²", or the word for an area the catalogue did not state. */
export function areaWord(areaSqm: number | null): string {
  return areaSqm === null ? "Area not stated" : `${String(areaSqm)} m²`;
}

/** "Floor 4", or the word for a floor the catalogue did not state. */
export function floorWord(floor: number | null): string {
  return floor === null ? "Floor not stated" : `Floor ${String(floor)}`;
}

/** "facing S", or the word for an aspect the catalogue did not state. */
export function aspectWord(orientation: string | null): string {
  return orientation === null ? "Aspect not stated" : `facing ${orientation}`;
}
