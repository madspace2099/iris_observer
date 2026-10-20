import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import type { MeetingId } from "@observer/contracts";
import {
  NotFoundError,
  NotPermittedError,
  sentence,
  slovakZForm,
  type OverviewQuery,
  type ReportSection,
  replayHref,
} from "@observer/readmodels";
import { requireSurface } from "@/lib/authz";
import { dynamicRoute } from "@/lib/href";
import { reportLanguage } from "@/lib/language";
import { presetFrom, withPeriod } from "@/lib/period";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import { AGENT_MIN_SAMPLE } from "@observer/metrics";
import { Missing } from "@/components/agents";
import { FlowLadder } from "@/components/flow";
import {
  DataTable,
  Evidence,
  FindingList,
  PageHead,
  Synthetic,
  Tally,
  TallyItem,
} from "@/components/product";
import { PrintPage } from "@/components/report";
import { omittedFrom, printedSections } from "@/components/report/omit";
import { CellBar, OutcomeMix, OutcomeSwatch } from "@/components/report/ReportCharts";
import {
  Count,
  ReportCover,
  ReportDocument,
  documentKind,
  type CoverFigure,
  type SectionNotes,
} from "@/components/report/ReportDocument";
import {
  AGENT_REPORT_WORDS,
  REPORT_BLANK_SECTIONS,
  REPORT_COVERAGE_CAPTION,
  REPORT_DOCUMENT_WORDS,
  REPORT_LEFT_OUT_SECTIONS,
  REPORT_MEETINGS_NEEDED,
  REPORT_WORDS,
} from "@/components/report/words";
import { AgentReport } from "./AgentReport";
import { ReportPlane } from "./ReportPlane";

export const metadata: Metadata = { title: "Report" };

/**
 * THE INTERNAL SALES-INTELLIGENCE REPORT, AS A PAGE.
 *
 * `docs/roadmap.md` M4 names two documents: the buyer meeting report and the
 * internal sales-intelligence report, "real vector PDF". No server renders a
 * file; the internal report is this page, the browser prints it to a PDF
 * (`?print=1` opens that dialog by itself, for the export dialog's "PDF
 * document"), and `report/csv` writes its figures (ADR-0045). The page is
 * the document itself: the same sections
 * `getReportScope` describes, in the same order, each one drawn from the read
 * model that owns it — the verdict and the findings from Sales Flow, the
 * segments from Project, the roster from Sales Agents, the ladder the CRM
 * stated, the evidence behind every one of them. A section the scope says
 * would be blank is printed as blank, with its reason, because a report that
 * quietly drops a section is the same lie as a zero standing in for a value
 * nobody measured.
 *
 * ## What the page does not do
 *
 * It computes nothing. Every figure is a field of one read model, printed
 * where that read model already prints it elsewhere; a percentage is
 * formatted with the project's own locale and nothing is summed, joined or
 * ranked here (ADR-0012). The browser's own print dialog makes a PDF of this
 * page — a vector one, as it happens — and the page says that this is the
 * browser's document, not a generated one. The buyer-facing report is a
 * separate, sanitised contract (ADR-0018) and nothing here is it: the route
 * is declared internal, the audience is stated on the cover, and no section
 * reaches a buyer-visible template.
 *
 * ## Why every section is anchored
 *
 * Every `ReportSection.evidence` the read model produces resolves to this
 * route. Until now that was a reference with nowhere to land; now it lands on
 * the section it describes, and the appendix lists them all.
 *
 * ## Three scopes, one page
 *
 * `?meeting=` draws one meeting's summary and `?agent=` one agent's, each
 * from the read model its own screen draws (`MeetingReport` below,
 * `AgentReport` beside this file). The sections are the scope's manifest;
 * the body of every section is the page's, drawn with the screens' own
 * components, so a rate reaches paper with the denominator and the floor it
 * has on screen.
 *
 * ## One document, three scopes (ADR-0049)
 *
 * Every scope prints the same document: a cover with the verdict and the
 * headline figures the page already reads, numbered contents, the numbered
 * sections with one line of provenance each, and "How to read this report",
 * where every explanatory paragraph that used to follow a section now stands
 * under that section's number. Each scope hands its notes over beside its
 * content, so nothing a section said is lost; it is said once, at the back.
 */

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string }>;
  searchParams: Promise<{
    period?: string;
    meeting?: string;
    agent?: string;
    lang?: string;
    omit?: string;
  }>;
}) {
  const viewer = await requireViewer();
  const { tenantSlug, projectSlug } = await params;
  // Declared in SURFACES, enforced here — a hidden link is not access control.
  requireSurface(viewer, "report", `/${tenantSlug}/${projectSlug}`);
  const search = await searchParams;

  const period = presetFrom(search.period);
  /*
   * The words' language, as the export dialog asked for it: it travels on the
   * read-model request with the period, so every sentence a read model writes
   * arrives in it. The project's locale still formats every figure and date.
   */
  const meetingId =
    typeof search.meeting === "string" && search.meeting.length > 0 ? search.meeting : null;
  const agentId = typeof search.agent === "string" && search.agent.length > 0 ? search.agent : null;
  /* Only a language the scope is written in whole; see `WRITTEN_IN`. The frame reads the same. */
  const language = reportLanguage(search);
  const omitted = omittedFrom(search.omit);
  const query = { viewer, tenantSlug, projectSlug, period, language };
  /*
   * A meeting summary is the meeting route's own material, and that route
   * excludes the developer (ADR-0018 keeps everything about one buyer on
   * agent surfaces). The same rule, enforced on the same surface list.
   */
  if (meetingId !== null) {
    requireSurface(viewer, "[meetingId]", `/${tenantSlug}/${projectSlug}`);
    return <MeetingReport query={query} meetingId={meetingId} omitted={omitted} />;
  }
  /* One agent's summary is the agent route's own material: the same roles, enforced on the same list. */
  if (agentId !== null) {
    requireSurface(viewer, "[agentId]", `/${tenantSlug}/${projectSlug}`);
    return <AgentReport query={query} agentId={agentId} omitted={omitted} />;
  }
  return <ProjectReport query={query} omitted={omitted} />;
}

/** The project's report: the sections `getReportScope` lists, each from the read model that owns it. */
async function ProjectReport({
  query,
  omitted,
}: {
  readonly query: OverviewQuery;
  readonly omitted: ReadonlySet<string>;
}) {
  const { tenantSlug, projectSlug, period, language } = query;
  const [report, flow, project, agents, meetings] = await Promise.all([
    repository.getReportScope(query),
    repository.getSalesFlow(query),
    repository.getProjectView(query, null),
    repository.getAgentsView(query),
    repository.getMeetings(query, { agentId: null, channel: null, outcome: null }),
  ]);

  const root = `/${tenantSlug}/${projectSlug}`;
  const printed = printedSections(report.sections, omitted);
  const leftOut = report.sections.filter((section) => !printed.includes(section));
  const locale = report.context.project.locale;
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
  const pct = (share: number) => percent.format(share);
  const link = (href: string) => dynamicRoute(withPeriod(href, period));
  const words = REPORT_WORDS[language];
  const coverageCaption = sentence(language, REPORT_COVERAGE_CAPTION, {
    timed: String(agents.timedMeetingCount),
    total: String(agents.meetingCount),
    from: slovakZForm(agents.meetingCount),
  });
  /* The longest share draws the full bar; the bar places a mark, the cell prints the figure. */
  const widestShare = Math.max(0, ...agents.teamSections.map((section) => section.teamShare));

  const content: Readonly<Record<string, ReactNode>> = {
    "period-summary": (
      <>
        <Tally>
          <TallyItem label={words.meetingsInPeriod} value={String(flow.meetingCount)} />
          {/* Today and yesterday, where the period holds them: outside it they have no count. */}
          {flow.periods
            .slice(0, 2)
            .filter((window) => window.inPeriod)
            .map((window) => (
              <TallyItem
                key={window.id}
                label={words.windowMeetings(window.label)}
                /* Its own box: two bare strings in the tile's flex row ran together as "2median". */
                value={<span>{window.meetings}</span>}
                delta={words.median(window.medianDurationDisplay)}
              />
            ))}
        </Tally>
        <FindingList findings={flow.findings} period={period} language={language} />
      </>
    ),
    "presentation-coverage":
      agents.teamSections.length === 0 ? null : (
        <DataTable
          caption={coverageCaption}
          columns={[
            { key: "section", label: words.coverageColumns[0] },
            { key: "share", label: words.coverageColumns[1], numeric: true },
            { key: "dwell", label: words.coverageColumns[2], numeric: true },
          ]}
          rows={agents.teamSections.map((section) => ({
            key: section.sectionId,
            cells: {
              section: section.label,
              share: (
                <span className="ox-bar-value">
                  <CellBar value={section.teamShare} max={widestShare} />
                  {pct(section.teamShare)}
                </span>
              ),
              dwell: section.teamDwellDisplay,
            },
          }))}
          period={period}
        />
      ),
    "unit-demand": (
      <DataTable
        caption={words.unitDemandCaption}
        columns={[
          { key: "segment", label: words.unitDemandColumns[0] },
          { key: "units", label: words.unitDemandColumns[1], numeric: true },
          { key: "stock", label: words.unitDemandColumns[2], numeric: true },
          { key: "attention", label: words.unitDemandColumns[3], numeric: true },
          { key: "favourites", label: words.unitDemandColumns[4], numeric: true },
          { key: "compares", label: words.unitDemandColumns[5], numeric: true },
        ]}
        rows={project.segments.map((segment) => ({
          key: segment.id,
          cells: {
            segment: segment.label,
            units: String(segment.availableUnits),
            stock: segment.stockShareDisplay,
            attention: segment.attentionShareDisplay,
            favourites: pct(segment.favouriteShare),
            compares: pct(segment.compareShare),
          },
        }))}
        period={period}
      />
    ),
    "sales-agents": (
      <DataTable
        caption={words.agentsCaption}
        columns={[
          { key: "agent", label: words.agentsColumns[0] },
          { key: "meetings", label: words.agentsColumns[1], numeric: true },
          { key: "duration", label: words.agentsColumns[2], numeric: true },
          { key: "progressed", label: words.agentsColumns[3], numeric: true },
        ]}
        rows={agents.agents.map((agent) => ({
          key: agent.agentId,
          cells: {
            agent: <Link href={link(agent.href)}>{agent.name}</Link>,
            meetings: String(agent.meetings),
            /*
             * The floor, as the roster applies it. This table printed a
             * median and a rate for every presenter whatever their sample —
             * the comparison the roster card withholds, on a second surface.
             * The words are the product's own: the shortfall `ShareFigure`
             * prints, and the read model's suppression sentence.
             */
            duration: agent.belowMinimum ? (
              <Missing
                what={sentence(language, REPORT_MEETINGS_NEEDED, {
                  count: String(agent.meetings),
                  minimum: String(AGENT_MIN_SAMPLE),
                })}
              />
            ) : (
              agent.medianDurationDisplay
            ),
            progressed: agent.belowMinimum ? (
              <Missing what={agent.suppressionNote ?? words.belowSample} />
            ) : agent.ring.decidedMeetings === 0 ? (
              <Missing what={words.noOutcome} />
            ) : (
              pct(agent.ring.progressedShare)
            ),
          },
        }))}
        period={period}
      />
    ),
    outcomes: (
      <>
        <div className="ox-report-chart">
          <OutcomeMix
            slices={flow.outcomes}
            id="project-outcomes"
            label={REPORT_DOCUMENT_WORDS[language].outcomeChart}
          />
          <DataTable
            caption={words.outcomesCaption}
            columns={[
              { key: "outcome", label: words.outcomesColumns[0] },
              { key: "count", label: words.outcomesColumns[1], numeric: true },
              { key: "share", label: words.outcomesColumns[2], numeric: true },
            ]}
            rows={flow.outcomes.map((slice) => ({
              key: slice.outcome,
              cells: {
                outcome: (
                  <span className="ox-swatched">
                    <OutcomeSwatch
                      outcome={slice.outcome}
                      id={`project-outcome-${slice.outcome}`}
                    />
                    {slice.label}
                  </span>
                ),
                count: String(slice.count),
                share: pct(slice.share),
              },
            }))}
            period={period}
          />
        </div>
        {/* The ladder's intro and its note are the section's notes, at the back. */}
        {flow.ladder.source === "crm" ? (
          <div className="ox-report-ladder">
            <FlowLadder stages={flow.ladder.stages} noun="deals" language={language} />
          </div>
        ) : null}
      </>
    ),
    "channel-split": (
      <p className="ox-section-note">
        {words.channelSplit[0]}{" "}
        <Link href={link(`${root}/meetings?channel=showroom`)}>{words.channelSplit[1]}</Link>
        {words.channelSplit[2]}
        <Link href={link(`${root}/meetings?channel=webiris`)}>{words.channelSplit[3]}</Link>
        {words.channelSplit[4]}
      </p>
    ),
    "meeting-summary":
      meetings.rows.length === 0 ? null : (
        <DataTable
          caption={words.meetingsCaption}
          columns={[
            { key: "meeting", label: words.meetingsColumns[0] },
            { key: "agent", label: words.meetingsColumns[1] },
            { key: "started", label: words.meetingsColumns[2] },
            { key: "outcome", label: words.meetingsColumns[3] },
          ]}
          rows={meetings.rows.slice(0, 5).map((row) => ({
            key: row.meetingId,
            cells: {
              meeting: <Link href={link(row.href)}>{row.label}</Link>,
              agent: row.agentName,
              started: row.startedDisplay,
              outcome: row.outcomeLabel,
            },
          }))}
          period={period}
        />
      ),
    "evidence-appendix": (
      <DataTable
        caption={words.appendixCaption}
        columns={[
          { key: "section", label: words.appendixColumns[0] },
          { key: "state", label: words.appendixColumns[1] },
          { key: "sample", label: words.appendixColumns[2], numeric: true },
          { key: "evidence", label: words.appendixColumns[3] },
        ]}
        rows={printed.map((section) => ({
          key: section.id,
          cells: {
            section: <a href={`#${section.id}`}>{section.label}</a>,
            state: words.availability[section.availability],
            sample:
              section.sampleSize === null ? "—" : `${section.sampleSize} ${section.sampleNoun}`,
            evidence: <Evidence evidence={section.evidence} period={period} language={language} />,
          },
        }))}
        period={period}
      />
    ),
  };

  /* Every sentence that qualifies a section, for "How to read this report". */
  const notes: SectionNotes = {
    "presentation-coverage": agents.teamSections.length === 0 ? [] : [coverageCaption],
    "unit-demand": [words.unitDemandCaption],
    "sales-agents": [words.agentsCaption],
    outcomes: [
      words.outcomesCaption,
      ...(flow.ladder.source === "crm" ? [words.ladderIntro] : []),
      flow.ladder.note,
    ],
    "meeting-summary": meetings.rows.length === 0 ? [] : [words.meetingsCaption],
    "evidence-appendix": [words.appendixCaption],
  };

  /*
   * The cover's figures, each a field the page already reads with the base it
   * stands on: the meetings in the period, the ones the source could time, the
   * team's progression as Sales Flow writes it, and the meetings nobody
   * recorded an outcome for.
   */
  const { ofMeetings } = AGENT_REPORT_WORDS[language];
  const unrecorded = flow.outcomes.find((slice) => slice.outcome === "skipped");
  const figures: readonly CoverFigure[] = [
    {
      key: "meetings",
      label: words.meetingsInPeriod,
      value: <Count n={flow.meetingCount} of={report.periodLabel} />,
    },
    {
      key: "timed",
      label: REPORT_DOCUMENT_WORDS[language].timedEndToEnd,
      value: <Count n={agents.timedMeetingCount} of={ofMeetings(agents.meetingCount)} />,
    },
    {
      key: "team",
      label: REPORT_DOCUMENT_WORDS[language].team,
      value: (
        <span className="ox-value">
          <span className="ox-cover-statement">{flow.team.display}</span>
        </span>
      ),
    },
    ...(unrecorded === undefined
      ? []
      : [
          {
            key: "unrecorded",
            label: unrecorded.label,
            value: <Count n={unrecorded.count} of={ofMeetings(flow.meetingCount)} />,
          },
        ]),
  ];

  return (
    <ReportDocument
      report={report}
      printed={printed}
      notes={notes}
      language={language}
      head={
        <PageHead
          kicker={`${report.context.project.name} · ${words.report} · ${report.periodLabel}`}
          title={words.title}
          answer={flow.verdict}
          lede={words.lede}
          crumbs={[
            { label: report.context.project.name, href: `${root}/project` },
            { label: words.report },
          ]}
          aside={
            <>
              <Synthetic language={language} />
              <PrintPage label={words.print} />
            </>
          }
          period={period}
          language={language}
        />
      }
      cover={
        <ReportCover
          report={report}
          subject={report.context.project.name}
          verdict={flow.verdict}
          figures={figures}
          language={language}
        />
      }
      footer={[report.context.project.name, documentKind("project", language), report.periodLabel]}
      statement={
        <>
          {words.audience}{" "}
          {words.attribution(
            report.context.attribution.version,
            report.context.attribution.effectiveFrom.slice(0, 10),
          )}{" "}
          {report.unavailableCount === 0
            ? words.everyWritable
            : sentence(language, REPORT_BLANK_SECTIONS, {
                count: String(report.unavailableCount),
                total: String(report.sections.length),
                from: slovakZForm(report.sections.length),
                n: report.unavailableCount,
              })}
          {leftOut.length === 0
            ? ""
            : ` ${sentence(language, REPORT_LEFT_OUT_SECTIONS, {
                count: String(leftOut.length),
                total: String(report.sections.length),
                from: slovakZForm(report.sections.length),
                n: leftOut.length,
              })}`}
        </>
      }
    >
      {/* --- the sections, in the read model's order ---------------------- */}
      {(number) =>
        printed.map((section) => (
          <ReportPlane
            key={section.id}
            section={section}
            number={number(section.id)}
            period={period}
            language={language}
          >
            {section.availability === "unavailable" ? null : content[section.id]}
          </ReportPlane>
        ))
      }
    </ReportDocument>
  );
}

/**
 * One meeting's summary, on the same page: the sequence the replay
 * reconstructs, printed as a list rather than a timeline so it survives
 * paper, and the evidence it rests on. Internal audience, like the rest.
 */
async function MeetingReport({
  query,
  meetingId,
  omitted,
}: {
  readonly query: OverviewQuery;
  readonly meetingId: string;
  readonly omitted: ReadonlySet<string>;
}) {
  /*
   * `?meeting=` is a URL parameter, so it is whatever the address bar says:
   * a meeting this project never held, a mistyped id, or another project's
   * meeting pasted under this one's address. The repository refuses each of
   * those with `NotFoundError` (the scope check is its own, in
   * `getReportScope`), and the honest page for a link to nothing is the
   * not-found page — not the error boundary, whose "did not arrive, try
   * again" would promise a retry can produce a meeting that does not exist.
   * A refusal of the project itself is already on screen from the layout.
   */
  let report;
  let replay;
  try {
    [report, replay] = await Promise.all([
      repository.getReportScope(query, { meetingId }),
      repository.getMeetingReplay({ ...query, meetingId: meetingId as MeetingId }),
    ]);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    if (error instanceof NotPermittedError) return null;
    throw error;
  }
  const root = `/${query.tenantSlug}/${query.projectSlug}`;
  const period = query.period;
  const printed: readonly ReportSection[] = printedSections(report.sections, omitted);
  const language = query.language;
  const words = REPORT_WORDS[language];
  const content: Readonly<Record<string, ReactNode>> = {
    "meeting-summary": (
      <>
        <Tally>
          <TallyItem label={words.started} value={replay.startedDisplay} />
          <TallyItem label={words.length} value={replay.durationDisplay} />
          <TallyItem label={words.presentedBy} value={replay.agentName} />
          <TallyItem label={words.recordedOutcome} value={replay.outcomeLabel} />
        </Tally>
        <ol className="ox-report-steps">
          {replay.steps.map((step) => (
            <li key={step.ordinal}>
              {step.label}
              {step.unitCode === null || step.label.includes(step.unitCode)
                ? ""
                : ` · ${step.unitCode}`}
              {step.dwellDisplay === null ? "" : ` · ${step.dwellDisplay}`}
              {step.detail === null ? "" : ` — ${step.detail}`}
            </li>
          ))}
        </ol>
      </>
    ),
    "evidence-appendix": (
      <DataTable
        caption={words.sessionCaption}
        columns={[
          { key: "section", label: words.appendixColumns[0] },
          { key: "state", label: words.appendixColumns[1] },
          { key: "evidence", label: words.appendixColumns[3] },
        ]}
        rows={printed.map((section) => ({
          key: section.id,
          cells: {
            section: <a href={`#${section.id}`}>{section.label}</a>,
            state: words.availability[section.availability],
            evidence: <Evidence evidence={section.evidence} period={period} language={language} />,
          },
        }))}
        period={period}
      />
    ),
  };
  /* The gaps the replay states, and the session record's caption, are notes. */
  const notes: SectionNotes = {
    "meeting-summary": replay.gaps.length === 0 ? [] : [replay.gaps.join(" ")],
    "evidence-appendix": [words.sessionCaption],
  };
  /* The cover's figures are the summary's own four facts, as the replay states them. */
  const fact = (text: string) => (
    <span className="ox-value">
      <span className="ox-cover-statement">{text}</span>
    </span>
  );
  const figures: readonly CoverFigure[] = [
    { key: "started", label: words.started, value: fact(replay.startedDisplay) },
    { key: "length", label: words.length, value: fact(replay.durationDisplay) },
    { key: "agent", label: words.presentedBy, value: fact(replay.agentName) },
    { key: "outcome", label: words.recordedOutcome, value: fact(replay.outcomeLabel) },
  ];
  return (
    <ReportDocument
      report={report}
      printed={printed}
      notes={notes}
      language={language}
      head={
        <PageHead
          kicker={`${report.context.project.name} · ${words.meetingSummary} · ${report.scope.label}`}
          title={words.meetingSummary}
          answer={replay.headline}
          lede={words.meetingLede}
          crumbs={[
            { label: report.context.project.name, href: `${root}/project` },
            { label: words.meetings, href: `${root}/meetings` },
            { label: replay.startedDisplay, href: replayHref(query, meetingId) },
            { label: words.summary },
          ]}
          aside={
            <>
              <Synthetic language={language} />
              <PrintPage label={words.print} />
            </>
          }
          period={period}
          language={language}
        />
      }
      cover={
        <ReportCover
          report={report}
          subject={report.scope.label}
          verdict={replay.headline}
          figures={figures}
          language={language}
        />
      }
      footer={[
        report.context.project.name,
        documentKind("meeting", language),
        replay.startedDisplay,
        report.periodLabel,
      ]}
      statement={words.audience}
    >
      {(number) =>
        printed.map((section) => (
          <ReportPlane
            key={section.id}
            section={section}
            number={number(section.id)}
            period={period}
            language={language}
          >
            {content[section.id]}
          </ReportPlane>
        ))
      }
    </ReportDocument>
  );
}
