import type { Metadata } from "next";
import Link from "next/link";
import { defineMeasurement, type ShowroomSignal, DEFAULT_LANGUAGE } from "@observer/readmodels";

import { InfoTip } from "@/components/iris/InfoTip";
import {
  Evidence,
  PageHead,
  Sample,
  StackPlan,
  StackPlanKey,
  Synthetic,
} from "@/components/product";
import { requireSurface } from "@/lib/authz";
import { dynamicRoute } from "@/lib/href";
import { DrawIn } from "@/showroom/DrawIn";
import { presetFrom, withPeriod } from "@/lib/period";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import "@/components/sheet/sheet.css";

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
 *   graphite  the verdict, the headline.
 *   paper     the three figures, which read first after it.
 *   graphite  the one thing worth acting on today.
 *   paper     the building.
 *   graphite  the three doors.
 *
 * ## Read at a glance (the owner, 2026-10-22, ADR-0058)
 *
 * "Simplify, less text, the rest in an info panel": the verdict is the h1, the
 * figures are drawn at the type scale's Figure size, and every explanation —
 * the clause the verdict rests on, a figure's definition, the plan's key, what
 * each door answers — is the `i` beside the title it explains. What a figure
 * is against or out of stays under it.
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
  no_verdict: "No verdict",
};

/*
 * A VERDICT NAMES WHAT IT IS MEASURED AGAINST (R02-1, Máté 2026-10-02).
 *
 * Every verdict here is a comparison with an earlier window, so the chip says
 * which and which way: "Above last month", "In line with last week". "On
 * course" stays only for a named plan and threshold, and none exists yet. When
 * meetings and their progression moved apart, the chip says so rather than
 * calling it in line.
 */
const MOVEMENT_WORDS = {
  above: "Above",
  in_line: "In line with",
  below: "Below",
  mixed: "Mixed against",
} as const;

function signalLabel(home: {
  readonly signal: ShowroomSignal;
  readonly comparedWith: string | null;
  readonly movement: keyof typeof MOVEMENT_WORDS | null;
}): string {
  return home.movement === null || home.comparedWith === null
    ? SIGNAL_LABELS[home.signal]
    : `${MOVEMENT_WORDS[home.movement]} ${home.comparedWith}`;
}

const SIGNAL_TONES: Readonly<Record<ShowroomSignal, string>> = {
  good: "good",
  attention: "watch",
  poor: "poor",
  no_verdict: "none",
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

  const query = { viewer, tenantSlug, projectSlug, period, language: DEFAULT_LANGUAGE };
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
    <div className="ox-page sheet">
      <PageHead
        language={home.context.language}
        period={period}
        crumbs={[{ label: "Ask IRIS", href: `${root}/ask` }, { label: "Briefing" }]}
        kicker={`Briefing · ${home.context.project.name} · ${home.context.period.label}`}
        /*
         * The verdict is the headline (the owner, 2026-10-22, ADR-0058), and
         * the page's name moves into the kicker, as Sales Flow's does. The
         * clause it rests on is the `i` beside the figures, which say it in
         * numbers.
         */
        title={home.verdict}
        aside={
          <>
            <span className="ox-chip" data-tone={SIGNAL_TONES[home.signal]}>
              <span className="ox-chip-mark" aria-hidden="true" />
              {signalLabel(home)}
            </span>
            <Synthetic language={home.context.language} />
          </>
        }
      />

      <div className="ox-body">
        {/*
         * --- the figures behind the verdict, at the size that reads first.
         * Measured, so: paper. Each says what it is against or out of in view;
         * what it measures is the `i` beside its name, and the clause the
         * verdict rests on and the sample are the `i` beside the title. The
         * sources stay in view, under the figures.
         */}
        <div className="ox-plate ox-paper">
          <div className="ox-plate-inner">
            <div className="ox-section-head">
              <div className="sheet-titled">
                <h2 className="ox-section-title">The figures behind it</h2>
                <InfoTip id="figures" label="the figures behind the verdict">
                  <p>{home.because}</p>
                  <p>
                    <Sample n={home.meetingCount} noun="presentations" />
                  </p>
                </InfoTip>
              </div>
            </div>

            <DrawIn kind="bloom">
              <dl className="sheet-figures">
                {home.figures.map((figure) => {
                  const definition =
                    figure.measurementId === null
                      ? undefined
                      : defineMeasurement(figure.measurementId);
                  return (
                    <div className="sheet-figure" key={figure.id}>
                      <dt>
                        {figure.label}
                        {definition === undefined ? null : (
                          <InfoTip id={`figure-${figure.id}`} label={figure.label}>
                            <p>{definition.whatItMeasures}</p>
                            <p>{definition.howItIsComputed}</p>
                          </InfoTip>
                        )}
                      </dt>
                      <dd>
                        <span className="sheet-n">{figure.value}</span>
                        {/*
                         * A whole clause — "65 last month", "of 150 meetings",
                         * "no earlier period to compare" — so it wraps under the
                         * figure rather than sitting in a nowrap delta.
                         */}
                        {figure.against === null ? null : (
                          <span className="sheet-of">
                            {figure.against}
                            {/*
                             * The unrecorded count is the whole period's, beside
                             * two figures named "this month": its window is
                             * said too (review, round 9).
                             */}
                            {figure.id === "unrecorded"
                              ? `, ${home.context.period.label.toLowerCase()}`
                              : null}
                          </span>
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </DrawIn>

            <div className="ox-finding-foot">
              <Evidence language={home.context.language} evidence={home.evidence} period={period} />
            </div>
          </div>
        </div>

        {/* --- the one thing worth acting on. A decision, so: graphite. --- */}
        <section className="ox-plane">
          <div className="ox-section-head">
            <div className="sheet-titled">
              <h2 className="ox-section-title">Worth acting on</h2>
              <InfoTip id="acting" label="what is worth acting on">
                <p>
                  One thing, or none: the first state What needs attention raised in this period. A
                  second is never manufactured to fill the space.
                </p>
              </InfoTip>
            </div>
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
                {home.alert.actionLabel}
              </Link>
            </div>
          )}
        </section>

        {/* --- the building. Also measured, and the reason this reads as
             real estate rather than as a dashboard about one. ------------- */}
        <div className="ox-plate ox-paper">
          <div className="ox-plate-inner">
            <div className="ox-section-head">
              <div className="sheet-titled">
                <h2 className="ox-section-title">{pulse.buildingLabel}</h2>
                {/* How the plan is drawn is the `i`; the counts stay in view. */}
                <InfoTip id="building" label="the stacking plan">
                  {pulse.totals.soldInPeriod === null ? (
                    <p>
                      The counts are the building as it stands. Sales within this period are not
                      observed yet.
                    </p>
                  ) : null}
                  <StackPlanKey peakViews={pulse.peakViews} />
                  <p>Every cell opens the unit&rsquo;s own page.</p>
                </InfoTip>
              </div>
            </div>

            <p className="sheet-line">
              {pulse.totals.units} units · {pulse.totals.available} available ·{" "}
              {pulse.totals.reserved} reserved · {pulse.totals.sold} sold
              {/*
               * Under a period's kicker "19 sold" would read as the period's
               * sales, so where those are not observed the count says "to
               * date" in view, and the building's `i` says why.
               */}
              {pulse.totals.soldInPeriod === null
                ? " to date"
                : `, ${pulse.totals.soldInPeriod} of them in this period`}
            </p>

            <DrawIn kind="floors">
              <StackPlan
                language={home.context.language}
                floors={pulse.floors}
                unitHrefs={unitHrefs}
                period={period}
                buildingLabel={pulse.buildingLabel}
                peakViews={pulse.peakViews}
                keyed={false}
              />
            </DrawIn>

            <div className="ox-finding-foot">
              <Evidence
                language={home.context.language}
                evidence={pulse.evidence}
                period={period}
              />
            </div>
          </div>
        </div>

        {/* --- where to look next. Each door carries what is behind it. --- */}
        <nav className="ox-plane" aria-label="Views">
          <div className="ox-section-head">
            <div className="sheet-titled">
              {/*
               * The doors' figures are the selected period's, and the figures
               * above compare two months: "55% progressing" below "54%" read
               * as a contradiction until the window was named where they meet.
               */}
              {/* The window is one phrase: at 360 "Quarter to / date" broke mid-label (round 9). */}
              <h2 className="ox-section-title">
                Where to look next ·{" "}
                <span style={{ whiteSpace: "nowrap" }}>{home.context.period.label}</span>
              </h2>
              <InfoTip id="doors" label="where to look next">
                {home.doors.map((door) => (
                  <p key={door.id}>
                    <b>{door.label}.</b> {door.question}
                  </p>
                ))}
              </InfoTip>
            </div>
          </div>

          {/*
           * One way in per door (ADR-0058): the name is a heading, the button
           * the door, so a reader tabs once per view rather than twice to the
           * same place.
           */}
          <ul className="ox-list">
            {home.doors.map((door) => (
              <li className="ox-row sheet-door" key={door.id}>
                <div>
                  <h3 className="ox-row-name">{door.label}</h3>
                  <p className="sheet-door-headline">{door.headline}</p>
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
