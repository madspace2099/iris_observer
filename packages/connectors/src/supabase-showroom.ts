import type {
  MeetingOutcome,
  SectionId,
  ShowroomEnvironmentSelection,
  ShowroomFilterApplication,
  ShowroomSession,
  ShowroomStep,
  ShowroomUnitInteraction,
  TimeOfDayPreset,
  WeatherPreset,
} from "@observer/contracts";
import { refusal, refusalForStatus, type FetchContext } from "./http";

/**
 * AKHILESH'S SHOWROOM TELEMETRY — read from his own Supabase project, mapped
 * into the canonical `ShowroomSession`.
 *
 * `docs/16-showroom-intelligence-audit.md` read this data through screen
 * captures of the legacy dashboard; this is the first direct read of the
 * table behind it, `public.user_sessions` (confirmed live, 2026-09-08: no
 * other candidate table name answers this project's anon key). One row per
 * visitor session: `session_id`, `sales_person`, `visitor_name`, a
 * `session_data` JSONB blob holding everything the legacy dashboard showed,
 * and `created_at`/`updated_at`.
 *
 * ## What is dropped on the way in, and why
 *
 * `visitor_name` (top level) and `session_data.UserName` (the same fact,
 * twice) are never read into anything this function returns.
 * `ShowroomSession` "holds no name, phone or email" by contract; ADR-0005
 * found this exact project's session table readable by anyone holding its
 * anon key with no row-level filter, which is one more reason this adapter
 * never carries the name past the row it read it from.
 *
 * ## What is mapped, and at what confidence — `docs/16` §2, table by table
 *
 * - **Identity, timing, outcome, screenshot count**: `legacy_available`.
 *   `SessionOutcome` free text maps to the canonical seven; anything this
 *   map does not recognise becomes `"skipped"` rather than a guess.
 * - **Steps** (`UserJourneyHierarchy`): the ordinal sequence is
 *   `legacy_available`, matching `docs/16` §2.4 exactly — "the seed of
 *   Presentation DNA". Per-step `enteredAt`/`dwellSeconds` are
 *   `requires_ue5_v2_event`: `HierarchyAnalytics` carries dwell aggregated
 *   PER SECTION, not per visit, and a section visited twice (Home appears
 *   at both step 1 and step 5 in the reference session) cannot be split
 *   across its two steps without inventing a division the source does not
 *   state. `isReturn` IS computed honestly, from the sequence itself.
 *   Nested `SubActions` are not expanded into further ordinals — the same
 *   flat, top-level sequence the legacy dashboard itself showed.
 * - **Units** (`ApartmentAnalytics` + `FavoritedUnits`): `legacy_available`.
 *   `unitId` and `unitCode` are both the source's own free-text code (e.g.
 *   `"IT 13 B5"`) — `docs/16` §2.5's own finding, unchanged here: there is
 *   no stable id and no catalogue join. `comparedWith`, `keptFromComparison`
 *   and `shared` are always `[]` / `null` / `false`: Compare Mode and Share
 *   are not in this payload at all (`docs/16` §2.5, confirmed absent here).
 * - **Environment** (`Environment.LastWeather`/`LastTimeOfDay`): one entry,
 *   the session's final observed state. `WeatherSelectionCounts` /
 *   `TimeOfDaySelectionCounts` are NOT expanded into synthetic per-change
 *   events — they are counts, not a timeline, and turning a count into that
 *   many fabricated events would be exactly the invented sequencing this
 *   product's honesty rules forbid.
 * - **Filters** (`FilterUsage`): one `ShowroomFilterApplication` per active
 *   dimension (rooms, status, buildings, each range), `matches` set to
 *   `FilteredApartmentCount` — the source's one combined result count,
 *   applied to every dimension alike because it does not report one per
 *   field. Availability `legacy_available` with that caveat stated on the
 *   field itself would need a new contract field this pass does not add;
 *   recorded here instead.
 * - **Places** (`ShowroomPlaceInteraction`): NOT populated. `docs/16` §2.6:
 *   POI-level presentation exists only for Amenities in this payload
 *   (already captured as unit-less `HierarchyAnalytics` item entries), and
 *   mapping those into `ShowroomPlaceInteraction` (which also wants a
 *   `category`) is left for a later pass rather than guessed here.
 *
 * `timingUnavailable` is always `true`: no session in this source carries
 * per-step timestamps, so no surface reading it may draw a timeline from it.
 */

export interface SupabaseShowroomCredential {
  readonly token: string;
}

export interface SupabaseShowroomConfig {
  /** The full, validated `https://<ref>.supabase.co` origin. No path. */
  readonly url: string;
}

interface RawSessionRow {
  readonly session_id?: string;
  readonly created_at?: string;
  readonly session_data?: RawSessionData;
}

interface RawSessionData {
  readonly SessionStartTime?: string;
  readonly SessionEndTime?: string;
  readonly SessionOutcome?: string;
  readonly AppEvents?: { readonly TotalScreenshots?: number };
  readonly Environment?: {
    readonly LastWeather?: string;
    readonly LastTimeOfDay?: string;
  };
  readonly FilterUsage?: {
    readonly FloorRange?: { readonly Min?: number; readonly Max?: number };
    readonly PriceRange?: { readonly Min?: number; readonly Max?: number };
    readonly SurfaceRange?: { readonly Min?: number; readonly Max?: number };
    readonly SelectedRooms?: readonly number[];
    readonly SelectedStatus?: readonly string[];
    readonly SelectedBuildings?: readonly string[];
    readonly FilteredApartmentCount?: number;
  };
  readonly FavoritedUnits?: readonly string[];
  readonly ApartmentAnalytics?: Record<
    string,
    {
      readonly PdfOpened?: boolean;
      readonly ViewCount?: number;
      readonly BalconyViewCount?: number;
      readonly FloorCutViewCount?: number;
      readonly TimeSpentInSeconds?: number;
    }
  >;
  readonly UserJourneyHierarchy?: readonly { readonly Action?: string }[];
}

/** The source's own section words → Observer's inventory. Unrecognised → null, dropped as a step. */
const SECTION_WORDS: Readonly<Record<string, SectionId>> = {
  home: "home",
  residences: "residences",
  amenities: "amenities",
  surroundings: "surroundings",
  gallery: "gallery",
  maps: "maps",
  weather: "environment",
  compare: "compare",
  shortlist: "shortlist",
};

const OUTCOME_WORDS: Readonly<Record<string, MeetingOutcome>> = {
  presentation: "presentation_only",
  "presentation only": "presentation_only",
  interested: "interested",
  "follow-up needed": "follow_up_needed",
  reservation: "reservation",
  purchase: "purchase",
  "not interested": "not_interested",
};

const WEATHER_WORDS: Readonly<Record<string, WeatherPreset>> = {
  rain: "rain",
  snow: "snow",
  cloudy: "cloudy",
  clear: "clear",
  fog: "fog",
};

const TIME_OF_DAY_WORDS: Readonly<Record<string, TimeOfDayPreset>> = {
  morning: "morning",
  afternoon: "afternoon",
  golden: "golden",
  evening: "evening",
  night: "night",
};

/** `"2026.08.19-15.04.27"` → ISO. Null when the shape does not match — never a guessed date. */
function parseSourceInstant(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const m = /^(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2})$/.exec(raw.trim());
  if (m === null) return null;
  const [, y, mo, d, h, mi, s] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}.000Z`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

function buildSteps(journey: readonly { readonly Action?: string }[]): ShowroomStep[] {
  const seen = new Set<SectionId>();
  const steps: ShowroomStep[] = [];
  let ordinal = 0;
  for (const entry of journey) {
    const word = entry.Action?.trim().toLowerCase();
    const sectionId = word === undefined ? undefined : SECTION_WORDS[word];
    if (sectionId === undefined) continue;
    ordinal += 1;
    steps.push({
      ordinal,
      sectionId,
      itemId: null,
      itemLabel: null,
      enteredAt: null,
      dwellSeconds: null,
      isReturn: seen.has(sectionId),
      availability: "requires_ue5_v2_event",
    });
    seen.add(sectionId);
  }
  return steps;
}

function buildUnits(
  apartments: RawSessionData["ApartmentAnalytics"],
  favourited: readonly string[] | undefined,
): ShowroomUnitInteraction[] {
  if (apartments === undefined) return [];
  const favourites = new Set(favourited ?? []);
  return Object.entries(apartments).map(([code, a]) => ({
    unitId: code,
    unitCode: code,
    views: a.ViewCount ?? 0,
    dwellSeconds: a.TimeSpentInSeconds ?? 0,
    longestViewSeconds: a.TimeSpentInSeconds ?? 0,
    favourited: favourites.has(code),
    pdfOpened: a.PdfOpened === true,
    balconyViews: a.BalconyViewCount ?? 0,
    floorCutViews: a.FloorCutViewCount ?? 0,
    screenshots: 0,
    comparedWith: [],
    keptFromComparison: null,
    shared: false,
  }));
}

function buildEnvironment(env: RawSessionData["Environment"]): ShowroomEnvironmentSelection[] {
  if (env === undefined) return [];
  const weather = WEATHER_WORDS[env.LastWeather?.trim().toLowerCase() ?? ""] ?? null;
  const timeOfDay = TIME_OF_DAY_WORDS[env.LastTimeOfDay?.trim().toLowerCase() ?? ""] ?? null;
  if (weather === null && timeOfDay === null) return [];
  return [{ timeOfDay, weather, duringSectionId: null }];
}

function buildFilters(usage: RawSessionData["FilterUsage"]): ShowroomFilterApplication[] {
  if (usage === undefined) return [];
  const matches = usage.FilteredApartmentCount ?? 0;
  const out: ShowroomFilterApplication[] = [];
  const range = (name: string, r: { readonly Min?: number; readonly Max?: number } | undefined) => {
    if (r === undefined || (r.Min === undefined && r.Max === undefined)) return;
    out.push({
      field: name,
      value: `${r.Min ?? "?"}–${r.Max ?? "?"}`,
      matches,
      availability: "legacy_available",
    });
  };
  range("floor", usage.FloorRange);
  range("price", usage.PriceRange);
  range("surface", usage.SurfaceRange);
  if (usage.SelectedRooms !== undefined && usage.SelectedRooms.length > 0) {
    out.push({
      field: "rooms",
      value: usage.SelectedRooms.join(", "),
      matches,
      availability: "legacy_available",
    });
  }
  if (usage.SelectedStatus !== undefined && usage.SelectedStatus.length > 0) {
    out.push({
      field: "status",
      value: usage.SelectedStatus.join(", "),
      matches,
      availability: "legacy_available",
    });
  }
  if (usage.SelectedBuildings !== undefined && usage.SelectedBuildings.length > 0) {
    out.push({
      field: "building",
      value: usage.SelectedBuildings.join(", "),
      matches,
      availability: "legacy_available",
    });
  }
  return out;
}

/**
 * One raw row → one canonical session, or `null` when the row cannot be
 * mapped at all (no session id, or neither timestamp parses) — counted by
 * the caller as rejected/unsupported, never silently skipped.
 */
export function mapShowroomSession(
  row: RawSessionRow,
  projectId: string,
  agentId: string,
): ShowroomSession | null {
  const sessionId = row.session_id?.trim();
  const data = row.session_data;
  if (sessionId === undefined || sessionId.length === 0 || data === undefined) return null;

  const startedAt = parseSourceInstant(data.SessionStartTime) ?? row.created_at ?? null;
  const endedAt = parseSourceInstant(data.SessionEndTime) ?? startedAt;
  if (startedAt === null || endedAt === null) return null;

  const outcomeWord = data.SessionOutcome?.trim().toLowerCase() ?? "";
  const outcome: MeetingOutcome = OUTCOME_WORDS[outcomeWord] ?? "skipped";

  const journey = data.UserJourneyHierarchy ?? [];
  const durationSeconds = Math.max(
    0,
    Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000),
  );

  return {
    sessionId,
    // No CRM appointment behind this data; the session is its own meeting.
    meetingId: sessionId,
    projectId,
    agentId,
    channel: "showroom",
    contactId: null,
    startedAt,
    endedAt,
    durationSeconds,
    outcome,
    steps: buildSteps(journey),
    units: buildUnits(data.ApartmentAnalytics, data.FavoritedUnits),
    environment: buildEnvironment(data.Environment),
    filters: buildFilters(data.FilterUsage),
    places: [],
    screenshots: data.AppEvents?.TotalScreenshots ?? 0,
    irisRating: null,
    priorMeetings: 0,
    timingUnavailable: true,
  };
}

export interface SupabaseSessionsOutcome {
  readonly ok: true;
  readonly fetched: number;
  readonly accepted: readonly ShowroomSession[];
  readonly rejected: number;
}
export type SupabaseFetchOutcome = SupabaseSessionsOutcome | ReturnType<typeof refusal>;

const PAGE_SIZE = 200;
const MAX_ROWS = 2000;

/**
 * Fetches every row of `public.user_sessions` this credential can read, over
 * PostgREST, bounded pagination, deterministic order (`created_at`, then
 * `session_id` as the tiebreaker so a page boundary never splits or repeats
 * a row). Read-only: `GET` only, never issued against anything but the
 * caller's own configured `config.url`.
 */
export async function supabaseShowroomFetchSessions(
  credential: SupabaseShowroomCredential,
  config: SupabaseShowroomConfig,
  projectId: string,
  agentId: string,
  ctx: FetchContext,
): Promise<SupabaseFetchOutcome> {
  const accepted: ShowroomSession[] = [];
  let rejected = 0;
  let fetched = 0;

  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const response = await ctx.http({
      url:
        `${config.url}/rest/v1/user_sessions` +
        `?select=session_id,created_at,session_data` +
        `&order=created_at.asc,session_id.asc` +
        `&limit=${String(PAGE_SIZE)}&offset=${String(offset)}`,
      method: "GET",
      headers: {
        apikey: credential.token,
        authorization: `Bearer ${credential.token}`,
        accept: "application/json",
      },
    });
    const refused = refusalForStatus(response.status, response.headers);
    if (refused !== null) return refused;

    let page: readonly RawSessionRow[];
    try {
      const parsed: unknown = JSON.parse(response.text);
      if (!Array.isArray(parsed)) {
        return refusal("malformed", "The session list was not a JSON array.");
      }
      page = parsed as readonly RawSessionRow[];
    } catch {
      return refusal("malformed", "The session list could not be read as JSON.");
    }

    fetched += page.length;
    for (const row of page) {
      const mapped = mapShowroomSession(row, projectId, agentId);
      if (mapped === null) rejected += 1;
      else accepted.push(mapped);
    }
    if (page.length < PAGE_SIZE) break;
  }

  return { ok: true, fetched, accepted, rejected };
}
