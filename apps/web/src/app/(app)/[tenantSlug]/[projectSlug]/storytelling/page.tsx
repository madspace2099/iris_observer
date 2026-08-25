import type { Metadata } from "next";
import type { PeriodPreset } from "@observer/readmodels";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import { requireSurface } from "@/lib/authz";
import { presetFrom } from "@/lib/period";
import { Finding, Gaps, SourceChips } from "@/showroom/parts";
import { Measure } from "@/showroom/Measure";

export const metadata: Metadata = { title: "Storytelling" };

/**
 * Storytelling and Feature Intelligence.
 *
 * How the IRIS presentation itself is being used: which sections carry
 * meaningful attention, which are opened and abandoned, which travel together,
 * and how the environment controls are used.
 *
 * The distinction that matters here is between a section being *reached* and a
 * section being *presented*. The legacy dashboard collapsed the two and graded
 * one click as "High" engagement.
 */
export default async function StorytellingPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const viewer = await requireViewer();
  const { tenantSlug, projectSlug } = await params;
  // Declared in SURFACES, enforced here — a hidden link is not access control.
  requireSurface(viewer, "storytelling", `/${tenantSlug}/${projectSlug}`);
  const search = await searchParams;

  const query = {
    viewer,
    tenantSlug,
    projectSlug,
    period: presetFrom(search.period) as PeriodPreset,
  };
  const view = await repository.getStorytelling(query);

  const totalTime = view.environment.timeOfDay.reduce((a, b) => a + b.count, 0);
  const totalWeather = view.environment.weather.reduce((a, b) => a + b.count, 0);
  const peakPair = view.pairings[0]?.lift ?? 1;

  return (
    <div className="iris-two">
      <section className="iris-plane iris-stack">
        <p className="iris-kicker">Storytelling · {view.context.period.label}</p>
        <h1 className="iris-section">Which parts of IRIS carry the argument.</h1>
        <p className="iris-meta" style={{ maxWidth: "62ch" }}>
          The solid bar is how often a section was reached. The hatched overlay is the share of
          those visits that ended within fifteen seconds — opened and left rather than presented.
        </p>
        <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
          <Measure id="section.reach" />
          <Measure id="section.glance" />
        </div>

        <div className="iris-bars" data-value-wide="true" style={{ marginTop: "1rem" }}>
          {view.sections.map((s) => (
            <div className="iris-bar" key={s.sectionId}>
              <span
                className="iris-bar-label"
                title={`${s.kind} · mean position ${Math.round(s.meanPosition * 100)}%`}
              >
                {s.label}
              </span>
              <span
                className="iris-bar-track"
                style={
                  {
                    "--v": s.reachRate.toFixed(3),
                    "--glance": (s.reachRate * s.glanceRate).toFixed(3),
                  } as React.CSSProperties
                }
                title={
                  s.medianDwellSeconds === null
                    ? `${s.meetings} meetings · timing not recorded by this source`
                    : `${s.meetings} meetings · median ${s.medianDwellSeconds}s · ${Math.round(s.glanceRate * 100)}% under 15s · returned to in ${Math.round(s.returnRate * 100)}%`
                }
              >
                <i />
                <b />
              </span>
              <span className="iris-bar-value">
                {Math.round(s.reachRate * 100)}%
                {s.medianDwellSeconds === null ? "" : ` · ${s.medianDwellSeconds}s`}
              </span>
            </div>
          ))}
        </div>

        <hr className="iris-rule" />

        <div>
          <p className="iris-kicker" style={{ marginBottom: ".75rem" }}>
            Where each section lands in the presentation
          </p>
          {/*
           * A list, not an axis.
           *
           * Six of the nine sections have a mean position between 0.44 and
           * 0.54, so labelling a 0–1 axis put six names inside a tenth of its
           * width and none of them could be read. The band is the useful
           * reading anyway: what opens, what closes, and what floats in the
           * middle.
           */}
          <div className="iris-bars">
            {view.sections
              .filter((s) => s.meetings > 0)
              .slice()
              .sort((a, b) => a.meanPosition - b.meanPosition)
              .map((s) => (
                <div className="iris-bar" key={`pos-${s.sectionId}`}>
                  <span className="iris-bar-label" title={s.label}>
                    {s.label}
                  </span>
                  <span className="iris-position-row" aria-hidden="true">
                    <i style={{ left: `${s.meanPosition * 100}%` }} />
                  </span>
                  <span className="iris-bar-value">
                    {s.meanPosition < 0.15
                      ? "opens"
                      : s.meanPosition < 0.4
                        ? "early"
                        : s.meanPosition < 0.62
                          ? "middle"
                          : s.meanPosition < 0.82
                            ? "late"
                            : "closes"}
                  </span>
                </div>
              ))}
          </div>
          {/* The legend belongs under the axis column, not under the whole row. */}
          <div className="iris-bar" style={{ marginTop: ".25rem" }}>
            <span />
            <span style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="iris-code">opens the meeting</span>
              <span className="iris-code">closes it</span>
            </span>
            <span />
          </div>
        </div>

        <hr className="iris-rule" />

        {view.findings.map((finding, index) => (
          <Finding key={finding.id} finding={finding} lead={index === 0} />
        ))}
      </section>

      <aside className="iris-plane iris-plane--raised iris-stack">
        <div>
          <p className="iris-kicker" style={{ marginBottom: ".5rem" }}>
            Sections that travel together
          </p>
          <div style={{ marginBottom: ".625rem" }}>
            <Measure id="section.pairing" />
          </div>
          <div className="iris-bars">
            {view.pairings.map((p) => (
              <div className="iris-bar" key={`${p.a}-${p.b}`}>
                <span className="iris-bar-label" title={`${p.a} + ${p.b}`}>
                  {p.a} + {p.b}
                </span>
                <span
                  className="iris-bar-track"
                  style={
                    {
                      "--v": Math.min(1, p.lift / Math.max(1, peakPair)).toFixed(3),
                    } as React.CSSProperties
                  }
                >
                  <i />
                </span>
                <span className="iris-bar-value">{p.lift.toFixed(2)}×</span>
              </div>
            ))}
          </div>
          <p className="iris-meta" style={{ marginTop: ".5rem" }}>
            1.00× is what independent use would produce. Co-occurrence within a meeting, not a claim
            about order.
          </p>
        </div>

        <hr className="iris-rule" />

        <div>
          <p className="iris-kicker" style={{ marginBottom: ".5rem" }}>
            Environment
          </p>
          <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap", marginBottom: ".5rem" }}>
            <Measure id="environment.time_of_day" />
            <Measure id="environment.weather" />
          </div>
          <p className="iris-meta">
            Used in {view.environment.meetingsUsingEnvironment} of {view.environment.meetingsTotal}{" "}
            meetings.
          </p>
          <div className="iris-bars" style={{ marginTop: ".5rem" }}>
            {[...view.environment.timeOfDay]
              .sort((a, b) => b.count - a.count)
              .map((t) => (
                <div className="iris-bar" key={t.preset}>
                  <span className="iris-bar-label" title={t.label}>
                    {t.label}
                  </span>
                  <span
                    className="iris-bar-track"
                    style={
                      {
                        "--v": (t.count / Math.max(1, totalTime)).toFixed(3),
                      } as React.CSSProperties
                    }
                  >
                    <i />
                  </span>
                  <span className="iris-bar-value">{t.count}</span>
                </div>
              ))}
          </div>
          <div className="iris-bars" style={{ marginTop: ".75rem" }}>
            {[...view.environment.weather]
              .sort((a, b) => b.count - a.count)
              .map((w) => (
                <div className="iris-bar" key={w.preset}>
                  <span className="iris-bar-label" title={w.label}>
                    {w.label}
                  </span>
                  <span
                    className="iris-bar-track"
                    style={
                      {
                        "--v": (w.count / Math.max(1, totalWeather)).toFixed(3),
                      } as React.CSSProperties
                    }
                  >
                    <i />
                  </span>
                  <span className="iris-bar-value">{w.count}</span>
                </div>
              ))}
          </div>
        </div>

        <hr className="iris-rule" />

        <div>
          <p className="iris-kicker" style={{ marginBottom: ".5rem" }}>
            Reached before a unit was shortlisted
          </p>
          <div className="iris-bars">
            {view.beforeShortlist.slice(0, 6).map((b) => (
              <div className="iris-bar" key={b.sectionId}>
                <span className="iris-bar-label" title={b.label}>
                  {b.label}
                </span>
                <span
                  className="iris-bar-track"
                  style={{ "--v": b.rate.toFixed(3) } as React.CSSProperties}
                >
                  <i />
                </span>
                <span className="iris-bar-value">{Math.round(b.rate * 100)}%</span>
              </div>
            ))}
          </div>
          <p className="iris-meta" style={{ marginTop: ".5rem" }}>
            Present in the meeting, not necessarily before the shortlisting. Per-step timing is
            needed to make that an ordering claim.
          </p>
        </div>

        <SourceChips sources={["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED"]} />

        <Gaps
          gaps={[
            "Which unit was on screen when a time-of-day or weather preset changed is not recorded, so the preset cannot be tied to an aspect or a floor.",
            "Individual points of interest inside Surroundings are not named by the current build — only that the section was reached.",
          ]}
        />
      </aside>
    </div>
  );
}
