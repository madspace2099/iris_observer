import type { Metadata } from "next";
import type { PeriodPreset } from "@observer/readmodels";
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
import { NotPermittedError } from "@observer/readmodels";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";

export const metadata: Metadata = { title: "Overview" };

const PRESETS: readonly PeriodPreset[] = [
  "quarter_to_date",
  "last_28_days",
  "last_quarter",
  "year_to_date",
];

function presetFrom(value: string | undefined): PeriodPreset {
  return PRESETS.includes(value as PeriodPreset) ? (value as PeriodPreset) : "quarter_to_date";
}

/**
 * Overview is role-aware rather than role-filtered.
 *
 * A developer and a sales agent do not want smaller and larger versions of the
 * same screen; they want different screens. Showing an agent the executive
 * view with half the cards blanked would tell them their colleagues' figures
 * exist and that they may not see them, which is worse than either.
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

  const query = { viewer, tenantSlug, projectSlug, period: presetFrom(period) };

  try {
    if (viewer.role === "sales_agent") {
      return <AgentView query={query} />;
    }
    return <ExecutiveView query={query} />;
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
    throw error;
  }
}

/* --- the developer's overview --------------------------------------------- */

async function ExecutiveView({
  query,
}: {
  query: Parameters<typeof repository.getExecutiveOverview>[0];
}) {
  const overview = await repository.getExecutiveOverview(query);
  const { context } = overview;

  return (
    <>
      <div>
        <p className="obs-kicker">
          {context.project.name} · {context.period.label}
        </p>
        <VerdictStrip verdict={overview.verdict} />
      </div>

      <section aria-labelledby="headline-heading">
        <SectionHead
          title="Key figures"
          aside={
            context.period.baselineClipped
              ? `Compared with ${context.period.baselineLabel}`
              : `Compared with ${context.period.baselineLabel}`
          }
        />
        <h2 className="obs-sr" id="headline-heading">
          Key figures
        </h2>
        <MetricGrid metrics={overview.headline} />
      </section>

      <Card as="section">
        <SectionHead
          title="Conversion"
          aside={<EvidenceLink evidence={overview.verdict.evidence} />}
        />
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
          <SectionHead title="Important changes" />
          <ChangeList changes={overview.changes} />
        </Card>

        <Card as="section">
          <SectionHead title="Needs attention" />
          <AlertList alerts={overview.alerts} />
        </Card>
      </div>

      {overview.actions.length === 0 ? null : (
        <section aria-label="Suggested actions" className="obs-actions">
          {overview.actions.map((action) => (
            <ActionLink key={action.id} href={action.href} emphasis={action.emphasis}>
              {action.label}
            </ActionLink>
          ))}
        </section>
      )}

      <DataHealthBar health={overview.dataHealth} />
    </>
  );
}

/* --- the agent's overview -------------------------------------------------- */

async function AgentView({ query }: { query: Parameters<typeof repository.getAgentOverview>[0] }) {
  const overview = await repository.getAgentOverview(query);
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
        <SectionHead title="Waiting on you" />
        {overview.followUps.length === 0 ? (
          <StateMessage
            title="Nobody is waiting"
            detail="Every buyer has been contacted since their meeting."
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
