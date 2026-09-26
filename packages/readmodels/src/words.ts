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

import { DEFAULT_LANGUAGE, plural, type Language, type PluralForms } from "./language";

export const NOT_STATED = "Not stated";

/** A room count's noun. "1,5" rooms is a real Slovak flat, so the fraction's form is here too. */
export const ROOMS_WORD: PluralForms = {
  en: { one: "room", other: "rooms" },
  sk: { one: "izba", few: "izby", many: "izby", other: "izieb" },
  hu: { one: "szoba", other: "szoba" },
};

/** "2 rooms", "1 room", or the word for a count the catalogue did not state. */
export function roomsWord(rooms: number | null, language: Language = DEFAULT_LANGUAGE): string {
  if (rooms === null) return "Rooms not stated";
  return `${String(rooms)} ${plural(language, rooms, ROOMS_WORD)}`;
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

/**
 * The two markers that say where a project's meetings came from.
 *
 * WRITTEN OUT TWICE UNTIL NOW, which is the whole reason they are here. The
 * shell header draws them as a loud amber pill and a page draws them as a quiet
 * chip — two deliberate treatments in two contexts, and neither is a bug. What
 * was a bug is that each rendering also carried its own copy of the SENTENCES,
 * so the two could drift into saying different things about the same project,
 * and a reader meeting one after the other would have no way to know which was
 * current.
 *
 * `short` is what a header can hold; `full` is the claim, kept as the title and
 * as the screen-reader text. The short form is never a shorter claim — it is
 * the same claim at a width that does not wrap a header bar into three lines,
 * which is what the full phrase did the first time.
 *
 * Which of the two a surface shows is not decided here and never in a
 * component: the project layout sets `data-sessions` and the stylesheet picks
 * one, so the dozen places that mount a marker cannot disagree about which
 * project they are on. See `sessionsDelivered` and `ownDataOnly` on
 * `ViewContext`, and `nothingReceivedYet` above for the third state.
 */
export const DATA_SOURCE_MARKERS = {
  synthetic: {
    short: "Demo data",
    full: "Synthetic demonstration data",
  },
  delivered: {
    short: "Live meetings",
    full: "Meetings come from this project's own showroom. Whatever a connector has not delivered is demonstration data.",
  },
} as const;

/**
 * What stands where a presenter's name would, when no directory names them.
 *
 * A showroom mints its own identifier for whoever ran a meeting, and a name for
 * that identifier arrives separately — from the roster an administrator keeps,
 * or from the installation's own report of who presents on it. Until one does,
 * there is no name, and every surface used to print the identifier in the name's
 * place: Akhilesh's delivered demonstration showed "agent-guid" as the person
 * who gave the presentation.
 *
 * That is not a name, and it is not the absence of one either. It reads as a
 * name to anybody who does not know the shape of the ids this system mints,
 * which is everybody the product is for. It is the same defect as a zero
 * standing for a figure nobody measured, and this module exists to answer it.
 *
 * THE IDENTIFIER STAYS, and that is the other half. Two people who present on
 * one project and are named by nobody are still two people, and dropping the id
 * would merge them into one anonymous presenter — turning a stated absence into
 * a false claim about who did what. So the word says the name is missing and
 * the id says which unnamed presenter this is.
 */
export const PRESENTER_NOT_NAMED = "Name not available";

export function presenterWord(name: string | null, agentId: string): string {
  return name === null || name.trim().length === 0 ? `${PRESENTER_NOT_NAMED} · ${agentId}` : name;
}
