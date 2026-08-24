import type { Evidence, MeetingId, ProjectId, TenantId } from "@observer/contracts";
import type { Period, PeriodPreset, ProjectSummary, TenantSummary, Viewer } from "./context";
import type { AgentOverview, ExecutiveOverview, PreMeetingBriefView } from "./views";
import type { AskSession, ProjectPulse } from "./pulse";
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

  listMeetings(query: OverviewQuery): Promise<readonly MeetingSummary[]>;

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
