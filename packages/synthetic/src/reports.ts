import { outcomeIsUnknown, type InsightSource, type ShowroomSession } from "@observer/contracts";
import { AGENT_MIN_SAMPLE } from "@observer/metrics";
import type { ReportScopeView, ReportSection, ViewContext } from "@observer/readmodels";
import { catalogueFor } from "./pulse";
import { count, evidenceRef, percent } from "./format";
import { SYNTHETIC_AGENTS } from "./showroom/sessions";

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
): ReportScopeView {
  const locale = context.project.locale;
  const root = `/${context.tenant.slug}/${context.project.slug}`;
  const crm = context.project.connectedSources.includes("crm");
  const n = sessions.length;

  const recorded = sessions.filter((s) => !outcomeIsUnknown(s.outcome)).length;
  const unrecordedShare = share(n - recorded, n);
  const legacy = sessions.filter((s) => s.timingUnavailable).length;
  const webiris = sessions.filter((s) => s.channel === "webiris").length;
  const catalogue = catalogueFor(context.project.id as string);

  const presenting = SYNTHETIC_AGENTS.map((agent) => ({
    name: agent.name,
    meetings: sessions.filter((s) => s.agentId === agent.id).length,
  })).filter((a) => a.meetings > 0);
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
