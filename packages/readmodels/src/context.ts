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

export interface ProjectSummary {
  readonly id: ProjectId;
  readonly tenantId: TenantId;
  readonly slug: string;
  readonly name: string;
  readonly currency: string;
  readonly locale: string;
  readonly timeZone: string;
  /** Which sources are wired up. Drives every unavailable state on screen. */
  readonly connectedSources: readonly ("webiris" | "showroom" | "crm" | "catalogue")[];
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
}
