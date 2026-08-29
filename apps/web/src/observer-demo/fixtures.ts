/**
 * THE DEMONSTRATION DATASET. Synthetic, deterministic, and labelled as such
 * everywhere it is shown.
 *
 * ## Why it is generated rather than written out
 *
 * Ninety days across two channels is a hundred and eighty rows, and a hundred
 * and eighty hand-written rows are a hundred and eighty opportunities for a
 * number that contradicts the chart beside it. They are generated from a fixed
 * seed instead: the same integers every time, on every machine, with no clock
 * and no environment read.
 *
 * ## Why there is no randomness at render time
 *
 * A dashboard whose figures move between two renders is a dashboard nobody can
 * screenshot. The generator runs once at module scope and produces frozen
 * arrays; nothing downstream calls a random function, reads a date or looks at
 * an environment variable.
 *
 * ## What it is not
 *
 * It is not from Supabase, it is not a sample of production, and it describes
 * nobody. There are no names, no identifiers that could belong to a person, and
 * no values shaped like a credential.
 */

import type { Channel, DayRow, DemoProject, DemoUnit, Orientation, UnitEvent } from "./types";

/**
 * The last day the fixture covers.
 *
 * A FIXED DATE, not `new Date()`. A demonstration that silently re-anchors
 * itself to today would show a different ninety days in every screenshot, and
 * the reservations it describes would drift out of the window they belong to.
 */
export const DEMO_TODAY = "2026-08-28";

export const DEMO_PROJECT: DemoProject = Object.freeze({
  id: "ister-tower",
  name: "ISTER TOWER",
  city: "Budapest",
  unitCount: 24,
});

/** The other projects the selector offers. Same shape, smaller stories. */
export const DEMO_PROJECTS: readonly DemoProject[] = Object.freeze([
  DEMO_PROJECT,
  Object.freeze({ id: "danube-quarter", name: "DANUBE QUARTER", city: "Budapest", unitCount: 18 }),
  Object.freeze({ id: "buda-terrace", name: "BUDA TERRACE", city: "Budapest", unitCount: 12 }),
]);

/**
 * A small deterministic generator.
 *
 * `Math.random()` is not usable here for the reason above, and a cryptographic
 * hash is more machinery than a fixture needs. This is a 32-bit mixer: same
 * input, same output, everywhere, forever.
 */
function noise(seed: number): number {
  let x = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** `n` days before `DEMO_TODAY`, as an ISO date. */
function dayBefore(offset: number): string {
  const base = Date.UTC(2026, 7, 28) - offset * 86_400_000;
  return new Date(base).toISOString().slice(0, 10);
}

/** How many days the fixture holds. Every range is a window into this. */
export const DEMO_DAYS = 90;

/**
 * The story the numbers tell, per project.
 *
 * A demonstration whose lines are flat proves nothing about a chart. Each
 * project gets a base level, a growth term and a weekly rhythm — buyers browse
 * in the evening and visit a showroom at the weekend, which is why the two
 * channels peak on different days.
 */
const SHAPE: Readonly<Record<string, { base: number; growth: number; showroomShare: number }>> =
  Object.freeze({
    "ister-tower": { base: 240, growth: 0.55, showroomShare: 0.28 },
    "danube-quarter": { base: 96, growth: 0.15, showroomShare: 0.34 },
    "buda-terrace": { base: 54, growth: -0.12, showroomShare: 0.41 },
  });

function buildDays(projectId: string): readonly DayRow[] {
  const shape = SHAPE[projectId] ?? SHAPE["ister-tower"];
  if (shape === undefined) throw new Error(`no shape for ${projectId}`);
  const rows: DayRow[] = [];

  for (let i = DEMO_DAYS - 1; i >= 0; i -= 1) {
    const date = dayBefore(i);
    /* 0 = oldest day, 1 = most recent. */
    const t = (DEMO_DAYS - 1 - i) / (DEMO_DAYS - 1);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();

    for (const channel of ["web", "showroom"] as const) {
      const isShowroom = channel === "showroom";
      /*
       * WEB PEAKS MIDWEEK, SHOWROOM AT THE WEEKEND. Two channels with the same
       * weekly shape would make the comparison chart pointless.
       */
      const rhythm = isShowroom
        ? weekday === 0 || weekday === 6
          ? 1.55
          : 0.72
        : weekday === 0 || weekday === 6
          ? 0.78
          : 1.12;

      const share = isShowroom ? shape.showroomShare : 1 - shape.showroomShare;
      const jitter = 0.86 + noise(i * 7 + (isShowroom ? 1 : 0) + projectId.length * 131) * 0.28;
      const sessions = Math.round(shape.base * share * (1 + shape.growth * t) * rhythm * jitter);

      /*
       * EVERY DOWNSTREAM COUNT IS A SHARE OF THE ONE ABOVE IT, so the funnel
       * cannot invert. A showroom visit converts harder than a web session and
       * the ratios say so.
       */
      const explorerRate = isShowroom ? 0.62 : 0.41;
      const explorers = Math.round(sessions * explorerRate);
      const qualified = Math.round(explorers * (isShowroom ? 0.74 : 0.52));
      const unitViews = Math.round(explorers * (isShowroom ? 4.1 : 2.6));
      const favorites = Math.round(explorers * (isShowroom ? 0.31 : 0.17));
      const meetings = Math.round(qualified * (isShowroom ? 0.22 : 0.06));
      /*
       * A RESERVATION FOLLOWS A MEETING. It cannot exceed one.
       *
       * Reservations used to be drawn independently, and on the smallest
       * project's web channel that produced days with a reservation and no
       * meeting — a funnel that inverts at the last stage. The stage order is
       * the one claim the funnel makes, so the generator has to respect it
       * rather than the test being relaxed to accommodate it.
       *
       * Still rare and still lumpy: a daily rate would draw a smooth line
       * through something that happens a few times a month.
       */
      const reservations =
        meetings > 0 &&
        noise(i * 17 + (isShowroom ? 3 : 11) + projectId.length) > (isShowroom ? 0.74 : 0.87)
          ? 1
          : 0;

      rows.push(
        Object.freeze({
          date,
          channel,
          sessions,
          qualified,
          explorers,
          unitViews,
          favorites,
          meetings,
          reservations,
        }),
      );
    }
  }
  return Object.freeze(rows);
}

export const DEMO_DAY_ROWS: Readonly<Record<string, readonly DayRow[]>> = Object.freeze(
  Object.fromEntries(DEMO_PROJECTS.map((p) => [p.id, buildDays(p.id)])),
);

const ORIENTATIONS: readonly Orientation[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/**
 * The unit stack.
 *
 * Weights, not counts. The counts a screen shows are derived from the day rows
 * for whatever window is selected, so they move with the filters and still sum
 * to the totals the cards and the funnel show. A unit with a hand-written view
 * count would contradict the chart the moment somebody changed the range.
 */
function buildUnits(projectId: string, count: number): readonly DemoUnit[] {
  const units: DemoUnit[] = [];
  for (let i = 0; i < count; i += 1) {
    const floor = 2 + Math.floor(i / 3);
    const position = (i % 3) + 1;
    const rooms = position === 1 ? 2 : position === 2 ? 3 : floor > 8 ? 5 : 4;
    const orientation = ORIENTATIONS[(i * 3 + floor) % ORIENTATIONS.length] ?? "S";
    const area = 44 + rooms * 17 + (floor > 8 ? 9 : 0);
    const price = Math.round((area * 1.62 + floor * 3.1) * 1_000_000);

    /*
     * Availability is not random: the cheapest lower-floor units go first, and
     * two high-floor units are reserved, which is what makes the "reserved but
     * still heavily viewed" story in the insights feed true.
     */
    const availability =
      i === 4 || i === 7 ? "sold" : i === 15 || i === 20 ? "reserved" : "available";

    /*
     * SOUTH AND SOUTH-WEST ON HIGH FLOORS ARE THE STORY. Their weight rises
     * between the two windows; north-facing low floors fall. That is the demand
     * shift the Overview and the insights both describe, and it is one fact in
     * one place rather than a claim typed into three screens.
     */
    const premium = (orientation === "S" || orientation === "SW") && floor >= 7;
    const dull = (orientation === "N" || orientation === "NE") && floor <= 5;
    const base = 1 + noise(i * 29 + projectId.length * 7) * 0.9;
    const weight = base * (premium ? 2.35 : dull ? 0.22 : 1);
    const priorWeight = base * (premium ? 1.42 : dull ? 0.34 : 1);

    units.push(
      Object.freeze({
        id: `${projectId}-${String(floor).padStart(2, "0")}${String(position).padStart(2, "0")}`,
        label: `${String(floor).padStart(2, "0")}.${String(position).padStart(2, "0")}`,
        floor,
        rooms,
        orientation,
        area,
        price,
        availability,
        weight,
        priorWeight,
      }),
    );
  }
  return Object.freeze(units);
}

export const DEMO_UNITS: Readonly<Record<string, readonly DemoUnit[]>> = Object.freeze(
  Object.fromEntries(DEMO_PROJECTS.map((p) => [p.id, buildUnits(p.id, p.unitCount)])),
);

/**
 * Journeys seen on BOTH channels and deterministically linked.
 *
 * Not a percentage of anything: a linked journey exists because the same
 * booking reference appeared on both sides, and the number of those is a count
 * of a specific kind of evidence. Everything else stays unattributed, which the
 * channel panel shows as its own category rather than dividing it up.
 */
export const DEMO_LINKED_JOURNEYS: Readonly<Record<string, number>> = Object.freeze({
  "ister-tower": 63,
  "danube-quarter": 21,
  "buda-terrace": 9,
});

/**
 * Recent observed events for a unit's detail panel.
 *
 * Generated from the unit id so a panel always has content and the same unit
 * always shows the same list. No personal data: an event says what happened and
 * on which channel, and nothing about who.
 */
export function eventsForUnit(unitId: string): readonly UnitEvent[] {
  const kinds: readonly UnitEvent["kind"][] = ["view", "view", "favorite", "view", "meeting"];
  const events: UnitEvent[] = [];
  for (let i = 0; i < 6; i += 1) {
    const seed = unitId.length * 13 + i * 37;
    const channel: Channel = noise(seed) > 0.62 ? "showroom" : "web";
    const kind = kinds[i % kinds.length] ?? "view";
    const hour = 9 + Math.floor(noise(seed + 5) * 11);
    events.push(
      Object.freeze({
        at: `${dayBefore(i)} ${String(hour).padStart(2, "0")}:${i % 2 === 0 ? "20" : "45"}`,
        channel,
        kind,
        detail:
          kind === "view"
            ? channel === "showroom"
              ? "Opened on the showroom table"
              : "Opened from the unit list"
            : kind === "favorite"
              ? "Added to favourites"
              : "Progressed to a meeting",
      }),
    );
  }
  return Object.freeze(events);
}
