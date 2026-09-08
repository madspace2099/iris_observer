import type { z } from "zod";
import type { MeetingOutcome } from "./engagement";
import type { MeasurementAvailabilitySchema } from "./provenance";
import type { SourceSystem } from "./sources";

/**
 * What IRIS shows, and what a showroom session looks like as data.
 *
 * This is the canonical shape the synthetic generator emits and the shape the
 * UE5 module will later be asked to produce. It is deliberately *not* a wire
 * format: no event names are frozen here (ADR-0013), only the facts the product
 * needs and the honest gaps where the current implementation cannot supply them.
 */

/* --- the section inventory ------------------------------------------------- */

/**
 * IRIS's own sections.
 *
 * The inventory matters as much as the observations: "which sections were
 * skipped" is unanswerable without knowing which sections exist. The legacy
 * analytics has no inventory, which is why skip detection is
 * `partially_derivable` in `docs/16-showroom-intelligence-audit.md`.
 */
export const SHOWROOM_SECTIONS = [
  { id: "home", label: "Home", kind: "frame", core: true },
  { id: "residences", label: "Residences", kind: "units", core: true },
  { id: "amenities", label: "Amenities", kind: "argument", core: true },
  { id: "surroundings", label: "Surroundings", kind: "argument", core: true },
  { id: "gallery", label: "Gallery", kind: "argument", core: false },
  { id: "maps", label: "Maps", kind: "argument", core: false },
  { id: "environment", label: "Time & weather", kind: "storytelling", core: false },
  { id: "compare", label: "Compare", kind: "decision", core: false },
  { id: "shortlist", label: "Shortlist", kind: "decision", core: false },
] as const;

export type ShowroomSection = (typeof SHOWROOM_SECTIONS)[number];
export type SectionId = ShowroomSection["id"];
export const SECTION_IDS = SHOWROOM_SECTIONS.map((s) => s.id) as readonly SectionId[];

export function sectionLabel(id: SectionId): string {
  return SHOWROOM_SECTIONS.find((s) => s.id === id)?.label ?? id;
}

/** Sections a complete presentation is expected to reach. Drives coverage. */
export const CORE_SECTION_IDS = SHOWROOM_SECTIONS.filter((s) => s.core).map(
  (s) => s.id,
) as readonly SectionId[];

/* --- outcomes -------------------------------------------------------------- */

/*
 * Outcomes are NOT redefined here.
 *
 * `MEETING_OUTCOMES` already exists in `engagement.ts` and comes from the
 * showroom's own `WBP_MeetingOutcome` widget — the list the agent actually taps.
 * A second vocabulary that said "offer" and "unknown" where the product says
 * "interested" and "skipped" would be two names for one fact, which is how a
 * join starts losing rows.
 *
 * What is added here is how Observer *uses* those outcomes: as cohort labels
 * (ADR-0023), never as a subject.
 */

export const OUTCOME_LABELS: Record<MeetingOutcome, string> = {
  presentation_only: "Presentation only",
  interested: "Interested",
  follow_up_needed: "Follow-up needed",
  reservation: "Reservation",
  purchase: "Purchase",
  not_interested: "Not interested",
  skipped: "Outcome not recorded",
};

/**
 * Which outcomes count as "progressed further" for cohort comparison.
 *
 * Stated once, in data, so a comparison cannot quietly redraw the line to make
 * a pattern look stronger. `skipped` is deliberately outside both cohorts: an
 * agent who did not record an outcome is not the same as one who recorded that
 * nothing happened, and folding the two together would invent a result.
 */
export const PROGRESSED_OUTCOMES = [
  "purchase",
  "reservation",
  "interested",
  "follow_up_needed",
] as const satisfies readonly MeetingOutcome[];

export const DID_NOT_PROGRESS_OUTCOMES = [
  "presentation_only",
  "not_interested",
] as const satisfies readonly MeetingOutcome[];

export function hasProgressed(outcome: MeetingOutcome): boolean {
  return (PROGRESSED_OUTCOMES as readonly MeetingOutcome[]).includes(outcome);
}

/** True when the outcome tells us nothing, so the meeting belongs to no cohort. */
export function outcomeIsUnknown(outcome: MeetingOutcome): boolean {
  return outcome === "skipped";
}

/* --- where the session was observed ---------------------------------------- */

/**
 * Which surface the presentation actually ran on.
 *
 * The same IRIS content is reachable in two places: the installation standing
 * in the sales gallery, and WEB IRIS in a buyer's browser — and a growing share
 * of presentations are given remotely, with the agent driving WEB IRIS over a
 * call rather than a buyer walking in. Both produce the same *kind* of fact, a
 * section reached and a unit opened, which is exactly why the channel has to be
 * carried on the record.
 *
 * Two reasons, and neither is presentational.
 *
 * 1. **The measurement is not the same measurement.** Dwell on a showroom
 *    installation is time in front of a wall-sized render with an agent
 *    talking; dwell in a browser tab is time in a window that may not have
 *    focus. Averaging the two into one median and printing it as "time on
 *    Residences" states something no source observed.
 * 2. **Provenance must survive the join.** `docs/06-ownership.md` gives WEBIRIS
 *    and the showroom different owners, and a fact that loses its owner on the
 *    way into a projection cannot be traced back, corrected, or withheld when
 *    its source disconnects.
 *
 * The vocabulary is drawn from `SOURCE_SYSTEMS` rather than restated, so a
 * channel can never name a source the rest of the product does not know.
 */
export const SESSION_CHANNELS = ["showroom", "webiris"] as const satisfies readonly SourceSystem[];
export type SessionChannel = (typeof SESSION_CHANNELS)[number];

/** How each channel is named on screen. WEB IRIS is spelled as the brand does. */
export const SESSION_CHANNEL_LABELS: Record<SessionChannel, string> = {
  showroom: "IRIS Showroom",
  webiris: "WEB IRIS",
};

/* --- storytelling presets -------------------------------------------------- */

export const TIME_OF_DAY_PRESETS = ["morning", "afternoon", "golden", "evening", "night"] as const;
export type TimeOfDayPreset = (typeof TIME_OF_DAY_PRESETS)[number];

export const WEATHER_PRESETS = ["clear", "cloudy", "rain", "snow", "fog"] as const;
export type WeatherPreset = (typeof WEATHER_PRESETS)[number];

/* --- the session ----------------------------------------------------------- */

/**
 * One step in the presentation.
 *
 * `enteredAt` and `dwellSeconds` are nullable on purpose. The legacy source
 * records the *order* of sections but not when each was entered, and a product
 * that fills that in with a plausible number is lying about its evidence. When
 * they are null the surface says so rather than drawing a timeline.
 */
export interface ShowroomStep {
  /** 1-based position in the presentation. Always known. */
  readonly ordinal: number;
  readonly sectionId: SectionId;
  /** The named item inside the section — an amenity, a POI. Null at section level. */
  readonly itemId: string | null;
  readonly itemLabel: string | null;
  /** Null when the source cannot say. Never inferred. */
  readonly enteredAt: string | null;
  /** Null when the source cannot say. Never inferred. */
  readonly dwellSeconds: number | null;
  /** True when this section had already been visited earlier in the session. */
  readonly isReturn: boolean;
  readonly availability: z.infer<typeof MeasurementAvailabilitySchema>;
}

/**
 * Everything one meeting did to one unit.
 *
 * Interactions are grouped by unit rather than listed chronologically because
 * that is how both the read model and the reader think about them; the
 * chronology lives in `ShowroomStep`.
 */
export interface ShowroomUnitInteraction {
  readonly unitId: string;
  readonly unitCode: string;
  readonly views: number;
  /** Total, across every view in this meeting. */
  readonly dwellSeconds: number;
  /** Longest single view. What separates examined from glanced at. */
  readonly longestViewSeconds: number;
  readonly favourited: boolean;
  readonly pdfOpened: boolean;
  readonly balconyViews: number;
  readonly floorCutViews: number;
  readonly screenshots: number;
  /** Units this one was placed beside in compare mode. */
  readonly comparedWith: readonly string[];
  /** Whether it survived the comparison it was in. Null when never compared. */
  readonly keptFromComparison: boolean | null;
  readonly shared: boolean;
}

/**
 * A place the agent stopped on, and for how long.
 *
 * The most interpretable signal the showroom produces. A visitor whose time goes
 * to the nursery and the playground is telling the agent something no filter
 * will — and unlike a filter, it is a *choice the buyer made about content*
 * rather than a constraint they typed.
 *
 * Amenities are recorded at item level today. Points of interest in Surroundings
 * are not: the current build records that the section was reached and nothing
 * more, so `availability` on these is `requires_ue5_v2_event` and every surface
 * reading them says so.
 */
export interface ShowroomPlaceInteraction {
  readonly placeId: string;
  readonly placeName: string;
  readonly category: string;
  readonly section: "surroundings" | "amenities";
  readonly dwellSeconds: number;
  readonly availability: z.infer<typeof MeasurementAvailabilitySchema>;
}

/**
 * A filter the buyer applied.
 *
 * Stated demand, as opposed to observed attention: what they asked for rather
 * than what they looked at. **The current build emits none of this.** It is
 * modelled because the product specifies the measurement before the engine
 * implements it (ADR-0013), and every surface says the data is a demonstration.
 */
export interface ShowroomFilterApplication {
  readonly field: string;
  readonly value: string;
  /** How many units matched. Zero is the interesting case. */
  readonly matches: number;
  readonly availability: z.infer<typeof MeasurementAvailabilitySchema>;
}

export interface ShowroomEnvironmentSelection {
  readonly timeOfDay: TimeOfDayPreset | null;
  readonly weather: WeatherPreset | null;
  /** Which section was on screen when the preset changed, where known. */
  readonly duringSectionId: SectionId | null;
}

/**
 * One showroom session, as canonical facts.
 *
 * This is the unit the whole product projects from. A session is not a meeting
 * record: it holds no name, phone or email, only the identifiers needed to join
 * to a contact held elsewhere (`docs/05-identity.md`).
 */
export interface ShowroomSession {
  readonly sessionId: string;
  readonly meetingId: string;
  readonly projectId: string;
  readonly agentId: string;
  /**
   * Which surface this presentation ran on. Never inferred from anything else
   * on the record — see `SESSION_CHANNELS` for why it has to be carried.
   */
  readonly channel: SessionChannel;
  /** Null for a walk-in that was never linked to a contact. */
  readonly contactId: string | null;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationSeconds: number;
  readonly outcome: MeetingOutcome;
  readonly steps: readonly ShowroomStep[];
  readonly units: readonly ShowroomUnitInteraction[];
  readonly environment: readonly ShowroomEnvironmentSelection[];
  /** Filter states applied during the session. */
  readonly filters: readonly ShowroomFilterApplication[];
  /** Named places the agent stopped on, inside Amenities and Surroundings. */
  readonly places: readonly ShowroomPlaceInteraction[];
  readonly screenshots: number;
  /**
   * The agent's rating of IRIS itself, 1–5, taken at the end of the session.
   *
   * **MADSPACE only.** It is feedback on the product, not on the meeting or the
   * agent, and showing a developer how their sales team rates the software they
   * were sold would misread it entirely. Null when the agent skipped it.
   */
  readonly irisRating: number | null;
  /**
   * How many previous meetings this contact has had on this project.
   *
   * Zero for a first visit. A second and third meeting are a different sales
   * situation from a first, and averaging them together hides that.
   */
  readonly priorMeetings: number;
  /**
   * True when the session came from a source that cannot supply per-step
   * timing. Surfaces read this to decide between a timeline and a sequence.
   */
  readonly timingUnavailable: boolean;
}

/**
 * A source of real showroom SESSIONS, as distinct from `ConnectorKind`
 * (`packages/contracts/src/catalogue.ts`), which is a source of CATALOGUE
 * units and CRM deals. Deliberately its own type rather than a member added
 * to that one: a telemetry source has no units and no deal stages, and a
 * connector that satisfied `ConnectorKind`'s config/credential shapes would
 * misrepresent what it actually delivers. The two share only the generic
 * project-scoped config/credential STORAGE the admin already has (any
 * string kind, sealed the same way) — never the vendor-specific schemas.
 */
export const SHOWROOM_SOURCE_KINDS = ["supabase_showroom"] as const;
export type ShowroomSourceKind = (typeof SHOWROOM_SOURCE_KINDS)[number];
