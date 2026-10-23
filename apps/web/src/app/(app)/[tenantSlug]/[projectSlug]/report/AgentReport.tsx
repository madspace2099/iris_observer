import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import {
  MEETINGS,
  hungarianAdessive,
  NotFoundError,
  NotPermittedError,
  plural,
  sentence,
  slovakZForm,
  type OverviewQuery,
  agentDetailHref,
} from "@observer/readmodels";
import { dynamicRoute } from "@/lib/href";
import { withPeriod } from "@/lib/period";
import { repository } from "@/lib/repository";
import { maySeeSurface } from "@/lib/routes";
import {
  MeetingRegister,
  Missing,
  ShareFigure,
  StageFunnel,
  agentAnswer,
  isDash,
} from "@/components/agents";
import {
  DataTable,
  Evidence,
  Figure,
  FindingList,
  PageHead,
  Sample,
  Sources,
  Synthetic,
  Tally,
  TallyItem,
  Tier,
  type DataColumn,
  type DataRow,
} from "@/components/product";
import { PrintPage } from "@/components/report";
import { printedSections } from "@/components/report/omit";
import { CellBar, OutcomeMix, OutcomeSwatch } from "@/components/report/ReportCharts";
import { DrawIn } from "@/showroom/DrawIn";
import {
  ReportCover,
  ReportDocument,
  documentKind,
  type CoverFigure,
  type SectionNotes,
} from "@/components/report/ReportDocument";
import {
  AGENT_REPORT_WORDS,
  REPORT_BLANK_SECTIONS,
  REPORT_DOCUMENT_WORDS,
  REPORT_LEFT_OUT_SECTIONS,
  REPORT_PARTIAL_SECTIONS,
  REPORT_WORDS,
} from "@/components/report/words";
import { AgentName } from "@/components/agents/Portrait";
import { portraitSources } from "@/lib/portraits/server";
import { ReportPlane } from "./ReportPlane";

/**
 * ONE SALES AGENT'S SUMMARY, ON THE REPORT PAGE.
 *
 * The scope's sections are a manifest; this is the document. It is drawn
 * from `AgentDetailView` — the read model the agent's own screen draws — with
 * the same components that screen uses: `Figure` for a metric that carries
 * its own state, `ShareFigure` for a raw share guarded by the floor from the
 * registry, `StageFunnel` for the observed states, the meeting register that
 * names the buyer where the register's gate and the contact's consent allow
 * it and prints the label alone otherwise — on paper exactly as on the
 * screen, for the same three roles, and blank with its reason for anyone
 * else. So every rate reaches paper the way it reaches the
 * screen: with its denominator in words beside it, and below the floor with
 * its shortfall printed and every comparison withheld. The read model's own
 * suppression sentence leads the page, exactly as it leads the screen.
 *
 * Nothing here computes a figure (ADR-0012). A share is formatted in the
 * project's own locale where the read model hands a bare number, which is
 * the one formatting the agent surfaces have to do and `ShareFigure` states
 * why; nothing is summed, joined or ranked.
 *
 * What the screen has and this page does not is stated by the manifest, in
 * the presentation section's reason, and not silently: the week-by-week
 * series and the reading guide (the ring's slices print as one bar). The
 * audience is internal, like the rest of the report; a buyer-facing document
 * is a separate contract (ADR-0018) and none of this is it.
 *
 * The page's own words are `AGENT_REPORT_WORDS`, in the language the export
 * dialog chose; the read model writes the rest in the same language.
 */
export async function AgentReport({
  query,
  agentId,
  omitted,
}: {
  readonly query: OverviewQuery;
  readonly agentId: string;
  /** Sections the reader took out in the export dialog; a blank one is printed whatever this says. */
  readonly omitted: ReadonlySet<string>;
}) {
  /*
   * `?agent=` is whatever the address bar says. An agent who did not present
   * on this project in the period, an id that exists nowhere, and a grant the
   * viewer does not hold are one answer — not found — for the reason the
   * agent's own screen gives: the reader asked for a person who does not
   * present on this development, and the honest page says so without saying
   * whether they exist on a development the reader cannot see.
   */
  let report;
  let view;
  try {
    [report, view] = await Promise.all([
      repository.getReportScope(query, { agentId }),
      repository.getAgentDetail(query, agentId),
    ]);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof NotPermittedError) notFound();
    throw error;
  }

  const { viewer, tenantSlug, projectSlug, period, language } = query;
  /* Their face beside their name in the heading, on screen; print draws none (ADR-0054). */
  const portrait =
    (await portraitSources(view.context.tenant, projectSlug, [view.agentId]))[view.agentId] ?? null;
  const words = AGENT_REPORT_WORDS[language];
  const reportWords = REPORT_WORDS[language];
  const root = `/${tenantSlug}/${projectSlug}`;
  const locale = view.context.project.locale;
  const periodLabel = view.context.period.label;
  const link = (href: string) => dynamicRoute(withPeriod(href, period));
  const pct = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
  /* The floor, once, from the view — never a literal in this file. */
  const floor = {
    sampleSize: view.sampleSize,
    minimumSampleSize: view.minimumSampleSize,
    locale,
    language,
  };
  const meetingsHref = `${root}/meetings?agent=${view.agentId}`;
  const partialCount = report.sections.filter((s) => s.availability === "partial").length;
  const printed = printedSections(report.sections, omitted);
  const leftOut = report.sections.filter((section) => !printed.includes(section));
  const total = report.sections.length;

  /* A count of their own meetings, with the count it is a fraction of. */
  const ofTheirs = (n: number) => (
    <span className="ox-value">
      <span className="ox-figure">{n}</span>
      <span className="ox-of">{words.ofMeetings(view.sampleSize)}</span>
    </span>
  );

  /*
   * THE SHARE COLUMN EXISTS ONLY WHERE A SHARE MAY BE READ — the screen's
   * rule, applied to the same tables. Below the floor every row would carry
   * the same shortfall sentence, so the column is dropped and the caption
   * says why once; the counts stay, each with its own denominator.
   */
  const shareColumns = (label: string): readonly DataColumn[] =>
    view.belowMinimum ? [] : [{ key: "share", label, numeric: true }];

  const runningOrder = [...view.profile.sections].sort((a, b) => a.order - b.order);
  /* The longest median stay draws the full bar; the cell prints the read model's duration. */
  const longestStay = Math.max(
    0,
    ...runningOrder.map((section) => section.medianDwellSeconds ?? 0),
  );

  const unitColumns: readonly DataColumn[] = [
    { key: "unit", label: words.unitColumns[0] },
    { key: "meetings", label: words.unitColumns[1], numeric: true },
    ...shareColumns(words.unitColumns[2]),
    { key: "favourites", label: words.unitColumns[3], numeric: true },
  ];
  const unitRows: readonly DataRow[] = view.commonUnits.map((unit) => ({
    key: unit.unitCode,
    cells: {
      unit: (
        <Link prefetch={false} href={link(unit.href)}>
          {unit.unitCode}
        </Link>
      ),
      meetings: ofTheirs(unit.meetings),
      share: <ShareFigure share={unit.share} {...floor} qualifier={words.ofTheirMeetings} />,
      favourites:
        unit.favourites === 0 ? (
          <Missing what={words.neverShortlisted} />
        ) : (
          <span className="ox-value">
            <span className="ox-figure">{unit.favourites}</span>
          </span>
        ),
    },
  }));

  const content: Readonly<Record<string, ReactNode>> = {
    "agent-activity": (
      <>
        <Tally>
          {view.activity.map((metric) => (
            <TallyItem
              key={metric.metricId}
              label={metric.label}
              value={<Figure value={metric} language={language} />}
            />
          ))}
        </Tally>

        <p className="ox-subhead">{words.followUp}</p>
        <Tally>
          <TallyItem
            label={view.followUp.recorded.label}
            value={<Figure value={view.followUp.recorded} language={language} />}
          />
          <TallyItem
            label={view.followUp.completed.label}
            value={<Figure value={view.followUp.completed} language={language} />}
          />
        </Tally>

        <p className="ox-subhead">{words.outcomesTheyRecorded}</p>
        <Tally>
          {view.recordedOutcomes.map((outcome) => (
            <TallyItem
              key={outcome.outcome}
              label={outcome.label}
              value={<Figure value={outcome.metric} language={language} />}
              evidence={
                <>
                  <Tier tier={outcome.tier} language={language} />
                  <Sources sources={outcome.sources} language={language} />
                </>
              }
            />
          ))}
        </Tally>
      </>
    ),

    /* On screen the marks draw in as they arrive, as on the project's report (ADR-0062). */
    "agent-funnel": (
      <DrawIn kind="fill">
        <StageFunnel
          steps={view.funnel}
          period={period}
          label={words.funnelLabel(view.name)}
          language={language}
        />
      </DrawIn>
    ),

    "agent-presentation": (
      <DrawIn kind="fill">
        <DataTable
          captionHidden
          caption={words.presentationCaption(
            view.name,
            view.belowMinimum,
            view.sampleSize,
            view.minimumSampleSize,
          )}
          columns={[
            { key: "order", label: words.presentationColumns[0], numeric: true },
            { key: "section", label: words.presentationColumns[1] },
            { key: "dwell", label: words.presentationColumns[2], numeric: true },
            ...shareColumns(words.presentationColumns[3]),
            ...(view.belowMinimum
              ? []
              : [{ key: "team", label: words.presentationColumns[4], numeric: true }]),
          ]}
          rows={runningOrder.map((section) => ({
            key: section.sectionId,
            cells: {
              order: String(section.order),
              section: section.label,
              dwell: isDash(section.dwellDisplay) ? (
                <Missing what={words.notTimed} />
              ) : (
                <span className="ox-bar-value">
                  <CellBar value={section.medianDwellSeconds} max={longestStay} />
                  {section.dwellDisplay}
                </span>
              ),
              share: (
                <ShareFigure
                  share={section.timeShare}
                  {...floor}
                  qualifier={words.ofTimed(view.profile.timedMeetings)}
                />
              ),
              team: isDash(section.teamDwellDisplay) ? (
                <Missing what={words.notTimed} />
              ) : (
                section.teamDwellDisplay
              ),
            },
          }))}
          period={period}
        />
      </DrawIn>
    ),

    "agent-buyers": (
      <>
        <DataTable
          captionHidden
          caption={words.buyersCaption(
            view.name,
            view.belowMinimum,
            view.sampleSize,
            view.minimumSampleSize,
          )}
          columns={[
            { key: "size", label: words.buyersColumns[0] },
            { key: "meetings", label: words.buyersColumns[1], numeric: true },
            ...shareColumns(words.buyersColumns[2]),
            ...(view.belowMinimum
              ? []
              : [{ key: "team", label: words.buyersColumns[3], numeric: true }]),
          ]}
          rows={view.buyerInterest.map((row) => ({
            key: row.id,
            cells: {
              size: row.label,
              meetings:
                row.meetings === 0 ? <Missing what={words.noneOpened} /> : ofTheirs(row.meetings),
              share: <ShareFigure share={row.share} {...floor} qualifier={words.ofTheirMeetings} />,
              team: (
                <span className="ox-value">
                  <span className="ox-figure">{pct.format(row.teamShare)}</span>
                  <span className="ox-of">{words.ofEveryMeeting}</span>
                </span>
              ),
            },
          }))}
          period={period}
        />
        <div className="ox-report-chart">
          <DrawIn kind="fill">
            <OutcomeMix
              slices={view.outcomeMix}
              id="agent-outcomes"
              label={REPORT_DOCUMENT_WORDS[language].outcomeChart}
            />
          </DrawIn>
          <DataTable
            captionHidden
            caption={words.outcomeCaption(
              view.name,
              view.belowMinimum,
              view.sampleSize,
              view.minimumSampleSize,
            )}
            columns={[
              { key: "outcome", label: words.outcomeColumns[0] },
              { key: "count", label: words.outcomeColumns[1], numeric: true },
              ...shareColumns(words.outcomeColumns[2]),
            ]}
            rows={view.outcomeMix.map((slice) => ({
              key: slice.outcome,
              cells: {
                outcome: (
                  <span className="ox-swatched">
                    <OutcomeSwatch outcome={slice.outcome} id={`agent-outcome-${slice.outcome}`} />
                    {slice.label}
                  </span>
                ),
                count: ofTheirs(slice.count),
                share: (
                  <ShareFigure
                    share={slice.share}
                    {...floor}
                    qualifier={words.ofMeetings(view.sampleSize)}
                  />
                ),
              },
            }))}
            period={period}
          />
        </div>
      </>
    ),

    "agent-units": (
      <DataTable
        captionHidden
        caption={words.unitsCaption(view.name, periodLabel)}
        columns={unitColumns}
        rows={unitRows}
        codeColumn="unit"
        period={period}
      />
    ),

    "agent-projects": (
      <>
        {view.projects.length === 0 ? (
          <p className="ox-result">
            <span>{words.noOtherProject}</span>
          </p>
        ) : (
          <ul className="ox-list">
            {view.projects.map((project) => (
              <li className="ox-row" key={project.projectId}>
                <div>
                  <h3 className="ox-row-name">
                    {project.isCurrent ? (
                      project.projectName
                    ) : (
                      <Link href={link(project.href)}>{project.projectName}</Link>
                    )}
                  </h3>
                  <p className="ox-row-meta">
                    <span>{words.projectMeetings(project.meetings, periodLabel)}</span>
                  </p>
                </div>
                <div className="ox-row-states">
                  {project.isCurrent ? (
                    <span className="ox-chip" data-tone="settled">
                      <span className="ox-chip-mark" aria-hidden="true" />
                      {words.thisProject}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </>
    ),

    "agent-meetings": (
      <>
        <MeetingRegister
          captionHidden
          rows={view.recentMeetings}
          period={period}
          canOpen={maySeeSurface(viewer.role, "[meetingId]")}
          caption={words.registerCaption(view.name, periodLabel)}
          emptyNote={words.registerEmpty(view.name, periodLabel)}
          language={language}
        />
      </>
    ),

    "agent-findings": <FindingList findings={view.findings} period={period} language={language} />,

    "evidence-appendix": (
      <DataTable
        captionHidden
        caption={words.appendixCaption}
        columns={[
          { key: "section", label: reportWords.appendixColumns[0] },
          { key: "state", label: reportWords.appendixColumns[1] },
          { key: "sample", label: reportWords.appendixColumns[2], numeric: true },
          { key: "evidence", label: reportWords.appendixColumns[3] },
        ]}
        rows={printed.map((section) => ({
          key: section.id,
          cells: {
            section: <a href={`#${section.id}`}>{section.label}</a>,
            state: reportWords.availability[section.availability],
            sample:
              section.sampleSize === null ? "—" : `${section.sampleSize} ${section.sampleNoun}`,
            evidence: <Evidence evidence={section.evidence} period={period} language={language} />,
          },
        }))}
        period={period}
      />
    ),
  };

  /*
   * Every sentence that qualified a section on the page, for "How to read
   * this report", in the order the section printed them: the tables'
   * captions (still each table's accessible caption), the follow-up note and
   * why no follow-up can be counted as done (its tile says "not available";
   * the reason sat beneath it in a box of its own), the recorded-outcome note,
   * the scope of the project list, and the register's link to every meeting
   * it is taken from.
   */
  const notes: SectionNotes = {
    "agent-activity": [
      view.followUp.note,
      `${view.followUp.completed.label} — ${view.followUp.completed.message ?? words.noFollowUpSource}`,
      words.recordedNote(view.name),
    ],
    "agent-presentation": [
      words.presentationCaption(
        view.name,
        view.belowMinimum,
        view.sampleSize,
        view.minimumSampleSize,
      ),
    ],
    "agent-buyers": [
      words.buyersCaption(view.name, view.belowMinimum, view.sampleSize, view.minimumSampleSize),
      words.outcomeCaption(view.name, view.belowMinimum, view.sampleSize, view.minimumSampleSize),
    ],
    "agent-units": [words.unitsCaption(view.name, periodLabel)],
    "agent-projects": [words.projectsNote],
    "agent-meetings": [
      ...(view.recentMeetings.length === 0 ? [] : [words.registerCaption(view.name, periodLabel)]),
      <>
        <Link href={link(meetingsHref)}>{words.registerLink}</Link>
        {words.registerRest}
      </>,
    ],
    "evidence-appendix": [words.appendixCaption],
  };

  /*
   * The cover's figures are the summary's headline across its sections, each
   * with its own base: the presentations it is drawn from and how far those
   * meetings reached — an outcome recorded, and progressed of recorded. Not
   * section 01's row again, which the next page prints in full.
   */
  const reached = (id: string) => view.funnel.find((step) => step.metric.metricId === id)?.metric;
  const figures: readonly CoverFigure[] = [
    view.activity.find((metric) => metric.metricId === "agent.meetings"),
    view.activity.find((metric) => metric.metricId === "agent.units"),
    reached("agent.funnel.recorded"),
    reached("agent.funnel.progressed"),
  ]
    .filter((metric) => metric !== undefined)
    .map((metric) => ({
      key: metric.metricId,
      label: metric.label,
      value: <Figure value={metric} language={language} />,
    }));
  const answer = agentAnswer(view, language);

  return (
    <ReportDocument
      report={report}
      printed={printed}
      notes={notes}
      language={language}
      head={
        <PageHead
          kicker={`${report.context.project.name} · ${words.kicker} · ${report.scope.label}`}
          title={<AgentName name={view.name} src={portrait} size="head" />}
          answer={answer}
          lede={words.lede(view.organisationName)}
          crumbs={[
            { label: report.context.project.name, href: `${root}/project` },
            { label: words.crumbAgents, href: `${root}/agents` },
            { label: view.name, href: agentDetailHref({ tenantSlug, projectSlug }, view.agentId) },
            { label: words.crumbSummary },
          ]}
          aside={
            <>
              <Synthetic language={language} />
              <Sample
                n={view.sampleSize}
                noun={language === "en" ? "meetings" : plural(language, view.sampleSize, MEETINGS)}
              />
              <PrintPage label={reportWords.print} />
            </>
          }
          period={period}
          language={language}
        />
      }
      cover={
        <ReportCover
          report={report}
          subject={view.name}
          verdict={answer}
          figures={figures}
          language={language}
        />
      }
      footer={[
        report.context.project.name,
        documentKind("agent", language),
        view.name,
        periodLabel,
      ]}
      statement={
        <>
          {reportWords.audience}{" "}
          {report.unavailableCount === 0
            ? words.everyWritable
            : sentence(language, REPORT_BLANK_SECTIONS, {
                count: String(report.unavailableCount),
                total: String(total),
                from: slovakZForm(total),
                n: report.unavailableCount,
              })}
          {partialCount === 0
            ? ""
            : ` ${sentence(language, REPORT_PARTIAL_SECTIONS, {
                count: String(partialCount),
                countAt: hungarianAdessive(String(partialCount)),
                total: String(total),
                from: slovakZForm(total),
                n: partialCount,
              })}`}
          {leftOut.length === 0
            ? ""
            : ` ${sentence(language, REPORT_LEFT_OUT_SECTIONS, {
                count: String(leftOut.length),
                total: String(total),
                from: slovakZForm(total),
                n: leftOut.length,
              })}`}
        </>
      }
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
            {section.availability === "unavailable" ? null : content[section.id]}
          </ReportPlane>
        ))
      }
    </ReportDocument>
  );
}
