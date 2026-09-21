import type { AgentId, ProjectId, TenantId } from "@observer/contracts";
import type { Role } from "@observer/metrics";

/**
 * Who is asking, and about what.
 *
 * Every repository call takes a viewer. Not for convenience — it is what makes
 * tenant isolation and role scoping a property of the data layer rather than
 * something each screen has to remember. A read model that could be fetched
 * without a viewer is a read model that will eventually be fetched by the
 * wrong one.
 */
export interface Viewer {
  readonly userId: string;
  readonly displayName: string;
  readonly role: Role;
  /** Tenants this viewer may see at all. */
  readonly tenantIds: readonly TenantId[];
  /** Projects within those tenants. An agency is granted per project. */
  readonly projectIds: readonly ProjectId[];
  /** Set when the viewer is a sales agent, so "my meetings" is answerable. */
  readonly agentId: AgentId | null;
  /** The organisation the viewer belongs to, shown in the shell. */
  readonly organisationName: string;
}

export interface TenantSummary {
  readonly id: TenantId;
  readonly slug: string;
  readonly name: string;
}

/**
 * The four things a project can be fed from.
 *
 * Named once so `connectedSources` and `sources` below cannot drift into two
 * spellings of the same idea.
 */
export type SourceKind = "webiris" | "showroom" | "crm" | "catalogue";

/**
 * One feed, as the reader would point at it in the room.
 *
 * `connectedSources` answers "is there a showroom on this project", which is
 * the question every unavailable state turns on. It cannot answer "which
 * showroom, and has it said anything today" — and that is the question an
 * agency manager actually asks, because a project with two installations has
 * one that went quiet and one that did not, and a kind alone hides that.
 *
 * Deliberately four fields and no more. This is the identity of a feed and its
 * pulse, not an integration console: throughput, error counts, connector
 * versions and retry state belong to the MADSPACE administration surface,
 * which is a separate product with its own audience (`docs/01-foundation.md`).
 *
 * `lastSeenAt` is nullable and **never zero-valued**. A source that has never
 * been heard from has no last-seen instant; writing the epoch, the project's
 * launch date, or "now" would each be a fabricated observation, and the reader
 * would have no way to tell a silent source from a new one.
 */
export interface ProjectSource {
  /** Stable within the project, so a row survives a rename. */
  readonly id: string;
  /** What it is called where it physically stands. "Main Showroom PC". */
  readonly displayName: string;
  readonly kind: SourceKind;
  /**
   * Whether it is wired up at all. Must agree with `connectedSources` on the
   * project: the same fact told twice that disagrees with itself is worse than
   * the fact being missing.
   */
  readonly connected: boolean;
  /** Last instant anything arrived from it. Null when nothing ever has. */
  readonly lastSeenAt: string | null;
}

export interface ProjectSummary {
  readonly id: ProjectId;
  readonly tenantId: TenantId;
  readonly slug: string;
  readonly name: string;
  readonly currency: string;
  readonly locale: string;
  readonly timeZone: string;
  /** Which sources are wired up. Drives every unavailable state on screen. */
  readonly connectedSources: readonly SourceKind[];
  /**
   * The same answer at the resolution a person recognises.
   *
   * Every kind in `connectedSources` appears here with `connected: true`, and
   * every kind absent from it appears here with `connected: false` — a
   * disconnected source is listed and stated, never omitted, because an
   * omission reads as "there is no CRM on this product" rather than "this
   * project's CRM is not wired up yet".
   */
  readonly sources: readonly ProjectSource[];
  /**
   * True for a project that came from the directory rather than from the
   * synthetic world. Stamped by the repository when it resolves one, so it means
   * exactly that and never what an adapter chose to claim. A shell reads it to
   * know that no part of this project may be marked as a demonstration.
   */
  readonly ownDataOnly?: boolean;
}

/* --- periods ------------------------------------------------------------- */

export const PERIOD_PRESETS = [
  "last_28_days",
  "quarter_to_date",
  "last_quarter",
  "year_to_date",
] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export interface Period {
  readonly preset: PeriodPreset;
  readonly label: string;
  readonly from: string;
  readonly to: string;
  /**
   * The baseline this period is compared against, described in words. Shown
   * next to every comparison, because "down 18%" against an unstated baseline
   * is not information.
   */
  readonly baselineLabel: string;
  readonly baselineFrom: string;
  readonly baselineTo: string;
  /**
   * True when the current period is still running and the baseline has been
   * clipped to the same number of elapsed days. Comparing a part-quarter with
   * a whole one is the most common way a dashboard raises a false alarm.
   */
  readonly baselineClipped: boolean;
}

export interface ViewContext {
  readonly viewer: Viewer;
  readonly tenant: TenantSummary;
  readonly project: ProjectSummary;
  readonly period: Period;
  readonly generatedAt: string;
  /**
   * True when this project's meetings were delivered by its own source — its
   * showrooms' ingested events, or a telemetry connector — rather than by the
   * synthetic generator. It decides the clock the periods were resolved on, and
   * it is how a builder knows that scenario prose does not describe this project.
   */
  readonly sessionsDelivered: boolean;
  /**
   * True for a project that exists outside the synthetic world: one created in
   * administration (`ProjectDirectory`). Nothing about it is demonstration data,
   * so what no source delivered is ABSENT, never invented and never borrowed
   * from a scenario. It runs on the real clock whether or not a meeting has
   * arrived, and no surface may mark any part of it as a demonstration.
   */
  readonly ownDataOnly: boolean;
  /**
   * THE POLICY-VERSION GUARD (docs/10-policies.md §1).
   *
   * Every figure on a screen was computed under one attribution policy, and
   * a comparison with a baseline period is meaningful only if both periods
   * were measured under compatible ones — the same window and the same
   * qualifying link. The version is exposed on every view so a report can
   * print it; `comparisonRefusal` is the reason the baseline comparison is
   * refused, or null when the two are comparable. A screen that draws a
   * comparison prints the refusal instead of the figures when it is set.
   */
  readonly attribution: AttributionContext;
}

export interface AttributionContext {
  readonly version: string;
  readonly effectiveFrom: string;
  /** Null when the period and its baseline may be compared. */
  readonly comparisonRefusal: string | null;
}
