import type { Metadata } from "next";
import Link from "next/link";
import type { PeriodPreset } from "@observer/readmodels";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import { presetFrom } from "@/lib/period";
import { dynamicRoute } from "@/lib/href";
import { Finding, Gaps, SourceChips } from "@/showroom/parts";

export const metadata: Metadata = { title: "Units" };

/**
 * Unit Attention.
 *
 * Apartment activity turned into explainable buyer attention. Not a sortable
 * table of counts: attention is drawn as a line against the busiest unit, the
 * building's shape is preserved by grouping into floors, and selecting a unit
 * opens what IRIS actually saw happen to it.
 */
export default async function UnitsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string }>;
  searchParams: Promise<{ period?: string; unit?: string }>;
}) {
  const viewer = await requireViewer();
  const { tenantSlug, projectSlug } = await params;
  const search = await searchParams;

  const query = { viewer, tenantSlug, projectSlug, period: presetFrom(search.period) as PeriodPreset };
  const view = await repository.getUnitAttention(query, search.unit ?? null);

  const root = `/${tenantSlug}/${projectSlug}/units`;
  const href = (unit: string | null) =>
    `${root}?${new URLSearchParams({
      period: presetFrom(search.period),
      ...(unit === null ? {} : { unit }),
    }).toString()}`;

  const touched = view.rows.filter((r) => r.meetings > 0);
  const untouched = view.rows.length - touched.length;
  const detail = view.selected;

  return (
    <div className="iris-two">
      <section className="iris-plane iris-stack">
        <p className="iris-kicker">Unit attention · {view.context.period.label}</p>
        <h1 className="iris-section">
          {touched.length} of {view.rows.length} units were opened in front of a buyer.
        </h1>
        <p className="iris-meta" style={{ maxWidth: "62ch" }}>
          Attention is total time spent looking at the unit, scaled against the busiest one in the
          project. A unit nobody opened is shown at zero because that is a real answer, not a gap.
        </p>

        <div className="iris-matrix" style={{ marginTop: ".75rem" }}>
          <div className="iris-matrix-head">
            <span>unit</span>
            <span>attention</span>
            <span style={{ textAlign: "right" }}>mtgs</span>
            <span style={{ textAlign: "right" }}>med s</span>
            <span style={{ textAlign: "right" }}>short</span>
            <span style={{ textAlign: "right" }}>plans</span>
            <span style={{ textAlign: "right" }}>cmp</span>
            <span style={{ textAlign: "right" }}>trend</span>
          </div>
          {view.rows.map((row) => (
            <Link
              key={row.unitId}
              className="iris-matrix-row"
              href={dynamicRoute(href(detail?.row.unitCode === row.unitCode ? null : row.unitCode))}
              data-status={row.status}
              aria-pressed={detail?.row.unitCode === row.unitCode}
              scroll={false}
            >
              <span className="iris-matrix-code">{row.unitCode}</span>
              <span
                className="iris-matrix-attention"
                style={{ "--a": row.attention.toFixed(3) } as React.CSSProperties}
                title={`${row.rooms} rooms · ${row.areaSqm} m² · ${row.orientation} · ${row.status}`}
              >
                <i />
              </span>
              <span className="iris-matrix-num" data-zero={row.meetings === 0 ? "true" : undefined}>
                {row.meetings}
              </span>
              <span className="iris-matrix-num" data-zero={row.medianDwellSeconds === 0 ? "true" : undefined}>
                {row.medianDwellSeconds}
              </span>
              <span className="iris-matrix-num" data-zero={row.favourites === 0 ? "true" : undefined}>
                {row.favourites}
              </span>
              <span className="iris-matrix-num" data-zero={row.pdfOpens === 0 ? "true" : undefined}>
                {row.pdfOpens}
              </span>
              <span
                className="iris-matrix-num"
                data-null={row.comparisonWins === null ? "true" : undefined}
                title={row.comparisonWins === null ? "never placed in Compare mode" : undefined}
              >
                {row.comparisonWins === null ? "—" : `${row.comparisonWins}/${row.comparisonAppearances}`}
              </span>
              <span className="iris-matrix-num">{row.trendDisplay}</span>
            </Link>
          ))}
        </div>

        {untouched === 0 ? null : (
          <p className="iris-meta">
            {untouched} units were never opened in this period. That is an observation about the
            presentation, not a gap in the data.
          </p>
        )}
      </section>

      <aside className="iris-plane iris-plane--raised iris-stack">
        {detail === null ? (
          <>
            <p className="iris-kicker">Select a unit</p>
            <p className="iris-body" style={{ color: "var(--ink-2)" }}>
              Choosing a unit shows what IRIS saw happen to it: how long it was examined, whether it
              was shortlisted, what it was weighed against, and how its attention has moved.
            </p>
            <hr className="iris-rule" />
            {view.findings.map((finding) => (
              <Finding key={finding.id} finding={finding} lead />
            ))}
          </>
        ) : (
          <>
            <p className="iris-kicker">{detail.row.unitCode}</p>
            <h2 className="iris-section" style={{ margin: 0 }}>
              {detail.headline}
            </h2>
            <SourceChips sources={detail.row.sources} />

            <dl className="iris-detail">
              <div>
                <dt>status</dt>
                <dd>{detail.row.status}</dd>
              </div>
              <div>
                <dt>aspect</dt>
                <dd>
                  {detail.row.orientation} · floor {detail.row.floor}
                </dd>
              </div>
              <div>
                <dt>meetings</dt>
                <dd>
                  {detail.row.meetings} · {detail.row.views} views · {detail.row.repeatViews} repeat
                </dd>
              </div>
              <div>
                <dt>examined</dt>
                <dd>
                  median {detail.row.medianDwellSeconds}s · {Math.round(detail.row.totalDwellSeconds / 60)}m total
                </dd>
              </div>
              <div>
                <dt>intent marks</dt>
                <dd>
                  {detail.row.favourites} shortlisted · {detail.row.pdfOpens} plans · {detail.row.screenshots}{" "}
                  screenshots · {detail.row.shares} shared
                </dd>
              </div>
              <div>
                <dt>examined how</dt>
                <dd>
                  {detail.row.balconyViews} balcony · {detail.row.floorCutViews} floor cut
                </dd>
              </div>
              <div>
                <dt>trend</dt>
                <dd>
                  {detail.row.trend} · {detail.row.trendDisplay}
                </dd>
              </div>
            </dl>

            {detail.competitors.length === 0 ? null : (
              <div>
                <p className="iris-kicker" style={{ marginBottom: ".5rem" }}>
                  Weighed against
                </p>
                <div className="iris-bars">
                  {detail.competitors.map((c) => (
                    <div className="iris-bar" key={c.unitCode}>
                      <span className="iris-bar-label">{c.unitCode}</span>
                      <span
                        className="iris-bar-track"
                        style={{ "--v": (c.together / Math.max(1, detail.competitors[0]?.together ?? 1)).toFixed(3) } as React.CSSProperties}
                      >
                        <i />
                      </span>
                      <span className="iris-bar-value">
                        {c.together}× · kept {c.keptOther}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detail.findings.map((finding) => (
              <Finding key={finding.id} finding={finding} />
            ))}

            <Gaps
              gaps={[
                ...(detail.relatedFilters.length === 0
                  ? [
                      "Filter state is not emitted by the current showroom build, so what buyers were searching for when they opened this unit is unknown.",
                    ]
                  : []),
                ...(detail.row.comparisonWins === null
                  ? ["This unit was never placed in Compare mode, so there is no comparison record."]
                  : []),
              ]}
            />
          </>
        )}
      </aside>
    </div>
  );
}
