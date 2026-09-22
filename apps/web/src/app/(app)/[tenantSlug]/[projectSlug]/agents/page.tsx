import type { Metadata } from "next";
import Link from "next/link";
import type { PeriodPreset } from "@observer/readmodels";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import { requireSurface } from "@/lib/authz";
import { presetFrom } from "@/lib/period";
import { dynamicRoute } from "@/lib/href";
import { AGENT_MIN_SAMPLE } from "@observer/metrics";
import { Missing, ShareFigure } from "@/components/agents";
import { Finding, Gaps, SourceChips } from "@/showroom/parts";
import { OutcomeKey, OutcomeRing } from "@/showroom/charts";
import { Radar, RankedBars } from "@/showroom/charts2";

export const metadata: Metadata = { title: "Sales Agents" };

/**
 * View three — how each person presents, and how their meetings end.
 *
 * Two things side by side for every agent, because neither means much alone.
 *
 * **The ring** is their outcome mix, drawn to the same scale of shares as
 * everyone else's, so the shapes are comparable at a glance and the count sits
 * in the middle where a share needs its denominator.
 *
 * **The paired rates** are where their presentation time goes against where the
 * team's does — the requested "which part do they lean on hardest". A single
 * agent's bar chart says nothing; the gap against the team is the finding.
 *
 * Repeat visits are here too. A first meeting and a third are different sales
 * situations, and a project whose meetings are all first meetings is filling the
 * top of a pipeline rather than working it.
 *
 * The IRIS rating an agent gives at the end of a session is **MADSPACE only**.
 * It is feedback on the software, and a developer reading it would take it as
 * feedback on their sales team.
 */
export default async function AgentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const viewer = await requireViewer();
  const { tenantSlug, projectSlug } = await params;
  // Declared in SURFACES, enforced here — a hidden link is not access control.
  requireSurface(viewer, "agents", `/${tenantSlug}/${projectSlug}`);
  const search = await searchParams;
  const period = presetFrom(search.period);

  const query = {
    viewer,
    tenantSlug,
    projectSlug,
    period: period as PeriodPreset,
  };

  const [view, charts] = await Promise.all([
    repository.getAgentsView(query),
    repository.getAgentCharts(query),
  ]);

  /*
   * ONE AGENT-DETAIL EXPERIENCE, AT THE DEDICATED ROUTE.
   *
   * This roster used to expand an agent inline, on this same page, with its
   * own smaller evidence treatment (no tier badges, no sample-size floor, no
   * "Unavailable" handling — see `agents/[agentId]/page.tsx`'s own docblock).
   * That left two "agent detail" implementations live with no link between
   * them, and the one a reader could actually reach from the roster was the
   * weaker one. There is one now: this card opens the dedicated `ox-` route,
   * which already carries everything the inline expansion showed (including
   * the same `SectionSequence` component for presentation timing) and more.
   */
  const detailHref = (agentId: string) =>
    `/${tenantSlug}/${projectSlug}/agents/${agentId}?${new URLSearchParams({ period }).toString()}`;

  return (
    <div className="iris-one">
      <section className="iris-plane iris-stack">
        <p className="iris-kicker">Sales agents · {view.context.period.label}</p>
        <h1 className="iris-section">{view.verdict}</h1>

        <div className="iris-rings">
          {view.agents.map((a) => (
            <article className="iris-ring-card" key={a.agentId}>
              <h3>{a.name}</h3>
              <p className="iris-meta" style={{ margin: "0 0 .5rem" }}>
                {a.organisationName}
              </p>
              <OutcomeRing
                slices={a.ring.slices}
                total={a.meetings}
                size={126}
                label={`${a.name}: ${a.meetings} meetings`}
              />
              {a.belowMinimum ? (
                /*
                 * BELOW AGENT_MIN_SAMPLE: no rank, no trend, no team
                 * comparison — the same floor `AgentDetailView` already
                 * states, applied here where a percentage and a flag would
                 * otherwise draw a verdict from a handful of meetings. The
                 * ring above still shows the raw outcome counts; this is the
                 * sentence that says why nothing here is compared.
                 */
                <p className="iris-meta" style={{ margin: 0 }}>
                  {a.suppressionNote}
                </p>
              ) : (
                /*
                 * THE RATE THROUGH `ShareFigure`, NOT ROUNDED HERE.
                 *
                 * This line rounded `progressedShare` and appended a percent
                 * sign — the component computing a figure that ADR-0012
                 * forbids, and the exact thing the Flow page's docblock named
                 * when it removed the same line. Worse, the only count on the
                 * card was the ring's centre, every meeting, while the rate
                 * stands on the decided ones. The denominator is the read
                 * model's, in words; the locale is the project's.
                 */
                <p className="iris-code" style={{ margin: 0 }}>
                  {a.ring.decidedMeetings === 0 ? (
                    <Missing what="No outcome recorded" />
                  ) : (
                    <ShareFigure
                      share={a.ring.progressedShare}
                      sampleSize={a.meetings}
                      minimumSampleSize={AGENT_MIN_SAMPLE}
                      locale={view.context.project.locale}
                      qualifier={`progressed, of ${a.ring.decidedMeetings} meetings with an outcome`}
                    />
                  )}{" "}
                  · median {a.medianDurationDisplay}
                </p>
              )}
              <OutcomeKey slices={a.ring.slices} />
              {/*
               * The habit's own gate, on the set the habit stands on. The
               * card's `belowMinimum` counts the meetings held; "leans on"
               * stands on the timed ones, and a card that named a set of
               * fifteen under a gate that counted twenty-five would contradict
               * itself in one breath. Under the timed floor the read model's
               * own reason stands where the habit would.
               */}
              {a.belowMinimum ? null : a.signatureNote !== null ? (
                <p className="iris-meta" style={{ margin: ".25rem 0 0" }}>
                  {a.signatureNote}
                </p>
              ) : a.signature === null ? null : (
                /* The set the two shares stand on, in the Features page's own form. */
                <p className="iris-meta" style={{ margin: ".25rem 0 0" }}>
                  Leans on <b>{a.signature.label}</b> — {a.signature.overIndex.toFixed(1)}× the
                  team&rsquo;s share of presentation time, across the {a.timedMeetings} of{" "}
                  {a.meetings} meetings the source could time end to end.
                </p>
              )}
              {a.irisRating === null ? null : (
                <p className="iris-rating">
                  Rates IRIS {a.irisRating.mean.toFixed(1)}/5
                  <span className="iris-code">
                    {" "}
                    · {a.irisRating.responses} responses · MADSPACE only
                  </span>
                </p>
              )}
              {a.belowMinimum || a.ring.flag === null ? null : (
                <p className="iris-ring-flag" data-severity={a.ring.flag.severity}>
                  {a.ring.flag.text}
                </p>
              )}
              <Link className="iris-action" href={dynamicRoute(detailHref(a.agentId))}>
                Agent detail →
              </Link>
            </article>
          ))}
        </div>

        <hr className="iris-rule" />

        {/* --- the same six dimensions, one shape per agent --------------- */}

        <div>
          <p className="iris-kicker" style={{ marginBottom: ".875rem" }}>
            How each agent uses the showroom
          </p>
          <div className="iris-radars">
            {charts.radar.profiles.map((profile) => (
              <div className="iris-radar-card" key={profile.id}>
                {/*
                 * Below the floor the card stays and the shape does not: a
                 * shape scaled against the strongest colleague on every axis
                 * is a ranking without numbers, drawn from four meetings. The
                 * note is the read model's, the same sentence the ring card
                 * above prints.
                 */}
                {profile.belowMinimum ? (
                  <p className="iris-meta" style={{ margin: 0 }}>
                    <b>{profile.label}</b> — {profile.note}
                  </p>
                ) : (
                  <Radar axes={charts.radar.axes} series={[profile]} size={190} />
                )}
              </div>
            ))}
          </div>
          <dl className="iris-axis-key">
            {charts.radar.axes.map((axis, i) => (
              <div key={axis}>
                <dt>{axis}</dt>
                <dd>{charts.radar.axisNotes[i]}</dd>
              </div>
            ))}
          </dl>
          <p className="iris-meta" style={{ marginTop: ".75rem" }}>
            Each spoke is scaled against the strongest agent on that spoke, so the shapes are
            comparable to each other and not to an absolute. A wider shape is a different way of
            presenting, not a better one.
          </p>
          <SourceChips sources={["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED"]} />
        </div>

        <hr className="iris-rule" />

        <div className="iris-band">
          <div>
            <p className="iris-kicker" style={{ marginBottom: ".625rem" }}>
              Presentations given
            </p>
            <RankedBars rows={charts.ranked} />
            <p className="iris-meta" style={{ marginTop: ".5rem" }}>
              How many, and how long they typically ran. This list is ordered by workload. It is not
              ordered by outcome, and there is no list here that is.
            </p>
          </div>

          <div className="iris-band-side">
            <p className="iris-kicker" style={{ marginBottom: ".625rem" }}>
              Across every agent
            </p>
            <div className="iris-bars">
              {view.repeats.map((r) => (
                <div className="iris-bar" key={r.visits}>
                  <span className="iris-bar-label" title={r.label}>
                    {r.label}
                  </span>
                  <span
                    className="iris-bar-track"
                    style={{ "--v": r.share.toFixed(3) } as React.CSSProperties}
                  >
                    <i />
                  </span>
                  <span className="iris-bar-value">
                    {r.meetings} · {Math.round(r.share * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/*
            Named where it contributed. A project with no CRM connected has no
            CRM outcome under these figures, and a chip saying otherwise is the
            same lie in miniature as a zero standing in for something unmeasured.
          */}
        <SourceChips
          sources={
            view.context.project.connectedSources.includes("crm")
              ? ["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED", "CRM_OUTCOME_CONTEXT"]
              : ["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED"]
          }
        />

        {view.findings.map((finding, index) => (
          <Finding key={finding.id} finding={finding} lead={index === 0} />
        ))}

        <Gaps
          gaps={[
            "These are differences in how people present, at the stated sample sizes. They are not a ranking.",
            ...(view.showRatings
              ? [
                  "The IRIS rating is the agent's own score for the software at the end of a session. It is visible to MADSPACE only.",
                ]
              : []),
          ]}
          title="How to read this"
        />
      </section>
    </div>
  );
}
