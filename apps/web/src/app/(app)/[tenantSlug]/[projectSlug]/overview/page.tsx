import type { Metadata } from "next";
import {
  ActionLink,
  AiSummary,
  AlertList,
  Badge,
  Card,
  ChangeList,
  DataHealthBar,
  EvidenceLink,
  FunnelChart,
  MetricGrid,
  SectionHead,
  StateMessage,
  VerdictStrip,
} from "@observer/ui";
import {
  NotFoundError,
  NotPermittedError,
  type AgentOverview,
  type ExecutiveOverview,
  DEFAULT_LANGUAGE,
} from "@observer/readmodels";
import { presetFrom, withPeriod, withPeriodOnLinks } from "@/lib/period";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";

export const metadata: Metadata = { title: "Overview" };

/**
 * Overview is role-aware rather than role-filtered.
 *
 * A developer and a sales agent do not want smaller and larger versions of the
 * same screen; they want different screens. Showing an agent the executive
 * view with half the cards blanked would tell them their colleagues' figures
 * exist and that they may not see them, which is worse than either.
 *
 * ## The read happens HERE, not inside the view components
 *
 * This page used to `return <AgentView query={query} />` inside a try/catch.
 * That catch never ran: returning an async component defers its rendering
 * — and its throw — to React, outside the try. So a project this overview is
 * not composed for (ISTER TOWER, the Akhilesh demo, and for a sales agent
 * anything but Northgate) fell through to `error.tsx`, which told the reader
 * the figures "did not arrive" and offered a Try again that could never help.
 * Awaiting the read here puts the refusal and the not-composed case back on
 * this page, where each can be stated as what it is.
 */
export default async function OverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const viewer = await requireViewer();
  const { tenantSlug, projectSlug } = await params;
  const { period } = await searchParams;

  const query = {
    viewer,
    tenantSlug,
    projectSlug,
    period: presetFrom(period),
    language: DEFAULT_LANGUAGE,
  };
  const root = `/${tenantSlug}/${projectSlug}`;

  let read:
    | { readonly kind: "agent"; readonly overview: AgentOverview }
    | { readonly kind: "executive"; readonly overview: ExecutiveOverview };
  try {
    read =
      viewer.role === "sales_agent"
        ? { kind: "agent", overview: await repository.getAgentOverview(query) }
        : { kind: "executive", overview: await repository.getExecutiveOverview(query) };
  } catch (error) {
    // The layout already renders the refusal for this project; the page must
    // not also throw, or an ordinary permission boundary reaches the error
    // screen and reads as a fault.
    if (error instanceof NotPermittedError) {
      return (
        <StateMessage
          title="Not available to your account"
          detail="Ask the developer who owns this project to grant access."
        />
      );
    }
    /*
     * Not composed for this project — a true sentence, not a fault. The
     * repository says so with `NotFoundError` rather than answering with
     * another project's story (its own docblock records why), and the same
     * figures live on Project, which is composed for every project.
     */
    if (error instanceof NotFoundError) {
      return (
        <StateMessage
          title="No overview is composed for this project yet"
          detail="Project carries the same figures for every project, read from the same records."
          action={
            <div className="obs-actions" style={{ marginTop: "var(--space-3)" }}>
              <ActionLink href={withPeriod(`${root}/project`, query.period)} emphasis="primary">
                Open Project
              </ActionLink>
            </div>
          }
        />
      );
    }
    throw error;
  }

  /* The UI package's components know no period; every link is finished here (P2-16). */
  return read.kind === "agent" ? (
    <AgentView overview={withPeriodOnLinks(read.overview, query.period)} />
  ) : (
    <ExecutiveView overview={withPeriodOnLinks(read.overview, query.period)} />
  );
}

/* --- the developer's overview --------------------------------------------- */

function ExecutiveView({ overview }: { readonly overview: ExecutiveOverview }) {
  const { context } = overview;
  const [headlineChange, ...remainingChanges] = overview.changes;

  return (
    <>
      {/*
        Everything down to the data-health strip is meant to fit the first
        viewport at 1080: one verdict with its rules and actions, four figures,
        one change, and how much of the picture is visible. That answers is it
        good, what moved, why it matters, and what to do next.

        The eighty-two-metric registry lives in the drill-downs. A dashboard
        that renders the registry is a registry, not a dashboard.
      */}
      <div>
        <p className="obs-kicker">
          {context.tenant.name} · {context.project.name} · {context.period.label}
        </p>
        <VerdictStrip verdict={overview.verdict} actions={overview.actions} />
      </div>

      <section aria-labelledby="headline-heading">
        <h2 className="obs-sr" id="headline-heading">
          Key figures
        </h2>
        <MetricGrid metrics={overview.headline} />
      </section>

      {headlineChange === undefined ? null : (
        <div className="obs-headline-change">
          <span
            className="obs-delta"
            data-sentiment={headlineChange.direction === headlineChange.better ? "good" : "bad"}
          >
            {headlineChange.deltaDisplay}
          </span>
          <strong>{headlineChange.label}</strong>
          <span className="obs-muted">{headlineChange.detail}</span>
          <EvidenceLink evidence={headlineChange.evidence} />
        </div>
      )}

      <DataHealthBar health={overview.dataHealth} />

      {/* ---- below the fold: the evidence behind the verdict ---- */}

      <Card as="section">
        <SectionHead title="Conversion" aside={context.period.baselineLabel} />
        <FunnelChart steps={overview.funnel} />
      </Card>

      <AiSummary briefing={overview.briefing} />

      <div
        style={{
          display: "grid",
          gap: "var(--space-5)",
          gridTemplateColumns: "repeat(auto-fit, minmax(22rem, 1fr))",
        }}
      >
        <Card as="section">
          <SectionHead title="Other changes" />
          <ChangeList changes={remainingChanges} />
        </Card>

        <Card as="section">
          <SectionHead title="Needs attention" />
          <AlertList alerts={overview.alerts} />
        </Card>
      </div>
    </>
  );
}

/* --- the agent's overview -------------------------------------------------- */

function AgentView({ overview }: { readonly overview: AgentOverview }) {
  const { context } = overview;

  return (
    <>
      <div>
        <p className="obs-kicker">{context.project.name} · your week</p>
        <VerdictStrip verdict={overview.verdict} />
      </div>

      <Card as="section">
        <SectionHead title="Upcoming meetings" aside={`${overview.upcoming.length} scheduled`} />
        {overview.upcoming.length === 0 ? (
          <StateMessage
            title="Nothing scheduled"
            detail="No showroom meeting is booked for you on this project."
          />
        ) : (
          <ul className="obs-list">
            {overview.upcoming.map((meeting) => (
              <li className="obs-alert" key={meeting.meetingId} data-severity="info">
                <span className="obs-alert-rail" aria-hidden="true" />
                <div className="obs-alert-body">
                  <div
                    style={{
                      display: "flex",
                      gap: "var(--space-2)",
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <span className="obs-alert-title">
                      {meeting.participantNames.join(" and ")}
                    </span>
                    {meeting.isReturningBuyer ? <Badge tone="accent">Returning</Badge> : null}
                    <span className="obs-baseline">{meeting.whenLabel}</span>
                  </div>
                  <p className="obs-alert-detail">{meeting.headline}</p>
                  {meeting.briefCaveat === null ? null : (
                    <p className="obs-metric-note">{meeting.briefCaveat}</p>
                  )}
                  <div className="obs-actions">
                    <ActionLink
                      href={meeting.briefHref}
                      emphasis={meeting.briefReady ? "primary" : "secondary"}
                    >
                      {meeting.briefReady ? "Open the brief" : "Open what we have"}
                    </ActionLink>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <AiSummary briefing={overview.briefing} />

      <Card as="section">
        <SectionHead
          title="No contact recorded"
          aside="Since their last meeting. Observer sees recorded contact only."
        />
        {overview.followUps.length === 0 ? (
          <StateMessage
            title="Nothing outstanding"
            detail="No meeting in this period is past the follow-up rule with nothing recorded against it."
          />
        ) : (
          <ul className="obs-list">
            {overview.followUps.map((item) => (
              <li
                className="obs-alert"
                key={item.contactId}
                data-severity={item.urgency === "overdue" ? "warning" : "info"}
              >
                <span className="obs-alert-rail" aria-hidden="true" />
                <div className="obs-alert-body">
                  <span className="obs-alert-title">{item.displayName}</span>
                  <p className="obs-alert-detail">
                    {item.reason} Last met {item.lastMeetingLabel}, {item.daysSinceMeeting} days
                    ago.
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <section aria-labelledby="personal-heading">
        <SectionHead
          title="Your quarter"
          aside="Your own figures only — never a comparison with colleagues."
        />
        <h2 className="obs-sr" id="personal-heading">
          Your quarter
        </h2>
        <MetricGrid metrics={overview.personal} />
      </section>

      <DataHealthBar health={overview.dataHealth} />
    </>
  );
}
