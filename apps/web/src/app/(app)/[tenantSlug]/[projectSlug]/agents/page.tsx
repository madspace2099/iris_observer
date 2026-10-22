import type { Metadata } from "next";
import Link from "next/link";
import type { AgentCharts, PeriodPreset } from "@observer/readmodels";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import { requireSurface } from "@/lib/authz";
import { maySeeSurface } from "@/lib/routes";
import { presetFrom, withPeriod } from "@/lib/period";
import { dynamicRoute } from "@/lib/href";
import { AGENT_MIN_SAMPLE } from "@observer/metrics";
import { AgentPortrait } from "@/components/agents/Portrait";
import { PresenterBars, seatTones } from "@/components/agents/PresenterBars";
import { portraitSources } from "@/lib/portraits/server";
import { Finding, Gaps, SourceChips } from "@/showroom/parts";
import { OutcomeKey, OutcomeRing } from "@/showroom/charts";
import { CoachingChart } from "@/showroom/CoachingChart";
import { AxisNotes } from "@/showroom/forms";
import { DrawIn } from "@/showroom/DrawIn";
import { SpokenVerdict } from "@/components/iris/SpokenVerdict";
import { InfoTip } from "@/components/iris/InfoTip";
import "@/components/agents/roster.css";

import { DEFAULT_LANGUAGE, agentDetailHref } from "@observer/readmodels";
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
  searchParams: Promise<{ period?: string; view?: string; lens?: string }>;
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
    language: DEFAULT_LANGUAGE,
  };

  const [view, charts] = await Promise.all([
    repository.getAgentsView(query),
    repository.getAgentCharts(query),
  ]);
  /* Each card's portrait or initials, ringed in the seat colour its charts wear (ADR-0054). */
  const portraits = await portraitSources(
    view.context.tenant,
    projectSlug,
    view.agents.map((a) => a.agentId),
  );
  const seatOrder = charts.radar.profiles.map((p) => p.id);
  const tones = seatTones(seatOrder);

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
  /*
   * COACHING, A TAB ON THIS PAGE (P2-19 K5, ZARAS1, 2026-10-02).
   *
   * The radars and their scale moved to their own view: a shape per person is
   * coaching material, and beside the rings it read as a second scorecard. A
   * tab rather than a route, so nothing new enters the navigation; the view is
   * on the address with the period, so switching keeps the reader's span and
   * a view can be linked. Nothing new stands where the radars were. "Coaching"
   * is the screen's label, English by the scope decision of 2026-10-02; the
   * first tab is the page's own name.
   */
  const coaching = search.view === "coaching";
  const viewHref = (to: "roster" | "coaching") =>
    withPeriod(
      `/${tenantSlug}/${projectSlug}/agents${to === "coaching" ? "?view=coaching" : ""}`,
      period,
    );

  const detailHref = (agentId: string) =>
    `${agentDetailHref({ tenantSlug, projectSlug }, agentId)}?${new URLSearchParams({ period }).toString()}`;
  const agentHref = (page: "meetings" | "report", agentId: string) =>
    withPeriod(
      `/${tenantSlug}/${projectSlug}/${page}?${new URLSearchParams({ agent: agentId }).toString()}`,
      period,
    );

  return (
    <div className="iris-one ag-page">
      <section className="iris-plane iris-stack">
        <p className="iris-kicker iris-kicker-measured">
          Sales agents · {view.context.period.label}
        </p>
        <SpokenVerdict
          sentence={view.verdict}
          meetings={view.meetingCount}
          locale={view.context.project.locale}
          replay={period}
        />

        <div className="iris-segmented" role="tablist" aria-label="Sales Agents">
          <Link role="tab" aria-selected={!coaching} href={dynamicRoute(viewHref("roster"))}>
            Sales Agents
          </Link>
          <Link role="tab" aria-selected={coaching} href={dynamicRoute(viewHref("coaching"))}>
            Coaching
          </Link>
        </div>

        {coaching ? null : (
          /*
           * THE ROSTER CARD, BY TYPE SIZE (the owner, 2026-10-22, ADR-0057).
           *
           * "Too much text, too small, no information hierarchy." Three levels
           * and nothing between them: the face and the name; the ring and the
           * one headline figure, the progressed rate and what it is of; then
           * the same seven outcome rows on every card, a zero printed as 0.
           * What the rate counts, the typical length and the presenter's habit
           * stand behind the `i` and on the agent's page; a flag stays in
           * sight, being something to act on.
           */
          <div className="iris-rings ag-roster">
            {view.agents.map((a, index) => {
              const about = (
                <InfoTip id={`agent-${index}`} label={`${a.name}’s figures`}>
                  <p>
                    Progressed: the meeting ended in a purchase, a reservation, interest or a
                    follow-up. The rate is of the meetings with an outcome recorded, and below{" "}
                    {AGENT_MIN_SAMPLE} recorded none is given.
                  </p>
                  <p>Typical length: {a.medianDurationDisplay} (the median).</p>
                  {/*
                   * The habit's own gate, on the set the habit stands on: "leans
                   * on" is a share of the TIMED meetings, so under the timed
                   * floor the read model's reason stands where it would. Under
                   * `belowMinimum` the floor's own sentence speaks for the card.
                   */}
                  {a.belowMinimum ? (
                    <p>{a.suppressionNote}</p>
                  ) : a.signatureNote !== null ? (
                    <p>{a.signatureNote}</p>
                  ) : a.signature === null ? null : (
                    <p>
                      Leans on <b>{a.signature.label}</b> — {a.signature.overIndex.toFixed(1)}× the
                      team&rsquo;s share of presentation time, across the {a.timedMeetings} of{" "}
                      {a.meetings} meetings the source could time end to end.
                    </p>
                  )}
                </InfoTip>
              );
              return (
                <article className="iris-ring-card d-card ag-card" key={`${a.agentId}-${period}`}>
                  <div className="ag-card-head">
                    <AgentPortrait
                      name={a.name}
                      src={portraits[a.agentId] ?? null}
                      tone={tones[a.agentId]}
                      size="card"
                      alt=""
                    />
                    <div>
                      <h3>{a.name}</h3>
                      <p className="ag-card-org">{a.organisationName}</p>
                    </div>
                  </div>
                  <div className="ag-card-ring">
                    <OutcomeRing
                      slices={a.ring.slices}
                      total={a.meetings}
                      size={176}
                      measured
                      label={`${a.name}: ${a.meetings} meetings`}
                    />
                  </div>
                  {/*
                   * A div: the `i`'s panel is a div, which a paragraph cannot hold.
                   * The `i` stands beside the figure it explains, or after the
                   * sentence that stands in for it.
                   */}
                  <div className="ag-card-headline">
                    {a.headline.figure === null ? (
                      <span className="ag-card-caption">
                        {a.headline.caption}
                        {about}
                      </span>
                    ) : (
                      <>
                        <span className="ag-card-rate">
                          <b className="ag-card-figure">{a.headline.figure}</b>
                          {about}
                        </span>
                        <span className="ag-card-caption">{a.headline.caption}</span>
                      </>
                    )}
                  </div>
                  <OutcomeKey slices={a.outcomes} />
                  {/* Always present, empty or not: each card's rows line up with its neighbours'. */}
                  <div className="ag-card-notes">
                    {a.belowMinimum || a.ring.flag === null ? null : (
                      <p className="iris-ring-flag" data-severity={a.ring.flag.severity}>
                        {a.ring.flag.text}
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
                  </div>
                  <div className="ag-card-foot">
                    <Link className="iris-action" href={dynamicRoute(detailHref(a.agentId))}>
                      {/* An agent's own page is their profile, where their portrait is changed. */}
                      {a.agentId === viewer.agentId ? "Your profile →" : "Agent detail →"}
                    </Link>
                    {/*
                     * R12-6 (Máté, 2026-10-02): the agent's meetings and report
                     * second, quieter than the one action; Report goes to the
                     * report page, never the export panel.
                     */}
                    <p className="iris-meta">
                      <Link href={dynamicRoute(agentHref("meetings", a.agentId))}>Meetings</Link>
                      {" · "}
                      <Link href={dynamicRoute(agentHref("report", a.agentId))}>Report</Link>
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* --- every agent in one chart, and what IRIS reads in it: the Coaching tab --- */}
        {coaching ? (
          <Coaching
            charts={charts}
            period={period}
            lens={search.lens === "parallel" ? "parallel" : "radar"}
            root={`/${tenantSlug}/${projectSlug}`}
            detailHref={detailHref}
            mayCompareCohorts={maySeeSurface(viewer.role, "presentation")}
          />
        ) : null}

        {coaching ? null : (
          <>
            <hr className="iris-rule" />

            <div className="iris-band" key={`ranked-${period}`}>
              <div className="d-card ag-presenters">
                <header className="iris-titled" style={{ marginBottom: ".875rem" }}>
                  <h2 className="iris-kicker iris-kicker-measured">Presentations given</h2>
                  <InfoTip id="presentations" label="presentations given">
                    <p>
                      How many, and how long they typically ran. This list is ordered by workload.
                      It is not ordered by outcome, and there is no list here that is.
                    </p>
                  </InfoTip>
                </header>
                <PresenterBars
                  rows={charts.ranked}
                  period={period}
                  tenant={view.context.tenant}
                  projectSlug={projectSlug}
                  seatOrder={seatOrder}
                  measured
                />
              </div>

              {/*
               * "Across every agent" did not say what it counted (the owner,
               * 2026-10-22, ADR-0057). A question for a title, rows in plain
               * words, and the share's base under it; why a meeting can be
               * neither a first nor a return stands behind the `i`.
               */}
              <div className="iris-band-side d-card ag-repeats">
                <header className="iris-titled">
                  <h2 className="iris-kicker iris-kicker-measured">
                    Was it the buyer&rsquo;s first meeting?
                  </h2>
                  <InfoTip id="repeats" label="first and returning meetings">
                    <p>
                      A meeting counts as a buyer&rsquo;s second, third or later when it is linked
                      to a contact who had met here before. A meeting linked to no contact has no
                      history, so it is neither a first nor a return: it is counted apart, as
                      &ldquo;Buyer not identified&rdquo;.
                    </p>
                  </InfoTip>
                </header>
                <p className="ag-repeats-of">{view.repeatsOf}</p>
                <DrawIn kind="sweep">
                  <div className="iris-bars">
                    {view.repeats.map((r) => (
                      <div className="iris-bar" key={r.visits ?? "unlinked"}>
                        <span className="iris-bar-label">{r.label}</span>
                        <span
                          className="iris-bar-track"
                          style={{ "--v": r.share.toFixed(3) } as React.CSSProperties}
                        >
                          <i />
                        </span>
                        <span className="iris-bar-value">
                          <b>{r.meetings}</b> · {r.shareDisplay}
                        </span>
                      </div>
                    ))}
                  </div>
                </DrawIn>
              </div>
            </div>

            {/*
            Named where it contributed, and the CRM contributes nothing here. The
            rings, the flags and the findings are the outcomes agents recorded in
            the room, the showroom's own record (docs/06; the sweep that took the
            same chip off the agent's page, 83d3e72). A CRM chip on a connected
            project credited it with figures it never touched.
          */}
            <SourceChips sources={["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED"]} />

            {view.findings.map((finding, index) => (
              <Finding
                key={finding.id}
                finding={finding}
                period={period}
                lead={index === 0}
                plane
                measured
              />
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
          </>
        )}
      </section>
    </div>
  );
}

/**
 * COACHING: EVERY AGENT IN ONE CHART, AND WHAT IRIS READS IN IT.
 *
 * The owner, 2026-10-20, on this tab: a row of small radars showed the reader
 * charts and taught them nothing; the system should evaluate what it sees
 * between the agents, in one large chart with every agent inside it. So:
 *
 *  - one chart region the width of the page, every agent at or above the
 *    floor drawn in it in their seat colour, through one of two lenses — how
 *    they present (the radar) or which parts of the showroom they use (the
 *    parallel plot) — chosen on the address, so a reload or a period change
 *    keeps it;
 *  - a key that lifts, hides and opens each agent (`CoachingChart`), and the
 *    agents under the floor named beside it with their counts, never drawn;
 *  - IRIS's reading beside the chart: where they differ most, each agent's
 *    most distinctive habit, and what meetings with that habit came to across
 *    the project, every figure with its denominator. It is the read model's
 *    (`CoachingReading`), composed with the chart from the same meetings; this
 *    component only places it. It ends on the comparison's own words and on
 *    the two places to act from: the cohort comparison and each agent's page.
 *
 * Nothing on this tab is ordered by workload or outcome: "presentations
 * given" stays on the roster.
 */
function Coaching({
  charts,
  period,
  lens,
  root,
  detailHref,
  mayCompareCohorts,
}: {
  readonly charts: AgentCharts;
  readonly period: PeriodPreset;
  readonly lens: "radar" | "parallel";
  readonly root: string;
  readonly detailHref: (agentId: string) => string;
  readonly mayCompareCohorts: boolean;
}) {
  const usage = charts.featureUsage;
  /* The feature-use profiles carry each person's count; the radar's are the same people, in the same seats. */
  const shapeOf = new Map(charts.radar.profiles.map((p) => [p.id, p.values]));
  const drawn = usage.profiles.filter((p) => !p.belowMinimum);
  const undrawn = usage.profiles.filter((p) => p.belowMinimum);
  const reading = lens === "parallel" ? usage.reading : charts.radar.reading;
  /* A habit that states a difference always brings its outcome line, so these two cover every one. */
  const said = reading.differences.length + reading.outcomes.length > 0;
  const counted = (n: number) => `${n} ${n === 1 ? "meeting" : "meetings"}`;
  const lensHref = (to: "radar" | "parallel") =>
    withPeriod(`${root}/agents?view=coaching${to === "parallel" ? "&lens=parallel" : ""}`, period);

  return (
    <section className="iris-coach d-card" aria-labelledby="coach-title">
      <div className="iris-coach-head">
        <h2 id="coach-title" className="iris-kicker iris-kicker-measured">
          Every agent at or above {AGENT_MIN_SAMPLE} meetings, in one chart
        </h2>
        <div className="iris-segmented" role="tablist" aria-label="What the chart shows">
          <Link
            role="tab"
            aria-selected={lens === "radar"}
            href={dynamicRoute(lensHref("radar"))}
            scroll={false}
          >
            How they present
          </Link>
          <Link
            role="tab"
            aria-selected={lens === "parallel"}
            href={dynamicRoute(lensHref("parallel"))}
            scroll={false}
          >
            Which parts of the showroom they use
          </Link>
        </div>
      </div>

      <div className="iris-coach-body">
        <div className="iris-coach-main">
          {drawn.length === 0 ? (
            <p className="iris-meta">
              No agent reached {AGENT_MIN_SAMPLE} meetings in this period, so no{" "}
              {lens === "radar" ? "shape" : "line"} is drawn.
            </p>
          ) : (
            <CoachingChart
              key={`${period}-${lens}`}
              lens={lens}
              radarAxes={charts.radar.axes}
              parallelAxes={usage.axes}
              people={drawn.map((p) => ({
                id: p.id,
                name: p.label,
                meetings: counted(p.meetings),
                tone: p.tone,
                href: detailHref(p.id),
                shape: shapeOf.get(p.id) ?? [],
                parts: p.values,
              }))}
            />
          )}
          <p className="ox-sr">{lens === "radar" ? charts.radar.summary : usage.summary}</p>

          {undrawn.length === 0 ? null : (
            <div className="iris-coach-undrawn">
              <p>Under {AGENT_MIN_SAMPLE} meetings, not drawn:</p>
              <ul>
                {undrawn.map((p) => (
                  <li key={p.id}>
                    <Link href={dynamicRoute(detailHref(p.id))}>{p.label}</Link> ·{" "}
                    {counted(p.meetings)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="iris-meta">
            {lens === "radar"
              ? "Each spoke is scaled against the strongest presenter in the period on that spoke, drawn or not, so the shapes are comparable to each other and not to an absolute. A wider shape is a different way of presenting, not a better one."
              : "The share of their meetings that used each part at least once; an axis the build cannot answer is dashed, and no line crosses it. A different way of presenting, not a better one."}
          </p>
          <AxisNotes
            items={
              lens === "radar"
                ? charts.radar.axes.map((label, i) => ({
                    label,
                    note: charts.radar.axisNotes[i] ?? "",
                    missing: null,
                  }))
                : usage.axes
            }
          />
        </div>

        <aside className="iris-coach-reading" aria-labelledby="coach-reading">
          <h2 id="coach-reading" className="iris-kicker iris-kicker-measured">
            IRIS reading
          </h2>
          {reading.note === null ? null : <p className="iris-coach-lead">{reading.note}</p>}
          {reading.differences.length === 0 ? null : (
            <>
              <h3>Where they differ most</h3>
              <ul>
                {reading.differences.map((d) => (
                  <li key={d.id}>{d.text}</li>
                ))}
              </ul>
            </>
          )}
          {reading.habits.length === 0 ? null : (
            <>
              <h3>Each agent&rsquo;s most distinctive habit</h3>
              <ul>
                {reading.habits.map((h) => (
                  <li key={h.agentId}>
                    <i style={{ background: h.tone }} aria-hidden="true" />
                    {h.text}{" "}
                    <Link href={dynamicRoute(detailHref(h.agentId))}>{h.name}&rsquo;s page</Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          {reading.outcomes.length === 0 ? null : (
            <>
              <h3>What meetings with those habits came to, across the project</h3>
              <ul>
                {reading.outcomes.map((o) => (
                  <li key={o.id}>{o.text}</li>
                ))}
              </ul>
            </>
          )}
          {/* The disclaimer and the cohorts are about stated differences: with none stated, neither stands. */}
          {said ? <p className="iris-coach-caveat">{reading.caveat}</p> : null}
          {said && mayCompareCohorts ? (
            <Link
              className="iris-action"
              href={dynamicRoute(withPeriod(`${root}/presentation?mode=cohorts`, period))}
            >
              The same meetings split by outcome, in Presentation DNA →
            </Link>
          ) : null}
        </aside>
      </div>

      <SourceChips sources={["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED"]} />
    </section>
  );
}
