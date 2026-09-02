import type { Metadata } from "next";
import type { PeriodPreset } from "@observer/readmodels";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import { requireSurface } from "@/lib/authz";
import { presetFrom } from "@/lib/period";
import { Finding, Gaps, SourceChips } from "@/showroom/parts";
import { UnitMatrix } from "@/showroom/UnitMatrix";
import { Measure } from "@/showroom/Measure";

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
  // Declared in SURFACES, enforced here — a hidden link is not access control.
  requireSurface(viewer, "units", `/${tenantSlug}/${projectSlug}`);
  const search = await searchParams;

  const query = {
    viewer,
    tenantSlug,
    projectSlug,
    period: presetFrom(search.period) as PeriodPreset,
  };
  const view = await repository.getUnitAttention(query, search.unit ?? null);

  const root = `/${tenantSlug}/${projectSlug}/units`;
  const href = (unit: string | null) =>
    `${root}?${new URLSearchParams({
      period: presetFrom(search.period),
      ...(unit === null ? {} : { unit }),
    }).toString()}`;

  const touched = view.rows.filter((r) => r.meetings > 0);
  const detail = view.selected;

  return (
    <div className="iris-two">
      <section className="iris-plane iris-stack">
        <p className="iris-kicker">Unit attention · {view.context.period.label}</p>
        <h1 className="iris-section">
          {touched.length} of {view.rows.length} units were opened in front of a buyer.
        </h1>
        <p className="iris-meta" style={{ maxWidth: "62ch" }}>
          Ordered by how much of the project&rsquo;s looking time each one took. Every column says
          what it measures — open the <b>i</b> beside a heading to see the rule behind the number
          and what it does not tell you.
        </p>

        <UnitMatrix
          rows={view.rows}
          selectedCode={detail?.row.unitCode ?? null}
          hrefFor={view.rows.map((r) => ({
            code: r.unitCode,
            href: href(detail?.row.unitCode === r.unitCode ? null : r.unitCode),
          }))}
        />
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
                  median {detail.row.medianDwellSeconds}s ·{" "}
                  {Math.round(detail.row.totalDwellSeconds / 60)}m total
                </dd>
              </div>
              <div>
                <dt>
                  <Measure id="unit.favourites" />
                </dt>
                <dd>
                  {detail.row.favourites} of {detail.row.meetings} meetings
                </dd>
              </div>
              <div>
                <dt>
                  <Measure id="unit.pdf_opens" />
                </dt>
                <dd>{detail.row.pdfOpens}</dd>
              </div>
              <div>
                <dt>
                  <Measure id="unit.examined" />
                </dt>
                <dd>
                  {detail.row.balconyViews} balcony{" "}
                  {detail.row.balconyViews === 1 ? "view" : "views"} · {detail.row.floorCutViews}{" "}
                  floor {detail.row.floorCutViews === 1 ? "cut" : "cuts"}
                </dd>
              </div>
              <div>
                <dt>
                  <Measure id="unit.screenshots" />
                </dt>
                <dd>{detail.row.screenshots}</dd>
              </div>
              <div>
                <dt>
                  <Measure id="unit.shares" />
                </dt>
                <dd>{detail.row.shares}</dd>
              </div>
              <div>
                <dt>
                  <Measure id="unit.comparison" />
                </dt>
                <dd>
                  {detail.row.comparisonWins === null
                    ? "never placed in Compare"
                    : `kept ${detail.row.comparisonWins} of ${detail.row.comparisonAppearances}`}
                </dd>
              </div>
              <div>
                <dt>
                  <Measure id="unit.trend" />
                </dt>
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
                {/*
                 * A list, not bars.
                 *
                 * Compare sets are small, so most competitors appear once and
                 * a bar chart of identical full-width bars says nothing. Bars
                 * appear only when there is actually a spread to see.
                 */}
                {(detail.competitors[0]?.together ?? 0) > 1 ? (
                  <div className="iris-bars">
                    {detail.competitors.map((c) => (
                      <div className="iris-bar" key={c.unitCode}>
                        <span className="iris-bar-label" title={c.unitCode}>
                          {c.unitCode}
                        </span>
                        <span
                          className="iris-bar-track"
                          style={
                            {
                              "--v": (c.together / (detail.competitors[0]?.together ?? 1)).toFixed(
                                3,
                              ),
                            } as React.CSSProperties
                          }
                        >
                          <i />
                        </span>
                        <span className="iris-bar-value">{c.together}×</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="iris-body" style={{ color: "var(--ink-2)" }}>
                    {detail.competitors.map((c) => c.unitCode).join(", ")} — each once.
                  </p>
                )}
                <p className="iris-meta" style={{ marginTop: ".5rem" }}>
                  {detail.competitors.filter((c) => c.keptOther > 0).length === 0
                    ? `${detail.row.unitCode} was the one kept in every comparison it appeared in.`
                    : `The other unit was kept in ${detail.competitors.reduce((a, c) => a + c.keptOther, 0)} of these.`}
                </p>
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
                  ? [
                      "This unit was never placed in Compare mode, so there is no comparison record.",
                    ]
                  : []),
              ]}
            />
          </>
        )}
      </aside>
    </div>
  );
}
