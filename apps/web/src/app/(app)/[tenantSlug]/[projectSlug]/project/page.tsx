import type { Metadata } from "next";
import Link from "next/link";
import { nothingReceivedYet, type PeriodPreset } from "@observer/readmodels";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import { requireSurface } from "@/lib/authz";
import { presetFrom } from "@/lib/period";
import { dynamicRoute } from "@/lib/href";
import { Finding, Gaps, SourceChips } from "@/showroom/parts";
import { PairedRates, ParityScale, QuadrantMatrix } from "@/showroom/charts";
import { BulletChart, JourneyFlow } from "@/showroom/charts2";
import { FlowScroller } from "@/showroom/FlowScroller";
import { ExportReport } from "@/components/report";
import { withPeriod } from "@/lib/period";

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

  const [view, charts, report] = await Promise.all([
    repository.getProjectView(query, search.segment ?? null),
    repository.getProjectCharts(query),
    repository.getReportScope(query),
  ]);
  const reportHref = withPeriod(`/${tenantSlug}/${projectSlug}/report`, query.period);

  const root = `/${tenantSlug}/${projectSlug}/project`;
  const qs = (segment: string) =>
    `${root}?${new URLSearchParams({ period: presetFrom(search.period), segment }).toString()}`;
  const segment = view.selectedSegment;
  const unmet = view.demand.filter((d) => d.matches === 0);
  /*
   * The search register's two count heads, each built once: the column head
   * on a desk, and every cell's `data-label` on a phone, where the head is
   * hidden and the record layout paints the label in front of the number.
   * Two literals drifted apart - the head learnt the set, the label kept the
   * short word, and a count stood without its set on the one view nobody
   * had photographed.
   */
  const applicationsHead = `Times applied, of ${view.meetingCount} presentations`;
  const matchesHead = `Units matching, of ${view.availableUnits} available now`;
  const peakPlace = view.places[0]?.totalDwellSeconds ?? 1;

  /*
   * THE FIRST DAY OF A PROJECT MADE IN ADMINISTRATION.
   *
   * Nothing has arrived and nothing is connected, so every frame below would be
   * its own way of saying so: two unavailable bars, an empty scale, four empty
   * quadrants and three tables of headings. That is a page of absences a reader
   * has to add up. It is one fact, so it is said once: what this project waits
   * for, feed by feed, in the names administration gave them. The ordinary page
   * returns the moment any one of them delivers.
   */
  if (
    nothingReceivedYet(view.context) !== null &&
    view.context.project.connectedSources.length === 0
  ) {
    return (
      <div className="iris-one">
        <section className="iris-plane iris-stack">
          <p className="iris-kicker">Project · {view.context.period.label}</p>
          <h1 className="iris-section">{view.verdict}</h1>
          <p className="iris-body" style={{ maxWidth: "62ch" }}>
            This project shows only what its own sources deliver, and none has delivered yet.
            MADSPACE connects them, and each screen fills as its source starts to report.
          </p>
          <Gaps
            title="What this project is waiting for"
            gaps={view.context.project.sources.map(
              (source) => `${source.displayName}: not connected yet.`,
            )}
          />
        </section>
      </div>
    );
  }

  return (
    <div className="iris-one">
      <section className="iris-plane iris-stack">
        <p className="iris-kicker">Project · {view.context.period.label}</p>
        <h1 className="iris-section">{view.verdict}</h1>

        {/*
         * PRESENTATION DNA, REACHABLE FROM ITS OWNING CONTEXT.
         *
         * It used to be a tab shown on Sales Flow and Sales Agents, sections it
         * does not belong to — see the docblock in Shell.tsx's `rowFor`. What
         * it measures is how THIS project's own presentations differ from one
         * another, so this is where it belongs: a plain link rather than
         * styled prose, because this page is converted onto the current
         * system in full shortly and a legacy sheet is not worth designing
         * for twice.
         *
         * `.iris-action` is `white-space: nowrap` by design — it is a pill,
         * not a sentence — so the label stays as short as the "Build an
         * audience from this" pill already on this page, rather than the full
         * sentence a first pass gave it, which held its line past 390px.
         */}
        <p className="iris-meta iris-actions">
          <Link
            className="iris-action"
            href={dynamicRoute(`/${tenantSlug}/${projectSlug}/presentation`)}
          >
            Presentation DNA →
          </Link>
          {/*
           * THE REPORT, REACHED FROM THE SCREEN WHOSE FIGURES IT PRINTS.
           *
           * The page is the document (M4's internal sales-intelligence
           * report, drawn rather than generated), and the dialog beside it
           * is where a reader sees which sections it would carry before
           * opening it. Both mount here because Project is the scope they
           * describe; Meeting Detail will mount the same dialog for one
           * meeting once the port can answer for one.
           */}
          <Link className="iris-action" href={dynamicRoute(reportHref)}>
            Report →
          </Link>
          <ExportReport report={report} pageHref={reportHref} />
        </p>

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
          {/*
            The provenance tag names the source these figures actually came
            from. A "CRM outcome" chip claimed on every project regardless of
            whether one is connected is the same lie in miniature as the
            zero-standing-in-for-unmeasured this project exists to prevent.
          */}
          {view.context.project.connectedSources.includes("crm") ? (
            <SourceChips sources={["CRM_OUTCOME_CONTEXT"]} />
          ) : null}
        </div>

        <hr className="iris-rule" />

        {/*
         * Both frames below compare the attention a segment takes with the stock
         * it holds. With no catalogue there are no segments, and drawn anyway they
         * were a scale with a legend and nothing on it, and four quadrants each
         * saying "No segment here". One sentence, in the words the plan above uses.
         */}
        {view.segments.length === 0 ? (
          <div>
            <p className="iris-kicker" style={{ marginBottom: ".875rem" }}>
              Attention against supply and conversion
            </p>
            <p className="iris-meta" style={{ maxWidth: "70ch" }}>
              Unavailable — no unit catalogue has reached this project, and both frames compare the
              attention a segment takes with the stock it holds.
            </p>
          </div>
        ) : (
          <>
            <div>
              <p className="iris-kicker" style={{ marginBottom: ".875rem" }}>
                Does attention match supply?
              </p>
              <ParityScale
                rows={view.segments.map((s) => ({
                  id: s.id,
                  label: s.label,
                  index: s.index,
                  /* The read model's own display strings: locale, and "<1%" for a share that rounds away. */
                  note: `${s.attentionShareDisplay} of looking time on ${s.stockShareDisplay} of stock`,
                }))}
              />
            </div>

            <hr className="iris-rule" />

            {/*
             * THE ATTENTION × CONVERSION MATRIX, docs/02-views.md §4.2: "the single
             * most actionable frame in the product". Each cell is a segment, not a
             * unit, so it maps onto a marketing decision; a segment the read model
             * would not place is listed under the frame with its reason.
             */}
            <div>
              <p className="iris-kicker" style={{ marginBottom: ".875rem" }}>
                Attention against conversion
              </p>
              <QuadrantMatrix
                locale={view.context.project.locale}
                rows={view.segments.map((s) => ({
                  id: s.id,
                  label: s.label,
                  index: s.index,
                  share: s.conversion.share,
                  projectShare: s.conversion.projectShare,
                  decided: s.conversion.decided,
                  quadrant: s.conversion.quadrant,
                  withheld: s.conversion.withheld,
                  href: qs(s.id),
                }))}
              />
              <p className="iris-meta" style={{ marginTop: ".75rem", maxWidth: "70ch" }}>
                {view.matrixNote}
              </p>
              <SourceChips
                sources={
                  view.context.project.connectedSources.includes("crm")
                    ? ["IRIS_SHOWROOM_DERIVED", "CRM_OUTCOME_CONTEXT"]
                    : ["IRIS_SHOWROOM_DERIVED"]
                }
              />
            </div>
          </>
        )}

        {/* A tab list with no tabs is a control that does nothing, so none is drawn. */}
        {view.segments.length === 0 ? null : (
          <>
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
          </>
        )}

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
                  }))}
                  of={`Each rate is of the unit openings in these meetings: ${segment.unitsOpened} openings of ${segment.label.toLowerCase()} units on the left, ${segment.otherUnitsOpened} of other units on the right.`}
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
              {/*
               * Place names are long — "Základná škola Ružová dolina 29" needs
               * 192px and the default label column is 136px, so two of six
               * names clipped at every width, with a title that named the
               * category rather than the place. The wide-label column the
               * transition bars already use holds every name here; below the
               * width that column fits, the name wraps instead of clipping.
               */}
              <div className="iris-bars" data-wide-labels="true">
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
                    <span className="iris-bar-value">{a.shareDisplay}</span>
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
                  segment.rooms === null
                    ? `/${tenantSlug}/${projectSlug}/audience`
                    : `/${tenantSlug}/${projectSlug}/audience?rooms=${String(segment.rooms)}`,
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
                {/* The column head is beside every figure in the column: the set is stated once, visibly. */}
                <span style={{ textAlign: "right" }}>{applicationsHead}</span>
                <span style={{ textAlign: "right" }}>{matchesHead}</span>
              </div>
              {view.demand.slice(0, 10).map((d) => (
                <div
                  className="iris-matrix-row"
                  key={`${d.field}-${d.value}`}
                  data-empty={d.matches === 0 ? "true" : undefined}
                >
                  <span className="iris-bar-label" title={d.label} data-label="Filter">
                    {d.label}
                  </span>
                  <span className="iris-bar-label" title={d.value} data-label="Value">
                    {d.value}
                  </span>
                  <span className="iris-matrix-num" data-label={applicationsHead}>
                    {d.applications}
                  </span>
                  <span
                    className="iris-matrix-num"
                    data-zero={d.matches === 0 ? "true" : undefined}
                    data-label={matchesHead}
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
                  <span className="iris-bar-label" title={c.label}>
                    {c.label}
                  </span>
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
                  <span className="iris-bar-value">{c.shareDisplay}</span>
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
            Ordered by total time. Amenities inside the building are recorded today; points of
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
          <FlowScroller label="How far a presentation gets">
            <JourneyFlow stages={charts.journey.stages} links={charts.journey.links} />
          </FlowScroller>
          <p className="iris-meta" style={{ marginTop: ".75rem" }}>
            {charts.journey.note}
          </p>
          <SourceChips sources={["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED"]} />
        </div>

        <hr className="iris-rule" />

        {view.findings.map((finding, index) => (
          <Finding key={finding.id} finding={finding} lead={index === 0} plane />
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
