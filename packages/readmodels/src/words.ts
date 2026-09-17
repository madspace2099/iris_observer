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

/**
 * What a project made in administration says before its showroom has sent
 * anything.
 *
 * Nothing having arrived is not a period with nought meetings in it. "0
 * presentations in quarter to date" is a measurement, and it is true of a quiet
 * quarter on a showroom that works; on a project whose showroom has never been
 * heard from it reads as a verdict on a business that has not started. So where
 * a project shows only its own data and none has come, every surface says this
 * instead of a count, and says the same thing.
 *
 * Null everywhere else, a synthetic project included: its meetings are
 * generated, so an empty period there really is an empty period.
 */
export const NOTHING_RECEIVED_YET = "No presentation has arrived from this project's showroom yet.";

export function nothingReceivedYet(context: {
  readonly ownDataOnly: boolean;
  readonly sessionsDelivered: boolean;
}): string | null {
  return context.ownDataOnly && !context.sessionsDelivered ? NOTHING_RECEIVED_YET : null;
}

/** "facing S", or the word for an aspect the catalogue did not state. */
export function aspectWord(orientation: string | null): string {
  return orientation === null ? "Aspect not stated" : `facing ${orientation}`;
}
