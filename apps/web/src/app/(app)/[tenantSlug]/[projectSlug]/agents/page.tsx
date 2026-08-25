import type { Metadata } from "next";
import Link from "next/link";
import type { PeriodPreset } from "@observer/readmodels";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import { presetFrom } from "@/lib/period";
import { dynamicRoute } from "@/lib/href";
import { Finding, Gaps, SourceChips } from "@/showroom/parts";
import { OutcomeKey, OutcomeRing } from "@/showroom/charts";
import { Radar, RankedBars, SectionSequence } from "@/showroom/charts2";
import { Measure } from "@/showroom/Measure";

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
  searchParams: Promise<{ period?: string; agent?: string }>;
}) {
  const viewer = await requireViewer();
  const { tenantSlug, projectSlug } = await params;
  const search = await searchParams;

  const query = {
    viewer,
    tenantSlug,
    projectSlug,
    period: presetFrom(search.period) as PeriodPreset,
  };

  const [view, charts] = await Promise.all([
    repository.getAgentsView(query),
    repository.getAgentCharts(query),
  ]);

  const focused = view.agents.find((a) => a.agentId === search.agent) ?? null;
  const root = `/${tenantSlug}/${projectSlug}/agents`;
  const qs = (agent: string | null) =>
    `${root}?${new URLSearchParams({
      period: presetFrom(search.period),
      ...(agent === null ? {} : { agent }),
    }).toString()}`;

  return (
    <div className="iris-one">
      <section className="iris-plane iris-stack">
        <p className="iris-kicker">Sales agents · {view.context.period.label}</p>
        <h1 className="iris-section">{view.verdict}</h1>

        <div className="iris-rings">
          {view.agents.map((a) => (
            <article
              className="iris-ring-card"
              key={a.agentId}
              data-focused={focused?.agentId === a.agentId ? "true" : undefined}
            >
              <h3>{a.name}</h3>
              <OutcomeRing
                slices={a.ring.slices}
                total={a.meetings}
                size={126}
                label={`${a.name}: ${a.meetings} meetings`}
              />
              <p className="iris-code" style={{ margin: 0 }}>
                {Math.round(a.ring.progressedShare * 100)}% progressed · median{" "}
                {a.medianDurationDisplay}
              </p>
              <OutcomeKey slices={a.ring.slices} />
              {a.signature === null ? null : (
                <p className="iris-meta" style={{ margin: ".25rem 0 0" }}>
                  Leans on <b>{a.signature.label}</b> — {a.signature.overIndex.toFixed(1)}× the
                  team&rsquo;s share.
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
              {a.ring.flag === null ? null : (
                <p className="iris-ring-flag" data-severity={a.ring.flag.severity}>
                  {a.ring.flag.text}
                </p>
              )}
              <Link
                className="iris-action"
                href={dynamicRoute(qs(focused?.agentId === a.agentId ? null : a.agentId))}
              >
                {focused?.agentId === a.agentId ? "Close" : "Where their time goes"}
              </Link>
            </article>
          ))}
        </div>

        {focused === null ? null : (
          <>
            <hr className="iris-rule" />
            <div className="iris-band">
              <div>
                <p className="iris-kicker" style={{ marginBottom: ".875rem" }}>
                  {focused.name} — what they open, in what order, and for how long
                </p>
                <SectionSequence
                  rows={focused.sections}
                  agentLabel={focused.name.split(" ")[0] ?? "This agent"}
                />
                <p className="iris-meta" style={{ marginTop: ".75rem" }}>
                  The order is where each section falls on average across their meetings, not one
                  meeting&rsquo;s path — nobody presents the same way twice. The bar is their median
                  stay in that section, scaled against their own longest stop; the team&rsquo;s
                  median sits beneath it, because a section time on its own has no scale.
                </p>
                <Measure id="section.dwell" align="left" />
              </div>

              <div className="iris-band-side">
                <p className="iris-kicker" style={{ marginBottom: ".625rem" }}>
                  How often the same buyer came back
                </p>
                <div className="iris-bars">
                  {focused.repeats.map((r) => (
                    <div className="iris-bar" key={r.visits}>
                      <span className="iris-bar-label">{r.label}</span>
                      <span
                        className="iris-bar-track"
                        style={{ "--v": r.share.toFixed(3) } as React.CSSProperties}
                      >
                        <i />
                      </span>
                      <span className="iris-bar-value">{r.meetings}</span>
                    </div>
                  ))}
                </div>
                <p className="iris-meta" style={{ marginTop: ".625rem" }}>
                  Only a contact Observer already knows can be counted as returning; a walk-in has no
                  history to have.
                </p>
              </div>
            </div>
          </>
        )}

        <hr className="iris-rule" />

        {/* --- the same six dimensions, one shape per agent --------------- */}

        <div>
          <p className="iris-kicker" style={{ marginBottom: ".875rem" }}>
            How each agent uses the showroom
          </p>
          <div className="iris-radars">
            {charts.radar.profiles.map((profile) => (
              <div className="iris-radar-card" key={profile.id}>
                <Radar axes={charts.radar.axes} series={[profile]} size={190} />
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
              How many, and how long they typically ran. This list is ordered by workload. It is
              not ordered by outcome, and there is no list here that is.
            </p>
          </div>

          <div className="iris-band-side">
            <p className="iris-kicker" style={{ marginBottom: ".625rem" }}>
              Across every agent
            </p>
          <div className="iris-bars">
            {view.repeats.map((r) => (
              <div className="iris-bar" key={r.visits}>
                <span className="iris-bar-label">{r.label}</span>
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

        <SourceChips
          sources={["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED", "CRM_OUTCOME_CONTEXT"]}
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
