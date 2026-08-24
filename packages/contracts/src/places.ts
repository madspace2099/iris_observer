/**
 * The places IRIS shows.
 *
 * Two lists, supplied by MADSPACE as demonstration data for a Bratislava
 * Ružinov project: the neighbourhood a buyer is being sold on, and the amenities
 * inside the building itself.
 *
 * They are here rather than in the synthetic package because they are part of
 * the **product's vocabulary**, not part of one fixture. What a buyer lingers on
 * is the most interpretable signal the showroom produces — a visitor who spends
 * their time on the nursery and the playground is telling you something a
 * filter never will — and that reading only works if the places carry a
 * category that Observer understands.
 *
 * **Availability differs between the two, and the difference is load-bearing.**
 * The legacy analytics records amenities at item level; it records Surroundings
 * only as a section. Which point of interest was presented needs a UE5 v2 event
 * that does not exist yet (`docs/16-showroom-intelligence-audit.md` §2.6), so
 * every surface reading POI-level data must say so.
 */

/**
 * What a place tells you about the person looking at it.
 *
 * Deliberately coarse. "Family" is a reasonable reading of time spent on a
 * nursery and a playground; it is not a claim about anybody's household, and no
 * surface may state it as one. `docs/05-identity.md` forbids inferring
 * sensitive attributes, and these categories exist to *group behaviour*, not to
 * label people.
 */
export const PLACE_CATEGORIES = [
  "family",
  "transport",
  "shopping",
  "leisure",
  "landmark",
  "healthcare",
  "work",
  "hospitality",
  "services",
  "neighbourhood",
  "convenience",
  "lifestyle",
  "building",
] as const;
export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

export const PLACE_CATEGORY_LABELS: Record<PlaceCategory, string> = {
  family: "Family",
  transport: "Transport",
  shopping: "Shopping",
  leisure: "Leisure",
  landmark: "Landmark",
  healthcare: "Healthcare",
  work: "Workplaces",
  hospitality: "Hotels",
  services: "Services",
  neighbourhood: "Neighbouring buildings",
  convenience: "Convenience",
  lifestyle: "Lifestyle",
  building: "Building",
};

export interface Place {
  readonly id: string;
  /** As it appears in IRIS, in the language the showroom presents it. */
  readonly name: string;
  readonly category: PlaceCategory;
  /** Which section of IRIS presents it. */
  readonly section: "surroundings" | "amenities";
}

function id(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function place(name: string, category: PlaceCategory, section: Place["section"]): Place {
  return { id: id(name), name, category, section };
}

/* --- Surroundings: the neighbourhood ---------------------------------------- */

export const SURROUNDINGS: readonly Place[] = [
  place("Štrkovecké jazero", "leisure", "surroundings"),
  place("Kostol svätej Alžbety (Modrý kostolík)", "landmark", "surroundings"),
  place("Hlavné námestie", "landmark", "surroundings"),
  place("Most SNP", "landmark", "surroundings"),
  place("Bratislavský hrad", "landmark", "surroundings"),

  place("Zastávka Mliekarenská", "transport", "surroundings"),
  place("Zastávka Líščie nivy", "transport", "surroundings"),
  place("Električková zastávka Herlianska", "transport", "surroundings"),
  place("Autobusová stanica Nivy", "transport", "surroundings"),
  place("Letisko M. R. Štefánika (BTS)", "transport", "surroundings"),

  place("Lidl Trenčianska", "shopping", "surroundings"),
  place("Potraviny Malina", "shopping", "surroundings"),
  place("Green Bike Cafe", "leisure", "surroundings"),
  place("Billa Ružová dolina", "shopping", "surroundings"),
  place("Trhovisko Miletičova", "shopping", "surroundings"),

  place("Aston Business Hotel", "hospitality", "surroundings"),
  place("PREMIUM Business Hotel Bratislava", "hospitality", "surroundings"),
  place("Hotel Nivy", "hospitality", "surroundings"),
  place("DoubleTree by Hilton Bratislava", "hospitality", "surroundings"),
  place("Pošta Bratislava 27", "services", "surroundings"),

  place("Radošinské naivné divadlo", "leisure", "surroundings"),
  place("Zimný štadión Vladimíra Dzurillu", "leisure", "surroundings"),
  place("Lezecké centrum Vertigo", "leisure", "surroundings"),
  place("Kúpalisko Delfín", "leisure", "surroundings"),
  place("TIPOS ARENA – Zimný štadión Ondreja Nepelu", "leisure", "surroundings"),

  place("Poliklinika Trenčianska", "healthcare", "surroundings"),
  place("Základná škola Ružová dolina 29", "family", "surroundings"),
  place("Materská škola Miletičova 37", "family", "surroundings"),
  place("Univerzitná nemocnica Bratislava – Nemocnica Ružinov", "healthcare", "surroundings"),
  place("Základná škola Pavla Marcelyho", "family", "surroundings"),

  place("Rosum", "work", "surroundings"),
  place("Asseco", "work", "surroundings"),
  place("Administratívne centrum Ružová dolina 10", "work", "surroundings"),
  place("SpaceUp", "work", "surroundings"),
  place("Bratislava Business Center I Plus", "work", "surroundings"),

  place("Rozadol", "neighbourhood", "surroundings"),
  place("Bajkalska Apartments", "neighbourhood", "surroundings"),
  place("Universo", "neighbourhood", "surroundings"),
  place("Miletičova 60", "neighbourhood", "surroundings"),
  place("Kvarter", "neighbourhood", "surroundings"),
];

/* --- Amenities: inside the building ----------------------------------------- */

export const AMENITIES: readonly Place[] = [
  place("Park", "family", "amenities"),
  place("Ihrisko", "family", "amenities"),
  place("Detská zóna", "family", "amenities"),
  place("Materská škola", "family", "amenities"),

  place("Lekáreň", "convenience", "amenities"),
  place("Potraviny", "convenience", "amenities"),
  place("Pekáreň", "convenience", "amenities"),
  place("Kvetinárstvo", "convenience", "amenities"),

  place("Fitness", "lifestyle", "amenities"),
  place("Zóna krásy", "lifestyle", "amenities"),
  place("Reštaurácia", "lifestyle", "amenities"),
  place("Kaviareň", "lifestyle", "amenities"),

  place("Vstupná hala", "building", "amenities"),
  place("Nabíjacia stanica pre elektromobily", "building", "amenities"),
];

export const ALL_PLACES: readonly Place[] = [...SURROUNDINGS, ...AMENITIES];

export function placeById(placeId: string): Place | undefined {
  return ALL_PLACES.find((p) => p.id === placeId);
}

export function placesInCategory(category: PlaceCategory): readonly Place[] {
  return ALL_PLACES.filter((p) => p.category === category);
}

/* --- what a buyer searched for ---------------------------------------------- */

/**
 * The filters IRIS offers.
 *
 * **Not emitted by the current showroom build.** Everything Observer shows about
 * filters is a demonstration of what the UE5 v2 event would answer, and every
 * surface that reads it carries that statement. It is defined here rather than
 * left out because the reversed development order means the product specifies
 * the measurement first; Akhilesh implements against this shape.
 */
export const FILTER_FIELDS = [
  { id: "rooms", label: "Rooms" },
  { id: "price", label: "Price" },
  { id: "area", label: "Floor area" },
  { id: "floor", label: "Floor" },
  { id: "orientation", label: "Orientation" },
  { id: "balcony", label: "Balcony" },
  { id: "availability", label: "Availability" },
] as const;
export type FilterField = (typeof FILTER_FIELDS)[number]["id"];

export function filterLabel(field: string): string {
  return FILTER_FIELDS.find((f) => f.id === field)?.label ?? field;
}
