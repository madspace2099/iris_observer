import type { Evidence, TenantId } from "@observer/contracts";
import type { ProjectId } from "@observer/contracts";
import type {
  AgentOverview,
  BriefQuery,
  ExecutiveOverview,
  ObserverRepository,
  OverviewQuery,
  Period,
  PeriodPreset,
  PreMeetingBriefView,
  ProjectSummary,
  TenantSummary,
  ViewContext,
  Viewer,
} from "@observer/readmodels";
import { NotFoundError, NotPermittedError } from "@observer/readmodels";
import { PROJECTS, TENANTS, TODAY } from "./world";
import { buildExecutiveOverview } from "./overview";
import { buildAgentOverview, buildPreMeetingBrief } from "./agent";

/**
 * A deterministic repository over the synthetic world.
 *
 * It implements the same port the database repository will implement, so every
 * screen built against it is already talking to its final interface. Two
 * things it does *not* do, deliberately:
 *
 *  - it does not expose fixtures. Components receive read models, never the
 *    world underneath;
 *  - it does not skip permission checks because the data is fake. Isolation is
 *    enforced here, and tested here, so that the behaviour is already correct
 *    before it is backed by real rows.
 */

const PERIODS: Record<PeriodPreset, Omit<Period, "preset">> = {
  last_28_days: {
    label: "Last 28 days",
    from: "2026-07-27T00:00:00.000+02:00",
    to: "2026-08-24T00:00:00.000+02:00",
    baselineLabel: "the previous 28 days",
    baselineFrom: "2026-06-29T00:00:00.000+02:00",
    baselineTo: "2026-07-27T00:00:00.000+02:00",
    baselineClipped: false,
  },
  quarter_to_date: {
    label: "Quarter to date",
    from: "2026-07-01T00:00:00.000+02:00",
    to: "2026-08-24T00:00:00.000+02:00",
    // 54 days elapsed, so the baseline is clipped to the same 54 days.
    // Comparing a part-quarter with a whole one is the commonest false alarm
    // a dashboard raises.
    baselineLabel: "the same 54 days of the previous quarter",
    baselineFrom: "2026-04-01T00:00:00.000+02:00",
    baselineTo: "2026-05-25T00:00:00.000+02:00",
    baselineClipped: true,
  },
  last_quarter: {
    label: "Last completed quarter",
    from: "2026-04-01T00:00:00.000+02:00",
    to: "2026-07-01T00:00:00.000+02:00",
    baselineLabel: "the quarter before it",
    baselineFrom: "2026-01-01T00:00:00.000+01:00",
    baselineTo: "2026-04-01T00:00:00.000+02:00",
    baselineClipped: false,
  },
  year_to_date: {
    label: "Year to date",
    from: "2026-01-01T00:00:00.000+01:00",
    to: "2026-08-24T00:00:00.000+02:00",
    baselineLabel: "the same period last year",
    baselineFrom: "2025-01-01T00:00:00.000+01:00",
    baselineTo: "2025-08-24T00:00:00.000+02:00",
    baselineClipped: true,
  },
};

export class SyntheticObserverRepository implements ObserverRepository {
  async listTenants(viewer: Viewer): Promise<readonly TenantSummary[]> {
    return TENANTS.filter((t) => viewer.tenantIds.includes(t.id));
  }

  async listProjects(viewer: Viewer, tenantId: TenantId): Promise<readonly ProjectSummary[]> {
    if (!viewer.tenantIds.includes(tenantId)) {
      throw new NotPermittedError("this developer");
    }
    return PROJECTS.filter((p) => p.tenantId === tenantId && viewer.projectIds.includes(p.id));
  }

  async resolveProject(
    viewer: Viewer,
    tenantSlug: string,
    projectSlug: string,
  ): Promise<{ tenant: TenantSummary; project: ProjectSummary }> {
    const tenant = TENANTS.find((t) => t.slug === tenantSlug);
    if (tenant === undefined) throw new NotFoundError(`Developer "${tenantSlug}"`);

    const project = PROJECTS.find((p) => p.slug === projectSlug && p.tenantId === tenant.id);
    if (project === undefined) throw new NotFoundError(`Project "${projectSlug}"`);

    // Both checks, not one. A viewer can hold a tenant grant without holding
    // every project in it — which is exactly how an agency is scoped.
    if (!viewer.tenantIds.includes(tenant.id)) throw new NotPermittedError(tenant.name);
    if (!viewer.projectIds.includes(project.id)) throw new NotPermittedError(project.name);

    return { tenant, project };
  }

  async resolvePeriod(_projectId: ProjectId, preset: PeriodPreset): Promise<Period> {
    return { preset, ...PERIODS[preset] };
  }

  private async context(query: OverviewQuery | BriefQuery): Promise<ViewContext> {
    const { tenant, project } = await this.resolveProject(
      query.viewer,
      query.tenantSlug,
      query.projectSlug,
    );
    const preset: PeriodPreset = "period" in query ? query.period : "quarter_to_date";
    const period = await this.resolvePeriod(project.id, preset);
    return { viewer: query.viewer, tenant, project, period, generatedAt: TODAY };
  }

  async getExecutiveOverview(query: OverviewQuery): Promise<ExecutiveOverview> {
    const context = await this.context(query);
    if (context.viewer.role === "sales_agent") {
      // Not a 404 and not an empty screen: agents have their own Overview, and
      // routing them here would either leak agency-wide figures or show them a
      // page of blanks.
      throw new NotPermittedError("the executive overview");
    }
    return buildExecutiveOverview(context);
  }

  async getAgentOverview(query: OverviewQuery): Promise<AgentOverview> {
    const context = await this.context(query);
    if (context.viewer.agentId === null) {
      throw new NotPermittedError("the agent workspace");
    }
    return buildAgentOverview(context);
  }

  async getPreMeetingBrief(query: BriefQuery): Promise<PreMeetingBriefView> {
    const context = await this.context(query);
    // The brief is an internal surface. Only roles that run or supervise
    // meetings may read it (ADR-0018).
    const permitted = ["sales_agent", "agency_manager", "madspace_admin"];
    if (!permitted.includes(context.viewer.role)) {
      throw new NotPermittedError("this pre-meeting brief");
    }
    const view = buildPreMeetingBrief(context, query.meetingId);
    if (view === null) throw new NotFoundError(`Meeting "${query.meetingId}"`);
    return view;
  }

  async getEvidence(viewer: Viewer, evidenceId: string): Promise<Evidence> {
    void viewer;
    throw new NotFoundError(`Evidence "${evidenceId}"`);
  }
}

export const syntheticRepository: ObserverRepository = new SyntheticObserverRepository();
