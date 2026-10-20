import type { Period, SourceKind } from "./context";

/**
 * PROJECT DIAGNOSTICS: what MADSPACE needs to know about a client project to
 * tell whether it is being used and whether it is still being fed.
 *
 * MADSPACE administrators only (the repository refuses everybody else). Every
 * count is stated with its denominator beside it in the same shape, and every
 * value a project does not have is `null`, never `0`: a project that keeps no
 * roster has no presenters to count, which is a different fact from a roster
 * nobody presented from. No figure here names a person, so there is nothing to
 * rank people by (ADR-0047).
 */

/** One feed, against the clock the project runs on. */
export interface DiagnosedSource {
  readonly name: string;
  readonly kind: SourceKind;
  readonly connected: boolean;
  readonly lastSeenAt: string | null;
  /** Whole hours from `lastSeenAt` to the diagnosis's `asOf`. Null when never seen. */
  readonly ageHours: number | null;
  /** Seen, and last seen more than {@link STALE_AFTER_HOURS} hours before `asOf`. */
  readonly stale: boolean;
}

/** A source last seen longer ago than this is stale. */
export const STALE_AFTER_HOURS = 24;

/** One named window, with every count's denominator beside it. */
export interface DiagnosisWindow {
  /** The window, with its words (`label`) and its bounds. */
  readonly period: Period;
  readonly meetings: number;
  /** Distinct presenters with at least one meeting in the window. */
  readonly presenters: number;
  /** Of {@link ProjectDiagnostics.roster}, how many presented here. Null when there is no roster. */
  readonly rosterPresenting: number | null;
  /** Of `presenters`, those not on the roster. Null when there is no roster. */
  readonly offRoster: number | null;
  /** Of `meetings`, those with an outcome recorded. */
  readonly outcomeRecorded: number;
  /** Of `meetings`, those carrying no per-step timing. */
  readonly timingUnavailable: number;
  /** Of `meetings`, those presented through WEB IRIS rather than on the installation. */
  readonly webiris: number;
  /** Catalogue units opened at least once in the window, of {@link ProjectDiagnostics.catalogueUnits}. */
  readonly unitsOpened: number;
}

export interface ProjectDiagnostics {
  /** The project's today: the synthetic world's fixed day, or the real clock for a delivered project. */
  readonly asOf: string;
  /**
   * Where its meetings come from: the synthetic demonstration, a showroom
   * source delivering them, or a project made in administration that shows
   * only its own sources' data.
   */
  readonly data: "demonstration" | "delivered" | "own";
  /** Presenters the project knows by name. Null when it keeps no roster. */
  readonly roster: number | null;
  /** Every meeting recorded up to `asOf`. */
  readonly recorded: number;
  /** Of `recorded`, the legacy imports: meetings carrying no per-step timing. */
  readonly legacyImports: number;
  readonly lastMeetingAt: string | null;
  readonly sources: readonly DiagnosedSource[];
  /** `deals` is null when no CRM delivered any; `fetchedAt` is when it last did. */
  readonly crm: {
    readonly connected: boolean;
    readonly deals: number | null;
    readonly fetchedAt: string | null;
  };
  /** Units in the catalogue. Null when no catalogue is connected and none is held. */
  readonly catalogueUnits: number | null;
  /** The last 28 days, then the quarter to date. */
  readonly windows: readonly DiagnosisWindow[];
}
