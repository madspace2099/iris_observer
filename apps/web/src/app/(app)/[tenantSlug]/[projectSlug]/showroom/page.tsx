import type { Metadata } from "next";
import Link from "next/link";
import { defineMeasurement, type ShowroomSignal } from "@observer/readmodels";

import {
  Evidence,
  PageHead,
  Sample,
  Sources,
  StackPlan,
  Synthetic,
  Tally,
  TallyItem,
} from "@/components/product";
import { requireSurface } from "@/lib/authz";
import { dynamicRoute } from "@/lib/href";
import { presetFrom, withPeriod } from "@/lib/period";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";

export const metadata: Metadata = { title: "Briefing" };

/**
 * THE BRIEFING — the verdict, what it rests on, and the building it is about.
 *
 * It is no longer the landing surface. ADR-0033 put a question there instead,
 * and the briefing became something Ask IRIS names: the answer sheet behind
 * "how are we doing", reachable by address so it can be linked, sent and
 * returned to. `surfaces.test.ts` holds that arrangement in `reachedFromAView`,
 * and the breadcrumb says it to the reader.
 *
 * ## What was removed, and why removing it was the point
 *
 * This screen used to open with a full-width assistant console: a 330px orb, a
 * prompt, and above them a greeting reading "GOOD MORNING, PETRA" at display
 * size. Two separate items on the doctrine's anti-slop list — giant greeting
 * copy, and that exact phrase — were on the product's first screen at once.
 *
 * Nothing was lost by taking it out. Ask IRIS is a section in the header and the
 * Observer rail is rendered by the project layout on every surface, so asking is
 * available from here exactly as it is everywhere else; what has gone is a
 * second, larger copy of it sitting on top of the measurements, and a sentence
 * about the time of day standing where a verdict belongs. Everything this screen
 * MEASURED is still here, and there is now more of it.
 *
 * ## The composition, and the seam through the middle of it
 *
 * ADR-0034 divides by content: above the seam what we conclude and what a reader
 * may do, below it what was measured.
 *
 *   graphite  the verdict, the clause it rests on, and the one thing worth
 *             acting on today.
 *   paper     the three figures, and the building.
 *   graphite  the three doors.
 *
 * ## Why the building is on this screen
 *
 * Project Pulse is Observer's ground: a spatial abstraction built from the unit
 * catalogue and observed interest, with nothing invented for the picture. A
 * verdict, three figures and three doors is a briefing about anything; a
 * briefing with the stack plan under it is a briefing about a building, and the
 * final test of every screen in this product is that with the logo hidden it
 * still reads as real-estate spatial sales intelligence.
 *
 * It is a second read-model call and not a join (ADR-0012). Each region draws
 * one read model whole: the figures come from `getHome`, the building comes from
 * `getProjectPulse`, and no figure on this page is derived from the other's
 * data. The only arithmetic in this file is `Object.fromEntries` assembling unit
 * routes, which is address-building rather than measurement.
 *
 * ## The one absence this screen cannot draw properly
 *
 * `HomeFigure` carries a formatted `value` and no `MetricState`, so the four
 * absences — empty, insufficient, unavailable, error — cannot be told apart
 * here the way `Figure` tells them apart everywhere else. The read model
 * already refuses to print a zero it does not mean: a project with no CRM gets
 * an em dash and the words "no outcome recorded on this project" beside it,
 * which is why rendering `value` verbatim is safe today. It is reported as a
 * gap all the same — the figure that should be a `MetricValue` is the one the
 * whole state machine exists for.
 */

/**
 * The signal, as a word and a shape as well as a tone.
 *
 * Three states rather than a score: a number between 0 and 100 invites the
 * reader to watch it move by a point, and a word makes them ask why. The chip's
 * mark is a different SHAPE per tone, which is what survives a greyscale print
 * and a reader who cannot separate the two hues.
 */
const SIGNAL_LABELS: Readonly<Record<ShowroomSignal, string>> = {
  good: "On course",
  attention: "Needs a look",
  poor: "Going the wrong way",
};

const SIGNAL_TONES: Readonly<Record<ShowroomSignal, string>> = {
  good: "good",
  attention: "watch",
  poor: "poor",
};

export default async function BriefingPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const viewer = await requireViewer();
  const { tenantSlug, projectSlug } = await params;
  const root = `/${tenantSlug}/${projectSlug}`;
  // Declared in SURFACES, enforced here — a hidden link is not access control.
  requireSurface(viewer, "showroom", root);
  const period = presetFrom((await searchParams).period);

  const query = { viewer, tenantSlug, projectSlug, period };
  const [home, pulse] = await Promise.all([
    repository.getHome(query),
    repository.getProjectPulse(query),
  ]);

  /*
   * Where each cell of the stacking plan goes.
   *
   * A resolved map rather than a lookup function, following `StackPlan`'s own
   * contract and `UnitMatrix` before it: a function prop cannot cross into a
   * client component, so a primitive that takes one breaks at the boundary
   * rather than at the call site. A unit missing from the map is drawn as a
   * plain cell rather than as a link to nowhere.
   */
  const unitHrefs = Object.fromEntries(
    pulse.floors.flatMap((floor) =>
      floor.units.map((unit) => [unit.unitId, `${root}/units/${unit.code}`] as const),
    ),
  );

  return (
    <div className="ox-page">
      <PageHead
        period={period}
        crumbs={[{ label: "Ask IRIS", href: `${root}/ask` }, { label: "Briefing" }]}
        kicker={`${home.context.project.name} · ${home.context.period.label}`}
        title="Briefing"
        answer={home.verdict}
        lede={home.because}
        aside={
          <>
            <span className="ox-chip" data-tone={SIGNAL_TONES[home.signal]}>
              <span className="ox-chip-mark" aria-hidden="true" />
              {SIGNAL_LABELS[home.signal]}
            </span>
            <Synthetic />
          </>
        }
      />

      <div className="ox-body">
        {/* --- the one thing worth acting on. A decision, so: graphite. --- */}
        <section className="ox-plane">
          <div className="ox-section-head">
            <h2 className="ox-section-title">Worth acting on</h2>
            <p className="ox-section-note">
              One thing, or none. The read model does not manufacture a second, and neither does
              this screen.
            </p>
          </div>

          {home.alert === null ? (
            <div className="ox-result">
              <span className="ox-chip" data-tone="good">
                <span className="ox-chip-mark" aria-hidden="true" />
                Clear
              </span>
              <span>Nothing in this period is waiting on a decision from you.</span>
            </div>
          ) : (
            /*
             * Stated, not alarmed. `ShowroomHome.alert` carries a sentence and a
             * route and no severity, so drawing it on the attention rail would
             * mean this screen choosing how loud it is — and the one red in this
             * system is reserved for a record going missing right now, which is
             * a judgement the attention read model makes and this one does not.
             */
            <div className="ox-result">
              <span>{home.alert.text}</span>
              <Link
                className="ox-btn"
                href={dynamicRoute(withPeriod(home.alert.href, period))}
                data-weight="primary"
              >
                Look at it
              </Link>
            </div>
          )}
        </section>

        {/* --- the readings. Measured, so: paper. ------------------------- */}
        <div className="ox-plate ox-paper">
          <div className="ox-plate-inner">
            <div className="ox-section-head">
              <h2 className="ox-section-title">The figures behind it</h2>
              <span className="ox-chart-period">{home.context.period.label}</span>
            </div>

            <Tally>
              {home.figures.map((figure) => {
                const definition =
                  figure.measurementId === null
                    ? undefined
                    : defineMeasurement(figure.measurementId);

                return (
                  <TallyItem
                    key={figure.id}
                    /*
                     * The definition travels with the label rather than beside
                     * it. Every figure in this product is entitled to say what
                     * it measures, and the affordance that does that visually —
                     * the glossary's own info control — belongs to the older
                     * component sheet and would put an icon beside every label
                     * in a three-cell row. Until the `ox-` vocabulary has one,
                     * the definition is carried to hover and to a screen reader,
                     * and the missing affordance is reported.
                     */
                    label={
                      definition === undefined ? (
                        figure.label
                      ) : (
                        <span title={definition.whatItMeasures}>
                          {figure.label}
                          <span className="ox-sr">
                            {" "}
                            — {definition.whatItMeasures} {definition.howItIsComputed}
                          </span>
                        </span>
                      )
                    }
                    value={
                      <span className="ox-value">
                        <span className="ox-figure">{figure.value}</span>
                      </span>
                    }
                    /*
                     * THE COMPARISON GOES IN THE QUALIFIER SLOT, NOT THE DELTA
                     * SLOT, AND THAT IS A WIDTH DECISION RATHER THAN A
                     * SEMANTIC ONE.
                     *
                     * `.ox-delta` is written for a compact string — "+18%",
                     * "−4 days" — and sets `white-space: nowrap` so a movement
                     * never breaks across two lines. `HomeFigure.against` is not
                     * that: it is a whole clause, "34% in the previous period",
                     * "no earlier period to compare", "of 74 meetings". At 390px
                     * the tally is two columns, and a nowrap clause in a 110px
                     * cell is clipped by the tally's own `overflow: hidden` —
                     * the reader was shown "34% in the previous", with the word
                     * that says which period silently cut off.
                     *
                     * `.ox-of` is the denominator-and-qualifier treatment beside
                     * a figure, it wraps, and it is exactly what these clauses
                     * are. What is lost is the delta's arrow and its hue; what
                     * that channel was carrying on this screen is already
                     * carried, once and better, by the signal chip beside the
                     * title. A comparison that cannot be read at all is a worse
                     * failure than one that is not coloured.
                     *
                     * The gap is reported: either the sheet needs a comparison
                     * class that wraps, or `HomeFigure` needs the compact
                     * `deltaDisplay` that `MetricComparison` already has.
                     */
                    evidence={
                      figure.against === null ? null : (
                        <span className="ox-of">{figure.against}</span>
                      )
                    }
                  />
                );
              })}
            </Tally>

            <div className="ox-finding-foot">
              <Sources sources={home.sources} />
              <Evidence evidence={home.evidence} period={period} />
              <Sample n={home.meetingCount} noun="presentations" />
            </div>
          </div>
        </div>

        {/* --- the building. Also measured, and the reason this reads as
             real estate rather than as a dashboard about one. ------------- */}
        <div className="ox-plate ox-paper">
          <div className="ox-plate-inner">
            <div className="ox-section-head">
              <h2 className="ox-section-title">{pulse.buildingLabel}</h2>
              <span className="ox-chart-period">{pulse.context.period.label}</span>
            </div>

            <StackPlan
              floors={pulse.floors}
              unitHrefs={unitHrefs}
              period={period}
              buildingLabel={pulse.buildingLabel}
              peakViews={pulse.peakViews}
            />

            <p className="ox-section-note">
              {pulse.totals.units} units · {pulse.totals.available} available ·{" "}
              {pulse.totals.reserved} reserved · {pulse.totals.sold} sold,{" "}
              {pulse.totals.soldInPeriod} of them in this period. Every cell opens the unit&rsquo;s
              own page.
            </p>

            <div className="ox-finding-foot">
              <Evidence evidence={pulse.evidence} period={period} />
            </div>
          </div>
        </div>

        {/* --- where to look next. Each door carries what is behind it. --- */}
        <nav className="ox-plane" aria-label="Views">
          <div className="ox-section-head">
            <h2 className="ox-section-title">Where to look next</h2>
            <p className="ox-section-note">
              Each of the three carries the most useful thing behind it, already computed, so
              choosing is a decision rather than a guess at a label.
            </p>
          </div>

          <ul className="ox-list">
            {home.doors.map((door) => (
              <li className="ox-row" key={door.id}>
                <div>
                  <h3 className="ox-row-name">
                    <Link href={dynamicRoute(withPeriod(door.href, period))}>{door.label}</Link>
                  </h3>
                  <p className="ox-alert-detail">{door.headline}</p>
                  <p className="ox-row-meta">{door.question}</p>
                </div>

                <Link className="ox-btn" href={dynamicRoute(withPeriod(door.href, period))}>
                  Open {door.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
