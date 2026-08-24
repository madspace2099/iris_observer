import type { Evidence, MeetingId, ProjectId, TenantId } from "@observer/contracts";
import type { Period, PeriodPreset, ProjectSummary, TenantSummary, Viewer } from "./context";
import type { AgentOverview, ExecutiveOverview, PreMeetingBriefView } from "./views";

/**
 * The port every screen reads through.
 *
 * An interface rather than a concrete client, so the application can be built
 * and tested against a deterministic synthetic implementation now and moved to
 * the physical database later without a single component changing. That is the
 * whole point of the reversed development order: the schema follows the
 * screens, and the screens are already talking to their final interface.
 *
 * Every method takes a `Viewer`. There is no unauthenticated read.
 */
export interface OverviewQuery {
  readonly viewer: Viewer;
  readonly tenantSlug: string;
  readonly projectSlug: string;
  readonly period: PeriodPreset;
}

export interface BriefQuery {
  readonly viewer: Viewer;
  readonly tenantSlug: string;
  readonly projectSlug: string;
  readonly meetingId: MeetingId;
}

/** Raised when a viewer asks for something outside their grants. */
export class NotPermittedError extends Error {
  constructor(what: string) {
    super(`This account has no access to ${what}.`);
    this.name = "NotPermittedError";
  }
}

/** Raised when the thing genuinely does not exist. Distinct from forbidden. */
export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} was not found.`);
    this.name = "NotFoundError";
  }
}

export interface ObserverRepository {
  /** Tenants the viewer may see. Never the full list. */
  listTenants(viewer: Viewer): Promise<readonly TenantSummary[]>;

  /** Projects the viewer may see within one tenant. */
  listProjects(viewer: Viewer, tenantId: TenantId): Promise<readonly ProjectSummary[]>;

  resolveProject(
    viewer: Viewer,
    tenantSlug: string,
    projectSlug: string,
  ): Promise<{ tenant: TenantSummary; project: ProjectSummary }>;

  resolvePeriod(project: ProjectId, preset: PeriodPreset): Promise<Period>;

  getExecutiveOverview(query: OverviewQuery): Promise<ExecutiveOverview>;

  getAgentOverview(query: OverviewQuery): Promise<AgentOverview>;

  getPreMeetingBrief(query: BriefQuery): Promise<PreMeetingBriefView>;

  /** Resolves an evidence reference for the drill-down panel. */
  getEvidence(viewer: Viewer, evidenceId: string): Promise<Evidence>;
}
