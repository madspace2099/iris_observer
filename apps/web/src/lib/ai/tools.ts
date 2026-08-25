import "server-only";
import { z } from "zod";
import {
  OUTCOME_LABELS,
  hasProgressed,
  outcomeIsUnknown,
  sectionLabel,
  type InsightSource,
  type SectionId,
} from "@observer/contracts";
import type { EvidenceRef, Viewer } from "@observer/readmodels";
import { NotPermittedError } from "@observer/readmodels";
import { repository } from "@/lib/repository";

/**
 * The analysis tools.
 *
 * These are the only things in the AI pipeline permitted to produce a number.
 * The model chooses which one to call and writes prose about what comes back;
 * it never queries, never aggregates and never fills a gap.
 *
 * Every tool is **read-only**, takes a validated argument object, runs against
 * the same repository the screens read, and returns facts already formatted for
 * display together with their provenance, sample size, evidence and caveats.
 * The application renders the evidence itself, beside the prose rather than
 * inside it, so a model that ignores its instructions cannot make a claim look
 * sourced.
 */

export interface ToolFact {
  readonly label: string;
  readonly value: string;
  readonly note: string | null;
}

export interface ToolResult {
  readonly tool: string;
  /** The figures. Computed here, never by the model. */
  readonly facts: readonly ToolFact[];
  readonly sources: readonly InsightSource[];
  readonly evidence: EvidenceRef | null;
  readonly sampleSize: number;
  /** What the data cannot say. Rendered as its own block, never buried. */
  readonly caveats: readonly string[];
  /** Where the reader should go to check this themselves. */
  readonly action: { readonly label: string; readonly href: string } | null;
  /**
   * A plain-language draft.
   *
   * The deterministic provider returns this verbatim; a live model rewrites it
   * without being permitted to change a figure. Either way the reader sees
   * prose that already matched the evidence before any model touched it.
   */
  readonly draft: string;
}

export interface ToolContext {
  readonly viewer: Viewer;
  readonly tenantSlug: string;
  readonly projectSlug: string;
  readonly period: "quarter_to_date" | "last_28_days" | "last_quarter" | "year_to_date";
}

interface ToolDefinition<S extends z.ZodTypeAny> {
  readonly name: string;
  readonly description: string;
  readonly input: S;
  run(context: ToolContext, args: z.infer<S>): Promise<ToolResult>;
}

function query(context: ToolContext) {
  return {
    viewer: context.viewer,
    tenantSlug: context.tenantSlug,
    projectSlug: context.projectSlug,
    period: context.period,
  };
}

function root(context: ToolContext): string {
  return `/${context.tenantSlug}/${context.projectSlug}`;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

const OBSERVED: readonly InsightSource[] = ["IRIS_SHOWROOM_OBSERVED"];
const DERIVED: readonly InsightSource[] = ["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED"];
const WITH_OUTCOME: readonly InsightSource[] = [
  "IRIS_SHOWROOM_OBSERVED",
  "IRIS_SHOWROOM_DERIVED",
  "CRM_OUTCOME_CONTEXT",
];

interface PresentationDifferenceLike {
  readonly behaviour: string;
  readonly leftDisplay: string;
  readonly rightDisplay: string;
}

/**
 * Turns a behaviour predicate into a clause.
 *
 * "Opens the Shortlist" + "89%" becomes "opens the Shortlist in 89% of their
 * meetings", which can be dropped into a sentence. The predicate strings are
 * written in the third person singular for exactly this reason.
 */
function describe(d: PresentationDifferenceLike, side: "left" | "right"): string {
  const rate = side === "left" ? d.leftDisplay : d.rightDisplay;
  const clause = d.behaviour.charAt(0).toLowerCase() + d.behaviour.slice(1);
  return `${clause} in ${rate} of their meetings`;
}

const NO_CAUSATION =
  "This is an association at the stated sample size, not evidence that one way of presenting produces a different outcome.";

/* --- 1. summarize_showroom_period ------------------------------------------ */

const summarizeShowroomPeriod: ToolDefinition<z.ZodObject<Record<string, never>>> = {
  name: "summarize_showroom_period",
  description:
    "What happened inside IRIS during the selected period: presentation volume, coverage, depth and the leading findings.",
  input: z.object({}),
  async run(context) {
    const overview = await repository.getShowroomOverview(query(context));
    return {
      tool: "summarize_showroom_period",
      facts: [
        { label: "Presentations", value: String(overview.meetingCount), note: null },
        {
          label: "Core coverage",
          value: pct(overview.coverage.coreReached),
          note: `${overview.coverage.coreTotal} core sections`,
        },
        { label: "Median depth", value: `${overview.coverage.medianDepth} steps`, note: null },
        ...overview.coverage.routinelySkipped.slice(0, 2).map((s) => ({
          label: `${s.label} skipped`,
          value: pct(s.skipRate),
          note: "of presentations",
        })),
      ],
      sources: DERIVED,
      evidence: overview.evidence,
      sampleSize: overview.meetingCount,
      caveats: overview.findings.flatMap((f) => (f.caveat === null ? [] : [f.caveat])),
      action: { label: "Open the Showroom overview", href: `${root(context)}/showroom` },
      draft: `${overview.verdict} ${overview.findings[0]?.statement ?? ""}`.trim(),
    };
  },
};

/* --- 2. compare_agent_flows ------------------------------------------------ */

const compareAgentFlows: ToolDefinition<
  z.ZodObject<{ leftAgentId: z.ZodString; rightAgentId: z.ZodString }>
> = {
  name: "compare_agent_flows",
  description:
    "Compare how two sales agents use IRIS: section order, coverage, Compare mode, returns, and where they differ most.",
  input: z.object({
    leftAgentId: z.string().min(1).describe("Agent id, e.g. agt_monika"),
    rightAgentId: z.string().min(1).describe("Agent id, e.g. agt_akhilesh"),
  }),
  async run(context, args) {
    /*
     * The same rule as the surface, enforced in the tool.
     *
     * Asking Observer to compare two named colleagues is the league table by
     * another route, and a control that exists only on the page it was written
     * for is not a control. `NotPermittedError` is what the agent loop already
     * turns into an honest refusal.
     */
    if (context.viewer.role === "sales_agent") {
      throw new NotPermittedError("a comparison of named colleagues");
    }

    const view = await repository.getPresentationIntelligence(query(context), {
      mode: "agents",
      left: args.leftAgentId,
      right: args.rightAgentId,
    });
    const c = view.comparison;
    if (c === null) {
      return {
        tool: "compare_agent_flows",
        facts: [],
        sources: DERIVED,
        evidence: view.evidence,
        sampleSize: 0,
        caveats: ["Those two agents could not be resolved in this project."],
        action: null,
        draft: "Those two agents could not be resolved in this project.",
      };
    }

    const top = c.differences.slice(0, 4);
    return {
      tool: "compare_agent_flows",
      facts: [
        {
          label: `${c.left.label} · meetings`,
          value: String(c.left.meetingCount),
          note: `${pct(c.left.coverage)} core coverage`,
        },
        {
          label: `${c.right.label} · meetings`,
          value: String(c.right.meetingCount),
          note: `${pct(c.right.coverage)} core coverage`,
        },
        ...top.map((d) => ({
          label: d.behaviour,
          value: `${d.leftDisplay} vs ${d.rightDisplay}`,
          note: d.note,
        })),
      ],
      sources: DERIVED,
      evidence: c.evidence,
      sampleSize: c.left.meetingCount + c.right.meetingCount,
      caveats: [NO_CAUSATION, ...top.flatMap((d) => (d.note === null ? [] : [d.note]))],
      action: {
        label: "Open the comparison",
        href: `${root(context)}/presentation?mode=agents&left=${args.leftAgentId}&right=${args.rightAgentId}`,
      },
      /*
       * Written as prose, not as a joined list.
       *
       * Without a model configured this is the answer the reader gets, so it has
       * to be readable on its own — a semicolon-separated dump of predicates is
       * a debug print, not an explanation.
       */
      draft:
        top.length === 0
          ? `Across ${c.left.meetingCount} and ${c.right.meetingCount} meetings, ${c.left.label} and ${c.right.label} present in measurably similar ways.`
          : `The clearest difference is that ${c.left.label} ${describe(top[0] as PresentationDifferenceLike, "left")}, where ${c.right.label} ${describe(top[0] as PresentationDifferenceLike, "right")}.${
              top[1] === undefined
                ? ""
                : ` ${c.left.label.split(" ")[0]} also ${describe(top[1] as PresentationDifferenceLike, "left")} against ${top[1].rightDisplay}.`
            } Based on ${c.left.meetingCount} and ${c.right.meetingCount} meetings.`,
    };
  },
};

/* --- 3. compare_meeting_cohorts -------------------------------------------- */

const compareMeetingCohorts: ToolDefinition<z.ZodObject<Record<string, never>>> = {
  name: "compare_meeting_cohorts",
  description:
    "Compare the IRIS behaviour of meetings that progressed further against those that did not. Outcome is the cohort boundary, not the subject.",
  input: z.object({}),
  async run(context) {
    const view = await repository.getPresentationIntelligence(query(context), {
      mode: "cohorts",
      left: null,
      right: null,
    });
    const c = view.comparison;
    if (c === null) {
      return {
        tool: "compare_meeting_cohorts",
        facts: [],
        sources: WITH_OUTCOME,
        evidence: view.evidence,
        sampleSize: 0,
        caveats: ["No cohort split was possible for this period."],
        action: null,
        draft: "No cohort split was possible for this period.",
      };
    }

    const top = c.differences.slice(0, 4);
    return {
      tool: "compare_meeting_cohorts",
      facts: [
        {
          label: "Progressed further",
          value: String(c.left.meetingCount),
          note: "purchase, reservation, interested or follow-up",
        },
        {
          label: "Did not progress",
          value: String(c.right.meetingCount),
          note: "presentation only or not interested",
        },
        ...top.map((d) => ({
          label: d.behaviour,
          value: `${d.leftDisplay} vs ${d.rightDisplay}`,
          note: d.note,
        })),
      ],
      sources: WITH_OUTCOME,
      evidence: c.evidence,
      sampleSize: c.left.meetingCount + c.right.meetingCount,
      caveats: [
        NO_CAUSATION,
        "Meetings with no recorded outcome are excluded from both cohorts rather than assigned to one.",
      ],
      action: {
        label: "Open the cohort comparison",
        href: `${root(context)}/presentation?mode=cohorts`,
      },
      draft:
        top.length === 0
          ? "The two cohorts show no behavioural difference above the reporting threshold."
          : `Meetings that progressed differ most on: ${top
              .map(
                (d) => `${d.behaviour.toLowerCase()} (${d.leftDisplay} against ${d.rightDisplay})`,
              )
              .join("; ")}. ${c.left.meetingCount} progressed, ${c.right.meetingCount} did not.`,
    };
  },
};

/* --- 4. explain_meeting_journey -------------------------------------------- */

const explainMeetingJourney: ToolDefinition<z.ZodObject<{ meetingId: z.ZodString }>> = {
  name: "explain_meeting_journey",
  description:
    "Reconstruct one showroom meeting step by step: sections entered, units opened, interactions and gaps.",
  input: z.object({ meetingId: z.string().min(1).describe("Meeting id, e.g. mtg_0042") }),
  async run(context, args) {
    const replay = await repository.getMeetingReplay({
      viewer: context.viewer,
      tenantSlug: context.tenantSlug,
      projectSlug: context.projectSlug,
      meetingId: args.meetingId as never,
    });
    const sections = replay.steps.filter((s) => s.kind === "section");
    return {
      tool: "explain_meeting_journey",
      facts: [
        { label: "Agent", value: replay.agentName, note: replay.startedDisplay },
        { label: "Duration", value: replay.durationDisplay, note: `${sections.length} sections` },
        {
          label: "Sections, in order",
          value: sections.map((s) => s.label).join(" → "),
          note: null,
        },
        {
          label: "Units opened",
          value: String(replay.steps.filter((s) => s.kind === "unit").length),
          note: null,
        },
        { label: "Outcome", value: replay.outcomeLabel, note: "recorded by the agent" },
      ],
      sources: OBSERVED,
      evidence: replay.evidence,
      sampleSize: 1,
      caveats: replay.gaps,
      action: { label: "Open the replay", href: `${root(context)}/meetings/${replay.meetingId}` },
      draft: `${replay.agentName} presented in this order: ${sections.map((s) => s.label).join(" → ")}. ${replay.headline} The outcome was recorded as ${replay.outcomeLabel.toLowerCase()}.`,
    };
  },
};

/* --- 5. analyze_feature_usage ---------------------------------------------- */

const analyzeFeatureUsage: ToolDefinition<z.ZodObject<{ sectionId: z.ZodOptional<z.ZodString> }>> =
  {
    name: "analyze_feature_usage",
    description:
      "How IRIS sections are used: reach, dwell, glance rate, returns and which sections are most often skipped.",
    input: z.object({
      sectionId: z.string().optional().describe("Optional section to focus on, e.g. amenities"),
    }),
    async run(context, args) {
      const view = await repository.getStorytelling(query(context));
      const focus =
        args.sectionId === undefined
          ? null
          : view.sections.find((s) => s.sectionId === args.sectionId);
      const rows = focus === undefined || focus === null ? view.sections.slice(0, 5) : [focus];

      return {
        tool: "analyze_feature_usage",
        facts: rows.map((s) => ({
          label: s.label,
          value: `reached in ${pct(s.reachRate)}`,
          note:
            s.medianDwellSeconds === null
              ? "timing not recorded by this source"
              : `median ${s.medianDwellSeconds}s · ${pct(s.glanceRate)} under the meaningful threshold`,
        })),
        sources: DERIVED,
        evidence: view.evidence,
        sampleSize: view.environment.meetingsTotal,
        caveats: view.sections.some((s) => s.availability === "requires_ue5_v2_event")
          ? [
              "Some sections have no timing at all in this period; their dwell is unknown, not zero.",
            ]
          : [],
        action: { label: "Open Storytelling", href: `${root(context)}/storytelling` },
        draft:
          rows
            .map(
              (s) =>
                `${s.label} is opened in ${pct(s.reachRate)} of meetings${
                  s.medianDwellSeconds === null ? "" : `, median ${s.medianDwellSeconds}s`
                }`,
            )
            .join("; ") + ".",
      };
    },
  };

/* --- 6. analyze_unit_attention --------------------------------------------- */

const analyzeUnitAttention: ToolDefinition<z.ZodObject<{ unitCode: z.ZodOptional<z.ZodString> }>> =
  {
    name: "analyze_unit_attention",
    description:
      "Buyer attention on units: meetings, dwell, repeat views, shortlisting, plans, comparisons and the recent trend.",
    input: z.object({ unitCode: z.string().optional().describe("Optional unit code, e.g. A-402") }),
    async run(context, args) {
      const view = await repository.getUnitAttention(query(context), args.unitCode ?? null);

      if (view.selected !== null) {
        const r = view.selected.row;
        return {
          tool: "analyze_unit_attention",
          facts: [
            {
              label: r.unitCode,
              value: `${r.rooms} rooms · ${r.areaSqm} m² · ${r.priceDisplay}`,
              note: r.status,
            },
            { label: "Meetings", value: String(r.meetings), note: `${r.views} views` },
            {
              label: "Median look",
              value: `${r.medianDwellSeconds}s`,
              note: `${r.repeatViews} repeat views`,
            },
            {
              label: "Shortlisted",
              value: String(r.favourites),
              note: `${r.pdfOpens} plans opened`,
            },
            {
              label: "Comparisons",
              value:
                r.comparisonWins === null
                  ? "never compared"
                  : `kept ${r.comparisonWins} of ${r.comparisonAppearances}`,
              note: null,
            },
            { label: "Trend", value: r.trendDisplay, note: `against the previous period` },
          ],
          sources: OBSERVED,
          evidence: view.selected.evidence,
          sampleSize: r.meetings,
          caveats:
            r.comparisonWins === null
              ? ["This unit was never placed in Compare mode, so no comparison record exists."]
              : [],
          action: {
            label: `Open ${r.unitCode}`,
            href: `${root(context)}/units?unit=${r.unitCode}`,
          },
          draft: `${r.unitCode} was opened in ${r.meetings} meetings with a median look of ${r.medianDwellSeconds} seconds, shortlisted ${r.favourites} times, and its attention is ${r.trend} against the previous period.`,
        };
      }

      const top = view.rows.filter((r) => r.meetings > 0).slice(0, 5);
      return {
        tool: "analyze_unit_attention",
        facts: top.map((r) => ({
          label: r.unitCode,
          value: `${r.meetings} meetings`,
          note: `${r.rooms} rooms · median ${r.medianDwellSeconds}s · ${r.favourites} shortlisted`,
        })),
        sources: OBSERVED,
        evidence: view.evidence,
        sampleSize: top.length,
        caveats: [],
        action: { label: "Open Unit attention", href: `${root(context)}/units` },
        draft: `The units drawing most attention are ${top.map((r) => `${r.unitCode} (${r.meetings} meetings)`).join(", ")}.`,
      };
    },
  };

/* --- 7. detect_showroom_behavior_changes ----------------------------------- */

const detectShowroomBehaviorChanges: ToolDefinition<z.ZodObject<Record<string, never>>> = {
  name: "detect_showroom_behavior_changes",
  description: "What changed in how IRIS is being presented, compared with the previous period.",
  input: z.object({}),
  async run(context) {
    const overview = await repository.getShowroomOverview(query(context));
    return {
      tool: "detect_showroom_behavior_changes",
      facts: overview.changes.map((c) => ({
        label: c.label,
        value: c.deltaDisplay,
        note: c.detail,
      })),
      sources: DERIVED,
      evidence: overview.evidence,
      sampleSize: overview.meetingCount,
      caveats: ["Period comparison only. A change is not a trend until it repeats."],
      action: {
        label: "Open Presentation Intelligence",
        href: `${root(context)}/presentation?mode=periods`,
      },
      draft:
        overview.changes
          .map((c) => `${c.label}: ${c.deltaDisplay} (${c.detail.toLowerCase()})`)
          .join("; ") + ".",
    };
  },
};

/* --- 8. analyze_environment_usage ------------------------------------------ */

const analyzeEnvironmentUsage: ToolDefinition<z.ZodObject<Record<string, never>>> = {
  name: "analyze_environment_usage",
  description:
    "How time-of-day and weather presets are used during presentations, and during which sections.",
  input: z.object({}),
  async run(context) {
    const view = await repository.getStorytelling(query(context));
    const env = view.environment;
    const totalTime = env.timeOfDay.reduce((a, b) => a + b.count, 0);
    const totalWeather = env.weather.reduce((a, b) => a + b.count, 0);

    return {
      tool: "analyze_environment_usage",
      facts: [
        {
          label: "Meetings using the environment",
          value: `${env.meetingsUsingEnvironment} of ${env.meetingsTotal}`,
          note: pct(env.meetingsUsingEnvironment / Math.max(1, env.meetingsTotal)),
        },
        ...[...env.timeOfDay]
          .sort((a, b) => b.count - a.count)
          .slice(0, 3)
          .map((t) => ({
            label: t.label,
            value: String(t.count),
            note: `${pct(t.count / Math.max(1, totalTime))} of time-of-day changes`,
          })),
        ...[...env.weather]
          .sort((a, b) => b.count - a.count)
          .slice(0, 2)
          .map((w) => ({
            label: w.label,
            value: String(w.count),
            note: `${pct(w.count / Math.max(1, totalWeather))} of weather changes`,
          })),
      ],
      sources: OBSERVED,
      evidence: view.evidence,
      sampleSize: env.meetingsTotal,
      caveats: [
        "Which unit was on screen at the moment of the change is not recorded by the current showroom build, so the preset cannot be tied to an aspect or a floor.",
      ],
      action: { label: "Open Storytelling", href: `${root(context)}/storytelling` },
      draft: `The environment controls were used in ${env.meetingsUsingEnvironment} of ${env.meetingsTotal} meetings, most often ${[...env.timeOfDay].sort((a, b) => b.count - a.count)[0]?.label ?? "no preset"}.`,
    };
  },
};

/* --- 9. prepare_meeting ----------------------------------------------------- */

const prepareMeeting: ToolDefinition<z.ZodObject<{ meetingId: z.ZodString }>> = {
  name: "prepare_meeting",
  description:
    "Prepare an agent for a meeting: what this contact already looked at, and what the showroom data suggests is worth reaching.",
  input: z.object({ meetingId: z.string().min(1) }),
  async run(context, args) {
    const brief = await repository.getPreMeetingBrief({
      viewer: context.viewer,
      tenantSlug: context.tenantSlug,
      projectSlug: context.projectSlug,
      meetingId: args.meetingId as never,
    });

    const b = brief.brief;
    const facts: ToolFact[] = [
      {
        label: "Meeting with",
        value: brief.participantNames.join(", ") || "an unnamed visitor",
        note: null,
      },
      {
        label: "Online before the meeting",
        value: `${b.observed.onlineActivity.sessionCount} sessions`,
        note: `${b.observed.unitInterest.length} units looked at`,
      },
      ...b.observed.unitInterest.slice(0, 4).map((u) => ({
        label: brief.units[u.unitId]?.code ?? u.unitId,
        value: `${u.uniqueViews} views`,
        note: u.favourited
          ? `shortlisted · ${Math.round(u.meaningfulDwellMs / 1000)}s of meaningful dwell`
          : `${Math.round(u.meaningfulDwellMs / 1000)}s of meaningful dwell`,
      })),
      ...b.interpretation.preferredAttributes.slice(0, 3).map((a) => ({
        label: a.attribute,
        value: a.value,
        note: `supported by ${a.supportCount} of ${a.totalObservations} observations`,
      })),
      ...b.recommended.clarificationQuestions.slice(0, 2).map((q) => ({
        label: "Worth asking",
        value: q.question,
        note: null,
      })),
    ];

    return {
      tool: "prepare_meeting",
      facts,
      // WEBIRIS enriches a brief; it never displaces the showroom as the
      // subject, so both classes are declared.
      sources: ["IRIS_SHOWROOM_OBSERVED", "WEBIRIS_CONTEXT", "CRM_OUTCOME_CONTEXT"],
      evidence: Object.values(brief.evidence)[0] ?? null,
      sampleSize: b.observed.unitInterest.length,
      // What is missing, said out loud rather than rendered as an absence.
      caveats: b.dataHealth.missing.map((m) => `${m.what} — ${m.consequence}`),
      action: { label: "Open the brief", href: `${root(context)}/meetings/${args.meetingId}` },
      draft: `${brief.participantNames.join(" and ") || "This visitor"} viewed ${b.observed.unitInterest.length} units across ${b.observed.onlineActivity.sessionCount} online sessions before this meeting. Data completeness is ${Math.round(b.dataHealth.completeness * 100)}%.`,
    };
  },
};

/* --- 10. get_metric_evidence ------------------------------------------------ */

const getMetricEvidence: ToolDefinition<z.ZodObject<{ metricId: z.ZodString }>> = {
  name: "get_metric_evidence",
  description:
    "Resolve what stands behind one figure: its records, its evidence tier and where to inspect it.",
  input: z.object({ metricId: z.string().min(1) }),
  async run(context, args) {
    const overview = await repository.getShowroomOverview(query(context));
    const metric = overview.figures.find((f) => f.metricId === args.metricId);

    if (metric === undefined) {
      return {
        tool: "get_metric_evidence",
        facts: [],
        sources: DERIVED,
        evidence: overview.evidence,
        sampleSize: 0,
        caveats: [`No figure called "${args.metricId}" is published on this surface.`],
        action: null,
        draft: `No figure called "${args.metricId}" is published on this surface.`,
      };
    }

    return {
      tool: "get_metric_evidence",
      facts: [
        { label: metric.label, value: metric.display ?? "not available", note: metric.qualifier },
        { label: "State", value: metric.state, note: metric.message },
        {
          label: "Minimum sample",
          value: String(metric.minimumSampleSize),
          note: metric.sampleSize === null ? null : `actual ${metric.sampleSize}`,
        },
      ],
      sources: DERIVED,
      evidence: metric.evidence ?? overview.evidence,
      sampleSize: metric.sampleSize ?? overview.meetingCount,
      caveats:
        metric.state === "ok"
          ? []
          : [metric.message ?? "This figure is not in a reportable state."],
      action:
        metric.drillHref === null
          ? null
          : { label: `Inspect ${metric.label}`, href: metric.drillHref },
      draft: `${metric.label} is ${metric.display ?? "not available"}${metric.qualifier === null ? "" : ` (${metric.qualifier})`}.`,
    };
  },
};

/* --- the registry ----------------------------------------------------------- */

export const TOOLS = [
  summarizeShowroomPeriod,
  compareAgentFlows,
  compareMeetingCohorts,
  explainMeetingJourney,
  analyzeFeatureUsage,
  analyzeUnitAttention,
  detectShowroomBehaviorChanges,
  analyzeEnvironmentUsage,
  prepareMeeting,
  getMetricEvidence,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
] as readonly ToolDefinition<any>[];

export const TOOL_NAMES = TOOLS.map((t) => t.name);

export function toolByName(name: string) {
  return TOOLS.find((t) => t.name === name);
}

/** The catalogue the model is shown. Descriptions only — never the data. */
export function toolCatalogue(): string {
  return TOOLS.map((t) => {
    const shape = t.input instanceof z.ZodObject ? Object.keys(t.input.shape as object) : [];
    return `- ${t.name}(${shape.join(", ")}): ${t.description}`;
  }).join("\n");
}

export { sectionLabel, OUTCOME_LABELS, hasProgressed, outcomeIsUnknown };
export type { SectionId };
