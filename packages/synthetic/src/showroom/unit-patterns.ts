import type { ShowroomSession } from "@observer/contracts";
import {
  areaWord,
  aspectWord,
  floorWord,
  roomsWord,
  type AssistedSale,
  type UnitAttentionPatterns,
  type UnitPatternFlat,
  type UnitPatternLine,
  type ViewContext,
} from "@observer/readmodels";

import { evidenceRef, money, percent } from "../format";
import { catalogueFor, type RawUnit } from "../pulse";
import { buildUnitAttention } from "./project";

/**
 * WHAT THE MOST-OPENED FLATS SHARE (ADR-0050).
 *
 * The owner, 2026-10-20: a list of the most-opened flats with their meeting
 * counts is not an answer; the answer is what those flats have in common —
 * the aspect, the floors, the rooms, the price. So the period's most-opened
 * flats are compared, attribute by attribute, with the WHOLE CATALOGUE: a flat
 * is opened whatever its status, so every flat could have been among them, and
 * the sold ones stay in both shares.
 *
 * A statistical association about the flats and nothing more. Every sentence
 * says which flats and against what share of the catalogue; none says why a
 * buyer opened them. An attribute the catalogue does not state is never put in
 * a band and never compared: it counts against a concentration, never for it.
 * English only, as the Ask tools ask in `DEFAULT_LANGUAGE`.
 */

/** "Most-opened" means this many flats, unless fewer were opened. */
export const UNIT_PATTERN_TOP = 5;

/*
 * ponytail: two fixed thresholds, not a significance test. 70% rather than the
 * 60% first asked for: with five flats 60% is three of them, which five flats
 * drawn at random from a band holding a third of the catalogue reach about one
 * time in five (four of five, about one in twenty). On Shark it printed "3 of
 * the 5 measure 62 to 88 m²" beside two flats of 59 m². The 1.5× lift keeps a
 * band that is most of the catalogue from reading as a pattern. A binomial
 * test against the base share is the upgrade if a false line still shows.
 */
export const PATTERN_MIN_SHARE = 0.7;
export const PATTERN_MIN_LIFT = 1.5;

/** Below either, nothing is compared: the flats are listed and the note says how far short. */
export const PATTERN_MIN_MEETINGS = 10;
export const PATTERN_MIN_OPENED = 3;

const COMPASS: Readonly<Record<string, string>> = {
  N: "north",
  NE: "north-east",
  E: "east",
  SE: "south-east",
  S: "south",
  SW: "south-west",
  W: "west",
  NW: "north-west",
};

const ROOM_NUMBERS = ["no", "one", "two", "three", "four", "five", "six"];

/** The catalogue's thirds by price and by area, cheapest and smallest first. */
const PRICE_THIRDS = ["cheapest", "middle", "dearest"] as const;
const AREA_THIRDS = ["smallest", "middle", "largest"] as const;
const FLOOR_BANDS = ["lower", "middle", "upper"] as const;

/** A set of catalogue flats an attribute value picks out, with how to say it. */
interface Band {
  readonly id: string;
  /** The predicate, plural: "face south", "are on the middle floors, 4 to 7". */
  readonly phrase: string;
  /** The same, as a label: "Facing south", "Floors 4 to 7". */
  readonly label: string;
  readonly holds: (unit: RawUnit) => boolean;
}

interface Attribute {
  readonly id: string;
  readonly value: (unit: RawUnit) => number | string | null;
  /** "flats in the catalogue", "priced flats in the catalogue". */
  readonly noun: string;
  readonly bands: readonly Band[];
  /** A continuous attribute's span among the flats, said when no band concentrates. */
  readonly range:
    ((top: readonly RawUnit[], stated: readonly RawUnit[], noun: string) => string | null) | null;
}

function share(part: number, whole: number, locale: string): string {
  return percent(whole === 0 ? 0 : part / whole, locale);
}

const was = (n: number) => (n === 1 ? "was" : "were");

/** "All 5", "4 of the 5": the subject once the flats are named. */
const of = (k: number, n: number) =>
  k === n ? `All ${String(n)}` : `${String(k)} of the ${String(n)}`;

/** "All 5 most-opened flats", "4 of the 5 most-opened flats". */
const lead = (k: number, n: number) => `${of(k, n)} most-opened flats`;

function joinCodes(codes: readonly string[]): string {
  return codes.length <= 1
    ? (codes[0] ?? "")
    : `${codes.slice(0, -1).join(", ")} and ${codes[codes.length - 1] ?? ""}`;
}

/** One band per value the catalogue states. */
function categorical(
  units: readonly RawUnit[],
  value: (unit: RawUnit) => number | string | null,
  words: (value: number | string) => readonly [phrase: string, label: string],
): Band[] {
  const values = [...new Set(units.map(value).filter((v) => v !== null))];
  return values.map((v) => {
    const [phrase, label] = words(v);
    return { id: String(v), phrase, label, holds: (u: RawUnit) => value(u) === v };
  });
}

/** "€212,000 to €289,000", or the one value where both ends meet. */
function span(low: number, high: number, say: (v: number) => string): string {
  return low === high ? say(low) : `${say(low)} to ${say(high)}`;
}

/**
 * The catalogue's own thirds, by value: cut at the values ranked n/3 and 2n/3,
 * so a tie sits wholly in the lower band. Bands left empty by ties are dropped.
 */
function thirds(
  units: readonly RawUnit[],
  value: (unit: RawUnit) => number | null,
  words: (index: number, low: number, high: number) => readonly [phrase: string, label: string],
): Band[] {
  const sorted = units
    .map(value)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  if (sorted.length < 3) return [];
  const cut1 = sorted[Math.ceil(sorted.length / 3) - 1] as number;
  const cut2 = sorted[Math.ceil((2 * sorted.length) / 3) - 1] as number;
  const within = [
    (v: number) => v <= cut1,
    (v: number) => v > cut1 && v <= cut2,
    (v: number) => v > cut2,
  ];
  return within.flatMap((inBand, index) => {
    const members = sorted.filter(inBand);
    if (members.length === 0) return [];
    const low = members[0] as number;
    const high = members[members.length - 1] as number;
    const [phrase, label] = words(index, low, high);
    return [
      {
        id: String(index),
        phrase,
        label,
        holds: (u: RawUnit) => {
          const v = value(u);
          return v !== null && inBand(v);
        },
      },
    ];
  });
}

/** The floors the building has, in thirds of its storeys rather than of its flats. */
function floorBands(units: readonly RawUnit[]): Band[] {
  const floors = [
    ...new Set(units.map((u) => u.floor).filter((f): f is number => f !== null)),
  ].sort((a, b) => a - b);
  if (floors.length < 3) return [];
  const edge = Math.round(floors.length / 3);
  const groups = [
    floors.slice(0, edge),
    floors.slice(edge, floors.length - edge),
    floors.slice(-edge),
  ];
  return groups.flatMap((group, index) => {
    const low = group[0];
    const high = group[group.length - 1];
    if (low === undefined || high === undefined) return [];
    return [
      {
        id: String(index),
        phrase:
          low === high
            ? `are on floor ${String(low)}`
            : `are on the ${FLOOR_BANDS[index] ?? ""} floors, ${String(low)} to ${String(high)}`,
        label: low === high ? `Floor ${String(low)}` : `Floors ${String(low)} to ${String(high)}`,
        holds: (u: RawUnit) => u.floor !== null && group.includes(u.floor),
      },
    ];
  });
}

/** The span the flats cover and how much of the catalogue falls inside it. */
function spanLine(
  top: readonly RawUnit[],
  stated: readonly RawUnit[],
  value: (unit: RawUnit) => number | null,
  say: (low: number, high: number) => string,
  noun: string,
  locale: string,
): string | null {
  const values = top.map(value).filter((v): v is number => v !== null);
  if (values.length < 2) return null;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const inside = stated.filter((u) => {
    const v = value(u);
    return v !== null && v >= low && v <= high;
  }).length;
  const unstated = top.length - values.length;
  return `The most-opened flats ${say(low, high)}; ${share(inside, stated.length, locale)} of the ${String(stated.length)} ${noun} fall in that range${unstated === 0 ? "" : `, and ${String(unstated)} of the ${String(top.length)} ${unstated === 1 ? "does" : "do"} not state it`}.`;
}

function attributes(
  catalogue: readonly RawUnit[],
  currency: string,
  locale: string,
): readonly Attribute[] {
  const price = (u: RawUnit) => u.price;
  const area = (u: RawUnit) => u.areaSqm;
  const floor = (u: RawUnit) => u.floor;
  /* A delivered flat with no building arrives with an empty block: unstated, not a block. */
  const block = (u: RawUnit) => (u.block === "" ? null : u.block);
  const fmt = (v: number) => money(v, currency, locale);
  return [
    {
      id: "rooms",
      value: (u) => u.rooms,
      noun: "flats in the catalogue that state their rooms",
      bands: categorical(
        catalogue,
        (u) => u.rooms,
        (v) => {
          const rooms = `${ROOM_NUMBERS[Number(v)] ?? String(v)} ${Number(v) === 1 ? "room" : "rooms"}`;
          return [`have ${rooms}`, rooms.charAt(0).toUpperCase() + rooms.slice(1)];
        },
      ),
      range: null,
    },
    {
      id: "floor",
      value: floor,
      noun: "flats in the catalogue that state a floor",
      bands: floorBands(catalogue),
      range: (top, stated, noun) =>
        spanLine(
          top,
          stated,
          floor,
          (low, high) =>
            low === high
              ? `are all on floor ${String(low)}`
              : `stand on floors ${String(low)} to ${String(high)}`,
          noun,
          locale,
        ),
    },
    {
      id: "orientation",
      value: (u) => u.orientation,
      noun: "flats in the catalogue that state an aspect",
      bands: categorical(
        catalogue,
        (u) => u.orientation,
        (v) => [
          `face ${COMPASS[String(v)] ?? String(v)}`,
          `Facing ${COMPASS[String(v)] ?? String(v)}`,
        ],
      ),
      range: null,
    },
    {
      id: "block",
      value: block,
      noun: "flats in the catalogue that state a block",
      bands: categorical(catalogue, block, (v) => [
        `are in block ${String(v)}`,
        `Block ${String(v)}`,
      ]),
      range: null,
    },
    {
      id: "price",
      value: price,
      noun: "priced flats in the catalogue",
      bands: thirds(catalogue, price, (index, low, high) => [
        `are priced ${span(low, high, fmt)} (the ${PRICE_THIRDS[index] ?? ""} third)`,
        span(low, high, fmt),
      ]),
      range: (top, stated, noun) =>
        spanLine(
          top,
          stated,
          price,
          (low, high) => `are priced from ${fmt(low)} to ${fmt(high)}`,
          noun,
          locale,
        ),
    },
    {
      id: "area",
      value: area,
      noun: "flats in the catalogue that state an area",
      bands: thirds(catalogue, area, (index, low, high) => [
        `measure ${span(low, high, String)} m² (the ${AREA_THIRDS[index] ?? ""} third)`,
        `${span(low, high, String)} m²`,
      ]),
      range: (top, stated, noun) =>
        spanLine(
          top,
          stated,
          area,
          (low, high) => `measure from ${String(low)} to ${String(high)} m²`,
          noun,
          locale,
        ),
    },
  ];
}

interface Candidate {
  readonly attribute: string;
  readonly phrase: string;
  readonly label: string;
  readonly top: readonly string[];
  readonly base: readonly string[];
  readonly baseTotal: number;
  readonly noun: string;
}

/**
 * The patterns, the ranges for attributes with none, and which attributes had one.
 * Two attributes that pick out the same flats in the top and in the catalogue
 * are one fact, said once ("are in block S and face south").
 */
function findPatterns(
  top: readonly RawUnit[],
  catalogue: readonly RawUnit[],
  currency: string,
  locale: string,
  meetings: number,
  base: string,
): { patterns: UnitPatternLine[]; ranges: string[] } {
  const n = top.length;
  const candidates: Candidate[] = [];
  const ranges: string[] = [];
  for (const attribute of attributes(catalogue, currency, locale)) {
    const stated = catalogue.filter((u) => attribute.value(u) !== null);
    /* The narrower noun only where some flat leaves the attribute out. */
    const noun = stated.length === catalogue.length ? "flats in the catalogue" : attribute.noun;
    let found = false;
    for (const band of attribute.bands) {
      const inTop = top.filter(band.holds);
      const inBase = stated.filter(band.holds);
      const topShare = inTop.length / n;
      const baseShare = inBase.length / stated.length;
      if (topShare >= PATTERN_MIN_SHARE && topShare >= PATTERN_MIN_LIFT * baseShare) {
        found = true;
        candidates.push({
          attribute: attribute.id,
          phrase: band.phrase,
          label: band.label,
          top: inTop.map((u) => u.code),
          base: inBase.map((u) => u.code),
          baseTotal: stated.length,
          noun,
        });
      }
    }
    if (!found && attribute.range !== null) {
      const line = attribute.range(top, stated, noun);
      if (line !== null) ranges.push(line);
    }
  }

  const merged = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const key = `${c.top.join(",")}|${c.base.join(",")}`;
    merged.set(key, [...(merged.get(key) ?? []), c]);
  }
  const groups = [...merged.values()].map((group) => ({
    group,
    first: group[0] as Candidate,
    id: group.map((c) => c.attribute).join("-"),
  }));
  /* The strongest concentration first: the most flats, then the furthest above the catalogue. */
  groups.sort(
    (a, b) =>
      b.first.top.length - a.first.top.length ||
      a.first.base.length / a.first.baseTotal - b.first.base.length / b.first.baseTotal ||
      a.id.localeCompare(b.id),
  );
  /* The first line names the flats; the lines after it read on from it ("All 5 have two rooms"). */
  const patterns = groups.map(({ group, first, id }, index): UnitPatternLine => {
    const k = first.top.length;
    return {
      id,
      label: group.map((c) => c.label).join(" · "),
      statement: `${index === 0 ? lead(k, n) : of(k, n)} ${group.map((c) => c.phrase).join(" and ")}, against ${share(first.base.length, first.baseTotal, locale)} of the ${String(first.baseTotal)} ${first.noun}.`,
      topCount: k,
      topTotal: n,
      baseCount: first.base.length,
      baseTotal: first.baseTotal,
      unitCodes: first.top,
      evidence: evidenceRef(
        `unit-pattern-${id}`,
        "statistical_association",
        `${base}/units`,
        meetings,
      ),
    };
  });
  return { patterns, ranges };
}

export interface UnitPatternSales {
  /** Whether a CRM is connected at all; without one no sale has a date. */
  readonly connected: boolean;
  /** The demonstration CRM makes its deals from meetings (ADR-0049), which the reader is told. */
  readonly demonstration: boolean;
  readonly windowHours: number;
  /** ADR-0039 for one flat: its newest dated sale placed against its last showing, or null. */
  readonly saleOf: (unitCode: string) => AssistedSale | null;
}

const byCode = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

export function buildUnitAttentionPatterns(
  context: ViewContext,
  sessions: readonly ShowroomSession[],
  sales: UnitPatternSales,
  size = UNIT_PATTERN_TOP,
): UnitAttentionPatterns {
  const locale = context.project.locale;
  const currency = context.project.currency;
  const base = `/${context.tenant.slug}/${context.project.slug}`;
  const periodLabel = context.period.label.toLowerCase();
  const catalogue = catalogueFor(context.project.id as string);
  const units = new Map(catalogue.map((u) => [u.code, u]));
  const meetings = sessions.length;

  /* The register's own counts, so a flat's figure here is the figure on its row. */
  const ranked = buildUnitAttention(context, sessions, [], null)
    .rows.filter((r) => r.meetings > 0)
    .sort(
      (a, b) =>
        b.meetings - a.meetings || b.favourites - a.favourites || byCode(a.unitCode, b.unitCode),
    );
  const chosen = ranked.slice(0, size);

  const top: UnitPatternFlat[] = chosen.map((row) => {
    const unit = units.get(row.unitCode);
    const sale = sales.connected ? sales.saleOf(row.unitCode) : null;
    return {
      unitCode: row.unitCode,
      href: `${base}/units/${row.unitCode}`,
      meetings: row.meetings,
      favourites: row.favourites,
      status: row.status,
      attributesDisplay: [
        roomsWord(row.rooms, context.language),
        areaWord(row.areaSqm),
        aspectWord(row.orientation),
        floorWord(row.floor),
        unit === undefined || unit.block === "" ? "Block not stated" : `block ${unit.block}`,
        row.priceDisplay,
      ].join(" · "),
      sale:
        sale === null
          ? null
          : {
              verdict: sale.verdict,
              verdictLabel: sale.verdictLabel,
              stageLabel: sale.stageLabel,
              stageDateDisplay: sale.stageDateDisplay,
            },
    };
  });

  const ranking = top
    .map((f, i) =>
      i === 0
        ? `${f.unitCode} (${String(f.meetings)} of ${String(meetings)} meetings)`
        : `${f.unitCode} (${String(f.meetings)})`,
    )
    .join(", ");

  /* Every tie that touches the list, and who it leaves outside. */
  const ties = [...new Set(top.map((f) => f.meetings))].flatMap((m) => {
    const group = ranked.filter((r) => r.meetings === m).map((r) => r.unitCode);
    if (group.length < 2) return [];
    const inside = group.filter((code) => top.some((f) => f.unitCode === code));
    const outside = group.length - inside.length;
    return [
      `${joinCodes(inside)}${outside === 0 ? "" : ` and ${String(outside)} more`} were each opened in ${String(m)} meetings`,
    ];
  });
  const cut = ranked.length > top.length;
  const tieNote =
    ties.length === 0
      ? null
      : `${ties.join("; ")}. A tie is ordered by times shortlisted, then by unit code${cut ? `, and the list stops at ${String(top.length)}` : ""}.`;

  const evidence = evidenceRef(
    "unit-patterns",
    "statistical_association",
    `${base}/units`,
    meetings,
  );
  const short =
    catalogue.length === 0
      ? "No unit catalogue has reached this project yet, so there is no flat to compare."
      : meetings < PATTERN_MIN_MEETINGS
        ? `Only ${String(meetings)} meetings in ${periodLabel}, ${String(PATTERN_MIN_MEETINGS - meetings)} short of the ${String(PATTERN_MIN_MEETINGS)} a pattern needs, so no attribute is compared.`
        : ranked.length < PATTERN_MIN_OPENED
          ? `Only ${String(ranked.length)} flats were opened in ${periodLabel}; a pattern needs at least ${String(PATTERN_MIN_OPENED)}, so no attribute is compared.`
          : null;

  if (short !== null) {
    return {
      context,
      state: "insufficient",
      meetings,
      opened: ranked.length,
      catalogueSize: catalogue.length,
      top,
      ranking,
      tieNote,
      patterns: [],
      ranges: [],
      note: short,
      conversion: [],
      caveats: [],
      evidence,
    };
  }

  const topUnits = top.flatMap((f) => {
    const unit = units.get(f.unitCode);
    return unit === undefined ? [] : [unit];
  });
  const { patterns, ranges } = findPatterns(topUnits, catalogue, currency, locale, meetings, base);
  const n = top.length;

  /* Conversion: the catalogue's status now, then ADR-0039 per flat. */
  const held = top.filter((f) => f.status !== "available");
  const heldBase = catalogue.filter((u) => u.status !== "available").length;
  const conversion = [
    `${of(held.length, n)} are reserved or sold now, against ${share(heldBase, catalogue.length, locale)} of the ${String(catalogue.length)} flats in the catalogue.`,
  ];
  if (!sales.connected) {
    conversion.push(
      "No CRM is connected to this project, so none of their sales can be placed against a showing.",
    );
  } else {
    const dated = top.filter((f) => f.sale !== null);
    const verdicts = (v: string) => dated.filter((f) => f.sale?.verdict === v).length;
    const within = verdicts("shown_in_window");
    const earlier = verdicts("shown_earlier");
    const never = verdicts("not_shown");
    /* A CRM sale on a flat the catalogue still offers: both are said, neither is corrected. */
    const stillListed = dated.filter((f) => f.status === "available").map((f) => f.unitCode);
    if (dated.length > 0) {
      conversion.push(
        `Of the ${String(dated.length)} whose sale the CRM dates, ${String(within)} followed an IRIS showing within ${String(sales.windowHours)} hours${earlier === 0 ? "" : `; ${String(earlier)} ${was(earlier)} shown earlier`}${never === 0 ? "" : `; ${String(never)} ${was(never)} not shown before it`}.${stillListed.length === 0 ? "" : ` The catalogue still lists ${joinCodes(stillListed)} as available.`}`,
      );
    }
    const undated = held.filter((f) => f.sale === null).map((f) => f.unitCode);
    if (undated.length > 0) {
      conversion.push(
        `The CRM states no sale date for ${joinCodes(undated)}, so ${undated.length === 1 ? "it" : "they"} cannot be placed against a showing.`,
      );
    }
  }

  return {
    context,
    state: "ok",
    meetings,
    opened: ranked.length,
    catalogueSize: catalogue.length,
    top,
    ranking,
    tieNote,
    patterns,
    ranges,
    note:
      patterns.length === 0
        ? `The ${String(n)} most-opened flats share no single attribute more than the catalogue does.`
        : null,
    conversion,
    caveats: [
      "Compared with the whole catalogue, sold and reserved flats included: a flat is opened whatever its status. These are associations about the flats; they say nothing about why a buyer opened them, and rooms, area and price move together, so one cannot be told from another here.",
      ...(sales.demonstration
        ? [
            "The demonstration CRM makes each of its deals from a meeting that opened the flat, so a flat opened often carries a deal more often by construction; a real CRM is not made that way.",
          ]
        : []),
    ],
    evidence,
  };
}
