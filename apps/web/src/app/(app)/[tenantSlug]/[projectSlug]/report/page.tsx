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
} from "@observer/readmodels";
import { requireSurface } from "@/lib/authz";
import { dynamicRoute } from "@/lib/href";
import { languageFrom, writtenLanguage } from "@/lib/language";
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
import {
  REPORT_BLANK_SECTIONS,
  REPORT_COVERAGE_CAPTION,
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
 * internal sales-intelligence report, "real vector PDF". No generator writes
 * a file yet, and `ReportGeneration.state` is typed to say so. What a reader
 * can already have is the document itself, on a page: the same sections
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
  /* Only a language the scope is written in whole; see `WRITTEN_IN`. */
  const language = writtenLanguage(
    meetingId !== null ? "meeting" : agentId !== null ? "agent" : "project",
    languageFrom(search.lang),
  );
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

  const content: Readonly<Record<string, ReactNode>> = {
    "period-summary": (
      <>
        <Tally>
          <TallyItem label={words.meetingsInPeriod} value={String(flow.meetingCount)} />
          {flow.periods.slice(0, 2).map((window) => (
            <TallyItem
              key={window.id}
              label={words.windowMeetings(window.label)}
              value={String(window.meetings)}
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
          caption={sentence(language, REPORT_COVERAGE_CAPTION, {
            timed: String(agents.timedMeetingCount),
            total: String(agents.meetingCount),
            from: slovakZForm(agents.meetingCount),
          })}
          columns={[
            { key: "section", label: words.coverageColumns[0] },
            { key: "share", label: words.coverageColumns[1], numeric: true },
            { key: "dwell", label: words.coverageColumns[2], numeric: true },
          ]}
          rows={agents.teamSections.map((section) => ({
            key: section.sectionId,
            cells: {
              section: section.label,
              share: pct(section.teamShare),
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
            stock: pct(segment.stockShare),
            attention: pct(segment.attentionShare),
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
        <DataTable
          caption={words.outcomesCaption}
          columns={[
            { key: "outcome", label: words.outcomesColumns[0] },
            { key: "count", label: words.outcomesColumns[1], numeric: true },
            { key: "share", label: words.outcomesColumns[2], numeric: true },
          ]}
          rows={flow.outcomes.map((slice) => ({
            key: slice.outcome,
            cells: { outcome: slice.label, count: String(slice.count), share: pct(slice.share) },
          }))}
          period={period}
        />
        {flow.ladder.source === "crm" ? (
          <div className="ox-report-ladder">
            <p className="ox-section-note">{words.ladderIntro}</p>
            <FlowLadder stages={flow.ladder.stages} noun="deals" language={language} />
            <p className="ox-section-note">{flow.ladder.note}</p>
          </div>
        ) : (
          <p className="ox-section-note">{flow.ladder.note}</p>
        )}
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

  return (
    <div className="ox-page ox-report" lang={language}>
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

      <div className="ox-body">
        {/* --- the cover facts ------------------------------------------------ */}
        <section className="ox-plane" aria-labelledby="report-cover">
          <div className="ox-section-head">
            <h2 className="ox-section-title" id="report-cover">
              {report.scope.label}
            </h2>
            <p className="ox-section-note">
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
            </p>
          </div>
          <ol className="ox-report-contents">
            {report.sections.map((section) =>
              leftOut.includes(section) ? (
                <li key={section.id}>
                  {section.label}
                  <span className="ox-n"> · {words.leftOut}</span>
                </li>
              ) : (
                <li key={section.id}>
                  <a href={`#${section.id}`}>{section.label}</a>
                  <span className="ox-n"> · {words.availability[section.availability]}</span>
                </li>
              ),
            )}
          </ol>
        </section>

        {/* --- the sections, in the read model's order ---------------------- */}
        {printed.map((section) => (
          <ReportPlane key={section.id} section={section} period={period} language={language}>
            {section.availability === "unavailable" ? null : content[section.id]}
          </ReportPlane>
        ))}
      </div>
    </div>
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
        <ol className="ox-report-contents">
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
        {replay.gaps.length === 0 ? null : (
          <p className="ox-section-note">{replay.gaps.join(" ")}</p>
        )}
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
  return (
    <div className="ox-page ox-report" lang={query.language}>
      <PageHead
        kicker={`${report.context.project.name} · ${words.meetingSummary} · ${report.scope.label}`}
        title={words.meetingSummary}
        answer={replay.headline}
        lede={words.meetingLede}
        crumbs={[
          { label: report.context.project.name, href: `${root}/project` },
          { label: words.meetings, href: `${root}/meetings` },
          { label: replay.startedDisplay, href: `${root}/meetings/${meetingId}` },
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
      <div className="ox-body">
        {printed.map((section) => (
          <ReportPlane key={section.id} section={section} period={period} language={language}>
            {content[section.id]}
          </ReportPlane>
        ))}
      </div>
    </div>
  );
}
