import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import type { MeetingId } from "@observer/contracts";
import {
  NotFoundError,
  NotPermittedError,
  type PeriodPreset,
  type ReportSection,
  type ReportSectionAvailability,
  type Viewer,
} from "@observer/readmodels";
import { requireSurface } from "@/lib/authz";
import { dynamicRoute } from "@/lib/href";
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
  Sample,
  Sources,
  Synthetic,
  Tally,
  TallyItem,
} from "@/components/product";
import { PrintPage } from "@/components/report";

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
 */

const AVAILABILITY_WORDS: Readonly<Record<ReportSectionAvailability, string>> = {
  ready: "Ready",
  partial: "Partial",
  unavailable: "Blank",
};

const AVAILABILITY_TONES: Readonly<Record<ReportSectionAvailability, string>> = {
  ready: "good",
  partial: "watch",
  unavailable: "none",
};

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string }>;
  searchParams: Promise<{ period?: string; meeting?: string }>;
}) {
  const viewer = await requireViewer();
  const { tenantSlug, projectSlug } = await params;
  // Declared in SURFACES, enforced here — a hidden link is not access control.
  requireSurface(viewer, "report", `/${tenantSlug}/${projectSlug}`);
  const search = await searchParams;

  const period = presetFrom(search.period);
  const query = { viewer, tenantSlug, projectSlug, period };
  const meetingId =
    typeof search.meeting === "string" && search.meeting.length > 0 ? search.meeting : null;
  /*
   * A meeting summary is the meeting route's own material, and that route
   * excludes the developer (ADR-0018 keeps everything about one buyer on
   * agent surfaces). The same rule, enforced on the same surface list.
   */
  if (meetingId !== null) {
    requireSurface(viewer, "[meetingId]", `/${tenantSlug}/${projectSlug}`);
    return <MeetingReport query={query} meetingId={meetingId} />;
  }

  const [report, flow, project, agents, meetings] = await Promise.all([
    repository.getReportScope(query),
    repository.getSalesFlow(query),
    repository.getProjectView(query, null),
    repository.getAgentsView(query),
    repository.getMeetings(query, { agentId: null, channel: null, outcome: null }),
  ]);

  const root = `/${tenantSlug}/${projectSlug}`;
  const locale = report.context.project.locale;
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
  const pct = (share: number) => percent.format(share);
  const link = (href: string) => dynamicRoute(withPeriod(href, period));

  /*
   * The team's own figures per section, which every agent's row carries
   * verbatim from the read model. The first agent's copy is the team's copy;
   * nothing is averaged here.
   */
  const teamSections = agents.agents[0]?.sections ?? [];

  const content: Readonly<Record<string, ReactNode>> = {
    "period-summary": (
      <>
        <Tally>
          <TallyItem label="Meetings in the period" value={String(flow.meetingCount)} />
          {flow.periods.slice(0, 2).map((window) => (
            <TallyItem
              key={window.id}
              label={`${window.label} · meetings`}
              value={String(window.meetings)}
              delta={`median ${window.medianDurationDisplay}`}
            />
          ))}
        </Tally>
        <FindingList findings={flow.findings} period={period} />
      </>
    ),
    "presentation-coverage":
      teamSections.length === 0 ? null : (
        <DataTable
          caption={`Where the team's presentation time goes, section by section, with the team's median dwell. Shares are of the time the source could time: ${agents.timedMeetingCount} of ${agents.meetingCount} meetings, every step timed.`}
          columns={[
            { key: "section", label: "Section" },
            { key: "share", label: "Share of time", numeric: true },
            { key: "dwell", label: "Median dwell", numeric: true },
          ]}
          rows={teamSections.map((section) => ({
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
        caption="Each room-count segment against its share of the stock: attention, favourites and comparisons."
        columns={[
          { key: "segment", label: "Segment" },
          { key: "units", label: "Available units", numeric: true },
          { key: "stock", label: "Share of stock", numeric: true },
          { key: "attention", label: "Share of attention", numeric: true },
          { key: "favourites", label: "Share of favourites", numeric: true },
          { key: "compares", label: "Share of comparisons", numeric: true },
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
        caption="Every presenter on the project in the period, in roster order. A roster, never a ranking."
        columns={[
          { key: "agent", label: "Agent" },
          { key: "meetings", label: "Meetings", numeric: true },
          { key: "duration", label: "Median duration", numeric: true },
          { key: "progressed", label: "Progressed", numeric: true },
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
              <Missing what={`${agent.meetings} of ${AGENT_MIN_SAMPLE} meetings needed`} />
            ) : (
              agent.medianDurationDisplay
            ),
            progressed: agent.belowMinimum ? (
              <Missing what={agent.suppressionNote ?? "Below the reporting sample"} />
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
          caption="How the period's meetings ended, as the agents recorded them."
          columns={[
            { key: "outcome", label: "Outcome" },
            { key: "count", label: "Meetings", numeric: true },
            { key: "share", label: "Share", numeric: true },
          ]}
          rows={flow.outcomes.map((slice) => ({
            key: slice.outcome,
            cells: { outcome: slice.label, count: String(slice.count), share: pct(slice.share) },
          }))}
          period={period}
        />
        {flow.ladder.source === "crm" ? (
          <div className="ox-report-ladder">
            <p className="ox-section-note">The deal ladder, as the CRM states it.</p>
            <FlowLadder stages={flow.ladder.stages} noun="deals" />
            <p className="ox-section-note">{flow.ladder.note}</p>
          </div>
        ) : (
          <p className="ox-section-note">{flow.ladder.note}</p>
        )}
      </>
    ),
    "channel-split": (
      <p className="ox-section-note">
        The register carries the split:{" "}
        <Link href={link(`${root}/meetings?channel=showroom`)}>showroom meetings</Link> and{" "}
        <Link href={link(`${root}/meetings?channel=webiris`)}>WEB IRIS meetings</Link>, each with
        its own total.
      </p>
    ),
    "meeting-summary":
      meetings.rows.length === 0 ? null : (
        <DataTable
          caption="The most recent meetings in the period. Each opens as a replay, or as a brief if it has not run."
          columns={[
            { key: "meeting", label: "Meeting" },
            { key: "agent", label: "Agent" },
            { key: "started", label: "Started" },
            { key: "outcome", label: "Outcome" },
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
        caption="Every section of this report with the evidence reference it rests on."
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
            sample: section.sampleSize === null ? "—" : String(section.sampleSize),
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
        kicker={`${report.context.project.name} · Report · ${report.periodLabel}`}
        title="Internal sales-intelligence report"
        answer={flow.verdict}
        lede="The internal report, drawn on a page: every section the export dialog describes, from the same read models the screens use, in the same order. Print it through the browser; no generator writes a file yet. The audience is internal, and a buyer-facing document is a separate contract that is not assembled here."
        crumbs={[
          { label: report.context.project.name, href: `${root}/project` },
          { label: "Report" },
        ]}
        aside={
          <>
            <Synthetic />
            <PrintPage />
          </>
        }
        period={period}
      />

      <div className="ox-body">
        {/* --- the cover facts ------------------------------------------------ */}
        <section className="ox-plane" aria-labelledby="report-cover">
          <div className="ox-section-head">
            <h2 className="ox-section-title" id="report-cover">
              {report.scope.label}
            </h2>
            <p className="ox-section-note">
              Audience: internal. Attribution policy {report.context.attribution.version}, effective{" "}
              {report.context.attribution.effectiveFrom.slice(0, 10)}.{" "}
              {report.unavailableCount === 0
                ? "Every section can be written from what this project has."
                : `${report.unavailableCount} of ${report.sections.length} sections would be blank, and each says why.`}
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

        {/* --- the sections, in the read model's order ---------------------- */}
        {report.sections.map((section) => (
          <ReportPlane key={section.id} section={section} period={period}>
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
}: {
  readonly query: { viewer: Viewer; tenantSlug: string; projectSlug: string; period: PeriodPreset };
  readonly meetingId: string;
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
      repository.getReportScope(query, meetingId),
      repository.getMeetingReplay({ ...query, meetingId: meetingId as MeetingId }),
    ]);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    if (error instanceof NotPermittedError) return null;
    throw error;
  }
  const root = `/${query.tenantSlug}/${query.projectSlug}`;
  const period = query.period;
  const content: Readonly<Record<string, ReactNode>> = {
    "meeting-summary": (
      <>
        <Tally>
          <TallyItem label="Started" value={replay.startedDisplay} />
          <TallyItem label="Length" value={replay.durationDisplay} />
          <TallyItem label="Presented by" value={replay.agentName} />
          <TallyItem label="Recorded outcome" value={replay.outcomeLabel} />
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
        caption="The session record behind this summary."
        columns={[
          { key: "section", label: "Section" },
          { key: "state", label: "State" },
          { key: "evidence", label: "Evidence" },
        ]}
        rows={report.sections.map((section) => ({
          key: section.id,
          cells: {
            section: <a href={`#${section.id}`}>{section.label}</a>,
            state: AVAILABILITY_WORDS[section.availability],
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
        kicker={`${report.context.project.name} · Meeting summary · ${report.scope.label}`}
        title="Meeting summary"
        answer={replay.headline}
        lede="One presentation, reconstructed from the session record and printed as a sequence. The audience is internal: the buyer-facing meeting report is a separate, sanitised contract and is not assembled here."
        crumbs={[
          { label: report.context.project.name, href: `${root}/project` },
          { label: "Meetings", href: `${root}/meetings` },
          { label: replay.startedDisplay, href: `${root}/meetings/${meetingId}` },
          { label: "Summary" },
        ]}
        aside={
          <>
            <Synthetic />
            <PrintPage />
          </>
        }
        period={period}
      />
      <div className="ox-body">
        {report.sections.map((section) => (
          <ReportPlane key={section.id} section={section} period={period}>
            {content[section.id]}
          </ReportPlane>
        ))}
      </div>
    </div>
  );
}

function ReportPlane({
  section,
  period,
  children,
}: {
  readonly section: ReportSection;
  readonly period: ReturnType<typeof presetFrom>;
  readonly children: ReactNode;
}) {
  const headingId = `${section.id}-heading`;
  return (
    <section className="ox-plane" id={section.id} aria-labelledby={headingId}>
      <div className="ox-section-head">
        <h2 className="ox-section-title" id={headingId}>
          {section.label}
        </h2>
        <span className="ox-chip" data-tone={AVAILABILITY_TONES[section.availability]}>
          <span className="ox-chip-mark" aria-hidden="true" />
          {AVAILABILITY_WORDS[section.availability]}
        </span>
      </div>
      <p className="ox-section-note">{section.summary}</p>
      {section.reason === null ? null : <p className="ox-section-note">{section.reason}</p>}
      {children}
      <div className="ox-alert-foot">
        <Sources sources={section.sources} />
        {section.sampleSize === null ? null : <Sample n={section.sampleSize} noun="meetings" />}
        <Evidence evidence={section.evidence} period={period} />
      </div>
    </section>
  );
}
