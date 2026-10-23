import type { Metadata } from "next";
import Link from "next/link";
import type { AgentCharts, PeriodPreset } from "@observer/readmodels";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import { requireSurface } from "@/lib/authz";
import { presetFrom, withPeriod } from "@/lib/period";
import { dynamicRoute } from "@/lib/href";
import { AGENT_MIN_SAMPLE } from "@observer/metrics";
import { AgentPortrait } from "@/components/agents/Portrait";
import { PresenterBars, seatTones } from "@/components/agents/PresenterBars";
import { portraitSources } from "@/lib/portraits/server";
import { Finding, Gaps, SourceChips } from "@/showroom/parts";
import { OutcomeKey, OutcomeRing } from "@/showroom/charts";
import { CoachingChart } from "@/showroom/CoachingChart";
import { DrawIn } from "@/showroom/DrawIn";
import { SpokenVerdict } from "@/components/iris/SpokenVerdict";
import { InfoTip } from "@/components/iris/InfoTip";
import { ScreenRail, type Screen } from "@/components/screens/ScreenRail";
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
  searchParams: Promise<{ period?: string; view?: string }>;
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

  /*
   * ONE SCREEN AT A TIME (the owner, 2026-10-23, ADR-0061): Sales Flow's
   * screens (ADR-0059) on this page too. The verdict and the tabs; the
   * presenters' cards; presentations given beside the first meetings; the
   * findings. Coaching is the verdict and its one question. Without a finding
   * the reading note closes the workload screen rather than standing alone.
   */
  const findingsScreen = view.findings.length > 0;
  const screens: readonly Screen[] = coaching
    ? [
        { id: "agents-verdict", label: "The verdict" },
        { id: "agents-coaching", label: "How do the presenters differ?" },
      ]
    : [
        { id: "agents-verdict", label: "The verdict" },
        { id: "agents-cards", label: "The presenters" },
        { id: "agents-workload", label: "Presentations given" },
        ...(findingsScreen ? [{ id: "agents-findings", label: "Findings" }] : []),
      ];

  const reading = (
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
  );

  return (
    <div className="iris-one ag-page iris-screens">
      <section className="iris-plane iris-stack">
        {/* The verdict is the first screen, with the page's two tabs under it. */}
        <div className="screen ag-verdict" id="agents-verdict">
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
          <div className="screen ag-cards" id="agents-cards">
            <div className="iris-rings ag-roster">
              {view.agents.map((a, index) => {
                const about = (
                  <InfoTip id={`agent-${index}`} label={`${a.name}’s figures`}>
                    <p>
                      Progressed: the meeting ended in a purchase, a reservation, interest or a
                      follow-up. The rate is of the meetings with an outcome recorded, and below{" "}
                      {AGENT_MIN_SAMPLE} recorded none is given.
                    </p>
                    {/* Under the floor the workload list beside it withholds the median too. */}
                    {a.belowMinimum ? null : (
                      <p>Typical length: {a.medianDurationDisplay} (the median).</p>
                    )}
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
                        Leans on <b>{a.signature.label}</b> — {a.signature.overIndex.toFixed(1)}×
                        the team&rsquo;s share of presentation time, across the {a.timedMeetings} of{" "}
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
                      {/*
                       * No viewport prefetch on a card's links (ADR-0061): five
                       * cards are fifteen pages, each rendered in full on the
                       * server the moment the cards scroll into view. A click
                       * still goes straight there.
                       */}
                      <Link
                        prefetch={false}
                        className="iris-action"
                        href={dynamicRoute(detailHref(a.agentId))}
                      >
                        {/* An agent's own page is their profile, where their portrait is changed. */}
                        {a.agentId === viewer.agentId ? "Your profile →" : "Agent detail →"}
                      </Link>
                      {/*
                       * R12-6 (Máté, 2026-10-02): the agent's meetings and report
                       * second, quieter than the one action; Report goes to the
                       * report page, never the export panel.
                       */}
                      <p className="iris-meta">
                        <Link
                          prefetch={false}
                          href={dynamicRoute(agentHref("meetings", a.agentId))}
                        >
                          Meetings
                        </Link>
                        {" · "}
                        <Link prefetch={false} href={dynamicRoute(agentHref("report", a.agentId))}>
                          Report
                        </Link>
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {/* --- how the presenters differ, in one chart: the Coaching tab --- */}
        {coaching ? (
          <Coaching charts={charts} period={period} detailHref={detailHref} portraits={portraits} />
        ) : null}

        {coaching ? null : (
          <>
            <div className="screen ag-workload" id="agents-workload" key={`ranked-${period}`}>
              <div className="iris-band">
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
                        &ldquo;Not linked to a contact&rdquo;, the Meetings register&rsquo;s words.
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
              {findingsScreen ? null : reading}
            </div>

            {findingsScreen ? (
              <div className="screen ag-findings" id="agents-findings">
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
                {reading}
              </div>
            ) : null}
          </>
        )}
      </section>
      {/*
       * After the screens in the DOM, so Tab reaches the agent page's controls
       * first; drawn beside them. Keyed as the screens are, so its observer
       * follows them when a period or a tab replaces them.
       */}
      <ScreenRail
        key={`rail-${period}-${coaching ? "coaching" : "roster"}`}
        screens={screens}
        label="Sales Agents screens"
      />
    </div>
  );
}

/**
 * COACHING: HOW DO THE PRESENTERS DIFFER? (the owner, 2026-10-22, ADR-0057)
 *
 * Two lenses beside three lists of sentences were "a complete mess", with no
 * focus; the owner could not tell what the panel wanted to show. One question
 * now, answered in one sentence and one chart:
 *
 *  - the question as the title, and the answer under it: the widest gap
 *    between the drawn agents in plain words, both ends with the meetings
 *    their figure is of (`PresenterComparison.headline`);
 *  - one chart, a row per part of the showroom and a dot per agent at the
 *    share of their own meetings that used it, the widest gap first; the three
 *    widest name who sits at each end, face and figure (`CoachingChart`);
 *  - the agents under the floor said under it, face, name and count, never
 *    drawn; under two drawn, no chart, since one agent alone has no gap, and
 *    that agent said the same way, a face and a count;
 *  - how it is measured, the floor and the parts not measured behind the `i`.
 *
 * Every word and figure is the read model's; this component only places them.
 * Nothing on this tab is ordered by workload or outcome.
 */
function Coaching({
  charts,
  period,
  detailHref,
  portraits,
}: {
  readonly charts: AgentCharts;
  readonly period: PeriodPreset;
  readonly detailHref: (agentId: string) => string;
  readonly portraits: Readonly<Record<string, string | null | undefined>>;
}) {
  const usage = charts.featureUsage;
  const { comparison } = usage;
  const drawn = usage.profiles.filter((p) => !p.belowMinimum);
  const undrawn = usage.profiles.filter((p) => p.belowMinimum);
  const counted = (n: number) => `${n} ${n === 1 ? "meeting" : "meetings"}`;
  /* A face, the name to their page, the count: how every agent off the chart is said. */
  const faces = (people: typeof drawn) => (
    <ul>
      {people.map((p) => (
        <li key={p.id}>
          <AgentPortrait
            name={p.label}
            src={portraits[p.id] ?? null}
            tone={p.tone}
            size="row"
            alt=""
          />
          <span>
            <Link href={dynamicRoute(detailHref(p.id))}>{p.label}</Link> · {counted(p.meetings)}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="screen ag-coaching" id="agents-coaching">
      <section className="ag-coach d-card" aria-labelledby="coach-title">
        <header className="iris-titled">
          <h2 id="coach-title" className="iris-kicker iris-kicker-measured">
            How do the presenters differ?
          </h2>
          <InfoTip id="coaching" label="how the presenters are compared">
            <p>{comparison.method}</p>
          </InfoTip>
        </header>
        <p className="ag-coach-headline">{comparison.headline}</p>

        {/* Under two agents drawn there is no gap to draw; the headline says why. */}
        {comparison.rows.length === 0 ? null : (
          <CoachingChart
            key={period}
            rows={comparison.rows}
            people={drawn.map((p) => ({
              id: p.id,
              name: p.label,
              meetings: counted(p.meetings),
              tone: p.tone,
              href: detailHref(p.id),
              portrait: portraits[p.id] ?? null,
            }))}
          />
        )}
        <p className="ox-sr">{usage.summary}</p>

        {comparison.rows.length > 0 || drawn.length === 0 ? null : (
          <div className="ag-coach-people">
            <p>Reached {AGENT_MIN_SAMPLE} meetings:</p>
            {faces(drawn)}
          </div>
        )}
        {undrawn.length === 0 ? null : (
          <div className="ag-coach-people">
            <p>Not drawn, under {AGENT_MIN_SAMPLE} meetings:</p>
            {faces(undrawn)}
          </div>
        )}

        <SourceChips sources={["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED"]} />
      </section>
    </div>
  );
}
