import { NotFoundError, NotPermittedError } from "@observer/readmodels";
import type { EvidenceRef, PreMeetingBriefView } from "@observer/readmodels";
import type { MeetingId } from "@observer/contracts";
import { ActionLink, Badge, Card, EvidenceLink, SectionHead, StateMessage } from "@observer/ui";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";

/**
 * The pre-meeting brief.
 *
 * The artefact the agent turns up for, and therefore the artefact that keeps
 * the data flowing (docs/01-foundation §1.2). Three sections, kept visually
 * apart because collapsing them is how an analytics product starts lying:
 * what is recorded, what the data supports, and what to do about it.
 *
 * **Internal surface.** Nothing here may appear on a display the buyer can see
 * (ADR-0018). The buyer-facing meeting report is a separate contract.
 */
export async function BriefView({
  tenantSlug,
  projectSlug,
  meetingId,
}: {
  tenantSlug: string;
  projectSlug: string;
  meetingId: string;
}) {
  const viewer = await requireViewer();

  let view: PreMeetingBriefView;
  try {
    view = await repository.getPreMeetingBrief({
      viewer,
      tenantSlug,
      projectSlug,
      meetingId: meetingId as MeetingId,
    });
  } catch (error) {
    if (error instanceof NotPermittedError) {
      return (
        <StateMessage
          title="Not available to your account"
          detail="Pre-meeting briefs are visible to the agent running the meeting and to their manager."
        />
      );
    }
    if (error instanceof NotFoundError) {
      return (
        <StateMessage
          title="No brief for this meeting"
          detail="Either the meeting does not exist on this project, or nothing has been recorded against it yet."
        />
      );
    }
    throw error;
  }

  const { brief, units, evidence } = view;
  const ref = (id: string): EvidenceRef | null => evidence[id] ?? null;
  const activity = brief.observed.onlineActivity;

  return (
    <>
      <div>
        <p className="obs-kicker">Pre-meeting brief · internal · {view.context.project.name}</p>
        <h1 style={{ margin: 0, fontSize: "var(--text-h5)", letterSpacing: "-0.02em" }}>
          {view.participantNames.join(" and ")}
        </h1>
        <p className="obs-muted" style={{ marginTop: "var(--space-2)" }}>
          {brief.context.scheduledFor === null
            ? "No scheduled time"
            : new Date(brief.context.scheduledFor).toLocaleString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}
          {" · "}
          {brief.context.isReturningBuyer
            ? `${brief.context.previousMeetingCount} previous meetings`
            : "First meeting"}
        </p>
      </div>

      {/* The finding that justifies the product. Put first, because an agent
          reading only one thing must read this one. */}
      {brief.recommended.changesSinceLastVisit.length === 0 ? null : (
        <ul className="obs-list">
          {brief.recommended.changesSinceLastVisit.map((statement) => (
            <li className="obs-alert" key={statement.text} data-severity="warning">
              <span className="obs-alert-rail" aria-hidden="true" />
              <div className="obs-alert-body">
                <span className="obs-alert-title">Changed since her last visit</span>
                <p className="obs-alert-detail">{statement.text}</p>
                <EvidenceLink evidence={ref(statement.evidenceId)} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="obs-brief-grid">
        <div className="obs-brief-section">
          {/* ---- section one: observed ---- */}
          <Card as="section">
            <SectionHead title="What is recorded" aside={<Badge>Observed</Badge>} />

            <dl className="obs-dl">
              <dt>Visits</dt>
              <dd>
                {activity.sessionCount} between{" "}
                {activity.firstSeenAt === null
                  ? "—"
                  : new Date(activity.firstSeenAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "long",
                    })}{" "}
                and{" "}
                {activity.lastSeenAt === null
                  ? "—"
                  : new Date(activity.lastSeenAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "long",
                    })}
              </dd>
              <dt>Last seen</dt>
              <dd>{activity.daysSinceLastVisit ?? "—"} days ago</dd>
              <dt>Price range</dt>
              <dd>
                {brief.observed.priceRange === null ? (
                  <span className="obs-dim">
                    Never stated — she set no price filter, so no range is claimed
                  </span>
                ) : (
                  `${brief.observed.priceRange.min ?? "—"} – ${brief.observed.priceRange.max ?? "—"}`
                )}
              </dd>
              <dt>Filters</dt>
              <dd>
                {brief.observed.filters
                  .map((f) => `${f.criterion} = ${f.value} (×${f.occurrences})`)
                  .join(" · ")}
              </dd>
            </dl>

            {activity.includesBackLinkedActivity ? (
              <p className="obs-metric-note" style={{ marginTop: "var(--space-3)" }}>
                Some of this history was attached after she gave her details, with her consent. She
                has not volunteered it.
              </p>
            ) : null}

            <div style={{ marginTop: "var(--space-4)" }}>
              <p className="obs-kicker">Units she opened</p>
              <ul className="obs-list">
                {brief.observed.unitInterest.map((interest) => {
                  const unit = units[interest.unitId];
                  return (
                    <li
                      className="obs-unit-row"
                      key={interest.unitId}
                      data-available={unit?.available ?? false}
                    >
                      <span className="obs-unit-code">{unit?.code ?? interest.unitId}</span>
                      <div>
                        <div className="obs-muted">{unit?.summary}</div>
                        <div className="obs-baseline">
                          {interest.uniqueViews} views ·{" "}
                          {Math.round(interest.meaningfulDwellMs / 1000)}s attention
                          {interest.materialsOpened.length > 0
                            ? ` · ${interest.materialsOpened.join(", ")}`
                            : ""}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 600 }}>{unit?.priceDisplay}</div>
                        <Badge state={unit?.available === true ? "good" : "weak"}>
                          {unit?.statusLabel}
                        </Badge>
                        {interest.favourited ? (
                          <div className="obs-baseline">Shortlisted</div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <ul className="obs-list" style={{ marginTop: "var(--space-4)" }}>
              {brief.observed.statements.map((statement) => (
                <li key={statement.text}>
                  <p style={{ margin: 0 }}>{statement.text}</p>
                  <div style={{ marginTop: "var(--space-2)" }}>
                    <EvidenceLink evidence={ref(statement.evidenceId)} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          {/* ---- section three: recommended ---- */}
          <Card as="section">
            <SectionHead title="What to do" aside={<Badge tone="accent">Recommended</Badge>} />

            <p className="obs-kicker">Have these ready</p>
            <ul className="obs-list">
              {brief.recommended.unitsToPrepare.map((item) => {
                const unit = units[item.unitId];
                return (
                  <li className="obs-unit-row" key={item.unitId} data-available={item.available}>
                    <span className="obs-unit-code">{unit?.code ?? item.unitId}</span>
                    <div>
                      <div className="obs-muted">{unit?.summary}</div>
                      <div className="obs-baseline">{item.reason.text}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 600 }}>{unit?.priceDisplay}</div>
                      <EvidenceLink evidence={ref(item.reason.evidenceId)} />
                    </div>
                  </li>
                );
              })}
            </ul>

            <div style={{ marginTop: "var(--space-5)" }}>
              <p className="obs-kicker">Worth asking</p>
              <ul className="obs-list">
                {brief.recommended.clarificationQuestions.map((question) => (
                  <li className="obs-question" key={question.question}>
                    <span className="obs-question-text">{question.question}</span>
                    <p className="obs-alert-detail" style={{ margin: 0 }}>
                      {question.rationale.text}
                    </p>
                    <EvidenceLink evidence={ref(question.rationale.evidenceId)} />
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </div>

        <div className="obs-brief-section">
          {/* ---- section two: interpretation ---- */}
          <Card as="section">
            <SectionHead title="What it suggests" aside={<Badge>Pattern</Badge>} />
            <p className="obs-metric-note" style={{ marginBottom: "var(--space-3)" }}>
              Inference, not record. Each line carries how much supports it.
            </p>
            <ul className="obs-list">
              {brief.interpretation.preferredAttributes.map((attribute) => (
                <li key={`${attribute.attribute}-${attribute.value}`}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "var(--space-2)",
                    }}
                  >
                    <strong>
                      {attribute.attribute}: {attribute.value}
                    </strong>
                    <Badge
                      state={
                        attribute.confidence.level === "high"
                          ? "good"
                          : attribute.confidence.level === "moderate"
                            ? "watch"
                            : "unknown"
                      }
                    >
                      {attribute.confidence.level}
                    </Badge>
                  </div>
                  <p className="obs-alert-detail" style={{ margin: "var(--space-1) 0 0" }}>
                    {attribute.confidence.reason}
                  </p>
                  <div className="obs-baseline">
                    {attribute.supportCount} of {attribute.totalObservations} observations
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card as="section">
            <SectionHead title="What we cannot see" />
            <p className="obs-alert-detail">
              {Math.round(brief.dataHealth.completeness * 100)}% of the expected inputs are present.
            </p>
            <ul className="obs-list" style={{ marginTop: "var(--space-3)" }}>
              {brief.dataHealth.missing.map((gap) => (
                <li key={gap.what}>
                  <strong>{gap.what}</strong>
                  <p className="obs-alert-detail" style={{ margin: 0 }}>
                    {gap.consequence}
                  </p>
                </li>
              ))}
            </ul>
            {brief.dataHealth.sourcesMissing.length === 0 ? null : (
              <div style={{ marginTop: "var(--space-3)" }}>
                <Badge state="watch">Missing: {brief.dataHealth.sourcesMissing.join(", ")}</Badge>
              </div>
            )}
          </Card>

          <Card as="section">
            <SectionHead title="Internal only" />
            <p className="obs-alert-detail">
              This brief must not be shown on the showroom display. The buyer-facing summary is a
              separate document with none of this in it.
            </p>
            <div className="obs-actions" style={{ marginTop: "var(--space-3)" }}>
              <ActionLink href={view.contactHref ?? "#"}>Open the full timeline</ActionLink>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
