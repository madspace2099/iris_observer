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

import {
  OUTCOME_LABELS,
  sectionLabel,
  type MeetingOutcome,
  type SectionId,
} from "@observer/contracts";
import {
  DEFAULT_LANGUAGE,
  plural,
  pluralCategory,
  type Language,
  type PluralForms,
} from "./language";

export const NOT_STATED = "Not stated";

/** A room count's noun. "1,5" rooms is a real Slovak flat, so the fraction's form is here too. */
export const ROOMS_WORD: PluralForms = {
  en: { one: "room", other: "rooms" },
  sk: { one: "izba", few: "izby", many: "izby", other: "izieb" },
  hu: { one: "szoba", other: "szoba" },
};

/*
 * THE COUNTED WORDS MORE THAN ONE SCREEN SHARES.
 *
 * Each was once written out word for word in several files; one entry each
 * now, so the three languages' forms are edited in one place. A sentence that
 * puts one of these in another case keeps that case's forms as its own.
 */

/** A count of meetings. Replaces the identical five of views3, project, screens, DemandSignals and DemandAttention. */
export const MEETINGS: PluralForms = {
  en: { one: "meeting", other: "meetings" },
  sk: { one: "stretnutie", few: "stretnutia", other: "stretnutí" },
  hu: { one: "találkozó", other: "találkozó" },
};

/** A count of whole days. Replaces the identical three of deals, views3 and time. */
export const DAYS: PluralForms = {
  en: { one: "day", other: "days" },
  sk: { one: "deň", few: "dni", other: "dní" },
  hu: { one: "nap", other: "nap" },
};

/** "Opened 3 times". Replaces the identical two of project and screens. */
export const TIMES: PluralForms = {
  en: { one: "time", other: "times" },
  sk: { one: "raz", few: "razy", other: "ráz" },
  hu: { one: "alkalommal", other: "alkalommal" },
};

/** "2 rooms", "1 room", or the word for a count the catalogue did not state. */
export function roomsWord(rooms: number | null, language: Language = DEFAULT_LANGUAGE): string {
  if (rooms === null) return "Rooms not stated";
  return `${String(rooms)} ${plural(language, rooms, ROOMS_WORD)}`;
}

/*
 * THE ADJECTIVE A ROOM COUNT MAKES.
 *
 * Slovak and Hungarian name a flat by its rooms in one word, "dvojizbový" and
 * "kétszobás", and the Slovak word carries two numbers: the rooms build its
 * stem and the count of flats it describes chooses its ending — "1 je
 * dvojizbový", "2 sú dvojizbové", "5 je dvojizbových". A numeral table holds
 * one word per count and cannot hold two, so the word is made here and a
 * sentence takes it as a value, as it takes `slovakZForm`.
 *
 * One function per language, as `slovakZForm` and `hungarianNumberSuffix` are:
 * the Slovak word turns on two numbers, the Hungarian on one. English has none;
 * it counts the rooms through `roomsWord`.
 *
 * To ten rooms the word is written out. From eleven, and for a half room — a
 * real flat, "1,5 izby", as `ROOMS_WORD` says — the figure stands in the word,
 * with the decimal comma both languages write and the catalogue's own value,
 * never a locale's: "11-izbový", "1,5 szobás". A read model does not throw on
 * the catalogue's lawful data, so a room count is refused only where it is
 * impossible: not a number, infinite, nought or below. A count of flats is
 * still a whole number above nought, or it is refused: a wrong word in a
 * sentence reads as a fact.
 */

/** The Slovak stem for one to ten rooms. From eleven, and for a fraction, the figure: "11-izbový". */
const SLOVAK_ROOM_STEMS: Readonly<Record<number, string>> = {
  1: "jedno",
  2: "dvoj",
  3: "troj",
  4: "štvor",
  5: "päť",
  6: "šesť",
  7: "sedem",
  8: "osem",
  9: "deväť",
  10: "desať",
};

/** The Slovak ending, by the category the count of flats takes. */
const SLOVAK_ROOM_ENDINGS: Readonly<Record<string, string>> = {
  one: "izbový",
  few: "izbové",
  other: "izbových",
};

/** The Hungarian adjective for one to ten rooms. From eleven, and for a fraction, the figure: "11 szobás". */
const HUNGARIAN_ROOM_ADJECTIVES: Readonly<Record<number, string>> = {
  1: "egyszobás",
  2: "kétszobás",
  3: "háromszobás",
  4: "négyszobás",
  5: "ötszobás",
  6: "hatszobás",
  7: "hétszobás",
  8: "nyolcszobás",
  9: "kilencszobás",
  10: "tízszobás",
};

function wholeAboveNought(value: number, what: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${what} must be a whole number above nought, not ${value}.`);
  }
}

/** A half room is a flat; a room count that is not a number, is infinite, or is nought or less is not. */
function possibleRoomCount(rooms: number): void {
  if (!Number.isFinite(rooms) || rooms <= 0) {
    throw new RangeError(`A room count must be a number above nought, not ${rooms}.`);
  }
}

/** The figure as the catalogue states it, with the decimal comma: "11", "1,5". */
function roomFigure(rooms: number): string {
  return String(rooms).replace(".", ",");
}

/** "dvojizbový" for one two-room flat, "dvojizbové" for two, "dvojizbových" for five. */
export function slovakRoomAdjective(rooms: number, unitCount: number): string {
  possibleRoomCount(rooms);
  wholeAboveNought(unitCount, "A count of flats");
  const ending = SLOVAK_ROOM_ENDINGS[pluralCategory("sk", unitCount)];
  if (ending === undefined) {
    throw new RangeError(`No Slovak room ending agrees with ${unitCount} flats.`);
  }
  const stem = Number.isInteger(rooms) ? SLOVAK_ROOM_STEMS[rooms] : undefined;
  return `${stem ?? `${roomFigure(rooms)}-`}${ending}`;
}

/** "kétszobás", whatever the count of flats: the Hungarian adjective turns on the rooms alone. */
export function hungarianRoomAdjective(rooms: number): string {
  possibleRoomCount(rooms);
  const word = Number.isInteger(rooms) ? HUNGARIAN_ROOM_ADJECTIVES[rooms] : undefined;
  return word ?? `${roomFigure(rooms)} szobás`;
}

/**
 * The Hungarian adjective where a count of flats stands before it.
 *
 * From eleven rooms, and for a half room, the adjective begins with a figure,
 * and two figures side by side read as one number: "2 11 szobás". So "db"
 * stands between them, "2 db 11 szobás", "2 db 1,5 szobás"; the written-out
 * word needs none, "2 kétszobás". Where a word stands before it — "Egy …
 * lakást" — the plain adjective is the one to use.
 */
export function hungarianRoomAdjectiveAfterCount(rooms: number): string {
  const adjective = hungarianRoomAdjective(rooms);
  return /^\d/.test(adjective) ? `db ${adjective}` : adjective;
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

/** The same statement in each language a report can be printed in. Slovak and Hungarian are drafts (P2-17). */
const NOTHING_RECEIVED_YET_WORDS: Readonly<Record<Language, string>> = {
  en: NOTHING_RECEIVED_YET,
  sk: "Zo showroomu tohto projektu zatiaľ neprišla žiadna prezentácia.",
  hu: "A projekt showroomjából még nem érkezett bemutató.",
};

export function nothingReceivedYet(context: {
  readonly ownDataOnly: boolean;
  readonly sessionsDelivered: boolean;
  readonly language?: Language;
}): string | null {
  return context.ownDataOnly && !context.sessionsDelivered
    ? NOTHING_RECEIVED_YET_WORDS[context.language ?? DEFAULT_LANGUAGE]
    : null;
}

/*
 * THE CONTRACT'S LABELS, IN EACH LANGUAGE A REPORT CAN BE PRINTED IN.
 *
 * A meeting's outcome and a showroom section are enums the contract names in
 * English (`OUTCOME_LABELS`, `SHOWROOM_SECTIONS`), and the contract is frozen:
 * its words stay the one English spelling, and are the English here. The other
 * languages are keyed by the same stable values, so no contract file opens to
 * print them. Slovak and Hungarian are drafts for review (P2-17). The section
 * names follow the glossary where it has spoken: the favourites list is the
 * "zoznam obľúbených" and the "Kedvencek listája".
 */
export const OUTCOME_WORDS: Readonly<Record<Language, Readonly<Record<MeetingOutcome, string>>>> = {
  en: OUTCOME_LABELS,
  sk: {
    presentation_only: "Iba prezentácia",
    interested: "Záujem",
    follow_up_needed: "Potrebný ďalší kontakt",
    reservation: "Rezervácia",
    purchase: "Kúpa",
    not_interested: "Bez záujmu",
    skipped: "Výsledok nezaznamenaný",
  },
  hu: {
    presentation_only: "Csak bemutató",
    interested: "Érdeklődik",
    follow_up_needed: "Utánkövetés szükséges",
    reservation: "Foglalás",
    purchase: "Vásárlás",
    not_interested: "Nem érdeklődik",
    skipped: "Nincs rögzített eredmény",
  },
};

const SECTION_NAMES: Readonly<
  Record<Exclude<Language, "en">, Readonly<Record<SectionId, string>>>
> = {
  sk: {
    home: "Úvod",
    residences: "Byty",
    amenities: "Vybavenie",
    surroundings: "Okolie",
    gallery: "Galéria",
    maps: "Mapy",
    environment: "Čas a počasie",
    compare: "Porovnanie",
    shortlist: "Zoznam obľúbených",
  },
  hu: {
    home: "Kezdőlap",
    residences: "Lakások",
    amenities: "Szolgáltatások",
    surroundings: "Környék",
    gallery: "Galéria",
    maps: "Térképek",
    environment: "Idő és időjárás",
    compare: "Összehasonlítás",
    shortlist: "Kedvencek listája",
  },
};

/** A showroom section by its name in `language`; English is the contract's own `sectionLabel`. */
export function sectionWord(language: Language, id: SectionId): string {
  /* A caller without a language — a test's hand-built context, say — reads English, like every word helper. */
  const lang = language ?? DEFAULT_LANGUAGE;
  return lang === "en" ? sectionLabel(id) : SECTION_NAMES[lang][id];
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
 * The same two markers in each language a report can be printed in. English is
 * `DATA_SOURCE_MARKERS` itself; Slovak and Hungarian are drafts for review
 * (P2-17). The screens stay in English and keep reading the one above.
 */
export const DATA_SOURCE_MARKER_WORDS: Readonly<
  Record<
    Language,
    {
      readonly synthetic: { readonly short: string; readonly full: string };
      readonly delivered: { readonly short: string; readonly full: string };
    }
  >
> = {
  en: DATA_SOURCE_MARKERS,
  sk: {
    synthetic: { short: "Demo údaje", full: "Syntetické demonštračné údaje" },
    delivered: {
      short: "Živé stretnutia",
      full: "Stretnutia pochádzajú z vlastného showroomu tohto projektu. Čokoľvek, čo konektor nedodal, sú demonštračné údaje.",
    },
  },
  hu: {
    synthetic: { short: "Demóadat", full: "Szintetikus bemutató adatok" },
    delivered: {
      short: "Élő találkozók",
      full: "A találkozók a projekt saját showroomjából érkeznek. Amit egy csatlakozó nem szállított, az bemutató adat.",
    },
  },
};

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

/* The same words in each language a report can be printed in; drafts for review (P2-17). */
const PRESENTER_NOT_NAMED_WORDS: Readonly<Record<Language, string>> = {
  en: PRESENTER_NOT_NAMED,
  sk: "Meno nie je k dispozícii",
  hu: "A név nem ismert",
};

export function presenterWord(
  name: string | null,
  agentId: string,
  language: Language = DEFAULT_LANGUAGE,
): string {
  return name === null || name.trim().length === 0
    ? `${PRESENTER_NOT_NAMED_WORDS[language]} · ${agentId}`
    : name;
}
