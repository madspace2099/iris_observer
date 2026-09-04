import type { Evidence, MeetingId, ProjectId, TenantId } from "@observer/contracts";
import type { Period, PeriodPreset, ProjectSummary, TenantSummary, Viewer } from "./context";
import type { AgentOverview, ExecutiveOverview, PreMeetingBriefView } from "./views";
import type { AskHistoryView, AskSession, AskThread, ProjectPulse } from "./pulse";
import type { ReportScopeView } from "./report";
import type {
  AgentDetailView,
  AttentionView,
  MeetingFilters,
  MeetingListView,
  UnitDetailView,
} from "./screens";
import type { AgentCharts, FlowCharts, KpiWindowId, ProjectCharts } from "./charts";
import type {
  AgentsView,
  AudienceCriteria,
  AudienceView,
  ProjectView,
  SalesFlowView,
  ShowroomHome,
} from "./views3";
import type {
  AgentSummary,
  MeetingReplay,
  MeetingSummary,
  PresentationIntelligence,
  ShowroomOverview,
  ShowroomSessionSlice,
  StorytellingIntelligence,
  UnitAttentionView,
} from "./showroom";

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

  /**
   * The building and what buyers are doing to it. Drives the signature
   * surface, and every selection made on it.
   */
  getProjectPulse(query: OverviewQuery): Promise<ProjectPulse>;

  /**
   * Ask Observer. Deterministic in the synthetic phase, behind the interface a
   * model will later call — the model chooses the query and writes the prose,
   * never the figures.
   */
  getAskSession(query: OverviewQuery, selectionLabel: string | null): Promise<AskSession>;

  /* --- the opening screen and the three views ----------------------------- */

  /**
   * The opening screen.
   *
   * A verdict, three figures and three doors. Everything analytical lives behind
   * the doors: review found the previous opening screen overloaded, and a
   * developer with two minutes needs an answer rather than a report.
   */
  getHome(query: OverviewQuery): Promise<ShowroomHome>;

  /** How the sales process is performing, period by period and agent by agent. */
  getSalesFlow(query: OverviewQuery): Promise<SalesFlowView>;

  /**
   * The charts the Sales Flow view draws.
   *
   * Separate from the view because the KPI window is the reader's own control
   * and changes independently of everything else on the page.
   */
  getFlowCharts(query: OverviewQuery, window: KpiWindowId): Promise<FlowCharts>;

  /** Progress against the plan, and where journeys stop. */
  getProjectCharts(query: OverviewQuery): Promise<ProjectCharts>;

  /**
   * Each agent across several dimensions at once.
   *
   * Normalised per axis, so the shape is comparable between a busy agent and a
   * quiet one. Deliberately not a score: the axes are not weighted against each
   * other and Observer does not add them up.
   */
  getAgentCharts(query: OverviewQuery): Promise<AgentCharts>;

  /** What buyers want, what they linger on, and what the project does not have. */
  getProjectView(query: OverviewQuery, segmentId: string | null): Promise<ProjectView>;

  /** How each agent presents, and how their meetings end. */
  getAgentsView(query: OverviewQuery): Promise<AgentsView>;

  /**
   * Everyone whose behaviour matched, for outreach.
   *
   * Returns meetings rather than people: identity stays on the surface that
   * already governs it (ADR-0018).
   */
  getAudience(query: OverviewQuery, criteria: AudienceCriteria): Promise<AudienceView>;

  /* --- Showroom Intelligence (ADR-0023) ----------------------------------- */

  /**
   * The period summary the three views draw on.
   *
   * No longer the front door — `getHome` is — but still the surface that states
   * the period's findings in full, and still where the AI's period summary comes
   * from.
   */
  getShowroomOverview(query: OverviewQuery): Promise<ShowroomOverview>;

  /** Presentation DNA: sequences, transitions, and side-by-side comparison. */
  getPresentationIntelligence(
    query: OverviewQuery,
    comparison: {
      mode: "agents" | "cohorts" | "periods";
      left: string | null;
      right: string | null;
    },
  ): Promise<PresentationIntelligence>;

  /** One meeting, reconstructed as a story rather than an event table. */
  getMeetingReplay(query: BriefQuery): Promise<MeetingReplay>;

  /**
   * The meeting list as a bare array.
   *
   * Kept because several surfaces already read it and none of them wants the
   * filter options or the findings. `getMeetings` is the view; this is the
   * list, and both project from the same session slice.
   */
  listMeetings(query: OverviewQuery): Promise<readonly MeetingSummary[]>;

  /**
   * The meeting list as a surface.
   *
   * Every other screen returns a context-bearing view and this one returned an
   * array, so the page around it had to state its own period, compose its own
   * empty sentence and derive its own filter options — three decisions a
   * component is not allowed to make (ADR-0012).
   *
   * `filters` is required and explicit. A default hidden inside the repository
   * is a default the reader cannot see and cannot clear.
   */
  getMeetings(query: OverviewQuery, filters: MeetingFilters): Promise<MeetingListView>;

  /**
   * One unit's own page.
   *
   * Separate from `getUnitAttention`, whose `selected` explains a row's place in
   * a ranking of the whole building. See `UnitDetailView` for the three reasons,
   * the third of which is that a unit nobody opened still has a page and the
   * attention view returns null for exactly that unit.
   */
  getUnitDetail(query: OverviewQuery, unitCode: string): Promise<UnitDetailView>;

  /**
   * One agent's own page, sample size first.
   *
   * Association, never causation, and never a score: there is no rank on the
   * view and no field to put one in. Below `AGENT_MIN_SAMPLE` the whole page is
   * suppressed to raw figures (`docs/10-policies.md` §6).
   */
  getAgentDetail(query: OverviewQuery, agentId: string): Promise<AgentDetailView>;

  /**
   * What is worth a person's attention, across every screen at once.
   *
   * Returns the checks that came back clean as well as the states that were
   * raised, because an empty alert panel otherwise means both "nothing is
   * wrong" and "nothing was measured".
   */
  getAttention(query: OverviewQuery): Promise<AttentionView>;

  /**
   * Previous Ask Observer conversations for this project.
   *
   * Marked `demonstration` in the type: nobody has held these conversations,
   * and the surface may not present them as somebody's history.
   */
  getAskHistory(query: OverviewQuery): Promise<AskHistoryView>;

  /** One conversation, with every turn and the evidence under each answer. */
  getAskThread(query: OverviewQuery, threadId: string): Promise<AskThread>;

  /**
   * What a report could contain, and the statement that nothing writes one.
   *
   * The sections and their availability come from the project's own sources, so
   * a scheme with no CRM is told which parts of its report would be blank
   * before it asks for one rather than afterwards.
   */
  getReportScope(query: OverviewQuery): Promise<ReportScopeView>;

  /**
   * The people presenting on this project, in this period.
   *
   * On the port rather than imported from the data package, so a surface that
   * needs to offer an agent picker does not have to know where agents come from.
   */
  listAgents(query: OverviewQuery): Promise<readonly AgentSummary[]>;

  /** Buyer attention on the building, unit by unit. */
  getUnitAttention(query: OverviewQuery, unitCode: string | null): Promise<UnitAttentionView>;

  /** How the IRIS story itself is being used. */
  getStorytelling(query: OverviewQuery): Promise<StorytellingIntelligence>;

  /**
   * The raw session slice.
   *
   * Exposed for the AI tool layer, which must compute from the same facts every
   * surface reads rather than from a summary written for it.
   */
  getSessionSlice(query: OverviewQuery): Promise<ShowroomSessionSlice>;

  /** Resolves an evidence reference for the drill-down panel. */
  getEvidence(viewer: Viewer, evidenceId: string): Promise<Evidence>;
}
