import type { Metadata } from "next";
import { CORE_SECTION_IDS, SHOWROOM_SECTIONS } from "@observer/contracts";
import { AGENT_MIN_SAMPLE } from "@observer/metrics";
import { nothingReceivedYet } from "@observer/readmodels";

import { requireSurface } from "@/lib/authz";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import { presetFrom } from "@/lib/period";
import {
  Evidence,
  FindingList,
  PageHead,
  Sample,
  Sources,
  Tabs,
  Tally,
  TallyItem,
  Unavailable,
  type TabItem,
} from "@/components/product";
import {
  Environment,
  FEATURE_CUTS,
  FeatureRegister,
  KeyCount,
  Limits,
  Pairings,
  REGISTER_ORDERS,
  RunningOrder,
  applyCut,
  cutFrom,
  directionFrom,
  orderFrom,
  orderSections,
  type FeatureCut,
  type OrderDirection,
  type RegisterOrder,
} from "@/components/features";

export const metadata: Metadata = { title: "Features" };

/**
 * FEATURES — which parts of the building carry the argument.
 *
 * The fourth face of Project, beside Overview, Units and Meetings. It succeeds
 * Storytelling, which now permanently redirects here: the old name described
 * the presentation, and what the analysis is actually about is the FEATURES a
 * presentation reaches for and what they do to a buyer's attention.
 *
 * The audience is two-sided in a way no other screen here is. A developer wants
 * to know which parts of their building are carrying the sale. MADSPACE wants
 * to know which parts of IRIS are earning their build cost. The same nine
 * features answer both, which is why this screen reports usage rather than
 * grading it.
 *
 * ## The distinction the rename existed to protect
 *
 * REACHED is not PRESENTED. The legacy dashboard collapsed the two and graded
 * one click as "High" engagement, and a usage screen that repeats that mistake
 * is worse than no usage screen, since it converts a vanity metric into a
 * decision about what to build next. So every feature is reported four ways at
 * once — how many presentations opened it, how many times it was entered, how
 * long a stop lasted, and how often a stop ended almost immediately — and the
 * fourth of those is what stops the first from being read as engagement.
 *
 * ## What this screen refuses to say, and where it says so
 *
 * Three refusals, each enacted rather than merely intended:
 *
 *   **Nothing is called underused.** That needs an expectation to fall short
 *   of, and no target for a feature exists anywhere in this product. The
 *   register is ordered by reach and the bottom of it is visible.
 *
 *   **No zero stands in for a missing measurement.** `SectionUsage` divides by
 *   `max(1, …)` so its own arithmetic cannot produce a `NaN`, and the price is
 *   that an unopened or untimed feature arrives carrying `0` in three fields.
 *   `stayOf`, `glanceIsMeasured` and `returnIsMeasured` sort the readings from
 *   the placeholders, and the placeholders render as the sheet's missing mark
 *   with the reason attached.
 *
 *   **Below {@link AGENT_MIN_SAMPLE} presentations there is no rank.** Not a
 *   softened rank, and not a rank with a warning beside it: the running-order
 *   chart is not drawn, the register offers no ordering of its own, the
 *   environment counts are registers rather than ordered bars, and the answer
 *   at the top of the screen states the shortfall instead of naming a most-used
 *   feature. One rule, applied to every ordered thing on the page.
 *
 * ## Two grounds
 *
 * Everything concluded is on graphite — the answer, the findings, the limits of
 * the instrument. Everything counted is on the paper plates: the register, the
 * co-occurrences, the environment. A reader can tell what was measured from
 * what was concluded without a label, which is the whole argument of ADR-0034.
 *
 * ## The cut and the order live in the URL
 *
 * Both are links. A reader who cut the register to the features nobody opened
 * and sent that screen to a colleague is sending the cut as well; there is no
 * browser storage anywhere in this application, so state that is not in the
 * query string does not survive being shared or refreshed.
 */
export default async function FeaturesPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string }>;
  searchParams: Promise<{
    period?: string;
    cut?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const viewer = await requireViewer();
  const { tenantSlug, projectSlug } = await params;
  const root = `/${tenantSlug}/${projectSlug}`;
  // Declared in SURFACES, enforced here — a hidden link is not access control.
  requireSurface(viewer, "features", root);

  const query = await searchParams;
  const period = presetFrom(query.period);
  const cut: FeatureCut = cutFrom(query.cut);
  const chosenOrder: RegisterOrder | null = orderFrom(query.sort);
  const direction: OrderDirection = directionFrom(query.dir);

  const view = await repository.getStorytelling({ viewer, tenantSlug, projectSlug, period });

  /*
   * THE DENOMINATOR OF THE WHOLE SCREEN, AND WHERE IT COMES FROM.
   *
   * Every reach on this page is a count out of the presentations recorded in
   * the period, and `environment.meetingsTotal` is that number — the same `n`
   * the read model divides by to produce every rate it returns. It is read
   * rather than derived: counting the sections, folding the rows or reading it
   * off a rate would each be this page computing a figure the read model
   * already publishes, which is the thing ADR-0012 forbids.
   *
   * Its home under `environment` is an accident of where the field was first
   * needed and is reported as one. `StorytellingIntelligence.evidence.
   * observationCount` carries the same figure, and a `meetingsTotal` at the top
   * of the view would settle which of the two a screen is supposed to read.
   */
  const meetingsTotal = view.environment.meetingsTotal;
  const recorded = meetingsTotal > 0;

  /*
   * The one gate, and everything ordered on this screen answers to it.
   *
   * `docs/10-policies.md` §6 sets the minimum; below it there is no verdict, no
   * rank and no trend. A ranked list of features is the most persuasive thing
   * this screen can draw and the easiest one to draw from nine meetings.
   */
  const ranked = meetingsTotal >= AGENT_MIN_SAMPLE;

  const leader = view.sections[0];
  const untimed = view.sections.filter(
    (section) => section.meetings > 0 && section.availability !== "legacy_available",
  );
  const noBaseline = view.sections.some((section) => section.adoption === "no_baseline");
  const anyNew = view.sections.some((section) => section.adoption === "new_in_period");

  const base = `${root}/features`;

  /**
   * A link to this screen in a different cut or a different order.
   *
   * The period is deliberately NOT set here. `Tabs` and `DataTable` both put
   * every href they render through `withPeriod`, so adding it a second time
   * would duplicate the parameter, and leaving it to those components is what
   * keeps the rule in one place.
   */
  const link = (next: {
    readonly cut?: FeatureCut;
    readonly order?: RegisterOrder | null;
    readonly direction?: OrderDirection;
  }): string => {
    const params = new URLSearchParams();
    const nextCut = next.cut ?? cut;
    if (nextCut !== "all") params.set("cut", nextCut);
    const nextOrder = next.order === undefined ? chosenOrder : next.order;
    if (nextOrder !== null) {
      params.set("sort", nextOrder);
      const nextDirection = next.direction ?? direction;
      if (nextDirection === "ascending") params.set("dir", "asc");
    }
    const search = params.toString();
    return search === "" ? base : `${base}?${search}`;
  };

  const tabs: readonly TabItem[] = FEATURE_CUTS.map((item) => ({
    key: item.key,
    label: item.label,
    href: link({ cut: item.key }),
    current: item.key === cut,
  }));

  /*
   * The sort links, built here and handed to the register already assembled.
   *
   * A column the reader is already sorted by toggles; every other column opens
   * descending, apart from the feature name, where ascending is the order a
   * reader means by "sort by name". Below the minimum sample the whole map is
   * `null` and the headers become plain text — a disabled sort control would be
   * a control that looks ready and does nothing.
   */
  const sortHrefs: Record<string, string> = {};
  if (ranked) {
    for (const key of REGISTER_ORDERS) {
      const first: OrderDirection = key === "feature" ? "ascending" : "descending";
      sortHrefs[key] = link({
        order: key,
        direction:
          chosenOrder === key ? (direction === "ascending" ? "descending" : "ascending") : first,
      });
    }
  }

  const rows = orderSections(applyCut(view.sections, cut), ranked ? chosenOrder : null, direction);

  /*
   * What an empty cut means, per cut.
   *
   * Every one of these is a real answer rather than a hole. "Every feature was
   * opened at least once" is one of the more useful things this register can
   * say, and drawing it as a blank table would say the opposite.
   */
  const CUT_EMPTY: Readonly<Record<FeatureCut, { title: string; note: string }>> = {
    all: {
      title: "No feature is instrumented for this project",
      note: "The showroom reported no feature vocabulary for this project, which is a configuration state rather than a reading.",
    },
    new: {
      title: noBaseline ? "Adoption cannot be answered for this period" : "Nothing is new",
      note: noBaseline
        ? `This period has no period before it in the data, so no feature can be reported as newly adopted. A feature absent from an empty baseline would otherwise be reported as new, which is the most flattering possible reading of having no history.`
        : `Every feature reached in this period was already being reached in ${view.context.period.baselineLabel}.`,
    },
    unopened: {
      title: "Every feature was opened at least once",
      note: `No feature in the showroom vocabulary went unreached across the ${meetingsTotal} presentations recorded in this period.`,
    },
    untimed: {
      title: "Every feature opened here carried a recorded stay",
      note: "The showroom build in use emits a timing event for every feature it presented in this period, so no stay on this screen is missing for want of an instrument.",
    },
  };

  const baselineNote = noBaseline
    ? `This period has no period before it in the data, so no feature is reported as newly adopted. A feature absent from an empty baseline would otherwise be reported as new.`
    : anyNew
      ? `A feature is newly adopted when it was reached in this period and in none of ${view.context.period.baselineLabel}. Those features carry a chip in the register.`
      : `No feature was reached in this period that went unreached in ${view.context.period.baselineLabel}. Every feature in the register was already in use.`;

  /* A real project's first day is one presentation, and that is when this sentence is read. */
  const recordedWords =
    meetingsTotal === 1
      ? "One presentation was recorded"
      : `${meetingsTotal} presentations were recorded`;

  const answer = !recorded
    ? (nothingReceivedYet(view.context) ??
      "No presentation was recorded in this period, so no feature was opened. That is the period's answer rather than a gap in it.")
    : !ranked
      ? `${recordedWords} in this period, short of the ${AGENT_MIN_SAMPLE} this product holds to before it will rank or compare features. Every figure below stands as a count, in the order the read model returned it.`
      : leader === undefined
        ? `${recordedWords} in this period and the showroom reported no feature vocabulary for ${meetingsTotal === 1 ? "it" : "them"}.`
        : `${leader.label} was opened in ${leader.meetings} of the ${meetingsTotal} presentations recorded in this period, and nothing else was reached more often.`;

  return (
    <div className="ox-page">
      <PageHead
        kicker={`${view.context.project.name} · Project · ${view.context.period.label}`}
        title="Features"
        answer={answer}
        lede="A feature is a named section of the IRIS presentation. Reached is not the same as presented: a section opened on the way somewhere else and left under the showroom's meaningful-dwell threshold counts here as an open and as a glance, and never as engagement."
        crumbs={[
          { label: view.context.project.name, href: `${root}/project` },
          { label: "Features" },
        ]}
        aside={
          <>
            <Sample n={meetingsTotal} noun="presentations" />
            <Evidence evidence={view.evidence} period={period} />
          </>
        }
        period={period}
      />

      <div className="ox-body">
        {/* --- what the period was, before anything is read off it ---------- */}

        <section className="ox-plane">
          <div className="ox-section-head">
            <h2 className="ox-section-title">The period, and the instrument</h2>
            <p className="ox-section-note">
              What was recorded, and how much of IRIS there was to record it from.
            </p>
          </div>

          <Tally>
            <TallyItem
              label="Presentations recorded"
              value={<KeyCount n={meetingsTotal} />}
              evidence={<Evidence evidence={view.evidence} period={period} />}
            />
            <TallyItem
              label="Features IRIS can present"
              value={<KeyCount n={SHOWROOM_SECTIONS.length} />}
            />
            <TallyItem
              label="Core to a complete presentation"
              value={<KeyCount n={CORE_SECTION_IDS.length} of={SHOWROOM_SECTIONS.length} />}
            />
            {/* A share of no presentations is "0 of 0", which is a denominator of nothing. */}
            {recorded ? (
              <TallyItem
                label="Presentations that moved the light or the weather"
                value={
                  <KeyCount
                    n={view.environment.meetingsUsingEnvironment}
                    of={view.environment.meetingsTotal}
                  />
                }
              />
            ) : null}
          </Tally>

          {/*
           * ONE STATEMENT FOR THE REGION, NOT ONE PER FIGURE.
           *
           * Where the build does not time a feature, every cell in that row
           * that depends on a stay already carries the terse missing mark. The
           * reason is stated once, here, which is the shape
           * `docs/12-visual-autopsy.md` §9 records after four panels in one
           * viewport each repeated the same missing source.
           *
           * No action is offered, and the omission is deliberate rather than an
           * oversight: nobody reading this screen can make a showroom build
           * emit an event it does not emit, and a control that pretended
           * otherwise would be worse than none.
           */}
          {untimed.length === 0 ? null : (
            <Unavailable
              what={`Time spent in ${untimed.map((section) => section.label).join(", ")}`}
              why="the showroom build in use does not emit a timing event for those features, so no median stay, no glance share and no ordering by stay exists for them"
              action={null}
              period={period}
            />
          )}

          <Sources sources={["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED"]} />
        </section>

        {/* --- what the read model concluded from it ------------------------ */}

        <section className="ox-plane">
          <div className="ox-section-head">
            <h2 className="ox-section-title">What stands out</h2>
          </div>
          <FindingList
            findings={view.findings}
            period={period}
            sampleNoun="presentations"
            emptyNote="No finding was produced for this period. That is the read model's answer about the features, not a gap in it."
          />
        </section>

        {/* --- the measured body, on paper --------------------------------- */}

        {/*
         * With no presentation there is no register to read: every row was "0 of
         * 0, not reached", nine times over, which is one fact repeated until it
         * looks like data. It is stated once, above, as the page's answer.
         */}
        <div className="ox-plate ox-paper" hidden={!recorded}>
          <section className="ox-plate-inner">
            <div className="ox-section-head">
              <h2 className="ox-section-title">The feature register</h2>
              <Sample n={meetingsTotal} noun="presentations" />
            </div>

            <p className="ox-section-note">
              Opened in counts the presentations that reached a feature at all. Opens counts entries
              into it, returns included, so one presentation that came back to Residences four times
              is one presentation and four opens. Median stay is the middle stop, not the average
              one. Opened, left is the share of the timed opens that ended under the
              showroom&rsquo;s meaningful-dwell threshold. Came back is the share of the
              presentations that reached a feature and returned to it later.
            </p>

            {recorded && ranked ? (
              <RunningOrder
                sections={view.sections}
                meetingsTotal={meetingsTotal}
                periodLabel={view.context.period.label}
              />
            ) : null}

            <Tabs label="Cut of the register" tabs={tabs} period={period} />

            <FeatureRegister
              sections={rows}
              meetingsTotal={meetingsTotal}
              period={period}
              caption={
                ranked
                  ? `Every feature of the IRIS presentation, ${view.context.period.label}. Ordered by the presentations that reached it unless a column heading says otherwise.`
                  : `Every feature of the IRIS presentation, ${view.context.period.label}. The register offers no ordering of its own at this sample: below ${AGENT_MIN_SAMPLE} presentations there is no rank, so the rows stand in the order the read model returned them.`
              }
              sort={ranked ? { order: chosenOrder, direction, hrefs: sortHrefs } : null}
              empty={CUT_EMPTY[cut]}
            />

            <p className="ox-section-note">
              A cell reading Not reached is a feature no presentation opened in this period; a cell
              reading Not timed is a feature the build did not record a stay in. Neither is a zero,
              and neither is ordered as one.
            </p>

            <div className="ox-finding-foot">
              <Sources sources={["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED"]} />
              <Evidence evidence={view.evidence} period={period} />
            </div>
          </section>
        </div>

        {/* --- how features combine, and the one that changes the building -- */}

        <div className="ox-plate ox-paper">
          <section className="ox-plate-inner">
            <div className="ox-section-head">
              <h2 className="ox-section-title">Which features travel together</h2>
              <Sample n={meetingsTotal} noun="presentations" />
            </div>

            <Pairings
              pairings={view.pairings}
              meetingsTotal={meetingsTotal}
              period={period}
              periodLabel={view.context.period.label}
              ranked={ranked}
              minimumSample={AGENT_MIN_SAMPLE}
            />

            <hr className="ox-rule" />

            <div className="ox-section-head">
              <h2 className="ox-section-title">Time and weather</h2>
              <p className="ox-section-note">
                The one feature that changes the building rather than the screen.
              </p>
            </div>

            <Environment
              environment={view.environment}
              period={period}
              periodLabel={view.context.period.label}
              ranked={ranked}
            />
          </section>
        </div>

        {/* --- the limits of the instrument, back on graphite --------------- */}

        <section className="ox-plane">
          <div className="ox-section-head">
            <h2 className="ox-section-title">What this register does not cover</h2>
            <p className="ox-section-note">
              Stated once, for the whole screen, where a reader who has just read the register will
              look for it.
            </p>
          </div>
          <Limits
            untimedFeatures={untimed.map((section) => section.label)}
            baselineNote={baselineNote}
          />
        </section>
      </div>
    </div>
  );
}
