import type { InsightSource, MeetingId } from "@observer/contracts";
import { AGENT_MIN_SAMPLE } from "@observer/metrics";
import {
  DATA_SOURCE_MARKER_WORDS,
  MEETINGS,
  plural,
  sentence,
  slovakZForm,
  type Language,
  type MetricValue,
  type ObserverRepository,
  type OverviewQuery,
  type ReportScopeSelector,
  type ReportScopeView,
  type ShowroomFinding,
} from "@observer/readmodels";

import { REGISTER_WORDS } from "@/components/agents/MeetingRegister";
import { SHORTFALL, isDash } from "@/components/agents/Rates";
import { FUNNEL_FROM } from "@/components/agents/StageFunnel";
import { LADDER_WORDS } from "@/components/flow/FlowLadder";
import { FINDING_WORDS } from "@/components/product/Finding";
import { FIGURE_WORDS } from "@/components/product/Metric";
import { evidenceText } from "@/components/product/Provenance";
import { CSV_WORDS, type FigureRow } from "./csv";
import { printedSections } from "./omit";
import {
  AGENT_REPORT_WORDS,
  REPORT_COVERAGE_CAPTION,
  REPORT_LEFT_OUT_SECTIONS,
  REPORT_MEETINGS_NEEDED,
  REPORT_WORDS,
  SOURCE_LINE_WORDS,
} from "./words";

/**
 * EVERY FIGURE THE REPORT PAGE PRINTS, AS ROWS (ADR-0045).
 *
 * The CSV is the report page flattened, not a second report. So this reads
 * the SAME read models the page reads for the same scope, period, language
 * and omitted sections — `getReportScope` and, per scope, the views the page
 * draws (`report/page.tsx`, `report/AgentReport.tsx`) — and writes, section
 * by section in the page's order, the figures the page prints with the words
 * the page prints beside them:
 *
 *   - first, the cover's statements: whose data it is (the demonstration
 *     marker the page wears), the internal audience, and which sections the
 *     reader left out — a file that silently lacks a section tells the same
 *     lie as a zero;
 *   - each section's state and sample, and its reason where it has one; a
 *     blank section is its state and reason and nothing else, as on paper;
 *   - every figure in its displayed form (`MetricValue.display`, the project
 *     locale's percentage, the read model's duration), with the base the read
 *     model states for THAT figure — an agent's rate over their decided
 *     meetings, a team share over the timed ones — and an empty cell where
 *     the read model states none. The section's sample stays on its State
 *     row: in a column headed "denominator" it would read as every figure's
 *     base, and for most of them it is not;
 *   - a sentence where the page has only a sentence, with an empty
 *     denominator rather than an invented number; a finding with the so-what
 *     and the caveat the page prints under it.
 *
 * It computes nothing: nothing is summed, joined or ranked (ADR-0012). An
 * absent value is written as the word the page prints, never as 0. Below the
 * floor the shortfall travels with the figure, and a column the page drops
 * below the floor is dropped here too.
 *
 * One deliberate subset: the agent's meeting register is written WITHOUT its
 * visitor column. The page names a buyer only where the register's gate and
 * the contact's consent allow it; a file that leaves the room is not a place
 * to carry that decision, and writing less than the page shows never shows a
 * reader more than the page would.
 */

type Put = (
  figure: string,
  value: string,
  /** The figure's own base, as the read model states it. Omitted: none is stated. */
  denominator?: string,
  sources?: readonly InsightSource[],
) => FigureRow;

type Body = (put: Put) => readonly FigureRow[];

/** What one scope's report reads, flattened. */
export interface ReportFigures {
  readonly report: ReportScopeView;
  /** Whose report, for the file's name: the agent, the meeting, or the project. */
  readonly subject: string;
  /** The period's name and its bounds, so a saved file still says which days it covers. */
  readonly period: string;
  readonly rows: readonly FigureRow[];
}

const joined = (...parts: readonly (string | null | undefined)[]): string =>
  parts.filter((part): part is string => typeof part === "string" && part.length > 0).join(" · ");

/** "n = 14 meetings", as `Sample` prints it: English says "meetings" whatever the count. */
const sampleOf = (n: number, language: Language): string =>
  `n = ${n} ${language === "en" ? "meetings" : plural(language, n, MEETINGS)}`;

/**
 * "Year to date (1 Jan 2026, 00:00 – 24 Aug 2026, 00:00)": the read model's
 * bounds, formatted in the project's locale and time zone. Both are instants
 * and the end is exclusive, so the times are written rather than implied.
 */
function periodCell(report: ReportScopeView): string {
  const { period, project } = report.context;
  const range = new Intl.DateTimeFormat(project.locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: project.timeZone,
  }).formatRange(new Date(period.from), new Date(period.to));
  return `${report.periodLabel} (${range})`;
}

/**
 * The cover's statements, as the page prints them above the sections: the
 * data-source marker its head wears (`Synthetic`, decided from the same two
 * facts the project layout reads), the audience, and the sections the reader
 * left out, each named.
 */
function cover(
  report: ReportScopeView,
  omitted: ReadonlySet<string>,
  language: Language,
): readonly FigureRow[] {
  const words = REPORT_WORDS[language];
  const note = (figure: string, value: string): FigureRow => ({
    section: report.scope.label,
    figure,
    value,
    denominator: "",
    sources: "",
  });
  const { ownDataOnly, sessionsDelivered } = report.context;
  const marker = DATA_SOURCE_MARKER_WORDS[language];
  const printed = printedSections(report.sections, omitted);
  const leftOut = report.sections.filter((section) => !printed.includes(section));
  const total = report.sections.length;
  return [
    ...(ownDataOnly
      ? []
      : [
          note(
            CSV_WORDS[language].note,
            sessionsDelivered ? marker.delivered.full : marker.synthetic.full,
          ),
        ]),
    note(CSV_WORDS[language].note, words.audience),
    ...(leftOut.length === 0
      ? []
      : [
          note(
            CSV_WORDS[language].note,
            sentence(language, REPORT_LEFT_OUT_SECTIONS, {
              count: String(leftOut.length),
              total: String(total),
              from: slovakZForm(total),
              n: leftOut.length,
            }),
          ),
          ...leftOut.map((section) => note(section.label, words.leftOut)),
        ]),
  ];
}

/** The cover, then the sections the page prints, each framed as `ReportPlane` frames it. */
function framed(
  report: ReportScopeView,
  omitted: ReadonlySet<string>,
  language: Language,
  bodies: Readonly<Record<string, Body>>,
): readonly FigureRow[] {
  const words = REPORT_WORDS[language];
  return [
    ...cover(report, omitted, language),
    ...printedSections(report.sections, omitted).flatMap((section) => {
      const sample =
        section.sampleSize === null ? "" : `n = ${section.sampleSize} ${section.sampleNoun}`;
      const put: Put = (figure, value, denominator, sources) => ({
        section: section.label,
        figure,
        value,
        denominator: denominator ?? "",
        sources: (sources ?? section.sources)
          .map((source) => SOURCE_LINE_WORDS[language].words[source])
          .join(" · "),
      });
      const body = bodies[section.id];
      return [
        /* The section's sample, once, where the page's plane footer prints it. */
        put(words.appendixColumns[1], words.availability[section.availability], sample),
        ...(section.reason === null ? [] : [put(CSV_WORDS[language].reason, section.reason)]),
        ...(section.availability === "unavailable" || body === undefined ? [] : body(put)),
      ];
    }),
  ];
}

/** One `MetricValue`, in whichever of its five states, as `Figure` prints it. */
function metric(
  put: Put,
  label: string,
  value: MetricValue,
  language: Language,
  sources?: readonly InsightSource[],
): FigureRow {
  const words = FIGURE_WORDS[language];
  const delta =
    value.comparison === null
      ? null
      : (value.comparison.refusedReason ??
        `${value.comparison.deltaDisplay} ${words.against(value.comparison.baselineLabel)}`);
  switch (value.state) {
    case "ok":
      return put(label, joined(value.display, delta), value.qualifier ?? undefined, sources);
    case "empty":
      return value.display === null && value.message === null
        ? put(label, words.notRecorded, "", sources)
        : put(label, joined(value.display, value.message), undefined, sources);
    case "insufficient": {
      const shortfall =
        value.message ??
        (value.sampleSize === null
          ? words.belowMinimum(value.minimumSampleSize)
          : words.needed(value.sampleSize, value.minimumSampleSize));
      return put(label, value.display ?? "", joined(value.qualifier, shortfall), sources);
    }
    case "unavailable":
      return put(label, joined(words.unavailable, value.message), "", sources);
    case "error":
      return put(label, value.message ?? words.didNotLoad, "", sources);
  }
}

/**
 * The findings `FindingList` prints, each with its own sample and sources, and
 * with the so-what and the caveat the page prints under the statement: the
 * caveat is the hedge against reading an association as an account, and a
 * file without it states the claim bare.
 */
function findings(
  put: Put,
  list: readonly ShowroomFinding[],
  language: Language,
): readonly FigureRow[] {
  const words = FINDING_WORDS[language];
  const label = CSV_WORDS[language].finding;
  if (list.length === 0) return [put(label, words.empty)];
  return list.map((finding) =>
    put(
      label,
      [
        finding.baseline === null
          ? finding.statement
          : `${finding.statement} — ${words.against} ${finding.baseline}`,
        finding.soWhat,
        finding.caveat,
      ]
        .filter((part): part is string => part !== null && part.length > 0)
        .join(" "),
      sampleOf(finding.sampleSize, language),
      finding.sources,
    ),
  );
}

/** The evidence appendix: every printed section, its state, its sample and its evidence. */
function appendix(
  put: Put,
  report: ReportScopeView,
  omitted: ReadonlySet<string>,
  language: Language,
  withSample: boolean,
): readonly FigureRow[] {
  const words = REPORT_WORDS[language];
  return printedSections(report.sections, omitted).map((section) =>
    put(
      section.label,
      joined(words.availability[section.availability], evidenceText(section.evidence, language)),
      withSample && section.sampleSize !== null
        ? `${section.sampleSize} ${section.sampleNoun}`
        : "",
      section.sources,
    ),
  );
}

/** "Unit demand · Share of stock": the row, then the column, as a table reads. */
const cell = (row: string, column: string) => `${row} · ${column}`;

async function projectFigures(
  repo: ObserverRepository,
  query: OverviewQuery,
  omitted: ReadonlySet<string>,
): Promise<ReportFigures> {
  const [report, flow, project, agents, meetings] = await Promise.all([
    repo.getReportScope(query),
    repo.getSalesFlow(query),
    repo.getProjectView(query, null),
    repo.getAgentsView(query),
    repo.getMeetings(query, { agentId: null, channel: null, outcome: null }),
  ]);
  const { language } = query;
  const words = REPORT_WORDS[language];
  const note = CSV_WORDS[language].note;
  const percent = new Intl.NumberFormat(report.context.project.locale, {
    style: "percent",
    maximumFractionDigits: 0,
  });
  const pct = (share: number) => percent.format(share);
  const { ofMeetings, ofTimed } = AGENT_REPORT_WORDS[language];
  /* An outcome's share is of the period's meetings, which the read model counts. */
  const ofPeriod = ofMeetings(flow.meetingCount);

  const bodies: Readonly<Record<string, Body>> = {
    "period-summary": (put) => [
      put(words.meetingsInPeriod, String(flow.meetingCount)),
      ...flow.periods
        .slice(0, 2)
        .filter((window) => window.inPeriod)
        .map((window) =>
          put(
            words.windowMeetings(window.label),
            joined(String(window.meetings), words.median(window.medianDurationDisplay)),
          ),
        ),
      ...findings(put, flow.findings, language),
    ],
    "presentation-coverage": (put) =>
      agents.teamSections.length === 0
        ? []
        : [
            put(
              note,
              sentence(language, REPORT_COVERAGE_CAPTION, {
                timed: String(agents.timedMeetingCount),
                total: String(agents.meetingCount),
                from: slovakZForm(agents.meetingCount),
              }),
              "",
            ),
            ...agents.teamSections.flatMap((section) => [
              /* The set the read model says a team share stands on (`AgentsView.timedMeetingCount`). */
              put(
                cell(section.label, words.coverageColumns[1]),
                pct(section.teamShare),
                ofTimed(agents.timedMeetingCount),
              ),
              put(cell(section.label, words.coverageColumns[2]), section.teamDwellDisplay),
            ]),
          ],
    /* Units and shares of stock, not meetings: no base is stated beyond the caption's. */
    "unit-demand": (put) => [
      put(note, words.unitDemandCaption, ""),
      ...project.segments.flatMap((segment) => [
        put(cell(segment.label, words.unitDemandColumns[1]), String(segment.availableUnits)),
        put(cell(segment.label, words.unitDemandColumns[2]), segment.stockShareDisplay),
        put(cell(segment.label, words.unitDemandColumns[3]), segment.attentionShareDisplay),
        put(cell(segment.label, words.unitDemandColumns[4]), pct(segment.favouriteShare)),
        put(cell(segment.label, words.unitDemandColumns[5]), pct(segment.compareShare)),
      ]),
    ],
    "sales-agents": (put) => [
      put(note, words.agentsCaption, ""),
      ...agents.agents.flatMap((agent) => [
        put(cell(agent.name, words.agentsColumns[1]), String(agent.meetings)),
        agent.belowMinimum
          ? put(
              cell(agent.name, words.agentsColumns[2]),
              sentence(language, REPORT_MEETINGS_NEEDED, {
                count: String(agent.meetings),
                minimum: String(AGENT_MIN_SAMPLE),
              }),
            )
          : put(
              cell(agent.name, words.agentsColumns[2]),
              agent.medianDurationDisplay,
              sampleOf(agent.meetings, language),
            ),
        /* The rate stands on the meetings with an outcome, not on all of theirs (`decidedMeetings`). */
        agent.belowMinimum || agent.ring.decidedMeetings === 0
          ? put(
              cell(agent.name, words.agentsColumns[3]),
              agent.belowMinimum ? (agent.suppressionNote ?? words.belowSample) : words.noOutcome,
            )
          : put(
              cell(agent.name, words.agentsColumns[3]),
              pct(agent.ring.progressedShare),
              ofMeetings(agent.ring.decidedMeetings),
            ),
      ]),
    ],
    outcomes: (put) => {
      /* The ladder the CRM stated, where one is connected; its note either way. */
      const stages = flow.ladder.source === "crm" ? flow.ladder.stages : [];
      const top = stages[0];
      return [
        put(note, words.outcomesCaption, ""),
        ...flow.outcomes.flatMap((slice) => [
          put(cell(slice.label, words.outcomesColumns[1]), String(slice.count), ofPeriod),
          put(cell(slice.label, words.outcomesColumns[2]), pct(slice.share), ofPeriod),
        ]),
        ...(top !== undefined
          ? stages.map((stage) =>
              put(
                stage.label,
                joined(
                  String(stage.count),
                  stage.rate === null ? null : LADDER_WORDS[language].alone(stage.rate),
                ),
                LADDER_WORDS[language].of(top.count, "deals"),
              ),
            )
          : []),
        put(note, flow.ladder.note, ""),
      ];
    },
    "channel-split": (put) => [
      put(
        note,
        `${words.channelSplit[0]} ${words.channelSplit[1]}${words.channelSplit[2]}${words.channelSplit[3]}${words.channelSplit[4]}`,
        "",
      ),
    ],
    "meeting-summary": (put) =>
      meetings.rows.length === 0
        ? []
        : [
            put(note, words.meetingsCaption, ""),
            ...meetings.rows
              .slice(0, 5)
              .flatMap((row) => [
                put(cell(row.label, words.meetingsColumns[1]), row.agentName, ""),
                put(cell(row.label, words.meetingsColumns[2]), row.startedDisplay, ""),
                put(cell(row.label, words.meetingsColumns[3]), row.outcomeLabel, ""),
              ]),
          ],
    "evidence-appendix": (put) => [
      put(note, words.appendixCaption, ""),
      ...appendix(put, report, omitted, language, true),
    ],
  };

  return {
    report,
    subject: "project",
    period: periodCell(report),
    rows: framed(report, omitted, language, bodies),
  };
}

async function meetingFigures(
  repo: ObserverRepository,
  query: OverviewQuery,
  meetingId: string,
  omitted: ReadonlySet<string>,
): Promise<ReportFigures> {
  const [report, replay] = await Promise.all([
    repo.getReportScope(query, { meetingId }),
    repo.getMeetingReplay({ ...query, meetingId: meetingId as MeetingId }),
  ]);
  const { language } = query;
  const words = REPORT_WORDS[language];
  const bodies: Readonly<Record<string, Body>> = {
    "meeting-summary": (put) => [
      put(words.started, replay.startedDisplay, ""),
      put(words.length, replay.durationDisplay, ""),
      put(words.presentedBy, replay.agentName, ""),
      put(words.recordedOutcome, replay.outcomeLabel, ""),
      ...replay.steps.map((step) =>
        put(
          joined(
            `${step.ordinal}. ${step.label}`,
            step.unitCode === null || step.label.includes(step.unitCode) ? null : step.unitCode,
          ),
          joined(step.dwellDisplay, step.detail),
          "",
          step.sources,
        ),
      ),
      ...(replay.gaps.length === 0
        ? []
        : [put(CSV_WORDS[language].note, replay.gaps.join(" "), "")]),
    ],
    "evidence-appendix": (put) => [
      put(CSV_WORDS[language].note, words.sessionCaption, ""),
      ...appendix(put, report, omitted, language, false),
    ],
  };
  return {
    report,
    subject: `meeting-${meetingId}`,
    period: periodCell(report),
    rows: framed(report, omitted, language, bodies),
  };
}

async function agentFigures(
  repo: ObserverRepository,
  query: OverviewQuery,
  agentId: string,
  omitted: ReadonlySet<string>,
): Promise<ReportFigures> {
  const [report, view] = await Promise.all([
    repo.getReportScope(query, { agentId }),
    repo.getAgentDetail(query, agentId),
  ]);
  const { language } = query;
  const words = AGENT_REPORT_WORDS[language];
  const note = CSV_WORDS[language].note;
  const periodLabel = view.context.period.label;
  const percent = new Intl.NumberFormat(view.context.project.locale, {
    style: "percent",
    maximumFractionDigits: 0,
  });
  const below = view.belowMinimum;
  const ofTheirs = words.ofMeetings(view.sampleSize);
  /* `ShareFigure`: the share, with its qualifier above the floor and its shortfall below it. */
  const share = (put: Put, figure: string, value: number, qualifier: string): FigureRow =>
    view.sampleSize < view.minimumSampleSize
      ? put(
          figure,
          percent.format(value),
          SHORTFALL[language](view.sampleSize, view.minimumSampleSize, "meetings"),
        )
      : put(figure, percent.format(value), qualifier);
  /* A table's caption, as the page prints it: below the floor it says once why the shares are gone. */
  const caption = (put: Put, text: string): FigureRow => put(note, text, "");

  const bodies: Readonly<Record<string, Body>> = {
    "agent-activity": (put) => [
      ...view.activity.map((value) => metric(put, value.label, value, language)),
      metric(put, view.followUp.recorded.label, view.followUp.recorded, language),
      metric(put, view.followUp.completed.label, view.followUp.completed, language),
      put(note, view.followUp.note, ""),
      ...view.recordedOutcomes.map((outcome) =>
        metric(put, outcome.label, outcome.metric, language, outcome.sources),
      ),
      put(note, words.recordedNote(view.name), ""),
    ],
    /* `StageFunnel`: "of 14" beside a stage whose figure carries no denominator of its own. */
    "agent-funnel": (put) =>
      view.funnel.map((step) => {
        const from =
          step.metric.qualifier === null && step.fromCount !== null
            ? FUNNEL_FROM[language](step.fromCount)
            : null;
        const withFrom: Put = (figure, value, denominator, sources) =>
          put(figure, value, from === null ? denominator : joined(from, denominator), sources);
        return metric(withFrom, step.label, step.metric, language);
      }),
    "agent-presentation": (put) => [
      caption(
        put,
        words.presentationCaption(view.name, below, view.sampleSize, view.minimumSampleSize),
      ),
      ...[...view.profile.sections]
        .sort((a, b) => a.order - b.order)
        .flatMap((section) => {
          const name = `${section.order}. ${section.label}`;
          return [
            put(
              cell(name, words.presentationColumns[2]),
              isDash(section.dwellDisplay) ? words.notTimed : section.dwellDisplay,
            ),
            ...(below
              ? []
              : [
                  share(
                    put,
                    cell(name, words.presentationColumns[3]),
                    section.timeShare,
                    words.ofTimed(view.profile.timedMeetings),
                  ),
                  /* The team's figure: not over this agent's sample, so it does not carry it. */
                  put(
                    cell(name, words.presentationColumns[4]),
                    isDash(section.teamDwellDisplay) ? words.notTimed : section.teamDwellDisplay,
                    "",
                  ),
                ]),
          ];
        }),
    ],
    "agent-buyers": (put) => [
      caption(put, words.buyersCaption(view.name, below, view.sampleSize, view.minimumSampleSize)),
      ...view.buyerInterest.flatMap((row) => [
        row.meetings === 0
          ? put(cell(row.label, words.buyersColumns[1]), words.noneOpened, "")
          : put(cell(row.label, words.buyersColumns[1]), String(row.meetings), ofTheirs),
        ...(below
          ? []
          : [
              share(put, cell(row.label, words.buyersColumns[2]), row.share, words.ofTheirMeetings),
              put(
                cell(row.label, words.buyersColumns[3]),
                percent.format(row.teamShare),
                words.ofEveryMeeting,
              ),
            ]),
      ]),
      caption(put, words.outcomeCaption(view.name, below, view.sampleSize, view.minimumSampleSize)),
      ...view.outcomeMix.flatMap((slice) => [
        put(cell(slice.label, words.outcomeColumns[1]), String(slice.count), ofTheirs),
        ...(below
          ? []
          : [share(put, cell(slice.label, words.outcomeColumns[2]), slice.share, ofTheirs)]),
      ]),
    ],
    "agent-units": (put) => [
      caption(put, words.unitsCaption(view.name, periodLabel)),
      ...view.commonUnits.flatMap((unit) => [
        put(cell(unit.unitCode, words.unitColumns[1]), String(unit.meetings), ofTheirs),
        ...(below
          ? []
          : [
              share(
                put,
                cell(unit.unitCode, words.unitColumns[2]),
                unit.share,
                words.ofTheirMeetings,
              ),
            ]),
        unit.favourites === 0
          ? put(cell(unit.unitCode, words.unitColumns[3]), words.neverShortlisted, "")
          : put(cell(unit.unitCode, words.unitColumns[3]), String(unit.favourites)),
      ]),
    ],
    "agent-projects": (put) => [
      ...(view.projects.length === 0
        ? [put(note, words.noOtherProject, "")]
        : view.projects.map((project) =>
            put(project.projectName, words.projectMeetings(project.meetings, periodLabel), ""),
          )),
      put(note, words.projectsNote, ""),
    ],
    "agent-meetings": (put) => {
      const register = REGISTER_WORDS[language];
      if (view.recentMeetings.length === 0) {
        return [put(note, words.registerEmpty(view.name, periodLabel), "")];
      }
      return [
        caption(put, words.registerCaption(view.name, periodLabel)),
        ...view.recentMeetings.flatMap((row) => [
          put(
            cell(row.label, register.columns[1]),
            isDash(row.durationDisplay)
              ? register.notTimed
              : `${row.durationDisplay}${row.timingAvailable ? "" : register.span}`,
            "",
          ),
          put(cell(row.label, register.columns[2]), String(row.sectionCount), ""),
          put(cell(row.label, register.columns[3]), String(row.unitCount), ""),
          put(cell(row.label, register.columns[4]), String(row.favourites), ""),
          put(cell(row.label, register.columns[5]), row.outcomeLabel, ""),
          put(cell(row.label, register.columns[6]), register.followUp[row.followUp], ""),
        ]),
      ];
    },
    "agent-findings": (put) => findings(put, view.findings, language),
    "evidence-appendix": (put) => [
      caption(put, words.appendixCaption),
      ...appendix(put, report, omitted, language, true),
    ],
  };

  return {
    report,
    subject: view.name,
    period: periodCell(report),
    rows: framed(report, omitted, language, bodies),
  };
}

/**
 * The report's figures for one scope: the project, one meeting or one agent.
 *
 * Refusals are the repository's, unchanged — `NotFoundError` for a meeting or
 * an agent this project does not have, `NotPermittedError` for a project or a
 * grant the viewer does not hold — so the caller answers them exactly as the
 * page does. Role checks (`requireSurface`) are the caller's, as on the page.
 */
export function reportFigures(
  repo: ObserverRepository,
  query: OverviewQuery,
  of: ReportScopeSelector | null,
  omitted: ReadonlySet<string>,
): Promise<ReportFigures> {
  if (of === null) return projectFigures(repo, query, omitted);
  if ("meetingId" in of) return meetingFigures(repo, query, of.meetingId, omitted);
  return agentFigures(repo, query, of.agentId, omitted);
}
