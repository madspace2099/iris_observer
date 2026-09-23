import { outcomeIsUnknown, type InsightSource, type ShowroomSession } from "@observer/contracts";
import { AGENT_MIN_SAMPLE } from "@observer/metrics";
import type {
  ProjectSummary,
  ReportScopeView,
  ReportSection,
  ViewContext,
} from "@observer/readmodels";
import { catalogueFor } from "./pulse";
import { buildMeetingList } from "./showroom/project";
import { buildAgentDetail } from "./showroom/screens";
import { count, evidenceRef, percent } from "./format";
import { presentersIn } from "./showroom/sessions";

/**
 * What a report could contain, project by project.
 *
 * The surface exists before the generator does, and this is the honest version
 * of that situation: every section is described, every section says whether it
 * could be written from what this project actually has, and the view states
 * once and plainly that nothing produces a document.
 *
 * The availability is computed from the same sources every other surface reads,
 * so a scheme with no CRM is told which pages of its report would be blank
 * *before* it asks for one. That is the whole value of the screen in this phase:
 * a reader who learns on Friday that the outcome section was never possible has
 * been let down by a product that knew on Monday.
 */

const OBSERVED: readonly InsightSource[] = ["IRIS_SHOWROOM_OBSERVED"];
const DERIVED: readonly InsightSource[] = ["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED"];
const WITH_OUTCOME: readonly InsightSource[] = [
  "IRIS_SHOWROOM_OBSERVED",
  "IRIS_SHOWROOM_DERIVED",
  "CRM_OUTCOME_CONTEXT",
];

function share(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

export function buildReportScope(
  context: ViewContext,
  sessions: readonly ShowroomSession[],
  meeting: ShowroomSession | null = null,
): ReportScopeView {
  if (meeting !== null) return buildMeetingReportScope(context, meeting);
  const locale = context.project.locale;
  const root = `/${context.tenant.slug}/${context.project.slug}`;
  const crm = context.project.connectedSources.includes("crm");
  const n = sessions.length;

  const recorded = sessions.filter((s) => !outcomeIsUnknown(s.outcome)).length;
  const unrecordedShare = share(n - recorded, n);
  const legacy = sessions.filter((s) => s.timingUnavailable).length;
  const webiris = sessions.filter((s) => s.channel === "webiris").length;
  const catalogue = catalogueFor(context.project.id as string);

  const presenting = presentersIn(sessions)
    .map((agent) => ({
      name: agent.name,
      meetings: sessions.filter((s) => s.agentId === agent.id).length,
    }))
    .filter((a) => a.meetings > 0);
  const thin = presenting.filter((a) => a.meetings < AGENT_MIN_SAMPLE);

  const evidence = (id: string, observations: number) =>
    evidenceRef(
      `report-${context.project.slug}-${id}`,
      "observed_sequence",
      `${root}/report`,
      observations,
    );

  const sections: readonly ReportSection[] = [
    {
      id: "period-summary",
      label: "Period summary",
      summary:
        "The verdict for the period, the presentation figures behind it, and what moved against the baseline.",
      availability: n === 0 ? "unavailable" : "ready",
      reason:
        n === 0
          ? `No presentations were recorded in ${context.period.label.toLowerCase()}, so the section would have nothing to summarise.`
          : null,
      sources: DERIVED,
      sampleSize: n,
      sampleNoun: "meetings",
      evidence: n === 0 ? null : evidence("summary", n),
    },
    {
      id: "presentation-coverage",
      label: "Presentation coverage",
      summary:
        "Which sections of IRIS the presentations reached, which were routinely skipped, and how deep a typical meeting went.",
      availability: n === 0 ? "unavailable" : legacy > 0 ? "partial" : "ready",
      reason:
        n === 0
          ? "No presentations in the period."
          : legacy > 0
            ? `${count(legacy, locale)} meetings came from the legacy import, which records the order of sections and not their timing. Their sequence would appear; their pacing would not.`
            : null,
      sources: DERIVED,
      sampleSize: n,
      sampleNoun: "meetings",
      evidence: n === 0 ? null : evidence("coverage", n),
    },
    {
      id: "unit-demand",
      label: "Unit demand",
      summary:
        "Attention unit by unit, which segments draw more interest than their share of stock, and what buyers examined on the units they opened.",
      availability: catalogue.length === 0 ? "unavailable" : n === 0 ? "unavailable" : "ready",
      reason:
        catalogue.length === 0
          ? "No unit catalogue is connected to this project, so units cannot be named or segmented."
          : n === 0
            ? "No presentations in the period, so no unit was opened."
            : null,
      sources: DERIVED,
      sampleSize: n,
      sampleNoun: "meetings",
      evidence: catalogue.length === 0 || n === 0 ? null : evidence("units", catalogue.length),
    },
    {
      id: "sales-agents",
      label: "Sales agents",
      summary:
        "How each person presents, how their meetings end, and where their running order differs from the team's.",
      availability: presenting.length === 0 ? "unavailable" : thin.length > 0 ? "partial" : "ready",
      reason:
        presenting.length === 0
          ? "Nobody presented on this project in the period."
          : thin.length > 0
            ? `${thin.map((a) => a.name).join(", ")} ${thin.length === 1 ? "is" : "are"} below the ${AGENT_MIN_SAMPLE}-meeting minimum, so their figures would appear as raw counts with no verdict, rank or trend.`
            : null,
      sources: DERIVED,
      sampleSize: n,
      sampleNoun: "meetings",
      evidence: presenting.length === 0 ? null : evidence("agents", presenting.length),
    },
    {
      id: "outcomes",
      label: "Outcomes and conversion",
      summary:
        "What the recorded outcomes were, and how many meetings progressed further after them.",
      availability: !crm ? "unavailable" : unrecordedShare > 0.2 ? "partial" : "ready",
      reason: !crm
        ? "No CRM is connected to this project, so no meeting carries an outcome. The section would be blank rather than nil."
        : unrecordedShare > 0.2
          ? `${percent(unrecordedShare, locale)} of meetings in the period ended with no outcome recorded, and every rate in this section would silently drop them.`
          : null,
      sources: WITH_OUTCOME,
      sampleSize: recorded,
      sampleNoun: "meetings",
      evidence: crm && recorded > 0 ? evidence("outcomes", recorded) : null,
    },
    {
      id: "channel-split",
      label: "Showroom and WEB IRIS",
      summary:
        "How the period divides between the installation and the browser, and what each channel can and cannot say about dwell.",
      availability:
        n === 0 ? "unavailable" : webiris === 0 || webiris === n ? "unavailable" : "ready",
      reason:
        n === 0
          ? "No presentations in the period."
          : webiris === 0
            ? "Every presentation on this project ran on the showroom installation, so there is no split to report."
            : webiris === n
              ? "Every presentation on this project ran on WEB IRIS, so there is no split to report."
              : null,
      sources: OBSERVED,
      sampleSize: n,
      sampleNoun: "meetings",
      evidence: webiris > 0 && webiris < n ? evidence("channel", n) : null,
    },
    {
      id: "meeting-summary",
      label: "A single meeting",
      summary:
        "One presentation reconstructed as a sequence: what was shown, in what order, which units were opened and what the meeting recorded at the end.",
      availability: n === 0 ? "unavailable" : legacy > 0 ? "partial" : "ready",
      reason:
        n === 0
          ? "No presentations in the period."
          : legacy > 0
            ? `A summary can be written for any meeting in the period, but ${count(legacy, locale)} of them carry no timing and would be shown as a sequence rather than a timeline.`
            : null,
      sources: OBSERVED,
      sampleSize: n,
      sampleNoun: "meetings",
      evidence: n === 0 ? null : evidence("meeting", n),
    },
    {
      id: "evidence-appendix",
      label: "Evidence appendix",
      summary:
        "Every figure in the report with its period, its filters, its sample size and the reference that resolves to the records underneath it.",
      // The one section that is always writable: it describes the report's own
      // provenance, which exists whether or not any given source does.
      availability: "ready",
      reason: null,
      sources: DERIVED,
      sampleSize: null,
      sampleNoun: "meetings",
      evidence: evidence("appendix", n),
    },
  ];

  return {
    context,
    scope: {
      kind: "project",
      label: `${context.project.name} · ${context.period.label}`,
      projectName: context.project.name,
      meetingId: null,
      agentId: null,
    },
    periodLabel: context.period.label,
    sections,
    generation: {
      state: "preview_only",
      statement:
        "Nothing generates a document yet. This screen states what a report would contain, section by section, from the sources this project actually has.",
      milestone: "Report generation is scheduled for M4 (docs/roadmap.md).",
    },
    unavailableCount: sections.filter((s) => s.availability === "unavailable").length,
    evidence: evidence("scope", n),
  };
}

/**
 * One meeting's summary as a report scope — the internal half of M4's
 * "buyer meeting report". The buyer-facing document is a separate,
 * sanitised contract (ADR-0018) and is not this: the scope is stated
 * internal and its two sections are the presentation reconstructed as a
 * sequence and the evidence behind it. A legacy import carries the order
 * of the sections and not their timing, so its summary is partial and says
 * so rather than drawing a timeline it does not have.
 */
function buildMeetingReportScope(context: ViewContext, meeting: ShowroomSession): ReportScopeView {
  const root = `/${context.tenant.slug}/${context.project.slug}`;
  const summary = buildMeetingList(context, [meeting])[0];
  const label =
    summary === undefined ? meeting.meetingId : `${summary.label} · ${summary.agentName}`;
  const evidence = (id: string, observations: number) =>
    evidenceRef(
      `report-${context.project.slug}-meeting-${meeting.meetingId}-${id}`,
      "observed_sequence",
      `${root}/report?meeting=${meeting.meetingId}`,
      observations,
    );
  const sections: readonly ReportSection[] = [
    {
      id: "meeting-summary",
      label: "The meeting, as a sequence",
      summary:
        "What was shown, in what order, which units were opened and what the meeting recorded at the end.",
      availability: meeting.timingUnavailable ? "partial" : "ready",
      reason: meeting.timingUnavailable
        ? "This meeting came from the legacy import, which records the order of sections and not their timing. The sequence is written; the pacing is not."
        : null,
      sources: OBSERVED,
      sampleSize: null,
      sampleNoun: "meetings",
      evidence: evidence("sequence", meeting.steps.length),
    },
    {
      id: "evidence-appendix",
      label: "Evidence appendix",
      summary:
        "The session record this summary rests on, with its source, its step count and the reference that resolves to it.",
      availability: "ready",
      reason: null,
      sources: OBSERVED,
      sampleSize: null,
      sampleNoun: "meetings",
      evidence: evidence("appendix", meeting.steps.length),
    },
  ];
  return {
    context,
    scope: {
      kind: "meeting",
      label,
      projectName: context.project.name,
      meetingId: meeting.meetingId,
      agentId: null,
    },
    periodLabel: context.period.label,
    sections,
    generation: {
      state: "preview_only",
      statement:
        "Nothing generates a document yet. This screen states what a meeting summary would contain from the session record.",
      milestone: "Report generation is scheduled for M4 (docs/roadmap.md).",
    },
    unavailableCount: 0,
    evidence: evidence("scope", meeting.steps.length),
  };
}

/**
 * ONE AGENT'S SUMMARY AS A REPORT SCOPE — THE MANIFEST, NOT THE CONTENT.
 *
 * `ReportSection` is a manifest: what a section would say, whether it can be
 * written, why not, and what sample stands under it. The printed page draws
 * its body from `AgentDetailView` itself, with the same components the
 * agent's own screen uses — `Figure`, `ShareFigure`, `StageFunnel`, the
 * register — so a rate reaches paper with its denominator in words and,
 * below the floor, with its shortfall beside it. A manifest of nine fields
 * cannot carry a floor per figure, and the document does not need it to.
 *
 * Two kinds of gap are stated here, in `reason`. Below `AGENT_MIN_SAMPLE`
 * every section whose figures are rates is `partial`, and its reason is the
 * read model's own suppression sentence — the one the screen leads with. And
 * the one section whose screen region the document does not carry whole
 * says what is missing: the week-by-week series is not printed, the outcome
 * ring reaches paper as a table rather than a shape, and the screen's
 * reading guide is not a section. A document that quietly dropped a region
 * would be the same lie as a zero standing in for a value nobody measured,
 * one level up.
 *
 * The agent has to present on this project in this period, by the rule
 * `getAgentDetail` applies: somebody who does not is not found here, and the
 * answer does not say whether they exist on a project the reader cannot see.
 * "Where else they present" is scoped to the reader's own grants and never
 * to the agent's, for the reason the screen states under the list.
 */
export function buildAgentReportScope(
  context: ViewContext,
  sessions: readonly ShowroomSession[],
  visibleProjects: readonly ProjectSummary[],
  agentId: string,
): ReportScopeView | null {
  const view = buildAgentDetail(context, sessions, visibleProjects, agentId);
  if (view === null) return null;
  const root = `/${context.tenant.slug}/${context.project.slug}`;
  const n = view.sampleSize;
  const evidence = (id: string, observations: number) =>
    evidenceRef(
      `report-${context.project.slug}-agent-${agentId}-${id}`,
      "observed_sequence",
      `${root}/report?agent=${agentId}`,
      observations,
    );

  /*
   * A section of rates, under the floor, is writable with a stated gap: the
   * figures stand as raw counts with their shortfall, and no verdict, rank or
   * trend is drawn from them. The sentence is the read model's, not this
   * file's, so the manifest and the page lead with the same words.
   */
  const rates = (gap: string | null = null): Pick<ReportSection, "availability" | "reason"> => {
    const reasons = [view.suppressionNote, gap].filter((s): s is string => s !== null);
    return reasons.length === 0
      ? { availability: "ready", reason: null }
      : { availability: "partial", reason: reasons.join(" ") };
  };

  /* What the document does not carry of the screen, said once and in full. */
  const notCarried =
    "Not in this document: the week-by-week series of their presentations, because a line is read as a direction whatever is written beneath it and paper cannot say otherwise; the outcome ring as a shape, whose slices are printed as a table under What it met; and the screen's reading guide. Everything else on their screen is here, from the same read model.";

  const sections: readonly ReportSection[] = [
    {
      id: "agent-activity",
      label: "Activity in this period",
      summary:
        "Presentations, the median length, units opened per meeting and core sections reached; follow-ups recorded as needed, and the half no source records; and the outcomes they recorded, each with the count it is a fraction of.",
      ...rates(),
      sources: DERIVED,
      sampleSize: n,
      sampleNoun: "meetings",
      evidence: evidence("activity", n),
    },
    {
      id: "agent-funnel",
      label: "Where their meetings reached",
      summary:
        "Five observed states, each a count of meetings that reached it against the count it is a fraction of. Nothing here says one stage produced the next.",
      availability: "ready",
      reason: null,
      sources: OBSERVED,
      sampleSize: n,
      sampleNoun: "meetings",
      evidence: evidence("funnel", n),
    },
    {
      id: "agent-presentation",
      label: "How they present",
      summary:
        "Their running order, with the median stay in each section. Above the floor, the share of their timed presentation time each section takes and the team's median beside it; below the floor, neither.",
      ...rates(notCarried),
      sources: DERIVED,
      sampleSize: view.profile.timedMeetings,
      sampleNoun: "timed meetings",
      evidence: evidence("presentation", view.profile.timedMeetings),
    },
    {
      id: "agent-buyers",
      label: "What it met",
      summary:
        "What their buyers opened, by apartment size, and how their meetings ended: counts of their own meetings, with the share above the floor and the project's own rate beside it.",
      ...rates(),
      sources: DERIVED,
      sampleSize: n,
      sampleNoun: "meetings",
      evidence: evidence("buyers", n),
    },
    {
      id: "agent-units",
      label: "The apartments they keep opening",
      summary:
        "Units opened in the largest share of their meetings, at most six, with how often each was shortlisted. An association with their habit and nothing more.",
      ...(view.commonUnits.length === 0
        ? {
            availability: "unavailable" as const,
            reason: "No meeting of theirs in the period opened an apartment in the catalogue.",
          }
        : rates()),
      sources: DERIVED,
      sampleSize: n,
      sampleNoun: "meetings",
      evidence: view.commonUnits.length === 0 ? null : evidence("units", n),
    },
    {
      id: "agent-projects",
      label: "Where else they present",
      summary:
        "The projects this account holds on which they also presented in the period, with the meeting count on each.",
      availability: "ready",
      reason: null,
      sources: OBSERVED,
      sampleSize: null,
      sampleNoun: "meetings",
      evidence: evidence("projects", view.projects.length),
    },
    {
      id: "agent-meetings",
      label: "Their most recent meetings",
      summary:
        "At most eight, newest first, each with its length, sections, units opened, shortlist, recorded outcome and follow-up state. The visitor column is a privacy-safe label; no buyer is named.",
      availability: "ready",
      reason: null,
      sources: OBSERVED,
      sampleSize: view.recentMeetings.length,
      sampleNoun: "meetings listed",
      evidence: evidence("meetings", view.recentMeetings.length),
    },
    {
      id: "agent-findings",
      label: "What this period found",
      summary:
        "The findings their own screen states, each with its baseline, its evidence and its caveat.",
      availability: view.findings.length === 0 ? "unavailable" : "ready",
      reason:
        view.findings.length === 0
          ? "Nothing on their screen reached a finding in the period."
          : null,
      sources: DERIVED,
      sampleSize: n,
      sampleNoun: "meetings",
      evidence: view.findings.length === 0 ? null : evidence("findings", view.findings.length),
    },
    {
      id: "evidence-appendix",
      label: "Evidence appendix",
      summary:
        "Every section of this summary with its state, its sample in its own noun, and the reference that resolves to the records underneath it.",
      availability: "ready",
      reason: null,
      sources: DERIVED,
      sampleSize: null,
      sampleNoun: "meetings",
      evidence: evidence("appendix", n),
    },
  ];

  return {
    context,
    scope: {
      kind: "agent",
      label: `${view.name} · ${context.period.label}`,
      projectName: context.project.name,
      meetingId: null,
      agentId,
    },
    periodLabel: context.period.label,
    sections,
    generation: {
      state: "preview_only",
      statement:
        "Nothing generates a document yet. This screen states what one agent's summary would contain, from the read model their own screen draws.",
      milestone: "Report generation is scheduled for M4 (docs/roadmap.md).",
    },
    unavailableCount: sections.filter((s) => s.availability === "unavailable").length,
    evidence: evidence("scope", n),
  };
}
