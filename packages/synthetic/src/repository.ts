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
  AskSession,
  PreMeetingBriefView,
  ProjectPulse,
  ProjectSummary,
  TenantSummary,
  ViewContext,
  Viewer,
} from "@observer/readmodels";
import { NotFoundError, NotPermittedError } from "@observer/readmodels";
import type { AgentCharts, FlowCharts, KpiWindowId, ProjectCharts } from "@observer/readmodels";
import type {
  AgentsView,
  AudienceCriteria,
  AudienceView,
  ProjectView,
  SalesFlowView,
  ShowroomHome,
  AgentSummary,
  MeetingReplay,
  MeetingSummary,
  PresentationIntelligence,
  ShowroomOverview,
  ShowroomSessionSlice,
  StorytellingIntelligence,
  UnitAttentionView,
} from "@observer/readmodels";
import { PROJECTS, TENANTS, TODAY } from "./world";
import { buildExecutiveOverview } from "./overview";
import { buildAgentOverview, buildPreMeetingBrief } from "./agent";
import { buildAskSession, buildProjectPulse } from "./pulse";
import {
  SYNTHETIC_AGENTS,
  sessionById,
  sessionsForProject,
  sessionsInPeriod,
} from "./showroom/sessions";
import { buildAgentCharts, buildFlowCharts, buildProjectCharts } from "./showroom/charts";
import {
  buildAgentsView,
  buildAudience,
  buildHome,
  buildProjectView,
  buildSalesFlow,
} from "./showroom/views3";
import {
  buildMeetingList,
  buildMeetingReplay,
  buildPresentationIntelligence,
  buildShowroomOverview,
  buildStorytelling,
  buildUnitAttention,
} from "./showroom/project";

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

  async getProjectPulse(query: OverviewQuery): Promise<ProjectPulse> {
    const context = await this.context(query);
    return buildProjectPulse(context);
  }

  async getAskSession(query: OverviewQuery, selectionLabel: string | null): Promise<AskSession> {
    const context = await this.context(query);
    return buildAskSession(context, buildProjectPulse(context), selectionLabel);
  }

  /* --- Showroom Intelligence ---------------------------------------------- */

  /**
   * The two session slices every showroom surface needs.
   *
   * Both are read from the same fact stream, so the period and its baseline
   * cannot disagree about which meetings exist — which is exactly the class of
   * bug the legacy dashboard has between its two feature-time accumulators.
   */
  /*
   * "Today" is the synthetic world's today, not the clock's.
   *
   * The named buckets — today, this week, last month — resolve against the same
   * fixed date the dataset was generated for, or a demo's figures change
   * overnight and no screenshot or assertion survives it.
   */
  private readonly today = new Date(TODAY);

  private async slices(query: OverviewQuery) {
    const context = await this.context(query);
    /*
     * One slice for the period. Not two.
     *
     * There used to be two: `current`, running to the period's stated end, and
     * `throughToday`, running to the end of today. "Quarter to date" ends at
     * midnight this morning, so a bucket called Today was empty on a period
     * that had already excluded today — which is what the second slice was
     * for.
     *
     * Two slices meant two answers to "how many meetings are in this period",
     * and both reached the screen: the briefing said "I reviewed 74 showroom
     * presentations quarter to date" while Presentation DNA said "73 meetings"
     * about the same quarter. Worse, `throughToday` ignored the period's end
     * entirely, so **Last completed quarter reported 132 meetings** — every
     * meeting in the dataset — on the three surfaces that read it.
     *
     * So the period's window is extended through today when the period is
     * still running, and left alone when it is not. A period that ended within
     * the last day is still running; anything older is history and does not
     * grow.
     */
    const endOfToday = new Date(this.today);
    endOfToday.setUTCHours(23, 59, 59, 999);

    const stillRunning =
      new Date(context.period.to).getTime() >= this.today.getTime() - 24 * 60 * 60 * 1000;
    const periodEnd = stillRunning ? endOfToday.toISOString() : context.period.to;

    /*
     * Every slice is scoped to the project the viewer resolved.
     *
     * `context.project` came from `resolveProject`, which checked the tenant and
     * the viewer's grants before returning it — so passing its id here is what
     * makes the authorisation reach the data rather than stopping at the page.
     */
    const project = context.project.id as string;

    return {
      context,
      current: sessionsInPeriod(project, context.period.from, periodEnd),
      previous: sessionsInPeriod(project, context.period.baselineFrom, context.period.baselineTo),
    };
  }

  async getHome(query: OverviewQuery): Promise<ShowroomHome> {
    const { context, current, previous } = await this.slices(query);
    return buildHome(context, current, previous, this.today);
  }

  async getSalesFlow(query: OverviewQuery): Promise<SalesFlowView> {
    const { context, current } = await this.slices(query);
    return buildSalesFlow(context, current, this.today);
  }

  async getFlowCharts(query: OverviewQuery, window: KpiWindowId): Promise<FlowCharts> {
    const { context, current } = await this.slices(query);
    /*
     * The KPI window ignores the selected *period*. It does not ignore the
     * project.
     *
     * "All time" inside a quarter-to-date period would be the quarter, which is
     * not what the control says — so the window reads outside the period, and
     * the rest of the page stays on it.
     *
     * It used to read `showroomSessions()`: every meeting in every project of
     * every tenant. Northgate's Sales Flow therefore reported 98 presentations
     * this month above a chart reading 32, and the 98 included Riverside and —
     * a different developer entirely — Beta Development's Kingsford. A
     * developer was being shown a competitor's volume inside their own
     * headline figure.
     *
     * `sessionsForProject` is the same unfiltered-by-period set, scoped to the
     * project the viewer already resolved. That scoping is what makes the
     * authorisation reach the data rather than stopping at the page.
     */
    return buildFlowCharts(
      context,
      current,
      sessionsForProject(context.project.id as string),
      this.today,
      window,
    );
  }

  async getProjectCharts(query: OverviewQuery): Promise<ProjectCharts> {
    // `current`, matching getProjectView for the same reason.
    const { context, current } = await this.slices(query);
    return buildProjectCharts(
      context.project.id as string,
      current,
      this.today,
      context.project.locale,
    );
  }

  async getAgentCharts(query: OverviewQuery): Promise<AgentCharts> {
    // `current`, matching getAgentsView — the rings and the radars are read as
    // one page, so they must count the same meetings.
    const { context, current } = await this.slices(query);
    const base = `/${context.tenant.slug}/${context.project.slug}`;
    return buildAgentCharts(current, base, context.project.locale);
  }

  async getProjectView(query: OverviewQuery, segmentId: string | null): Promise<ProjectView> {
    const { context, current } = await this.slices(query);
    return buildProjectView(context, current, segmentId);
  }

  async getAgentsView(query: OverviewQuery): Promise<AgentsView> {
    const { context, current } = await this.slices(query);

    /*
     * Every role that holds the project reads this, sales agents included
     * (ADR-0029). The refusal that used to stand here was a ROLE check; the
     * check that matters is the project one, and it has already happened —
     * `this.slices` resolves the project through the viewer's grants and
     * throws before any session is counted if the grant is missing.
     *
     * So there is no branch here at all, and that is the point: an agent on
     * Northgate sees Northgate's agents because Northgate is theirs, and sees
     * nothing of Kingsford because Kingsford is not.
     */

    // The IRIS rating is feedback on the software, so only MADSPACE sees it.
    return buildAgentsView(context, current, context.viewer.role === "madspace_admin");
  }

  async getAudience(query: OverviewQuery, criteria: AudienceCriteria): Promise<AudienceView> {
    const { context, current } = await this.slices(query);
    return buildAudience(context, current, criteria);
  }

  async getShowroomOverview(query: OverviewQuery): Promise<ShowroomOverview> {
    // One slice, like every other read model. See `slices()` for why there
    // used to be two and what having two put on the screen.
    const { context, current, previous } = await this.slices(query);
    return buildShowroomOverview(context, current, previous);
  }

  async getPresentationIntelligence(
    query: OverviewQuery,
    comparison: {
      mode: "agents" | "cohorts" | "periods";
      left: string | null;
      right: string | null;
    },
  ): Promise<PresentationIntelligence> {
    const { context, current, previous } = await this.slices(query);
    return buildPresentationIntelligence(
      context,
      current,
      previous,
      comparison.mode,
      comparison.left,
      comparison.right,
    );
  }

  async getMeetingReplay(query: BriefQuery): Promise<MeetingReplay> {
    const context = await this.context(query);
    const session = sessionById(query.meetingId);
    if (session === undefined) throw new NotFoundError(`Meeting "${query.meetingId}"`);
    return buildMeetingReplay(context, session);
  }

  async listMeetings(query: OverviewQuery): Promise<readonly MeetingSummary[]> {
    const { context, current } = await this.slices(query);
    return buildMeetingList(context, current);
  }

  async listAgents(query: OverviewQuery): Promise<readonly AgentSummary[]> {
    const { current } = await this.slices(query);
    return SYNTHETIC_AGENTS.map((agent) => ({
      agentId: agent.id,
      name: agent.name,
      organisationName: agent.organisationName,
      meetingCount: current.filter((s) => s.agentId === agent.id).length,
    })).filter((a) => a.meetingCount > 0);
  }

  async getUnitAttention(
    query: OverviewQuery,
    unitCode: string | null,
  ): Promise<UnitAttentionView> {
    const { context, current, previous } = await this.slices(query);
    return buildUnitAttention(context, current, previous, unitCode);
  }

  async getStorytelling(query: OverviewQuery): Promise<StorytellingIntelligence> {
    const { context, current } = await this.slices(query);
    return buildStorytelling(context, current);
  }

  async getSessionSlice(query: OverviewQuery): Promise<ShowroomSessionSlice> {
    const { context, current } = await this.slices(query);
    return { sessions: current, periodLabel: context.period.label };
  }

  async getEvidence(viewer: Viewer, evidenceId: string): Promise<Evidence> {
    void viewer;
    throw new NotFoundError(`Evidence "${evidenceId}"`);
  }
}

export const syntheticRepository: ObserverRepository = new SyntheticObserverRepository();
