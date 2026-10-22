import type { ShowroomSession } from "@observer/contracts";
import {
  areaWord,
  roomsWord,
  type AssistVerdict,
  type UnitAttentionPatterns,
  type UnitPatternFlat,
  type UnitPatternLine,
  type ViewContext,
} from "@observer/readmodels";

import type { PlacedSale } from "../deals";
import { evidenceRef, money, percent } from "../format";
import { catalogueFor, type RawUnit } from "../pulse";
import { buildUnitAttention } from "./project";

/**
 * WHAT THE MOST-OPENED FLATS SHARE (ADR-0051).
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
 * ponytail: one chance test per line, not a correction across the lines.
 *
 * A band (an aspect, a block, a room count, a storey band) is a pattern when
 * at least 70% of the most-opened flats hold it AND that many flats drawn at
 * random from the catalogue would hold it less than one time in twenty
 * (`bandChance`). A price or an area is a pattern when ALL the flats fall in a
 * span that flats drawn at random would stay inside less than one time in
 * twenty (`spanChance`): the flats' own span, so a fixed third of the catalogue
 * never cuts through a cluster of near-identical plans. Some fifteen values
 * are tested per question, so one line of an answer can still be chance, and
 * the caveat says so. A Bonferroni bar would find nothing among five flats;
 * raise UNIT_PATTERN_TOP before tightening it.
 */
export const PATTERN_MIN_SHARE = 0.7;
export const PATTERN_MAX_CHANCE = 0.05;

/** Below either, nothing is compared: the flats are listed and the note says how far short. */
export const PATTERN_MIN_MEETINGS = 10;
export const PATTERN_MIN_OPENED = 3;

/** n choose k. */
function choose(n: number, k: number): number {
  let c = 1;
  for (let i = 1; i <= k; i += 1) c = (c * (n - k + i)) / i;
  return c;
}

/**
 * The chance that n flats drawn at random hold at least k of a band that holds
 * `share` of the catalogue: the binomial tail. Drawn without replacement the
 * chance is a little smaller, so this errs towards saying nothing.
 */
export function bandChance(k: number, n: number, share: number): number {
  let total = 0;
  for (let i = k; i <= n; i += 1) total += choose(n, i) * share ** i * (1 - share) ** (n - i);
  return total;
}

/**
 * The chance that n flats drawn at random span no more than `share` of the
 * catalogue between their lowest and highest value: n·s^(n−1) − (n−1)·s^n, the
 * range of n uniform draws.
 */
export function spanChance(n: number, share: number): number {
  return n * share ** (n - 1) - (n - 1) * share ** n;
}

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

const ROOM_NUMBERS = ["", "one", "two", "three", "four", "five", "six"];
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

/** How a continuous attribute's span among the flats is said. */
interface Span {
  /** As a pattern: "are priced €191,000 to €218,000". */
  readonly phrase: (low: number, high: number) => string;
  readonly label: (low: number, high: number) => string;
  /** As a range line's opening: "They are priced €191,000 to €218,000". */
  readonly range: (low: number, high: number) => string;
}

interface Attribute {
  readonly id: string;
  readonly value: (unit: RawUnit) => number | string | null;
  /** "flats in the catalogue that state an aspect": the base where some flat leaves it out. */
  readonly noun: string;
  readonly bands: readonly Band[];
  /** A continuous attribute: the flats' own span, a pattern or else a range line. */
  readonly span: Span | null;
}

function share(part: number, whole: number, locale: string): string {
  return percent(whole === 0 ? 0 : part / whole, locale);
}

const was = (n: number) => (n === 1 ? "was" : "were");
const meetingsWord = (n: number) => `${String(n)} ${n === 1 ? "meeting" : "meetings"}`;

/** "All 5", "4 of the 5", "None of the 5": a count of the most-opened flats. */
const of = (k: number, n: number) =>
  k === n
    ? `All ${String(n)}`
    : k === 0
      ? `None of the ${String(n)}`
      : `${String(k)} of the ${String(n)}`;

/** The verb after `of`: "None of the 5 is", "1 of the 5 is", "4 of the 5 are". */
const isAre = (k: number, n: number) => (k <= 1 && k !== n ? "is" : "are");

/** "A, B and C"; with `more`, "A, B, C and 2 more". */
function joinList(items: readonly string[], more = 0): string {
  const all = more === 0 ? [...items] : [...items, `${String(more)} more`];
  return all.length <= 1
    ? (all[0] ?? "")
    : `${all.slice(0, -1).join(", ")} and ${all[all.length - 1] ?? ""}`;
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

function attributes(
  catalogue: readonly RawUnit[],
  currency: string,
  locale: string,
): readonly Attribute[] {
  /* A delivered flat with no building arrives with an empty block: unstated, not a block. */
  const block = (u: RawUnit) => (u.block === "" ? null : u.block);
  const fmt = (v: number) => money(v, currency, locale);
  const sqm = (low: number, high: number) => `${span(low, high, String)} m²`;
  return [
    {
      id: "rooms",
      value: (u) => u.rooms,
      noun: "flats in the catalogue that state their rooms",
      bands: categorical(
        catalogue,
        (u) => u.rooms,
        (v) => {
          const n = Number(v);
          /* The contract allows 0 rooms: a studio, which "have no rooms" would misstate. */
          if (n === 0) return ["are studios", "Studios"];
          const rooms = `${ROOM_NUMBERS[n] ?? String(n)} ${n === 1 ? "room" : "rooms"}`;
          return [`have ${rooms}`, rooms.charAt(0).toUpperCase() + rooms.slice(1)];
        },
      ),
      span: null,
    },
    {
      id: "floor",
      value: (u) => u.floor,
      noun: "flats in the catalogue that state a floor",
      bands: floorBands(catalogue),
      span: {
        phrase: (low, high) =>
          low === high
            ? `are on floor ${String(low)}`
            : `are on floors ${String(low)} to ${String(high)}`,
        label: (low, high) =>
          low === high ? `Floor ${String(low)}` : `Floors ${String(low)} to ${String(high)}`,
        range: (low, high) =>
          low === high
            ? `They are all on floor ${String(low)}`
            : `They stand on floors ${String(low)} to ${String(high)}`,
      },
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
      span: null,
    },
    {
      id: "block",
      value: block,
      noun: "flats in the catalogue that state a block",
      bands: categorical(catalogue, block, (v) => [
        `are in block ${String(v)}`,
        `Block ${String(v)}`,
      ]),
      span: null,
    },
    {
      id: "price",
      value: (u) => u.price,
      noun: "priced flats in the catalogue",
      bands: [],
      span: {
        phrase: (low, high) => `are priced ${span(low, high, fmt)}`,
        label: (low, high) => span(low, high, fmt),
        range: (low, high) =>
          low === high
            ? `They are all priced ${fmt(low)}`
            : `They are priced ${fmt(low)} to ${fmt(high)}`,
      },
    },
    {
      id: "area",
      value: (u) => u.areaSqm,
      noun: "flats in the catalogue that state an area",
      bands: [],
      span: {
        phrase: (low, high) => `measure ${sqm(low, high)}`,
        label: sqm,
        range: (low, high) =>
          low === high ? `They all measure ${sqm(low, high)}` : `They measure ${sqm(low, high)}`,
      },
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
  /** Null when the base is the whole catalogue. */
  readonly noun: string | null;
}

/** A continuous attribute no pattern was found in: the flats' span, to be said as a range. */
interface RangeSpec {
  readonly opening: string;
  readonly inside: number;
  readonly stated: number;
  readonly noun: string | null;
  readonly unstated: number;
}

/**
 * The candidate patterns, grouped and strongest first, and the spans of the
 * continuous attributes that had none. Two attributes that pick out the same
 * flats from the same base are one fact, said once ("face south and are in block S").
 */
function findPatterns(
  top: readonly RawUnit[],
  catalogue: readonly RawUnit[],
  currency: string,
  locale: string,
): { groups: Candidate[][]; ranges: RangeSpec[] } {
  const n = top.length;
  const candidates: Candidate[] = [];
  const ranges: RangeSpec[] = [];
  for (const attribute of attributes(catalogue, currency, locale)) {
    const stated = catalogue.filter((u) => attribute.value(u) !== null);
    const noun = stated.length === catalogue.length ? null : attribute.noun;
    let found = false;
    for (const band of attribute.bands) {
      const inTop = top.filter(band.holds);
      const inBase = stated.filter(band.holds);
      if (
        inTop.length / n >= PATTERN_MIN_SHARE &&
        bandChance(inTop.length, n, inBase.length / stated.length) < PATTERN_MAX_CHANCE
      ) {
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
    const way = attribute.span;
    if (found || way === null) continue;
    const value = (u: RawUnit) => attribute.value(u) as number | null;
    const values = top.map(value).filter((v): v is number => v !== null);
    if (values.length < 2) continue;
    const low = Math.min(...values);
    const high = Math.max(...values);
    const inside = stated.filter((u) => {
      const v = value(u);
      return v !== null && v >= low && v <= high;
    });
    if (values.length === n && spanChance(n, inside.length / stated.length) < PATTERN_MAX_CHANCE) {
      candidates.push({
        attribute: attribute.id,
        phrase: way.phrase(low, high),
        label: way.label(low, high),
        top: top.map((u) => u.code),
        base: inside.map((u) => u.code),
        baseTotal: stated.length,
        noun,
      });
    } else {
      ranges.push({
        opening: way.range(low, high),
        inside: inside.length,
        stated: stated.length,
        noun,
        unstated: n - values.length,
      });
    }
  }

  /* One fact only where the same flats, the same base and the same denominator say it. */
  const merged = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const key = `${c.top.join(",")}|${c.base.join(",")}|${String(c.baseTotal)}|${c.noun ?? ""}`;
    merged.set(key, [...(merged.get(key) ?? []), c]);
  }
  /* The strongest concentration first: the most flats, then the furthest below the catalogue's share. */
  const groups = [...merged.values()].sort((a, b) => {
    const x = a[0] as Candidate;
    const y = b[0] as Candidate;
    return (
      y.top.length - x.top.length ||
      x.base.length / x.baseTotal - y.base.length / y.baseTotal ||
      x.attribute.localeCompare(y.attribute)
    );
  });
  return { groups, ranges };
}

export interface UnitPatternSales {
  /** Whether a CRM is connected at all; without one no sale has a date. */
  readonly connected: boolean;
  /** The demonstration CRM makes its deals from meetings (ADR-0049), which the reader is told. */
  readonly demonstration: boolean;
  readonly windowHours: number;
  /**
   * ADR-0039 for one flat: its newest dated sale placed against its last
   * showing, with its instant; "undated" when the CRM holds a sale of it with
   * no date; null when it holds none.
   */
  readonly saleOf: (unitCode: string) => PlacedSale | "undated" | null;
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
  const periodFrom = Date.parse(context.period.from);
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
    const placed = sales.connected ? sales.saleOf(row.unitCode) : null;
    return {
      unitCode: row.unitCode,
      href: `${base}/units/${row.unitCode}`,
      meetings: row.meetings,
      favourites: row.favourites,
      status: row.status,
      attributesDisplay: [
        row.rooms === null ? "rooms not stated" : roomsWord(row.rooms, context.language),
        row.areaSqm === null ? "area not stated" : areaWord(row.areaSqm),
        row.orientation === null
          ? "aspect not stated"
          : `facing ${COMPASS[row.orientation] ?? row.orientation}`,
        row.floor === null ? "floor not stated" : `floor ${String(row.floor)}`,
        unit === undefined || unit.block === "" ? "block not stated" : `block ${unit.block}`,
        unit === undefined || unit.price === null ? "price not stated" : row.priceDisplay,
      ].join(" · "),
      sale:
        placed === null || placed === "undated"
          ? null
          : {
              verdict: placed.verdict,
              verdictLabel: placed.verdictLabel,
              stageLabel: placed.stageLabel,
              stageDateDisplay: placed.stageDateDisplay,
              dateBasis: placed.dateBasis,
              beforePeriod: placed.at < periodFrom,
            },
      saleUndated: placed === "undated",
    };
  });

  const ranking = top
    .map((f, i) =>
      i === 0
        ? `${f.unitCode} (${String(f.meetings)} of ${meetingsWord(meetings)})`
        : `${f.unitCode} (${String(f.meetings)})`,
    )
    .join(", ");

  /* Every tie that touches the list, and who it leaves outside. */
  const ties = [...new Set(top.map((f) => f.meetings))].flatMap((m) => {
    const group = ranked.filter((r) => r.meetings === m).map((r) => r.unitCode);
    if (group.length < 2) return [];
    const inside = group.filter((code) => top.some((f) => f.unitCode === code));
    return [
      `${joinList(inside, group.length - inside.length)} were each opened in ${meetingsWord(m)}`,
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
      : meetings === 0
        ? `No meetings were recorded in ${periodLabel}, so no attribute is compared.`
        : meetings < PATTERN_MIN_MEETINGS
          ? `Only ${meetingsWord(meetings)} in ${periodLabel}, ${String(PATTERN_MIN_MEETINGS - meetings)} short of the ${String(PATTERN_MIN_MEETINGS)} a pattern needs, so no attribute is compared.`
          : ranked.length === 0
            ? `No flat was opened in ${periodLabel}, so no attribute is compared.`
            : ranked.length < PATTERN_MIN_OPENED
              ? `Only ${String(ranked.length)} ${ranked.length === 1 ? "flat was" : "flats were"} opened in ${periodLabel}; a pattern needs at least ${String(PATTERN_MIN_OPENED)}, so no attribute is compared.`
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
      salesNote: null,
      caveats: [],
      evidence,
    };
  }

  const n = top.length;
  const topUnits = top.flatMap((f) => {
    const unit = units.get(f.unitCode);
    return unit === undefined ? [] : [unit];
  });
  const { groups, ranges: spans } = findPatterns(topUnits, catalogue, currency, locale);

  /* The catalogue's size is said once, in the first sentence that compares with it. */
  let named = false;
  const whole = (): string => {
    if (named) return "of the catalogue";
    named = true;
    return `of the ${String(catalogue.length)} flats in the catalogue`;
  };
  const against = (noun: string | null, total: number) =>
    noun === null ? whole() : `of the ${String(total)} ${noun}`;

  /* The first line names the flats; the lines after it read on from it ("All 5 have two rooms"). */
  const patterns = groups.map((group, index): UnitPatternLine => {
    const first = group[0] as Candidate;
    const k = first.top.length;
    const outside = top.map((f) => f.unitCode).filter((code) => !first.top.includes(code));
    const id = group.map((c) => c.attribute).join("-");
    const baseShareDisplay = share(first.base.length, first.baseTotal, locale);
    return {
      id,
      label: group.map((c) => c.label).join(" · "),
      statement: `${of(k, n)}${index === 0 ? " most-opened flats" : ""} ${joinList(group.map((c) => c.phrase))}${outside.length === 0 ? "" : ` (all but ${joinList(outside)})`}, against ${baseShareDisplay} ${against(first.noun, first.baseTotal)}.`,
      topCount: k,
      topTotal: n,
      baseCount: first.base.length,
      baseTotal: first.baseTotal,
      baseShareDisplay,
      baseNoun: first.noun ?? "flats in the catalogue",
      unitCodes: first.top,
      evidence: evidenceRef(
        `unit-pattern-${id}`,
        "statistical_association",
        `${base}/units`,
        meetings,
      ),
    };
  });
  let note: string | null = null;
  if (patterns.length === 0) {
    named = true;
    note = `The ${String(n)} most-opened flats share no single attribute more than the ${String(catalogue.length)} flats in the catalogue do.`;
  }
  const ranges = spans.map(
    (r) =>
      `${r.opening}, a range that holds ${share(r.inside, r.stated, locale)} ${against(r.noun, r.stated)}${r.unstated === 0 ? "" : `; ${of(r.unstated, n)} ${r.unstated === 1 ? "does" : "do"} not state it`}.`,
  );

  /* Conversion: the catalogue's status now, then ADR-0039 per flat, split at the period's start. */
  const held = top.filter((f) => f.status !== "available");
  const heldBase = catalogue.filter((u) => u.status !== "available").length;
  const conversion = [
    heldBase === 0
      ? `${of(held.length, n)} ${isAre(held.length, n)} reserved or sold now, and no flat in the catalogue is.`
      : `${of(held.length, n)} ${isAre(held.length, n)} reserved or sold now, against ${share(heldBase, catalogue.length, locale)} ${whole()}.`,
  ];
  const notes: string[] = [];
  if (!sales.connected) {
    conversion.push(
      "No CRM is connected to this project, so none of their sales can be placed against a showing.",
    );
  } else {
    const hours = `${String(sales.windowHours)} hours`;
    const dated = top.flatMap((f) => (f.sale === null ? [] : [{ ...f, sale: f.sale }]));
    type Dated = (typeof dated)[number];
    const saleWords = (f: Dated) =>
      `${f.unitCode}'s ${f.sale.stageLabel.toLowerCase()} (${f.sale.stageDateDisplay})`;
    /* A CRM sale on a flat the catalogue still offers: said in the sale's own sentence, never corrected. */
    const stillListed = (group: readonly Dated[]) => {
      const codes = group.filter((f) => f.status === "available").map((f) => f.unitCode);
      return codes.length === 0
        ? ""
        : `; the catalogue still lists ${joinList(codes)} as available`;
    };
    const one: Record<AssistVerdict, string> = {
      shown_in_window: `followed an IRIS showing within ${hours}`,
      shown_earlier: `came more than ${hours} after the flat's last IRIS showing`,
      not_shown: "had no IRIS showing before it",
    };
    const since = dated.filter((f) => !f.sale.beforePeriod);
    const before = dated.filter((f) => f.sale.beforePeriod);
    const [only] = since;
    if (since.length === 1 && only !== undefined) {
      conversion.push(`${saleWords(only)} ${one[only.sale.verdict]}${stillListed(since)}.`);
    } else if (since.length > 1) {
      const count = (v: AssistVerdict) => since.filter((f) => f.sale.verdict === v).length;
      const within = count("shown_in_window");
      const earlier = count("shown_earlier");
      const never = count("not_shown");
      const sinceWords = `sales dated since the period began`;
      conversion.push(
        within === since.length
          ? `${since.length === 2 ? "Both" : `All ${String(since.length)}`} ${sinceWords} followed an IRIS showing within ${hours}${stillListed(since)}.`
          : `Of the ${String(since.length)} ${sinceWords}, ${within === 0 ? "none" : String(within)} followed an IRIS showing within ${hours}${earlier === 0 ? "" : `; ${String(earlier)} ${was(earlier)} shown earlier`}${never === 0 ? "" : `; ${String(never)} ${was(never)} not shown in IRIS before it`}${stillListed(since)}.`,
      );
    }
    if (before.length > 0) {
      conversion.push(
        `${joinList(before.map(saleWords))} ${before.length === 1 ? "predates" : "predate"} the period${stillListed(before)}.`,
      );
    }
    const undated = held.filter((f) => f.sale === null && f.saleUndated).map((f) => f.unitCode);
    if (undated.length > 0) {
      conversion.push(
        `The CRM holds a sale of ${joinList(undated)} with no date, so ${undated.length === 1 ? "it" : "they"} cannot be placed against a showing.`,
      );
    }
    const noDeal = held.filter((f) => f.sale === null && !f.saleUndated).map((f) => f.unitCode);
    if (noDeal.length > 0) {
      conversion.push(
        `The CRM holds no sale of ${joinList(noDeal)}; the catalogue lists ${noDeal.length === 1 ? "it" : "them"} as reserved or sold.`,
      );
    }
    const observed = dated.filter((f) => f.sale.dateBasis === "first_observed");
    if (observed.length > 0) {
      notes.push(
        `The CRM states no date for the sale of ${joinList(observed.map((f) => f.unitCode))}, so it is dated by the sync that first saw it, up to one sync late: the time after a showing reads longer than it was, never shorter.`,
      );
    }
  }
  if (sales.demonstration) {
    notes.push(
      "The demonstration CRM makes each of its deals from a meeting that opened the flat, so a flat opened often carries a deal more often by construction; a real CRM is not made that way.",
    );
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
    note,
    conversion,
    salesNote: notes.length === 0 ? null : notes.join(" "),
    caveats: [
      "Compared with the whole catalogue, sold and reserved flats included: a flat is opened whatever its status. A line is said only where flats drawn at random would match it less than one time in twenty; some fifteen values are tested, so one line can still be chance. These are associations about the flats; they say nothing about why a buyer opened them, and rooms, area and price move together, so one cannot be told from another here.",
    ],
    evidence,
  };
}
