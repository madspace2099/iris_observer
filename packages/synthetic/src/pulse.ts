import type {
  AskAnswer,
  AskSession,
  ProjectPulse,
  PulseFloor,
  PulseSegment,
  PulseUnit,
  UnitChange,
  UnitStatus,
  ViewContext,
} from "@observer/readmodels";
import { ProjectIdSchema } from "@observer/contracts";
import { evidenceRef, moneyOr } from "./format";
import { unitsForProject } from "./world";

/**
 * The Northgate building, generated deterministically.
 *
 * `docs/08-scenarios.md` fixed five units by hand because five was enough for a
 * brief. A building is not, so the catalogue is extended here to the shape a
 * real project has: three blocks, eight floors, two units per block per floor.
 *
 * This is an honest extension of the documented synthetic model, not data
 * invented to make a picture work. Every figure is derived from the unit's own
 * attributes by a stated rule, the five hand-written units keep their exact
 * values, and the aggregate reproduces the story the Overview already tells —
 * two-room units drawing about twice their share of attention while converting
 * at half the project average.
 */

/**
 * A building, described rather than assumed.
 *
 * Every project in the demonstration world is a different development. A
 * catalogue hard-coded to one stacking plan is how three projects came to
 * report the same flats, the same demand and the same sold count — so each
 * project names its own blocks, floors and aspects, and `A-402` exists in
 * exactly one of them.
 */
export interface BuildingSpec {
  readonly floors: readonly number[];
  readonly blocks: readonly string[];
  readonly perBlock: number;
  readonly orientation: Readonly<Record<string, PulseUnit["orientation"]>>;
  /** How much of the lower stock has already moved, 0–1. */
  readonly soldPressure: number;
  /** Units written by hand in the scenario document, pinned against drift. */
  readonly pinned: Readonly<Record<string, Partial<PulseUnit> & { status: UnitStatus }>>;
}

/**
 * The five units written by hand in the scenario document. They are pinned so
 * the brief, the Overview narrative and the Pulse cannot drift apart.
 */
const NORTHGATE_PINNED: Record<string, Partial<PulseUnit> & { status: UnitStatus }> = {
  "A-402": { rooms: 2, areaSqm: 63, price: 214_000, status: "available", orientation: "S" },
  "B-301": { rooms: 2, areaSqm: 59, price: 202_000, status: "available", orientation: "SW" },
  "A-505": { rooms: 2, areaSqm: 66, price: 229_000, status: "sold", orientation: "S" },
  "C-204": { rooms: 3, areaSqm: 88, price: 268_000, status: "reserved", orientation: "W" },
  "A-204": { rooms: 2, areaSqm: 61, price: 189_000, status: "available", orientation: "N" },
};

/**
 * The three developments.
 *
 * Deliberately different sizes and shapes, because the point of a second and a
 * third project is to prove the product reads each one on its own terms. A
 * reader who sees the same 48 units under every name learns nothing except
 * that the demonstration is fake.
 */
export const BUILDINGS: Readonly<Record<string, BuildingSpec>> = {
  prj_northgate01: {
    floors: [1, 2, 3, 4, 5, 6, 7, 8],
    blocks: ["A", "B", "C"],
    perBlock: 2,
    orientation: { A: "S", B: "SW", C: "W" },
    soldPressure: 0.25,
    pinned: NORTHGATE_PINNED,
  },
  // Riverside is a smaller waterside scheme: two blocks, six floors, and a
  // different aspect — its stock faces the water, east and north-east.
  prj_riversidew1: {
    floors: [1, 2, 3, 4, 5, 6],
    blocks: ["R", "W"],
    perBlock: 3,
    orientation: { R: "E", W: "N" },
    soldPressure: 0.44,
    pinned: {
      "R-201": { rooms: 2, areaSqm: 57, price: 178_000, status: "available", orientation: "E" },
      "W-402": { rooms: 3, areaSqm: 91, price: 246_000, status: "reserved", orientation: "N" },
    },
  },
  // Kingsford Yard is a single tall block, three weeks on sale, almost nothing
  // moved yet — which is the whole reason it exists in this world.
  prj_beta0000001: {
    floors: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    blocks: ["K"],
    perBlock: 3,
    orientation: { K: "SE" },
    soldPressure: 0.86,
    pinned: {
      "K-301": { rooms: 2, areaSqm: 54, price: 312_000, status: "available", orientation: "SE" },
    },
  },
};

/** A small deterministic hash, so every derived figure is reproducible. */
function seed(code: string): number {
  let h = 2166136261;
  for (let i = 0; i < code.length; i += 1) {
    h ^= code.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function unitCode(block: string, floor: number, index: number): string {
  return `${block}-${floor}${String(index).padStart(2, "0")}`;
}

/**
 * A unit as a catalogue states it.
 *
 * The synthetic world states everything; a delivered catalogue does not, and
 * each of the five attributes is `null` where the source gave nothing. Every
 * builder that reads one must say the absence in words rather than compute
 * through it, which is why the type refuses to let a null add or compare.
 */
export interface RawUnit {
  code: string;
  block: string;
  floor: number | null;
  rooms: number | null;
  areaSqm: number | null;
  orientation: PulseUnit["orientation"];
  price: number | null;
  status: UnitStatus;
}

/**
 * The room counts a catalogue actually contains, ascending.
 *
 * Room segments are derived from the stock rather than declared: a segment
 * list written by hand names the two counts the first scenario had and drops
 * every one-room and four-room flat from a scale that claims to cover the
 * stock. A real catalogue arrives from the CRM with whatever counts the
 * developer built, and the segments have to follow it. A unit whose count
 * the catalogue does not state is not in this list; it gets its own row
 * (`hasUnstatedRooms`), never a guessed count.
 */
export function roomCounts(
  units: ReadonlyArray<{ readonly rooms: number | null }>,
): readonly number[] {
  const counts = new Set<number>();
  for (const unit of units) if (unit.rooms !== null) counts.add(unit.rooms);
  return [...counts].sort((a, b) => a - b);
}

/** Whether any unit's room count is unstated, so the stock needs the extra row. */
export function hasUnstatedRooms(units: ReadonlyArray<{ readonly rooms: number | null }>): boolean {
  return units.some((u) => u.rooms === null);
}

/** The segment id and label for the units whose room count is not stated. */
export const UNSTATED_ROOMS_SEGMENT = { id: "rooms-unstated", label: "Rooms not stated" } as const;

/** The label for the floor row that holds units whose floor is not stated. */
export const UNSTATED_FLOOR_LABEL = "Floor not stated";

const ROOM_WORDS: Readonly<Record<number, string>> = {
  1: "One",
  2: "Two",
  3: "Three",
  4: "Four",
  5: "Five",
  6: "Six",
};

export function roomLabel(rooms: number): string {
  const word = ROOM_WORDS[rooms];
  return word === undefined ? `${rooms}-room` : `${word}-room`;
}

/**
 * Conversion against the project average, per room count.
 *
 * These two are the first scenario's pinned narrative figures. A count with
 * no pinned figure gets `null` — unknown, never a guess — which every reader
 * of `PulseSegment` already handles for the floor bands.
 */
const ROOM_CONVERSION: Readonly<Record<number, number | null>> = { 2: 0.5, 3: 1.3 };

function buildCatalogue(spec: BuildingSpec): RawUnit[] {
  const units: RawUnit[] = [];

  for (const floor of spec.floors) {
    for (const block of spec.blocks) {
      for (let index = 1; index <= spec.perBlock; index += 1) {
        const code = unitCode(block, floor, index);
        const pinned = spec.pinned[code];
        const r = seed(code);

        // Two- and three-room units alternate by position; the top two floors
        // carry the larger plans, as a real stacking plan does.
        const top = spec.floors[spec.floors.length - 1] ?? 8;
        const rooms =
          pinned?.rooms ?? (floor >= top - 1 ? 3 : index === 2 && block !== "B" ? 3 : 2);
        const areaSqm =
          pinned?.areaSqm ?? (rooms === 2 ? 58 + Math.round(r * 9) : 84 + Math.round(r * 12));
        const orientation = pinned?.orientation ?? spec.orientation[block] ?? "S";

        // Price: area, a floor premium, and a south-facing premium.
        const base = areaSqm * 2_950;
        const floorPremium = (floor - 1) * 4_200;
        const aspectPremium = orientation === "S" ? 9_000 : orientation === "SW" ? 4_000 : 0;
        const price =
          pinned?.price ?? Math.round((base + floorPremium + aspectPremium) / 1000) * 1000;

        /*
         * Availability, scaled by how long the scheme has been selling.
         *
         * `soldPressure` is the threshold a unit must clear to have moved, so a
         * low number means most of the lower stock has gone and a high one means
         * almost nothing has. Kingsford sits at 0.86 because it launched three
         * weeks ago, and a demonstration that showed it half sold would be
         * telling the reader something untrue about a real sales situation.
         */
        let status: UnitStatus = "available";
        if (pinned !== undefined) {
          status = pinned.status;
        } else if (floor <= 2 && r > spec.soldPressure) {
          status = "sold";
        } else if (floor === 3 && r > spec.soldPressure + 0.53) {
          status = "sold";
        } else if (floor >= 6 && r > spec.soldPressure + 0.61) {
          status = "reserved";
        }

        units.push({ code, block, floor, rooms, areaSqm, orientation, price, status });
      }
    }
  }
  return units;
}

/**
 * Attention, derived rather than sprinkled.
 *
 * Interest concentrates on what buyers can still have, on the aspect they keep
 * filtering for, and on the middle floors where price meets view. Sold units
 * retain the attention they earned before they went — hiding it would erase
 * the reason they sold.
 */
function attentionFor(unit: RawUnit): number {
  const r = seed(`${unit.code}:attention`);
  let score = 0.18 + r * 0.22;

  if (unit.rooms === 2) score += 0.34; // the segment the verdict is about
  if (unit.orientation === "S") score += 0.2;
  if (unit.orientation === "SW") score += 0.08;
  if (unit.floor !== null && unit.floor >= 4 && unit.floor <= 6) score += 0.14;
  if (unit.floor === 1) score -= 0.1;
  if (unit.status === "sold") score -= 0.08;

  return Math.max(0.04, Math.min(1, score));
}

const CHANGE_FOR: Record<string, UnitChange> = {
  "A-505": "sold",
  "A-402": "new_interest",
  "B-604": "price_cut",
  // ISTER TOWER's two south-facing compact flats, in the order the reader meets
  // them: one went during the period, and the one left is the flat everybody
  // keeps opening. Neither label is a verdict — `sold` and `new_interest` are
  // both observations, and the unit surface says what to do about them.
  "IT-A-11-07": "sold",
  "IT-A-12-07": "new_interest",
};

/**
 * The catalogue for one project, memoised.
 *
 * The Pulse, the unit surfaces and the showroom session generator must all draw
 * from the same building, or the stacking plan and the meeting records quietly
 * disagree about which flat exists — and they must draw from *that project's*
 * building, which is the correction this function exists to make.
 */
const catalogues = new Map<string, readonly RawUnit[]>();

/**
 * Projects whose catalogue a connector delivered, replacing the synthetic one.
 *
 * Set by the repository before it builds a view, from the `CatalogueSource`
 * it was composed with. What it changes is the stock and nothing else: a
 * delivered unit has no synthetic attention, no pinned change and no
 * narrative figure, because those are observations and the catalogue is not
 * one (ADR-0036). `null` restores the synthetic catalogue.
 */
const delivered = new Map<string, readonly RawUnit[]>();

export function provideCatalogue(projectId: string, units: readonly RawUnit[] | null): void {
  if (units === null) delivered.delete(projectId);
  else delivered.set(projectId, units);
}

/** True while a connector's catalogue stands in for the synthetic one. */
export function hasDeliveredCatalogue(projectId: string): boolean {
  return delivered.has(projectId);
}

/**
 * Schemes whose stacking plan is written out rather than derived.
 *
 * A `BuildingSpec` describes a building as a rule — blocks times floors times
 * units per level — and for a scheme nobody names a flat in, a rule is exactly
 * right. ISTER TOWER is not that scheme: the brief sends a reviewer to
 * `IT-A-12-07` by code and expects the two-room south-facing flat on level
 * twelve, and a rule can promise the code but not the flat.
 *
 * So its units live beside the rest of the world in `world.ts`, in the same
 * `SyntheticUnit` shape as the scenario document's hand-written five, and are
 * adapted to `RawUnit` here. One list, two readers: the Pulse and the session
 * generator cannot disagree about which apartments exist, which is the whole
 * reason `catalogueFor` exists at all.
 */
const ENUMERATED_CATALOGUES: readonly string[] = ["prj_istertower1"];

function enumeratedCatalogue(projectId: string): readonly RawUnit[] {
  /*
   * Parsed rather than cast, for the same reason `world.ts` parses its
   * identifiers: this function is reached with a raw string that came off a
   * route, and the branded type is the only thing standing between a typo and a
   * catalogue silently belonging to nothing.
   */
  return unitsForProject(ProjectIdSchema.parse(projectId)).map((unit) => ({
    code: unit.code,
    block: unit.block,
    floor: unit.floor,
    rooms: unit.rooms,
    areaSqm: unit.areaSqm,
    orientation: unit.orientation,
    price: unit.price,
    status: unit.status,
  }));
}

/**
 * The stock a surface describes: a connector's catalogue when one was
 * delivered for the project, the synthetic one otherwise.
 */
export function catalogueFor(projectId: string): readonly RawUnit[] {
  return delivered.get(projectId) ?? syntheticCatalogueFor(projectId);
}

/**
 * The synthetic building, whatever a connector delivered.
 *
 * The one reader that must never see a delivered catalogue is the session
 * generator: it invents showroom behaviour, and inventing it against a real
 * developer's unit codes would put fabricated meetings on real flats. Its
 * sessions keep touching the synthetic units, which a delivered stock does not
 * contain — so a delivered unit shows exactly the attention it has earned,
 * which is none until ingestion delivers sessions of its own.
 */
export function syntheticCatalogueFor(projectId: string): readonly RawUnit[] {
  const cached = catalogues.get(projectId);
  if (cached !== undefined) return cached;

  if (ENUMERATED_CATALOGUES.includes(projectId)) {
    const listed = enumeratedCatalogue(projectId);
    catalogues.set(projectId, listed);
    return listed;
  }

  const spec = BUILDINGS[projectId];
  if (spec === undefined) {
    /*
     * An unknown project gets nothing, not Northgate.
     *
     * Returning a default catalogue is exactly the bug this replaces: a screen
     * that cannot find its building should render its empty state, so the gap
     * is visible instead of being filled with another development's flats.
     */
    catalogues.set(projectId, []);
    return [];
  }

  const built = buildCatalogue(spec);
  catalogues.set(projectId, built);
  return built;
}

/*
 * There was a `RAW_CATALOGUE` here — Northgate's units, as a module constant,
 * "retained for the surfaces that are still single-project". Four builders
 * read it, and every project rendered Northgate's stock as a result.
 *
 * It is gone rather than deprecated. A constant that is correct for one
 * project and silently wrong for every other one is not a thing to leave
 * lying about with a comment on it.
 */

export function buildProjectPulse(context: ViewContext): ProjectPulse {
  const raw = catalogueFor(context.project.id as string);
  const { locale, currency } = {
    locale: context.project.locale,
    currency: context.project.currency,
  };

  /*
   * A delivered catalogue carries no observed attention. The synthetic
   * scoring below is a stand-in for sessions that never happened, and
   * applying it to a real developer's flats would put invented interest on
   * screen against real codes. Zero is the true figure until sessions arrive.
   */
  const observed = !hasDeliveredCatalogue(context.project.id as string);

  const withAttention = raw.map((unit) => {
    const attention = observed ? attentionFor(unit) : 0;
    const meaningfulViews = Math.round(attention * 46);
    const r = seed(`${unit.code}:trend`);
    return {
      ...unit,
      attention,
      meaningfulViews,
      uniqueContacts: observed ? Math.max(0, Math.round(meaningfulViews * (0.45 + r * 0.2))) : 0,
      trend: (!observed
        ? "flat"
        : attention > 0.62
          ? "rising"
          : attention < 0.25
            ? "falling"
            : "flat") as PulseUnit["trend"],
    };
  });

  const peakViews = Math.max(...withAttention.map((u) => u.meaningfulViews));

  const units: PulseUnit[] = withAttention.map((unit) => {
    return {
      /*
       * Every separator goes, not the first one.
       *
       * `replace` with a string argument replaces one occurrence, which was
       * invisible while every code held a single hyphen. ISTER TOWER spells a
       * unit `IT-A-12-07`, and one-shot replacement turned that into
       * `unt_ita-12-07` — an identifier with hyphens in it, which is not the
       * shape `UnitIdSchema` describes and which would have travelled straight
       * into a route. Codes with one hyphen produce exactly the same string as
       * before, so nothing that already existed moves.
       */
      unitId: `unt_${unit.code.toLowerCase().replaceAll("-", "")}`,
      code: unit.code,
      block: unit.block,
      floor: unit.floor,
      rooms: unit.rooms,
      areaSqm: unit.areaSqm,
      orientation: unit.orientation,
      price: unit.price,
      priceDisplay: moneyOr(unit.price, currency, locale),
      status: unit.status,
      meaningfulViews: unit.meaningfulViews,
      uniqueContacts: unit.uniqueContacts,
      attention: peakViews === 0 ? 0 : unit.meaningfulViews / peakViews,
      trend: unit.trend,
      change: observed ? (CHANGE_FOR[unit.code] ?? null) : null,
      intent:
        unit.status !== "available" || !observed
          ? null
          : unit.attention > 0.72
            ? "high"
            : unit.attention > 0.45
              ? "medium"
              : unit.uniqueContacts < 3
                ? "insufficient_data"
                : "low",
    };
  });

  /*
   * Floors, top first, and one more row at the bottom for the units whose
   * catalogue states no floor. They are stock; a building that left them out
   * would claim fewer units than it sells. The row is labelled in words and
   * sorts last, below the ground floor, because "below everything" is the
   * only place that does not imply a level.
   */
  const byFloor = new Map<number | null, PulseUnit[]>();
  for (const unit of units) {
    const list = byFloor.get(unit.floor) ?? [];
    list.push(unit);
    byFloor.set(unit.floor, list);
  }

  const floors: PulseFloor[] = [...byFloor.entries()]
    .sort((a, b) => (b[0] ?? -Infinity) - (a[0] ?? -Infinity))
    .map(([floor, floorUnits]) => ({
      floor,
      label: floor === null ? UNSTATED_FLOOR_LABEL : `L${floor}`,
      units: floorUnits.sort((a, b) => a.code.localeCompare(b.code)),
      available: floorUnits.filter((u) => u.status === "available").length,
      attention:
        floorUnits.reduce((sum, u) => sum + u.attention, 0) / Math.max(1, floorUnits.length),
    }));

  const totalAttention = units.reduce((sum, u) => sum + u.attention, 0);

  function segment(
    id: string,
    dimension: PulseSegment["dimension"],
    label: string,
    predicate: (u: PulseUnit) => boolean,
    conversionRatio: number | null,
  ): PulseSegment {
    const members = units.filter(predicate);
    const share =
      members.reduce((sum, u) => sum + u.attention, 0) / Math.max(0.0001, totalAttention);
    const inventoryShare = members.length / Math.max(1, units.length);
    return {
      id,
      dimension,
      label,
      unitIds: members.map((u) => u.unitId),
      attentionIndex: inventoryShare === 0 ? 0 : Number((share / inventoryShare).toFixed(2)),
      conversionRatio,
      available: members.filter((u) => u.status === "available").length,
    };
  }

  /*
   * A unit whose room count is not stated is its own row, never folded into
   * a guessed count and never dropped: the scale claims to cover the stock.
   * A unit whose floor is not stated belongs to no band, and one whose aspect
   * is not stated faces neither south nor west; both stay in the totals.
   */
  const segments: PulseSegment[] = [
    ...roomCounts(units).map((rooms) =>
      segment(
        `rooms-${rooms}`,
        "rooms",
        roomLabel(rooms),
        (u) => u.rooms === rooms,
        observed ? (ROOM_CONVERSION[rooms] ?? null) : null,
      ),
    ),
    ...(hasUnstatedRooms(units)
      ? [
          segment(
            UNSTATED_ROOMS_SEGMENT.id,
            "rooms",
            UNSTATED_ROOMS_SEGMENT.label,
            (u) => u.rooms === null,
            null,
          ),
        ]
      : []),
    segment(
      "aspect-s",
      "orientation",
      "South-facing",
      (u) => u.orientation === "S",
      observed ? 1.1 : null,
    ),
    segment(
      "aspect-w",
      "orientation",
      "West-facing",
      (u) => u.orientation === "W",
      observed ? 0.8 : null,
    ),
    segment(
      "floors-low",
      "floor_band",
      "Floors 1–3",
      (u) => u.floor !== null && u.floor <= 3,
      null,
    ),
    segment(
      "floors-mid",
      "floor_band",
      "Floors 4–6",
      (u) => u.floor !== null && u.floor >= 4 && u.floor <= 6,
      observed ? 1.2 : null,
    ),
    segment(
      "floors-high",
      "floor_band",
      "Floors 7–8",
      (u) => u.floor !== null && u.floor >= 7,
      null,
    ),
  ];

  const root = `/${context.tenant.slug}/${context.project.slug}`;

  return {
    context,
    buildingLabel: context.project.name,
    floors,
    blocks: [...new Set(units.map((u) => u.block))],
    segments,
    totals: {
      units: units.length,
      available: units.filter((u) => u.status === "available").length,
      reserved: units.filter((u) => u.status === "reserved").length,
      sold: units.filter((u) => u.status === "sold").length,
      // Seven is the scenario's figure; a delivered catalogue has no observed period yet.
      soldInPeriod: observed ? 7 : null,
    },
    peakViews,
    // A delivered catalogue rests on no observed sessions yet; the count says so.
    evidence: evidenceRef(
      "northgate.pulse",
      "observed_sequence",
      `${root}/project`,
      observed ? 46 : 0,
    ),
  };
}

/* --- Ask Observer, deterministic ------------------------------------------ */

/**
 * Deterministic answers behind the interface a model will later call.
 *
 * Each one is a sentence, the figures it rests on, an evidence reference, and
 * what to do next. When a model arrives it chooses the query and writes the
 * prose; the figures still come from here.
 */
export function buildAskSession(
  context: ViewContext,
  pulse: ProjectPulse,
  selectionLabel: string | null,
): AskSession {
  const root = `/${context.tenant.slug}/${context.project.slug}`;
  const twoRoom = pulse.segments.find((s) => s.id === "rooms-2");
  const available = pulse.totals.available;

  const answers: AskAnswer[] = [
    {
      question: "Why did demand fall this quarter?",
      answer:
        "Demand did not fall — viewings held at 46. Offers fell from 17 to 12, and the whole loss sits in two-room units.",
      figures: [
        { label: "Viewings", value: "46", note: "unchanged" },
        { label: "Offers", value: "12", note: "was 17" },
        {
          label: "Two-room attention index",
          value: String(twoRoom?.attentionIndex ?? "—"),
          note: "above 1 means over-indexed",
        },
      ],
      evidence: evidenceRef("ask.demand", "observed_sequence", `${root}/flow`, 46),
      actionLabel: "Open two-room pricing",
      actionHref: `${root}/project`,
      followUps: [
        "Which two-room units lose their comparisons?",
        "What are buyers filtering for that we cannot supply?",
      ],
      caveat: null,
    },
    {
      question: "Which available two-bedroom apartments have the strongest verified interest?",
      answer: `${
        pulse.floors
          .flatMap((f) => f.units)
          .filter((u) => u.rooms === 2 && u.status === "available" && u.intent === "high").length
      } available two-room units currently hold a high intent signal, all on floors 4 to 6 and all south or south-west facing.`,
      figures: [
        { label: "Available two-room", value: String(twoRoom?.available ?? 0), note: null },
        {
          label: "Peak interest",
          value: `${pulse.peakViews} meaningful views`,
          note: "busiest unit",
        },
      ],
      evidence: evidenceRef("ask.strongest", "observed_sequence", `${root}/project`, 46),
      actionLabel: "Filter the Pulse to these",
      actionHref: `${root}/project`,
      followUps: [
        "Who are the interested buyers?",
        "How do these compare on price per square metre?",
      ],
      caveat:
        "Intent signals expire after 21 days; two of these were calculated more than a fortnight ago.",
    },
    {
      question: "Which prospects should the sales team contact this week?",
      answer:
        "Four buyers shortlisted a unit and have had no contact since their meeting. One of them shortlisted A-505, which has since sold.",
      figures: [
        { label: "Uncontacted after a meeting", value: "4", note: "median wait 11 days" },
        { label: "Affected by a sold unit", value: "1", note: "Viktória Halász, A-505" },
      ],
      evidence: evidenceRef("ask.contact", "observed_sequence", `${root}/people`, 4),
      actionLabel: "Open the follow-up list",
      actionHref: `${root}/people`,
      followUps: ["Prepare me for Viktória's meeting", "Who has waited longest?"],
      caveat: null,
    },
    {
      question: "Prepare me for Viktória's meeting.",
      answer:
        "Three visits in three weeks, two units shortlisted, both two-room and south-facing. She kept A-505 in a direct comparison and it sold four days after her last visit.",
      figures: [
        { label: "Visits", value: "3", note: "last one 3 days ago" },
        { label: "Shortlisted", value: "A-402, A-505", note: "A-505 now sold" },
        { label: "Price range", value: "Never stated", note: "she set no price filter" },
      ],
      evidence: evidenceRef("ask.viktoria", "observed_sequence", `${root}/people`, 3),
      actionLabel: "Open the full brief",
      actionHref: `${root}/meetings/mtg_viktoria0827`,
      followUps: [
        "What should I offer instead of A-505?",
        "What has changed since her last visit?",
      ],
      caveat:
        "No CRM record is linked to this contact, so earlier contact by a colleague would not appear.",
    },
    {
      question: "Which apartment attributes are gaining demand?",
      answer: `South-facing units draw ${
        pulse.segments.find((s) => s.id === "aspect-s")?.attentionIndex ?? "—"
      }× their share of attention, and floors 4 to 6 draw ${
        pulse.segments.find((s) => s.id === "floors-mid")?.attentionIndex ?? "—"
      }×.`,
      figures: pulse.segments
        .filter((s) => s.attentionIndex >= 1)
        .slice(0, 3)
        .map((s) => ({
          label: s.label,
          value: `${s.attentionIndex}×`,
          note: `${s.available} available`,
        })),
      evidence: evidenceRef("ask.attributes", "statistical_association", `${root}/project`, 48),
      actionLabel: "Open segment intelligence",
      actionHref: `${root}/project`,
      followUps: ["Which of these convert?", "What is priced above what buyers will pay?"],
      caveat: null,
    },
    {
      question: "Create a one-page report for tomorrow's management meeting.",
      answer:
        "A one-page summary is ready: the verdict, the four figures, the two-room finding, three stalled offers and the recommended actions.",
      figures: [
        { label: "Period", value: context.period.label, note: context.period.baselineLabel },
        { label: "Available units", value: String(available), note: `of ${pulse.totals.units}` },
      ],
      evidence: evidenceRef("ask.report", "observed_sequence", `${root}/flow`, 46),
      actionLabel: "Reports arrive in M4",
      actionHref: `${root}/overview`,
      followUps: ["Include the buyer list", "Compare with last quarter"],
      caveat: "Report generation is not built yet; this answer describes what it would contain.",
    },
  ];

  return {
    context: {
      projectLabel: context.project.name,
      periodLabel: context.period.label,
      selectionLabel,
    },
    suggestions: answers.slice(0, 4).map((a) => a.question),
    answers,
  };
}
