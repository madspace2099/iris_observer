import type { Metadata } from "next";
import Link from "next/link";
import type { PeriodPreset } from "@observer/readmodels";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import { requireSurface } from "@/lib/authz";
import { presetFrom } from "@/lib/period";
import { dynamicRoute } from "@/lib/href";
import { Finding, Gaps, SourceChips } from "@/showroom/parts";
import { PairedRates, ParityScale } from "@/showroom/charts";
import { BulletChart, JourneyFlow } from "@/showroom/charts2";

export const metadata: Metadata = { title: "Project" };

/**
 * View two — what buyers want, and what they linger on.
 *
 * Three questions, in the order a developer asks them.
 *
 * **Is this segment interesting?** Attention against supply, on an axis centred
 * at parity, so the reading is which side of 1.00× a segment falls on rather
 * than how tall a bar is.
 *
 * **What is interesting about it?** Not one number. How they examined the units
 * — the balcony is the view, the floor cut is the layout, the plan is what they
 * take away — each against the same rate for every other unit, because "40% of
 * two-room openings got a balcony view" only means something beside "37% for
 * the rest". This is the input to what the next campaign should show.
 *
 * **What did they search for that we do not have?** A filter with no matching
 * unit is the sharpest demand signal a project gets, and the only one that names
 * something the building lacks. It needs a UE5 v2 event, and the page says so.
 */
export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string }>;
  searchParams: Promise<{ period?: string; segment?: string }>;
}) {
  const viewer = await requireViewer();
  const { tenantSlug, projectSlug } = await params;
  // Declared in SURFACES, enforced here — a hidden link is not access control.
  requireSurface(viewer, "project", `/${tenantSlug}/${projectSlug}`);
  const search = await searchParams;

  const query = {
    viewer,
    tenantSlug,
    projectSlug,
    period: presetFrom(search.period) as PeriodPreset,
  };

  const [view, charts] = await Promise.all([
    repository.getProjectView(query, search.segment ?? "rooms-2"),
    repository.getProjectCharts(query),
  ]);

  const root = `/${tenantSlug}/${projectSlug}/project`;
  const qs = (segment: string) =>
    `${root}?${new URLSearchParams({ period: presetFrom(search.period), segment }).toString()}`;
  const segment = view.selectedSegment;
  const unmet = view.demand.filter((d) => d.matches === 0);
  const peakPlace = view.places[0]?.totalDwellSeconds ?? 1;

  return (
    <div className="iris-one">
      <section className="iris-plane iris-stack">
        <p className="iris-kicker">Project · {view.context.period.label}</p>
        <h1 className="iris-section">{view.verdict}</h1>

        {/* --- the plan, and where the project stands against it ---------- */}

        <div>
          <p className="iris-kicker" style={{ marginBottom: ".875rem" }}>
            Sold against the plan
          </p>
          <BulletChart
            rows={charts.targets.map((t) => ({
              id: t.id,
              label: t.label,
              actual: t.actual,
              target: t.target,
              pace: t.pace,
              total: t.total,
              note: t.note,
            }))}
          />
          {charts.targets.map((t) => (
            <p className="iris-meta" key={t.id} style={{ marginTop: ".625rem" }}>
              {t.note}
            </p>
          ))}
          <SourceChips sources={["CRM_OUTCOME_CONTEXT"]} />
        </div>

        <hr className="iris-rule" />

        <div>
          <p className="iris-kicker" style={{ marginBottom: ".875rem" }}>
            Does attention match supply?
          </p>
          <ParityScale
            rows={view.segments.map((s) => ({
              id: s.id,
              label: s.label,
              index: s.index,
              note: `${Math.round(s.attentionShare * 100)}% of looking time on ${Math.round(s.stockShare * 100)}% of stock`,
            }))}
          />
        </div>

        <hr className="iris-rule" />

        <div className="iris-segmented" role="tablist" aria-label="Unit segment">
          {view.segments.map((s) => (
            <Link
              key={s.id}
              role="tab"
              aria-selected={segment?.id === s.id}
              href={dynamicRoute(qs(s.id))}
            >
              {s.label}
            </Link>
          ))}
        </div>

        {segment === null ? null : (
          <div className="iris-band">
            <div>
              <p className="iris-kicker" style={{ marginBottom: ".375rem" }}>
                What is interesting about {segment.label.toLowerCase()} units
              </p>
              <p className="iris-body" style={{ maxWidth: "60ch" }}>
                {segment.soWhat}
              </p>

              <div style={{ marginTop: "1.25rem" }}>
                <PairedRates
                  leftLabel={segment.label}
                  rightLabel="Every other unit"
                  rows={segment.examinedHow.map((e) => ({
                    id: e.id,
                    label: e.label,
                    left: e.rate,
                    right: e.otherRate,
                    note: "share of units opened that got this",
                  }))}
                />
              </div>
              <p className="iris-meta" style={{ marginTop: ".75rem" }}>
                The filled dot is {segment.label.toLowerCase()} units, the hollow one is every other
                unit, and the line between them is the difference. Four different acts, kept apart:
                the balcony is the view, the floor cut is the layout, the plan is what a buyer takes
                away, the screenshot is what they show someone else.
              </p>
            </div>

            <div className="iris-band-side">
              <p className="iris-kicker" style={{ marginBottom: ".625rem" }}>
                Where those buyers spent their time
              </p>
              <div className="iris-bars">
                {segment.attendedTo.map((a) => (
                  <div className="iris-bar" key={a.label}>
                    <span className="iris-bar-label" title={a.category}>
                      {a.label}
                    </span>
                    <span
                      className="iris-bar-track"
                      style={
                        {
                          "--v": (a.share / (segment.attendedTo[0]?.share ?? 1)).toFixed(3),
                        } as React.CSSProperties
                      }
                    >
                      <i />
                    </span>
                    <span className="iris-bar-value">{Math.round(a.share * 100)}%</span>
                  </div>
                ))}
              </div>
              <p className="iris-meta" style={{ marginTop: ".625rem" }}>
                Share of the time these meetings spent on any named place.
              </p>
              <Link
                className="iris-action"
                data-emphasis="primary"
                href={dynamicRoute(
                  `/${tenantSlug}/${projectSlug}/audience?rooms=${segment.id === "rooms-2" ? 2 : 3}`,
                )}
                style={{ marginTop: "1rem" }}
              >
                Build an audience from this
              </Link>
            </div>
          </div>
        )}

        <hr className="iris-rule" />

        <div className="iris-band">
          <div>
            <p className="iris-kicker" style={{ marginBottom: ".625rem" }}>
              What buyers searched for
            </p>
            <div className="iris-matrix" data-columns="demand">
              <div className="iris-matrix-head">
                <span>Filter</span>
                <span>Value</span>
                <span style={{ textAlign: "right" }}>Times applied</span>
                <span style={{ textAlign: "right" }}>Units matching</span>
              </div>
              {view.demand.slice(0, 10).map((d) => (
                <div
                  className="iris-matrix-row"
                  key={`${d.field}-${d.value}`}
                  data-empty={d.matches === 0 ? "true" : undefined}
                >
                  <span className="iris-bar-label" title={d.label}>{d.label}</span>
                  <span className="iris-bar-label" title={d.value}>{d.value}</span>
                  <span className="iris-matrix-num">{d.applications}</span>
                  <span
                    className="iris-matrix-num"
                    data-zero={d.matches === 0 ? "true" : undefined}
                  >
                    {d.matches}
                  </span>
                </div>
              ))}
            </div>
            {unmet.length === 0 ? null : (
              <p className="iris-finding-caveat" style={{ marginTop: ".75rem" }}>
                {unmet.length} of these searches matched no available unit at all.
              </p>
            )}
          </div>

          <div className="iris-band-side">
            <p className="iris-kicker" style={{ marginBottom: ".625rem" }}>
              What the neighbourhood is doing
            </p>
            <div className="iris-bars">
              {view.placeCategories.slice(0, 7).map((c) => (
                <div className="iris-bar" key={c.category}>
                  <span className="iris-bar-label" title={c.label}>{c.label}</span>
                  <span
                    className="iris-bar-track"
                    style={
                      {
                        "--v": (c.share / (view.placeCategories[0]?.share ?? 1)).toFixed(3),
                      } as React.CSSProperties
                    }
                  >
                    <i />
                  </span>
                  <span className="iris-bar-value">{Math.round(c.share * 100)}%</span>
                </div>
              ))}
            </div>
            <p className="iris-meta" style={{ marginTop: ".625rem" }}>
              Share of all time spent on named places, by what kind of place it is.
            </p>
          </div>
        </div>

        <hr className="iris-rule" />

        <div>
          <p className="iris-kicker" style={{ marginBottom: ".75rem" }}>
            The places buyers stopped on
          </p>
          <div className="iris-places">
            {view.places.map((p) => (
              <span
                className="iris-place"
                key={p.placeId}
                data-section={p.section}
                style={
                  { "--w": (p.totalDwellSeconds / peakPlace).toFixed(3) } as React.CSSProperties
                }
                title={`${p.meetings} meetings · median ${p.medianDwellSeconds}s${
                  p.availability === "requires_ue5_v2_event" ? " · needs a UE5 v2 event" : ""
                }`}
              >
                {p.name}
                <b>{Math.round(p.totalDwellSeconds / 60)}m</b>
              </span>
            ))}
          </div>
          <p className="iris-meta" style={{ marginTop: ".75rem" }}>
            Sized by total time. Amenities inside the building are recorded today; points of
            interest in the neighbourhood need a UE5 v2 event and are shown here as a demonstration.
          </p>
          <SourceChips sources={["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED"]} />
        </div>

        <hr className="iris-rule" />

        {/* --- how far a presentation gets, and where it stops ------------ */}

        <div>
          <p className="iris-kicker" style={{ marginBottom: ".875rem" }}>
            How far a presentation gets
          </p>
          <JourneyFlow stages={charts.journey.stages} links={charts.journey.links} />
          <p className="iris-meta" style={{ marginTop: ".75rem" }}>
            {charts.journey.note}
          </p>
          <SourceChips sources={["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED"]} />
        </div>

        <hr className="iris-rule" />

        {view.findings.map((finding, index) => (
          <Finding key={finding.id} finding={finding} lead={index === 0} />
        ))}

        <Gaps
          gaps={[
            "Filter state and individual points of interest are not emitted by the current showroom build. Both are shown as a demonstration of what the UE5 v2 event would answer.",
            "Time spent on a kind of place is a behaviour, not a fact about anyone's household.",
          ]}
        />
      </section>
    </div>
  );
}
