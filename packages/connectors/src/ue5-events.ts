import type {
  MeetingOutcome,
  SectionId,
  ShowroomEnvironmentSelection,
  ShowroomFilterApplication,
  ShowroomSession,
  ShowroomStep,
  ShowroomUnitInteraction,
} from "@observer/contracts";

import {
  OUTCOME_WORDS,
  SECTION_WORDS,
  TIME_OF_DAY_WORDS,
  WEATHER_WORDS,
} from "./supabase-showroom";

/**
 * STORED V2 EVENTS → THE SESSIONS THE DASHBOARD ALREADY RENDERS.
 *
 * The ingestion path stores what a showroom sends and, until this file, nothing
 * read it back: real sessions reached Sales Flow only through the legacy
 * Supabase connector, which the V2 plugin no longer writes to. This is the
 * other half — a pure fold from one project's events to `ShowroomSession[]`,
 * the same shape `mapShowroomSession` produces, so every surface downstream is
 * reused untouched.
 *
 * ## Pure on purpose
 *
 * No database, no clock, no package dependency on `@observer/sources`: the row
 * type below is structural. The same input always folds to the same sessions,
 * which is what lets this move behind an ingest-time materialisation later
 * without changing what it means.
 *
 * ## What it never does
 *
 *   - **invent a fact.** A unit with no `view.ended` has the dwell that was
 *     reported — none — not an estimate from the next event's timestamp.
 *   - **name a buyer.** `contactId` is null; an event carries a pseudonymous
 *     visitor subject and joining it to a contact is a CRM decision, not a fold.
 *   - **trust a property's type.** The plugin's `TrackEvent` sends every value
 *     as a string and its Blueprint library sends numbers; both are read.
 *
 * ponytail: event names are matched by literal here because the registry (M8)
 * does not exist yet. The aliases from `docs/03-event-map.md` are accepted
 * beside the names the shipped plugin actually sends; when the registry lands,
 * this table becomes a read of it.
 */

/** The columns of `observer_events_for_project` this fold reads. */
export interface Ue5EventRow {
  readonly event_name: string;
  readonly occurred_at: string;
  readonly session_id: string;
  readonly sequence: number;
  readonly agent_id: string | null;
  readonly entity_type: string | null;
  readonly entity_id: string | null;
  readonly properties: Readonly<Record<string, unknown>>;
}

/**
 * The agent of a session whose events named none.
 *
 * A kiosk session started without a salesperson signed in is still a session
 * that happened; dropping it would understate the project. It is attributed to
 * nobody, visibly, rather than to whoever is first in a roster.
 */
export const UNATTRIBUTED_AGENT_ID = "agt_unattributed";

function text(props: Readonly<Record<string, unknown>>, key: string): string | null {
  const v = props[key];
  if (typeof v === "string") return v.trim().length > 0 ? v.trim() : null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/** A finite number from a number or a numeric string. Anything else is absent, never zero. */
function numeric(props: Readonly<Record<string, unknown>>, key: string): number | null {
  const v = props[key];
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim().length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function unitOf(row: Ue5EventRow): string | null {
  return text(row.properties, "unit_id") ?? (row.entity_type === "unit" ? row.entity_id : null);
}

/** `"Main|Residences|Floor 3"` → `["residences", "Floor 3"]`; the leading `Main` is the plugin's root. */
function featurePath(
  row: Ue5EventRow,
): { key: string; sectionId: SectionId; item: string | null } | null {
  const raw =
    text(row.properties, "feature_id") ??
    text(row.properties, "section_id") ??
    (row.entity_type === "feature" || row.entity_type === "section" ? row.entity_id : null);
  if (raw === null) return null;
  const parts = raw
    .split("|")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts[0]?.toLowerCase() === "main") parts.shift();
  const category = text(row.properties, "category");
  const word = (parts[0] ?? category ?? "").toLowerCase();
  const sectionId = SECTION_WORDS[word] ?? SECTION_WORDS[(category ?? "").toLowerCase()];
  if (sectionId === undefined) return null;
  const rest = parts.slice(1).join(" · ");
  return { key: raw, sectionId, item: rest.length > 0 ? rest : null };
}

interface MutableUnit {
  views: number;
  dwellSeconds: number;
  longestViewSeconds: number;
  favourited: boolean;
  pdfOpened: boolean;
  balconyViews: number;
  floorCutViews: number;
}

interface MutableStep {
  key: string;
  sectionId: SectionId;
  item: string | null;
  enteredAt: string;
  dwellSeconds: number | null;
  isReturn: boolean;
}

const UNIT_VIEW_STARTED = new Set(["unit.view.started", "unit.view_started"]);
const UNIT_VIEW_ENDED = new Set(["unit.view.ended", "unit.view_ended"]);
const FAVOURITE_ON = new Set(["unit.favourite_added", "unit.favourited", "unit.favorite_added"]);
const FAVOURITE_OFF = new Set([
  "unit.favourite_removed",
  "unit.unfavourited",
  "unit.favorite_removed",
]);
const DOCUMENT_OPENED = new Set(["unit.document_opened", "unit.pdf_opened"]);
const BALCONY = new Set(["unit.balcony_viewed", "unit.balcony.entered"]);
const FLOOR_CUT = new Set(["unit.floor_cut_viewed", "unit.floor_cut.shown"]);
const STEP_OPENED = new Set(["feature.opened", "section.entered"]);
const STEP_CLOSED = new Set(["feature.closed", "section.exited"]);
const ENVIRONMENT = new Set(["environment.weather_changed", "scene.changed"]);
const SCREENSHOT = new Set(["screenshot.created", "capture.created"]);
const OUTCOME = new Set(["meeting.outcome_set", "session.outcome_recorded"]);

function foldOne(
  sessionId: string,
  rows: readonly Ue5EventRow[],
  projectId: string,
): ShowroomSession | null {
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (first === undefined || last === undefined) return null;

  const units = new Map<string, MutableUnit>();
  const unit = (code: string): MutableUnit => {
    let u = units.get(code);
    if (u === undefined) {
      u = {
        views: 0,
        dwellSeconds: 0,
        longestViewSeconds: 0,
        favourited: false,
        pdfOpened: false,
        balconyViews: 0,
        floorCutViews: 0,
      };
      units.set(code, u);
    }
    return u;
  };

  /*
   * A build that emits both the paired `unit.view.*` events and the single
   * `unit.viewed` would count every view twice. The pair is the richer source,
   * so the single event is read only by a session that has no pair at all.
   */
  const hasPairedViews = rows.some((r) => UNIT_VIEW_STARTED.has(r.event_name));

  const steps: MutableStep[] = [];
  const seenSections = new Set<SectionId>();
  const environment: ShowroomEnvironmentSelection[] = [];
  const filters: ShowroomFilterApplication[] = [];
  let screenshots = 0;
  let outcome: MeetingOutcome = "skipped";
  let irisRating: number | null = null;
  let endedAt = last.occurred_at;
  let reportedDuration: number | null = null;
  let agentId: string | null = null;

  for (const row of rows) {
    const name = row.event_name;
    const props = row.properties;
    agentId ??= row.agent_id;

    if (name === "session.ended") {
      endedAt = row.occurred_at;
      reportedDuration = numeric(props, "duration_seconds");
      continue;
    }

    const code = unitOf(row);
    if (code !== null) {
      if (UNIT_VIEW_STARTED.has(name)) unit(code).views += 1;
      else if (UNIT_VIEW_ENDED.has(name) || (name === "unit.viewed" && !hasPairedViews)) {
        const u = unit(code);
        if (name === "unit.viewed") u.views += 1;
        const ms = numeric(props, "duration_ms");
        const seconds = numeric(props, "duration_seconds") ?? (ms === null ? null : ms / 1000);
        if (seconds !== null && seconds > 0) {
          u.dwellSeconds += seconds;
          u.longestViewSeconds = Math.max(u.longestViewSeconds, seconds);
        }
      } else if (FAVOURITE_ON.has(name)) unit(code).favourited = true;
      else if (FAVOURITE_OFF.has(name)) unit(code).favourited = false;
      else if (DOCUMENT_OPENED.has(name)) unit(code).pdfOpened = true;
      else if (BALCONY.has(name)) unit(code).balconyViews += 1;
      else if (FLOOR_CUT.has(name)) unit(code).floorCutViews += 1;
    }

    if (STEP_OPENED.has(name)) {
      const path = featurePath(row);
      if (path !== null) {
        steps.push({
          key: path.key,
          sectionId: path.sectionId,
          item: path.item,
          enteredAt: row.occurred_at,
          dwellSeconds: null,
          isReturn: seenSections.has(path.sectionId),
        });
        seenSections.add(path.sectionId);
      }
    } else if (STEP_CLOSED.has(name)) {
      const path = featurePath(row);
      const ms = numeric(props, "duration_ms");
      const seconds = numeric(props, "duration_seconds") ?? (ms === null ? null : ms / 1000);
      if (path !== null && seconds !== null && seconds >= 0) {
        /* The most recent still-open step of this feature; a close with no open is dropped. */
        for (let i = steps.length - 1; i >= 0; i -= 1) {
          const step = steps[i];
          if (step !== undefined && step.key === path.key && step.dwellSeconds === null) {
            step.dwellSeconds = Math.round(seconds);
            break;
          }
        }
      }
    } else if (ENVIRONMENT.has(name)) {
      const weather =
        WEATHER_WORDS[
          (text(props, "weather_type") ?? text(props, "weather") ?? "").toLowerCase()
        ] ?? null;
      const timeOfDay = TIME_OF_DAY_WORDS[(text(props, "time_of_day") ?? "").toLowerCase()] ?? null;
      if (weather !== null || timeOfDay !== null) {
        const open = steps.findLast((s) => s.dwellSeconds === null);
        environment.push({ timeOfDay, weather, duringSectionId: open?.sectionId ?? null });
      }
    } else if (name === "filter.applied") {
      filters.push(...filtersOf(props));
    } else if (SCREENSHOT.has(name)) {
      screenshots += 1;
    } else if (OUTCOME.has(name)) {
      outcome = OUTCOME_WORDS[(text(props, "outcome") ?? "").toLowerCase()] ?? outcome;
    } else if (name === "agent.rating") {
      const score = numeric(props, "rating_score") ?? numeric(props, "irisRating");
      irisRating = score !== null && score >= 1 && score <= 5 ? score : null;
    }
  }

  const startedAt = first.occurred_at;
  const measured = Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000);
  if (Number.isNaN(measured)) return null;

  const foldedSteps: ShowroomStep[] = steps.map((s, i) => ({
    ordinal: i + 1,
    sectionId: s.sectionId,
    itemId: s.item,
    itemLabel: s.item,
    enteredAt: s.enteredAt,
    dwellSeconds: s.dwellSeconds,
    isReturn: s.isReturn,
    availability: "legacy_available",
  }));

  const foldedUnits: ShowroomUnitInteraction[] = [...units.entries()].map(([code, u]) => ({
    unitId: code,
    unitCode: code,
    views: u.views,
    dwellSeconds: Math.round(u.dwellSeconds),
    longestViewSeconds: Math.round(u.longestViewSeconds),
    favourited: u.favourited,
    pdfOpened: u.pdfOpened,
    balconyViews: u.balconyViews,
    floorCutViews: u.floorCutViews,
    screenshots: 0,
    comparedWith: [],
    keptFromComparison: null,
    shared: false,
  }));

  return {
    sessionId,
    // No CRM appointment is joined yet; the session is its own meeting, as for the legacy source.
    meetingId: sessionId,
    projectId,
    agentId: agentId ?? UNATTRIBUTED_AGENT_ID,
    channel: "showroom",
    contactId: null,
    startedAt,
    endedAt,
    durationSeconds: Math.max(0, Math.round(reportedDuration ?? measured)),
    outcome,
    steps: foldedSteps,
    units: foldedUnits,
    environment,
    filters,
    places: [],
    screenshots,
    irisRating,
    priorMeetings: 0,
    timingUnavailable: foldedSteps.length === 0,
  };
}

function filtersOf(props: Readonly<Record<string, unknown>>): ShowroomFilterApplication[] {
  const matches = numeric(props, "filtered_count") ?? 0;
  const out: ShowroomFilterApplication[] = [];
  const range = (field: string, minKey: string, maxKey: string) => {
    const min = numeric(props, minKey);
    const max = numeric(props, maxKey);
    /* Zero-to-zero is the plugin's untouched default, not a filter — as in the legacy mapper. */
    if ((min ?? 0) === 0 && (max ?? 0) === 0) return;
    out.push({
      field,
      value: `${min ?? "?"}–${max ?? "?"}`,
      matches,
      availability: "legacy_available",
    });
  };
  range("price", "min_price", "max_price");
  range("surface", "min_surface", "max_surface");
  const buildings = props["selected_buildings"];
  const list = Array.isArray(buildings)
    ? buildings.filter((b): b is string => typeof b === "string" && b.length > 0)
    : (text(props, "selected_buildings")
        ?.split(",")
        .map((b) => b.trim())
        .filter((b) => b.length > 0) ?? []);
  if (list.length > 0) {
    out.push({
      field: "building",
      value: list.join(", "),
      matches,
      availability: "legacy_available",
    });
  }
  return out;
}

/**
 * Every session in `events`, oldest first.
 *
 * `events` may arrive in any order and may interleave sessions; each session is
 * folded over its own events in `sequence` order, which is the order the
 * showroom emitted them in whatever the network did afterwards.
 */
export function foldUe5Sessions(
  events: readonly Ue5EventRow[],
  projectId: string,
): ShowroomSession[] {
  const bySession = new Map<string, Ue5EventRow[]>();
  for (const row of events) {
    const rows = bySession.get(row.session_id);
    if (rows === undefined) bySession.set(row.session_id, [row]);
    else rows.push(row);
  }
  const sessions: ShowroomSession[] = [];
  for (const [sessionId, rows] of bySession) {
    rows.sort((a, b) => a.sequence - b.sequence);
    const folded = foldOne(sessionId, rows, projectId);
    if (folded !== null) sessions.push(folded);
  }
  return sessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}
