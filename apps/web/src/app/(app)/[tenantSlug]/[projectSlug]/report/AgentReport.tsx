import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { NotFoundError, NotPermittedError, type OverviewQuery } from "@observer/readmodels";
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
  Unavailable,
  type DataColumn,
  type DataRow,
} from "@/components/product";
import { PrintPage } from "@/components/report";
import { AVAILABILITY_WORDS, ReportPlane } from "./ReportPlane";

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
 * series, the outcome ring as a shape, the reading guide. The audience is
 * internal, like the rest of the report; a buyer-facing document is a
 * separate contract (ADR-0018) and none of this is it.
 */
export async function AgentReport({
  query,
  agentId,
}: {
  readonly query: OverviewQuery;
  readonly agentId: string;
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

  const { viewer, tenantSlug, projectSlug, period } = query;
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
  };
  const short = `${view.minimumSampleSize - view.sampleSize} short of ${view.minimumSampleSize}`;
  const meetingsHref = `${root}/meetings?agent=${view.agentId}`;
  const partialCount = report.sections.filter((s) => s.availability === "partial").length;

  /* A count of their own meetings, with the count it is a fraction of. */
  const ofTheirs = (n: number) => (
    <span className="ox-value">
      <span className="ox-figure">{n}</span>
      <span className="ox-of">of {view.sampleSize} meetings</span>
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

  const unitColumns: readonly DataColumn[] = [
    { key: "unit", label: "Unit" },
    { key: "meetings", label: "Meetings that opened it", numeric: true },
    ...shareColumns("Share of their meetings"),
    { key: "favourites", label: "Shortlisted", numeric: true },
  ];
  const unitRows: readonly DataRow[] = view.commonUnits.map((unit) => ({
    key: unit.unitCode,
    cells: {
      unit: <Link href={link(unit.href)}>{unit.unitCode}</Link>,
      meetings: ofTheirs(unit.meetings),
      share: <ShareFigure share={unit.share} {...floor} qualifier="of their meetings" />,
      favourites:
        unit.favourites === 0 ? (
          <Missing what="Never shortlisted" />
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
              value={<Figure value={metric} />}
            />
          ))}
        </Tally>

        <p className="ox-subhead">Follow-up</p>
        <Tally>
          <TallyItem
            label={view.followUp.recorded.label}
            value={<Figure value={view.followUp.recorded} />}
          />
          <TallyItem
            label={view.followUp.completed.label}
            value={<Figure value={view.followUp.completed} />}
          />
        </Tally>
        <Unavailable
          what="Follow-ups completed"
          why={view.followUp.completed.message ?? "No source records whether a follow-up happened."}
          action={null}
          period={period}
        />
        <p className="ox-section-note">{view.followUp.note}</p>

        <p className="ox-subhead">Outcomes they recorded</p>
        <Tally>
          {view.recordedOutcomes.map((outcome) => (
            <TallyItem
              key={outcome.outcome}
              label={outcome.label}
              value={<Figure value={outcome.metric} />}
              evidence={
                <>
                  <Tier tier={outcome.tier} />
                  <Sources sources={outcome.sources} />
                </>
              }
            />
          ))}
        </Tally>
        <p className="ox-section-note">
          What {view.name} entered on the showroom&rsquo;s outcome widget as a purchase or a
          reservation. It is the agent&rsquo;s own record — not a reservation and not a sale, and no
          CRM or other system of record has confirmed it: Observer links no deal to a meeting.
        </p>
      </>
    ),

    "agent-funnel": (
      <>
        <StageFunnel
          steps={view.funnel}
          period={period}
          label={`Stages ${view.name}'s meetings reached`}
        />
      </>
    ),

    "agent-presentation": (
      <DataTable
        caption={
          view.belowMinimum
            ? `${view.name}'s running order: where each section falls on average across their meetings, not one meeting's path, with their median stay in it. Neither the share of their timed time nor the team's median is printed beside their stops: at ${view.sampleSize} meetings, ${short}, a share would be a rate read as a verdict and the comparison a judgement about how somebody works, drawn from a sample too thin to carry either.`
            : `${view.name}'s running order: where each section falls on average across their meetings, not one meeting's path, with their median stay in it, the share of their timed presentation time it takes, and the team's median beside it, since a section time on its own has no scale.`
        }
        columns={[
          { key: "order", label: "Order", numeric: true },
          { key: "section", label: "Section" },
          { key: "dwell", label: "Their median stay", numeric: true },
          ...shareColumns("Share of their timed time"),
          ...(view.belowMinimum ? [] : [{ key: "team", label: "Team median stay", numeric: true }]),
        ]}
        rows={runningOrder.map((section) => ({
          key: section.sectionId,
          cells: {
            order: String(section.order),
            section: section.label,
            dwell: isDash(section.dwellDisplay) ? (
              <Missing what="Not timed" />
            ) : (
              section.dwellDisplay
            ),
            share: (
              <ShareFigure
                share={section.timeShare}
                {...floor}
                qualifier={`of ${view.profile.timedMeetings} timed meetings`}
              />
            ),
            team: isDash(section.teamDwellDisplay) ? (
              <Missing what="Not timed" />
            ) : (
              section.teamDwellDisplay
            ),
          },
        }))}
        period={period}
      />
    ),

    "agent-buyers": (
      <>
        <DataTable
          caption={
            view.belowMinimum
              ? `Meetings of ${view.name}'s in which at least one apartment of that size was opened. A meeting that showed a one-room flat and a four-room penthouse counts in both, so these do not sum to the meeting count. The project's own rate is not set beside them: at ${view.sampleSize} meetings, ${short}, that comparison would be a judgement about how somebody works drawn from a sample too thin to carry one.`
              : `Each row is one size of apartment: the share of ${view.name}'s meetings in which at least one unit of that size was opened, and the same rate over every meeting on the project in the period. The rows do not sum to one and this is not a mix — a meeting that showed a one-room flat and a four-room penthouse counts in both.`
          }
          columns={[
            { key: "size", label: "Apartments" },
            { key: "meetings", label: "Meetings that opened one", numeric: true },
            ...shareColumns("Share of their meetings"),
            ...(view.belowMinimum ? [] : [{ key: "team", label: "Project", numeric: true }]),
          ]}
          rows={view.buyerInterest.map((row) => ({
            key: row.id,
            cells: {
              size: row.label,
              meetings:
                row.meetings === 0 ? <Missing what="None opened" /> : ofTheirs(row.meetings),
              share: <ShareFigure share={row.share} {...floor} qualifier="of their meetings" />,
              team: (
                <span className="ox-value">
                  <span className="ox-figure">{pct.format(row.teamShare)}</span>
                  <span className="ox-of">of every meeting on the project</span>
                </span>
              ),
            },
          }))}
          period={period}
        />
        <DataTable
          caption={`How ${view.name}'s meetings ended: parts of one whole, every meeting of theirs in the period, by the outcome recorded at the end of it. ${view.sampleSize} meetings is the denominator. Meetings with no outcome recorded are a row of their own rather than being folded into one that says something happened.${view.belowMinimum ? ` No share is printed beside the counts: at ${view.sampleSize} meetings, ${short}, a rate over this person's meetings is not a figure to act on, and each count already carries the denominator it is a fraction of.` : ""}`}
          columns={[
            { key: "outcome", label: "Outcome" },
            { key: "count", label: "Meetings", numeric: true },
            ...shareColumns("Share"),
          ]}
          rows={view.outcomeMix.map((slice) => ({
            key: slice.outcome,
            cells: {
              outcome: slice.label,
              count: ofTheirs(slice.count),
              share: (
                <ShareFigure
                  share={slice.share}
                  {...floor}
                  qualifier={`of ${view.sampleSize} meetings`}
                />
              ),
            },
          }))}
          period={period}
        />
      </>
    ),

    "agent-units": (
      <DataTable
        caption={`Units opened in the largest share of ${view.name}'s meetings in ${periodLabel.toLowerCase()}, at most six. An association with this presenter's habit and nothing more: a unit opened in most of somebody's meetings may be the one the buyers ask for or the one the agent reaches for.`}
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
            <span>
              No other project this account may open holds a meeting of theirs in this period.
            </span>
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
                    <span>
                      {project.meetings} meeting{project.meetings === 1 ? "" : "s"} in{" "}
                      {periodLabel.toLowerCase()}
                    </span>
                  </p>
                </div>
                <div className="ox-row-states">
                  {project.isCurrent ? (
                    <span className="ox-chip" data-tone="settled">
                      <span className="ox-chip-mark" aria-hidden="true" />
                      This project
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="ox-section-note">
          Scoped to the projects this account holds, never to the projects the agent holds. An
          agency selling for two developers is the ordinary arrangement, and a list that showed the
          rest of it would be a commercial fact about somebody else read off a staff page.
        </p>
      </>
    ),

    "agent-meetings": (
      <>
        <MeetingRegister
          rows={view.recentMeetings}
          period={period}
          canOpen={maySeeSurface(viewer.role, "[meetingId]")}
          caption={`${view.name}'s most recent meetings in ${periodLabel.toLowerCase()}, newest first, at most eight.`}
          emptyNote={`No meeting of ${view.name}'s falls inside ${periodLabel.toLowerCase()}.`}
        />
        <p className="ox-section-note">
          <Link href={link(meetingsHref)}>Every meeting of theirs in this period</Link> is the
          register these eight are taken from.
        </p>
      </>
    ),

    "agent-findings": <FindingList findings={view.findings} period={period} />,

    "evidence-appendix": (
      <DataTable
        caption="Every section of this summary with its state, its sample in its own noun, and the evidence reference it rests on."
        columns={[
          { key: "section", label: "Section" },
          { key: "state", label: "State" },
          { key: "sample", label: "Sample", numeric: true },
          { key: "evidence", label: "Evidence" },
        ]}
        rows={report.sections.map((section) => ({
          key: section.id,
          cells: {
            section: <a href={`#${section.id}`}>{section.label}</a>,
            state: AVAILABILITY_WORDS[section.availability],
            sample:
              section.sampleSize === null ? "—" : `${section.sampleSize} ${section.sampleNoun}`,
            evidence: <Evidence evidence={section.evidence} period={period} />,
          },
        }))}
        period={period}
      />
    ),
  };

  return (
    <div className="ox-page ox-report">
      <PageHead
        kicker={`${report.context.project.name} · Agent summary · ${report.scope.label}`}
        title={view.name}
        answer={agentAnswer(view)}
        lede={`Presenting for ${view.organisationName}. One agent's summary, drawn from the read model their own screen draws, with the same figures at the same sample and the same floor. The audience is internal: nothing here is a score, and a buyer-facing document is a separate contract that is not assembled here.`}
        crumbs={[
          { label: report.context.project.name, href: `${root}/project` },
          { label: "Sales Agents", href: `${root}/agents` },
          { label: view.name, href: `${root}/agents/${view.agentId}` },
          { label: "Summary" },
        ]}
        aside={
          <>
            <Synthetic />
            <Sample n={view.sampleSize} noun="meetings" />
            <PrintPage />
          </>
        }
        period={period}
      />

      <div className="ox-body">
        <section className="ox-plane" aria-labelledby="report-cover">
          <div className="ox-section-head">
            <h2 className="ox-section-title" id="report-cover">
              {report.scope.label}
            </h2>
            <p className="ox-section-note">
              Audience: internal.{" "}
              {report.unavailableCount === 0
                ? "Every section can be written from what this agent's screen has."
                : `${report.unavailableCount} of ${report.sections.length} sections would be blank, and each says why.`}
              {partialCount === 0
                ? ""
                : ` ${partialCount} of ${report.sections.length} carry a stated gap, and each says what it is.`}
            </p>
          </div>
          <ol className="ox-report-contents">
            {report.sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`}>{section.label}</a>
                <span className="ox-n"> · {AVAILABILITY_WORDS[section.availability]}</span>
              </li>
            ))}
          </ol>
        </section>

        {report.sections.map((section) => (
          <ReportPlane key={section.id} section={section} period={period}>
            {section.availability === "unavailable" ? null : content[section.id]}
          </ReportPlane>
        ))}
      </div>
    </div>
  );
}
