import type { Metadata } from "next";
import Link from "next/link";
import { sectionLabel } from "@observer/contracts";
import type { PeriodPreset, PresentationLane } from "@observer/readmodels";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import { requireSurface } from "@/lib/authz";
import { presetFrom } from "@/lib/period";
import { dynamicRoute } from "@/lib/href";
import { DnaLane, Finding, Gaps, shortCode } from "@/showroom/parts";
import { DrawIn } from "@/showroom/DrawIn";
import { InfoTip } from "@/components/iris/InfoTip";
import { AgentPortrait, type PortraitSize } from "@/components/agents/Portrait";
import { portraitSources } from "@/lib/portraits/server";
import "./presentation.css";

import { DEFAULT_LANGUAGE } from "@observer/readmodels";
export const metadata: Metadata = { title: "Presentation" };

/**
 * Presentation Intelligence.
 *
 * Presentation DNA: every agent's sequence on one screen, then a side-by-side
 * comparison of two lanes with the behaviours that actually differ between
 * them. The comparison is computed, never narrated — each difference is a pair
 * of rates with both sample sizes beside it, and the page states in words that
 * an association is not a cause.
 */
type Mode = "agents" | "cohorts" | "periods";

const MODES: readonly { id: Mode; label: string }[] = [
  { id: "agents", label: "Two agents" },
  { id: "cohorts", label: "Outcome cohorts" },
  { id: "periods", label: "This period vs last" },
];

export default async function PresentationPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string }>;
  searchParams: Promise<{ period?: string; mode?: string; left?: string; right?: string }>;
}) {
  const viewer = await requireViewer();
  const { tenantSlug, projectSlug } = await params;
  // Declared in SURFACES, enforced here — a hidden link is not access control.
  requireSurface(viewer, "presentation", `/${tenantSlug}/${projectSlug}`);
  const search = await searchParams;

  const mode: Mode = MODES.some((m) => m.id === search.mode) ? (search.mode as Mode) : "agents";
  const query = {
    viewer,
    tenantSlug,
    projectSlug,
    period: presetFrom(search.period) as PeriodPreset,
    language: DEFAULT_LANGUAGE,
  };

  const agents = await repository.listAgents(query);
  const view = await repository.getPresentationIntelligence(query, {
    mode,
    left: search.left ?? null,
    right: search.right ?? null,
  });

  const root = `/${tenantSlug}/${projectSlug}/presentation`;
  const qs = (extra: Record<string, string>) =>
    `${root}?${new URLSearchParams({ period: presetFrom(search.period), ...extra }).toString()}`;
  /*
   * The chosen pair is part of the scope (the plan's R11: a selection may not be
   * lost by moving between screens). A mode switch dropped it, so "Two agents"
   * came back as the default pair; it now travels through the other two modes,
   * which ignore it, and returns with the reader.
   */
  const pair: Record<string, string> = {
    ...(search.left === undefined ? {} : { left: search.left }),
    ...(search.right === undefined ? {} : { right: search.right }),
  };

  /*
   * A face beside every presenter the page names (ADR-0054): one address per
   * agent, reused by the chips and the lanes. A lane is a presenter's only
   * where its id is on the roster; the team's and a cohort's are not.
   */
  const portraits = await portraitSources(
    view.context.tenant,
    projectSlug,
    agents.map((agent) => agent.agentId),
  );
  const rosterName = new Map<string, string>(agents.map((agent) => [agent.agentId, agent.name]));
  const face = (id: string, size: PortraitSize = "row") => {
    const name = rosterName.get(id);
    return name === undefined ? undefined : (
      <AgentPortrait name={name} src={portraits[id] ?? null} size={size} alt="" />
    );
  };

  /*
   * A column head for "What differs": a presenter by first name, as the lanes
   * above it name them; a cohort or a period by its whole label, which wraps
   * (`presentation.css`). The first word alone printed "Did" over the cohort
   * that did not progress.
   */
  const head = (lane: PresentationLane) =>
    rosterName.has(lane.id) ? (lane.label.split(" ")[0] ?? lane.label) : lane.label;

  const comparison = view.comparison;
  const timingBlind = view.lanes.some((lane) =>
    lane.steps.some((s) => s.medianDwellSeconds === null),
  );
  /* The codes every lane prints, said once under the lanes (the comparison's key, below). */
  const key = (lanes: readonly PresentationLane[]) =>
    [...new Set(lanes.flatMap((lane) => lane.steps.map((s) => s.label)))]
      .map((label) => `${shortCode(label)} ${label}`)
      .join(" · ");

  return (
    <div className="iris-two iris-presentation" data-lead="aside">
      {/*
       * The comparison first in the DOM — the question before the material.
       * Stacked under 90rem this is the reading order; side by side the grid
       * places it on the right by column, so the composition is unchanged.
       * The reasoning is on `.iris-two[data-lead="aside"]` in `showroom.css`.
       */}
      <aside className="iris-plane iris-plane--raised iris-stack">
        <div>
          {/*
           * What this source cannot say stands behind the `i` (the owner,
           * 2026-10-23: "where there is a lot of text, simplify"), in the
           * aside on every mode, as R11-5 asks; the association line stays in
           * sight under the comparison.
           */}
          <header className="iris-titled" style={{ marginBottom: ".5rem" }}>
            <p className="iris-kicker">Compare</p>
            <InfoTip id="presentation-limits" label="what this comparison cannot say">
              <Gaps
                gaps={[
                  ...(timingBlind
                    ? [
                        "Some sessions in this period came from the legacy analytics, which records the order of sections but not when each was entered. Their sequence is real; their pacing is unknown.",
                      ]
                    : []),
                  "Filter state is not emitted by the current showroom build, so what buyers searched for cannot be placed in the sequence.",
                  "Sold and unsold units are not compared on this page: it has no control group to measure such a comparison against.",
                  "The buyer of a deal is not linked to the visitor in the room, so no buyer’s path is drawn.",
                ]}
              />
            </InfoTip>
          </header>
          <div className="iris-segmented" role="tablist" aria-label="Comparison mode">
            {MODES.map((m) => (
              <Link
                prefetch={false}
                key={m.id}
                role="tab"
                aria-selected={mode === m.id}
                href={dynamicRoute(qs({ mode: m.id, ...pair }))}
              >
                {m.label}
              </Link>
            ))}
          </div>
        </div>

        {mode === "agents" ? (
          <div className="iris-mode-strip">
            {agents.map((agent) => (
              <Link
                key={agent.agentId}
                className="iris-chip"
                aria-current={
                  comparison?.left.id === agent.agentId || comparison?.right.id === agent.agentId
                    ? "true"
                    : undefined
                }
                href={dynamicRoute(
                  qs({
                    mode: "agents",
                    left: agent.agentId,
                    right:
                      comparison === null
                        ? /*
                           * No comparison to swap a side of: the default pair
                           * had an absent side, and pairing the chip with the
                           * same absent colleague again would be a dead end
                           * on the review project. Pair it with the agent the
                           * reader last chose if they have meetings, else the
                           * first other one who does.
                           */
                          ((
                            agents.find(
                              (a) =>
                                a.agentId === search.left &&
                                a.agentId !== agent.agentId &&
                                a.meetingCount > 0,
                            ) ??
                            agents.find((a) => a.agentId !== agent.agentId && a.meetingCount > 0)
                          )?.agentId ?? "")
                        : comparison.left.id === agent.agentId
                          ? comparison.right.id
                          : comparison.left.id,
                  }),
                )}
              >
                {face(agent.agentId, "chip")}
                {agent.name}
                <b>{agent.meetingCount}</b>
              </Link>
            ))}
          </div>
        ) : null}

        {comparison === null ? (
          /*
           * The reason, not a shrug. A side with no meetings is an absence,
           * and the read model says whose — on the review project's default
           * view this used to be a lane of nought drawn as 0% on every row.
           */
          <p className="iris-meta">
            {view.noComparison ?? "No comparison is available for this selection."}
          </p>
        ) : (
          <>
            <div
              className="d-card"
              key={`pair-${mode}-${comparison.left.id}-${comparison.right.id}-${query.period}`}
            >
              <DrawIn kind="bloom">
                <div className="iris-dna">
                  <DnaLane lane={comparison.left} compact mark={face(comparison.left.id)} />
                  <DnaLane lane={comparison.right} compact mark={face(comparison.right.id)} />
                </div>
              </DrawIn>
              {/*
               * The key the compact lanes are read by. They print codes, and a
               * title is no answer on a touch screen: the plan's R11 asks that no
               * reading hang on an abbreviation, and the lane's own comment
               * promised this key.
               */}
              <p className="iris-meta" style={{ marginTop: ".25rem" }}>
                {key([comparison.left, comparison.right])}
              </p>
            </div>

            <hr className="iris-rule" />

            <div
              className="d-card"
              key={`differs-${mode}-${comparison.left.id}-${comparison.right.id}-${query.period}`}
            >
              <p className="iris-kicker" style={{ marginBottom: ".5rem" }}>
                What differs
              </p>
              {/*
               * Three states, told apart. Under the floor the read model
               * withholds every row and says so; that is not the same as two
               * lanes that reach the floor and differ on nothing, and neither
               * is an empty grid with a header.
               */}
              {comparison.verdictRefusal !== null ? (
                <p className="iris-meta">{comparison.verdictRefusal}</p>
              ) : comparison.differences.length === 0 ? (
                <p className="iris-meta">
                  No behaviour differs between the two by more than four percentage points.
                </p>
              ) : (
                <DrawIn kind="sweep">
                  <div className="iris-diff">
                    <div className="iris-diff-row">
                      <span className="iris-code">behaviour</span>
                      <span className="iris-code iris-diff-head">{head(comparison.left)}</span>
                      {/* Where a row drops its bar, the head drops this (`presentation.css`). */}
                      <span className="iris-code iris-diff-gaphead" style={{ textAlign: "center" }}>
                        gap
                      </span>
                      <span className="iris-code iris-diff-head">{head(comparison.right)}</span>
                    </div>
                    {comparison.differences.map((d) => (
                      <div className="iris-diff-row" key={d.id}>
                        <span className="iris-diff-behaviour">{d.behaviour}</span>
                        <span className="iris-diff-value">{d.leftDisplay}</span>
                        <span
                          className="iris-diff-bar"
                          style={{ "--magnitude": d.magnitude.toFixed(3) } as React.CSSProperties}
                          title={`${Math.round(d.magnitude * 100)} percentage points`}
                        >
                          <i />
                        </span>
                        <span className="iris-diff-value">{d.rightDisplay}</span>
                        {/*
                         * A row whose sample is narrower than the lane's says so
                         * on the row, with its own n: the "n = L and R" line
                         * below is the lanes' count, not this row's.
                         */}
                        {d.note === null &&
                        d.sampleLeft === comparison.left.meetingCount &&
                        d.sampleRight === comparison.right.meetingCount ? null : (
                          <p className="iris-diff-note">
                            {d.note === null ? "" : `${d.note} `}n = {d.sampleLeft} and{" "}
                            {d.sampleRight}.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </DrawIn>
              )}
              {comparison.withheld.map((sentence) => (
                <p className="iris-meta" key={sentence} style={{ marginTop: ".5rem" }}>
                  {sentence}
                </p>
              ))}
              <p className="iris-meta" style={{ marginTop: ".75rem" }}>
                n = {comparison.left.meetingCount} and {comparison.right.meetingCount} meetings.
                {comparison.excluded === null ? "" : ` ${comparison.excluded}`}
                {mode === "periods"
                  ? view.context.attribution.comparisonRefusal === null
                    ? ` Both periods measured under attribution policy ${view.context.attribution.version}.`
                    : ` Refused: ${view.context.attribution.comparisonRefusal}`
                  : ""}
              </p>
            </div>

            {/* An association, never a cause: one line in sight, no box round it. */}
            <p className="iris-meta">{comparison.disclaimer}</p>
          </>
        )}
      </aside>

      <section className="iris-plane iris-stack">
        <p className="iris-kicker">Presentation DNA · {view.context.period.label}</p>
        {/* One line in sight; how a lane is built is the `i`'s (the owner, 2026-10-23). */}
        <header className="iris-titled">
          <h1 className="iris-section">How the story is told, in the order it was told.</h1>
          <InfoTip id="presentation-dna" label="how the lanes are drawn">
            <p>
              The first lane is the team&rsquo;s and each lane under it one presenter&rsquo;s: every
              section stands at its mean position across that lane&rsquo;s meetings in the period,
              not on one meeting&rsquo;s path. Width is how often those meetings reached that
              section at all; fill is how long they stayed. A hatched, dashed block means the source
              records that the section was reached but not for how long — which is a different
              statement from no time at all.
            </p>
          </InfoTip>
        </header>
        <p className="iris-meta">
          The team&rsquo;s order first, then each presenter&rsquo;s; width is how often a section
          was reached.
        </p>

        <div className="d-card" key={`lanes-${query.period}`}>
          {/*
           * Every lane in codes, as the comparison's are: a lane chose per
           * section, so one read "Home · Amenities · GAL · MAP" (the owner's
           * review, 2026-10-23). The key under the lanes reads them.
           */}
          <DrawIn kind="bloom">
            <div className="iris-dna">
              <DnaLane lane={view.teamBenchmark} compact />
              <hr className="iris-rule" style={{ margin: ".5rem 0" }} />
              {view.lanes.map((lane) => (
                <DnaLane key={lane.id} lane={lane} compact mark={face(lane.id)} />
              ))}
            </div>
          </DrawIn>
          <p className="iris-meta" style={{ marginTop: ".25rem" }}>
            {key([view.teamBenchmark, ...view.lanes])}
          </p>
        </div>

        <hr className="iris-rule" />

        <div className="d-card" key={`transitions-${query.period}`}>
          {/*
           * The denominator changes from row to row — it is the moves out of
           * each row's own starting section — so it is printed under every
           * share, and the `i` says so. Two bars read against each other as if
           * they shared one were the P2-05 shape with a twist: the denominator
           * was in the read model's docblock and nowhere else.
           */}
          <header className="iris-titled" style={{ marginBottom: ".5rem" }}>
            <p className="iris-kicker">Most common transitions</p>
            <InfoTip id="presentation-transitions" label="the transitions' shares">
              <p>
                Each share is of the moves out of that row&rsquo;s own starting section, printed
                beneath it. Two rows have two denominators, so a longer bar is not more meetings.
              </p>
            </InfoTip>
          </header>
          <DrawIn kind="sweep">
            <div className="iris-bars" data-wide-labels="true" data-fraction="true">
              {/*
               * Sorted by share, not by raw count.
               *
               * The read model orders by volume because that is what the AI
               * tools want; a reader looking at bars expects the longest one
               * first, and a list whose order contradicts its own bars reads as
               * a rendering bug.
               */}
              {[...view.transitions]
                .sort((a, b) => b.share - a.share)
                .slice(0, 6)
                .map((t) => (
                  <div className="iris-bar" key={`${t.from}-${t.to}`}>
                    {/* The sections' names, never their ids: "environment" is Time & weather. */}
                    <span
                      className="iris-bar-label"
                      title={`${sectionLabel(t.from)} → ${sectionLabel(t.to)}`}
                    >
                      {sectionLabel(t.from)} → {sectionLabel(t.to)}
                    </span>
                    <span
                      className="iris-bar-track"
                      style={{ "--v": t.share.toFixed(3) } as React.CSSProperties}
                    >
                      <i />
                    </span>
                    <span className="iris-bar-value">
                      {Math.round(t.share * 100)}%
                      <span className="iris-bar-of">
                        {t.count} of {t.outOf}
                      </span>
                    </span>
                  </div>
                ))}
            </div>
          </DrawIn>
        </div>

        {view.findings.map((finding) => (
          <Finding key={finding.id} finding={finding} period={query.period} lead />
        ))}
      </section>
    </div>
  );
}
