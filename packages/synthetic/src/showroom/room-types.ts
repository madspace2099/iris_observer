import type { ShowroomSession } from "@observer/contracts";
import {
  KPI_WINDOWS,
  type RoomType,
  type RoomTypeComparisonRow,
  type RoomTypeColumn,
  type RoomTypeReading,
  type RoomTypeShare,
  type RoomTypeTrend,
  type RoomTypeWindow,
  type RoomTypeWindowId,
  type RoomTypesView,
  type SegmentInterest,
  type ViewContext,
} from "@observer/readmodels";
import { attentionIndexDisplay, getMetric } from "@observer/metrics";
import { catalogueFor } from "../pulse";
import { count, dayLabel, shareDisplay } from "../format";
import { endOfDayIn, startOfDayIn } from "../time";
import { meetings } from "./views3";

/**
 * THE ROOM TYPES, SIDE BY SIDE (ADR-0056).
 *
 * Built from the period's segments (`ProjectView.segments`, so the readings and
 * the rates are the very figures the rest of the page states) and from the
 * project's whole history of meetings, for the windows the reader switches
 * between in the browser without a request: each window is computed here, all
 * of them at once.
 */

const DAY = 24 * 60 * 60 * 1000;

/** How many equal stretches each window's line is split into. */
const PARTS: Readonly<Record<RoomTypeWindowId, number>> = {
  week: 7,
  month: 5,
  quarter: 13,
  half: 13,
  year: 12,
  all: 12,
};

/** The acts a buyer can do with an opened flat, in the order the comparison lists them. */
const ACTS = ["balcony", "plan", "floor_cut", "screenshot", "shared"] as const;

const floor = (metricId: string): number => getMetric(metricId)?.minimumSampleSize ?? 1;

function within(sessions: readonly ShowroomSession[], from: number, to: number): ShowroomSession[] {
  return sessions.filter((s) => {
    const at = Date.parse(s.startedAt);
    return at >= from && at < to;
  });
}

function points(delta: number): RoomTypeShare["change"] {
  const p = Math.round(delta * 100);
  if (p === 0) return { direction: "flat", display: "no change" };
  return {
    direction: p > 0 ? "up" : "down",
    display: `${p > 0 ? "+" : "−"}${Math.abs(p)} ${Math.abs(p) === 1 ? "pt" : "pts"}`,
  };
}

/** "two-room", for the second place onwards of a sentence that starts with the first. */
const lower = (label: string): string => `${label.charAt(0).toLowerCase()}${label.slice(1)}`;

/** "a, b and c". */
function listed(items: readonly string[]): string {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1] ?? ""}`;
}

export function buildRoomTypes(
  context: ViewContext,
  segments: readonly SegmentInterest[],
  history: readonly ShowroomSession[],
  today: Date,
): RoomTypesView {
  const { locale, timeZone } = context.project;
  const language = context.language;
  const base = `/${context.tenant.slug}/${context.project.slug}`;
  const crm = context.project.connectedSources.includes("crm");
  const catalogue = catalogueFor(context.project.id as string);
  const n = (v: number) => count(v, locale);
  const m = (v: number) => meetings(v, locale, language);

  /* --- the stock: what exists, and what the CRM says is gone ------------------- */

  const totalFlats = catalogue.length;
  const totalSold = catalogue.filter((u) => u.status === "sold").length;
  const projectSoldShare = crm && totalFlats > 0 ? totalSold / totalFlats : null;

  const types: RoomType[] = segments.map((s) => {
    const mine = catalogue.filter((u) => u.rooms === s.rooms);
    const sold = crm ? mine.filter((u) => u.status === "sold").length : null;
    const reserved = crm ? mine.filter((u) => u.status === "reserved").length : null;
    const soldShare = sold === null || mine.length === 0 ? null : sold / mine.length;
    return {
      id: s.id,
      label: s.label,
      rooms: s.rooms,
      flats: mine.length,
      flatsDisplay: `${n(mine.length)} ${mine.length === 1 ? "flat" : "flats"}`,
      stockShare: totalFlats === 0 ? 0 : mine.length / totalFlats,
      stockShareDisplay: shareDisplay(totalFlats === 0 ? 0 : mine.length / totalFlats, locale),
      sold,
      reserved,
      soldShare,
      soldDisplay:
        sold === null || soldShare === null
          ? null
          : `${n(sold)} sold · ${shareDisplay(soldShare, locale)}`,
      reservedDisplay: reserved === null ? null : `${n(reserved)} reserved`,
      audienceHref:
        s.rooms === null ? `${base}/audience` : `${base}/audience?rooms=${String(s.rooms)}`,
    };
  });

  /* --- interest, window by window --------------------------------------------- */

  const typeOf = new Map<string, string>();
  for (const u of catalogue) {
    const s = segments.find((x) => x.rooms === u.rooms);
    if (s !== undefined) typeOf.set(u.code, s.id);
  }
  const opened = (xs: readonly ShowroomSession[], id: string) =>
    xs.filter((s) => s.units.some((u) => typeOf.get(u.unitCode) === id)).length;

  const windowMin = floor("project.room_type_interest");
  const to = endOfDayIn(today, timeZone).getTime() + 1;
  const pastOnly = history.filter((s) => Date.parse(s.startedAt) < to);
  const firstAt = Math.min(...pastOnly.map((s) => Date.parse(s.startedAt)));
  const first = Number.isFinite(firstAt) ? startOfDayIn(firstAt, timeZone).getTime() : to - DAY;

  function trendOf(
    id: RoomTypeWindowId,
    start: number,
    end: number,
    clipped: boolean,
  ): RoomTypeTrend {
    const days = Math.max(1, Math.round((end - start) / DAY));
    const count_ = Math.min(PARTS[id], days);
    const width = (end - start) / count_;
    const parts = Array.from({ length: count_ }, (_, i) =>
      within(pastOnly, start + i * width, start + (i + 1) * width),
    );
    const stretch = Math.round(width / DAY);
    const unit = stretch <= 1 ? "day" : `${n(stretch)}-day stretch`;
    const series = segments.map((s) => ({
      id: s.id,
      values: parts.map((p) => (p.length < windowMin ? null : opened(p, s.id) / p.length)),
    }));
    const drawn = parts.filter((p) => p.length >= windowMin).length;
    const busiest = Math.max(0, ...parts.map((p) => p.length));
    return {
      parts: parts.map((p, i) => ({
        label: dayLabel(new Date(start + (i + 1) * width - 1), locale, timeZone),
        meetings: p.length,
      })),
      series,
      caption: `One point is one ${unit}${clipped ? `, from the first meeting on ${dayLabel(new Date(start), locale, timeZone)}` : ""}.`,
      empty:
        drawn >= 2
          ? null
          : drawn === 1
            ? `Only one ${unit} has the ${n(windowMin)} meetings a point needs, so there is no line to draw.`
            : `Too few meetings a ${unit} to draw a line: a point needs ${n(windowMin)}, and the busiest ${unit} had ${n(busiest)}.`,
    };
  }

  const windows: RoomTypeWindow[] = KPI_WINDOWS.filter(
    (w): w is (typeof KPI_WINDOWS)[number] & { readonly id: RoomTypeWindowId } => w.id !== "today",
  ).map((spec) => {
    const all = spec.id === "all";
    const from = all ? Math.min(first, to - DAY) : to - spec.days * DAY;
    const now = within(pastOnly, from, to);
    const before = all ? null : within(pastOnly, from - spec.days * DAY, from);
    const span = all ? "all time" : `the last ${n(spec.days)} days`;
    const comparable = before !== null && now.length >= windowMin && before.length >= windowMin;

    const deltas = segments.map((s) =>
      !comparable ? null : opened(now, s.id) / now.length - opened(before, s.id) / before.length,
    );
    const shares: RoomTypeShare[] = segments.map((s, i) => {
      const k = opened(now, s.id);
      const share = now.length === 0 ? null : k / now.length;
      const delta = deltas[i] ?? null;
      return {
        id: s.id,
        opened: k,
        share,
        shareDisplay: share === null ? "—" : shareDisplay(share, locale),
        change: delta === null ? null : points(delta),
      };
    });

    const changeAgainst = all
      ? "All time has no time before it to compare with."
      : before === null || before.length === 0
        ? `No meeting in the ${n(spec.days)} days before, so no change is shown.`
        : now.length < windowMin
          ? `No change is shown: ${m(now.length)} is ${n(windowMin - now.length)} short of ${n(windowMin)}.`
          : before.length < windowMin
            ? `No change is shown: the ${n(spec.days)} days before hold ${m(before.length)}, ${n(windowMin - before.length)} short of ${n(windowMin)}.`
            : `Change in points against the ${n(spec.days)} days before (${m(before.length)}).`;

    /* The sentence: which type is opened most, then the rest, then what moved most. */
    const ranked = shares
      .map((x, i) => ({ ...x, label: segments[i]?.label ?? x.id }))
      .filter((x): x is typeof x & { readonly share: number } => x.share !== null)
      .sort((a, b) => b.share - a.share);
    const top = ranked[0];
    let reading: string;
    if (now.length === 0 || top === undefined) {
      reading = `No meeting in ${span}.`;
    } else if (now.length < windowMin) {
      reading = `${m(now.length)} in ${span}: too few to rank the types, ${n(windowMin - now.length)} short of ${n(windowMin)}.`;
    } else {
      const leaders = ranked.filter((x) => x.share === top.share);
      const rest = ranked.filter((x) => x.share !== top.share);
      reading = `${listed(leaders.map((x, i) => (i === 0 ? x.label : lower(x.label))))} flats were opened in the most meetings: ${top.shareDisplay}${leaders.length > 1 ? " each" : ""}.`;
      if (rest.length > 0) {
        reading += ` Then ${listed(rest.map((x) => `${lower(x.label)} ${x.shareDisplay}`))}.`;
      }
      /* The largest move, in either direction; a tie goes to the first type. */
      const moved = shares
        .map((x, i) => ({
          ...x,
          label: segments[i]?.label ?? x.id,
          size: Math.abs(deltas[i] ?? 0),
        }))
        .filter((x) => x.change !== null && x.change.direction !== "flat")
        .sort((a, b) => b.size - a.size)[0];
      if (moved?.change != null) {
        reading += ` ${moved.label} moved most: ${moved.change.display}.`;
      }
    }

    return {
      id: spec.id,
      label: spec.label,
      meetings: now.length,
      meetingsDisplay: `${m(now.length)} in ${span}`,
      shares,
      changeAgainst,
      reading,
      trend: trendOf(spec.id, Math.max(from, first), to, from < first && !all),
    };
  });

  /* --- interest against sales, in the page's period ----------------------------- */

  const readingMin = floor("project.room_type_reading");
  const readings: RoomTypeReading[] = segments.map((s, i) => {
    const soldShare = types[i]?.soldShare ?? null;
    const base_ = {
      id: s.id,
      label: s.label,
      lookedAt: s.index,
      lookedAtDisplay: s.index === null ? "—" : attentionIndexDisplay(s.index),
      soldShare,
      soldDisplay: soldShare === null ? "—" : shareDisplay(soldShare, locale),
    };
    const opened_ = `${m(s.meetings)} opened one`;
    const none = (headline: string, basis = opened_): RoomTypeReading => ({
      ...base_,
      verdict: null,
      headline,
      action: null,
      basis,
    });
    if (!crm || soldShare === null || projectSoldShare === null) {
      return none("No reading: no CRM says what sold");
    }
    if (s.index === null) {
      return none(
        types[i]?.flats === types[i]?.sold
          ? "No reading: every flat of it is sold"
          : "No reading: nobody looked at its unsold flats",
      );
    }
    if (s.meetings < readingMin) {
      return none(
        "Too few meetings for a reading",
        `${opened_} · ${n(readingMin - s.meetings)} short of ${n(readingMin)}`,
      );
    }
    const wanted = s.index >= 1;
    const selling = soldShare >= projectSoldShare;
    const [verdict, headline, action] = wanted
      ? selling
        ? (["wanted_selling", "Wanted, and selling well", "Lead the campaign with it."] as const)
        : ([
            "wanted_slow",
            "Wanted, but selling less",
            "Check the price and what is promised.",
          ] as const)
      : selling
        ? ([
            "shown_less_selling",
            "Selling well, looked at less",
            "Show it more in presentations.",
          ] as const)
        : (["neither", "Looked at less, and selling less", "Rethink how it is offered."] as const);
    return { ...base_, verdict, headline, action, basis: opened_ };
  });

  /* --- how each type was examined, side by side ------------------------------- */

  const examinedMin = floor("project.room_type_examined");
  const columns: RoomTypeColumn[] = segments.map((s, i) => ({
    id: s.id,
    label: s.label,
    openingsDisplay: `${n(s.unitsOpened)} ${s.unitsOpened === 1 ? "opening" : "openings"}`,
    belowMinimum: s.unitsOpened < examinedMin,
    shortNote:
      s.unitsOpened === 0
        ? "never opened"
        : s.unitsOpened < examinedMin
          ? `too few to compare · ${n(examinedMin - s.unitsOpened)} short of ${n(examinedMin)}`
          : null,
    audienceHref: types[i]?.audienceHref ?? `${base}/audience`,
  }));
  const rows: RoomTypeComparisonRow[] = ACTS.flatMap((act) => {
    const label = segments.flatMap((s) => s.examinedHow).find((e) => e.id === act)?.label;
    if (label === undefined) return [];
    const rates = segments.map((s) =>
      s.unitsOpened === 0 ? null : (s.examinedHow.find((e) => e.id === act)?.rate ?? null),
    );
    const eligible = rates.filter(
      (r, i): r is number => r !== null && columns[i]?.belowMinimum === false,
    );
    const best = Math.max(...eligible);
    const marks = eligible.length >= 2 && eligible.some((r) => r !== best);
    return [
      {
        id: act,
        label,
        cells: segments.map((s, i) => {
          const rate = rates[i] ?? null;
          return {
            id: s.id,
            rate,
            display: rate === null ? "—" : shareDisplay(rate, locale),
            highest: marks && rate === best && columns[i]?.belowMinimum === false,
          };
        }),
      },
    ];
  });

  const projectSoldDisplay =
    projectSoldShare === null
      ? null
      : `${n(totalSold)} of ${n(totalFlats)} sold · ${shareDisplay(projectSoldShare, locale)}`;

  return {
    types,
    flatsDisplay: `${n(totalFlats)} ${totalFlats === 1 ? "flat" : "flats"}`,
    projectSoldDisplay,
    soldUnavailable: crm
      ? null
      : "Sold and reserved are unavailable: they come from the CRM, and none is connected to this project.",
    windows,
    defaultWindow: "month",
    definition: `Flats are the catalogue's, by room count; sold (a purchase) and reserved come from the CRM, as the catalogue stands now. Interest is the share of a window's meetings that opened at least one flat of the type, so a meeting that opened two sizes counts for both and the shares add up to more than 100%. The change is in percentage points against the same length of time just before. The line splits the window into equal stretches and draws each from its own meetings; a stretch, or a window, with fewer than ${n(windowMin)} meetings is shown raw and never ranked, compared or drawn.`,
    readings,
    soldAgainst:
      projectSoldShare === null
        ? "Sold"
        : `Sold, against the project's ${shareDisplay(projectSoldShare, locale)}`,
    readingDefinition: `Looked at: the type's share of the time buyers spent looking at unsold flats in this period, divided by its share of the unsold flats; above 1.00× it is looked at more than its size. Sold: its sold flats over all its flats${projectSoldDisplay === null ? "" : `, against the project's ${projectSoldDisplay}`}. A reading needs ${n(readingMin)} meetings that opened the type in the period. It pairs attention with sales and says nothing about which caused which.`,
    columns,
    rows,
    comparisonDefinition: `An opening is one flat opened in one meeting. Each rate is the share of a type's openings in this period with that act. The highest of a row is marked only among the types with ${n(examinedMin)} openings or more.`,
  };
}
