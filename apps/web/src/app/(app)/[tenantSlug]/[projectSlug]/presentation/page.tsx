import type { Metadata } from "next";
import Link from "next/link";
import type { PeriodPreset } from "@observer/readmodels";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import { presetFrom } from "@/lib/period";
import { dynamicRoute } from "@/lib/href";
import { DnaLane, Finding, Gaps, SourceChips } from "@/showroom/parts";

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
  const search = await searchParams;

  const mode: Mode = MODES.some((m) => m.id === search.mode) ? (search.mode as Mode) : "agents";
  const query = {
    viewer,
    tenantSlug,
    projectSlug,
    period: presetFrom(search.period) as PeriodPreset,
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

  const comparison = view.comparison;
  const timingBlind = view.lanes.some((lane) =>
    lane.steps.some((s) => s.medianDwellSeconds === null),
  );

  return (
    <div className="iris-two">
      <section className="iris-plane iris-stack">
        <p className="iris-kicker">Presentation DNA · {view.context.period.label}</p>
        <h1 className="iris-section">How the story is told, in the order it was told.</h1>
        <p className="iris-meta" style={{ maxWidth: "62ch" }}>
          Each lane is one presenter&rsquo;s sequence. Width is how often their meetings reached
          that section at all; fill is how long they stayed. A hatched, dashed block means the
          source records that the section was reached but not for how long — which is a different
          statement from no time at all.
        </p>

        <div className="iris-dna" style={{ marginTop: "1rem" }}>
          <DnaLane lane={view.teamBenchmark} />
          <hr className="iris-rule" style={{ margin: ".5rem 0" }} />
          {view.lanes.map((lane) => (
            <DnaLane key={lane.id} lane={lane} />
          ))}
        </div>

        <hr className="iris-rule" />

        <div>
          <p className="iris-kicker" style={{ marginBottom: ".5rem" }}>
            Most common transitions
          </p>
          <div className="iris-bars" data-wide-labels="true">
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
                  <span className="iris-bar-label">
                    {t.from} → {t.to}
                  </span>
                  <span
                    className="iris-bar-track"
                    style={{ "--v": t.share.toFixed(3) } as React.CSSProperties}
                  >
                    <i />
                  </span>
                  <span className="iris-bar-value">{Math.round(t.share * 100)}%</span>
                </div>
              ))}
          </div>
        </div>

        {view.findings.map((finding) => (
          <Finding key={finding.id} finding={finding} lead />
        ))}
      </section>

      <aside className="iris-plane iris-plane--raised iris-stack">
        <div>
          <p className="iris-kicker" style={{ marginBottom: ".5rem" }}>
            Compare
          </p>
          <div className="iris-segmented" role="tablist" aria-label="Comparison mode">
            {MODES.map((m) => (
              <Link
                key={m.id}
                role="tab"
                aria-selected={mode === m.id}
                href={dynamicRoute(qs({ mode: m.id }))}
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
                      comparison?.left.id === agent.agentId
                        ? (comparison.right.id ?? "")
                        : (comparison?.left.id ?? ""),
                  }),
                )}
              >
                {agent.name}
                <b>{agent.meetingCount}</b>
              </Link>
            ))}
          </div>
        ) : null}

        {comparison === null ? (
          <p className="iris-meta">No comparison is available for this selection.</p>
        ) : (
          <>
            <div className="iris-dna">
              <DnaLane lane={comparison.left} compact />
              <DnaLane lane={comparison.right} compact />
            </div>

            <hr className="iris-rule" />

            <div>
              <p className="iris-kicker" style={{ marginBottom: ".5rem" }}>
                What differs
              </p>
              <div className="iris-diff">
                <div className="iris-diff-row">
                  <span className="iris-code">behaviour</span>
                  <span className="iris-code" style={{ textAlign: "right" }}>
                    {comparison.left.label.split(" ")[0]}
                  </span>
                  <span className="iris-code" style={{ textAlign: "center" }}>
                    gap
                  </span>
                  <span className="iris-code" style={{ textAlign: "right" }}>
                    {comparison.right.label.split(" ")[0]}
                  </span>
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
                  </div>
                ))}
              </div>
              <p className="iris-meta" style={{ marginTop: ".75rem" }}>
                n = {comparison.left.meetingCount} and {comparison.right.meetingCount} meetings.
              </p>
              <div style={{ marginTop: ".5rem" }}>
                <SourceChips sources={comparison.differences[0]?.sources ?? []} />
              </div>
            </div>

            <Gaps gaps={[comparison.disclaimer]} title="How to read this" />
          </>
        )}

        <Gaps
          gaps={
            timingBlind
              ? [
                  "Some sessions in this period came from the legacy analytics, which records the order of sections but not when each was entered. Their sequence is real; their pacing is unknown.",
                  "Filter state is not emitted by the current showroom build, so what buyers searched for cannot be placed in the sequence.",
                ]
              : [
                  "Filter state is not emitted by the current showroom build, so what buyers searched for cannot be placed in the sequence.",
                ]
          }
        />
      </aside>
    </div>
  );
}
