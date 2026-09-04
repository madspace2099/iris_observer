import type { Metadata } from "next";

import { requireSurface } from "@/lib/authz";
import { presetFrom } from "@/lib/period";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import { FindingList, PageHead, StackPlan, Synthetic } from "@/components/product";
import {
  DemandAttention,
  UnitRegister,
  readRegisterQuery,
  type RegisterSearch,
} from "@/components/units";

export const metadata: Metadata = { title: "Units" };

/**
 * PROJECT · UNITS — the unit demand register.
 *
 * Which apartments buyers are actually looking at, what they did with each one,
 * and which of them are drawing interest that is going nowhere. It is the
 * densest surface in the product and the one that answers the developer's
 * blunt question — "what is selling itself and what is not" — with rows rather
 * than with a paragraph.
 *
 * ## The shape of the screen, and why it is in this order
 *
 * **The building, on graphite.** Forty-eight flats arranged the way they
 * physically stand, top floor first, each cell as wide as its floor area and as
 * bright as the attention it drew. It is first because it is the only thing on
 * this screen that answers "where" — the register beneath it answers "how
 * much", and a reader who meets the numbers before the building has to assemble
 * the building in their head from a floor column.
 *
 * **What is not converting, on graphite.** Two of the six attention checks ask
 * the register's own question from both ends. They are conclusions and they
 * carry actions, so they belong above the seam with everything else a reader
 * may act on.
 *
 * **The register, on paper.** Thirteen columns of measurement. ADR-0034 divides
 * this product by content rather than by page, and this is the surface the
 * paper plate was written for: every cell in it is a reading, a date, a count
 * or a price, and none of it is a conclusion.
 *
 * **The findings, on graphite.** Back above the seam, where the product states
 * what it thinks the readings mean, with the sample size and the evidence
 * beside each one.
 *
 * ## What this screen does not do
 *
 * It does not compute anything. Every figure in the register is a field on
 * `UnitAttentionRow`; the demand share is normalised by the projection and
 * labelled DERIVED where it is drawn; the two attention states are read whole
 * from `getAttention` rather than re-derived from the rows. The only arithmetic
 * on this page is counting the rows it is about to draw, which is what a filter
 * needs to be honest about what it left out.
 *
 * ## Three read models, and no join between them
 *
 * `getUnitAttention`, `getProjectPulse` and `getAttention` each answer for the
 * same project and the same period, and nothing here reads a value out of one
 * and into another. The stacking plan draws the pulse's own units, the register
 * draws the attention projection's own rows, and the alert band draws the
 * attention view's own states. Reading three surfaces is not joining them
 * (ADR-0012); the line is whether a number on screen came out of one call or
 * out of two, and none of these did.
 *
 * ## What `?unit=` does now
 *
 * It marks a row rather than opening a panel. An attention state names a flat
 * and links here with the code, and the old behaviour — a detail panel beside
 * the table — has become the flat's own page, which is linkable, sendable and
 * where the timeline, the funnel and the agents now live. A marked register is
 * never truncated, so the flat a reader was sent to look at is always drawn.
 */
export default async function UnitsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string }>;
  searchParams: Promise<RegisterSearch & { period?: string }>;
}) {
  const viewer = await requireViewer();
  const { tenantSlug, projectSlug } = await params;
  // Declared in SURFACES, enforced here — a hidden link is not access control.
  requireSurface(viewer, "units", `/${tenantSlug}/${projectSlug}`);
  const search = await searchParams;

  const period = presetFrom(search.period);
  const query = { viewer, tenantSlug, projectSlug, period };

  const [view, pulse, attention] = await Promise.all([
    /*
     * `null` rather than the marked unit.
     *
     * Passing a code makes the projection build the selected detail as well,
     * and this screen no longer draws one: a unit's own page answers for a
     * unit. The mark is a highlight on a row, which needs the code and not a
     * second projection.
     */
    repository.getUnitAttention(query, null),
    repository.getProjectPulse(query),
    repository.getAttention(query),
  ]);

  const registerQuery = readRegisterQuery(search);
  const root = `/${tenantSlug}/${projectSlug}`;
  const base = `${root}/units`;
  const periodLabel = view.context.period.label.toLowerCase();

  /*
   * The count in the answer sentence.
   *
   * `UnitAttentionView` carries findings and rows but no headline of its own,
   * so the screen states the register's subject in the shape the surface it
   * replaces already stated it. It is a count of rows rather than a metric, and
   * it is the one figure on this page the read model did not hand over —
   * reported as a gap rather than left looking like a measurement.
   */
  const opened = view.rows.filter((row) => row.meetings > 0).length;

  /*
   * Every cell in the plan is a door into a flat's own page, keyed by unit id
   * as `StackPlan` requires. A resolved map rather than a function: a function
   * cannot cross into a client component, and the primitive follows the
   * convention `UnitMatrix` established.
   */
  const unitHrefs = Object.fromEntries(
    pulse.floors.flatMap((floor) =>
      floor.units.map((unit) => [unit.unitId, `${base}/${unit.code}`]),
    ),
  );

  return (
    <div className="ox-page">
      <PageHead
        kicker={`${view.context.project.name} · Units · ${view.context.period.label}`}
        title="Unit demand register"
        answer={`${opened} of ${view.rows.length} units were opened in front of a buyer in ${periodLabel}.`}
        lede="Every flat in the catalogue, with what the showroom recorded against it. The order is yours and it is carried in the address, so the register you are reading is the register you can send. Open a unit code for what IRIS saw happen to that apartment."
        crumbs={[{ label: view.context.project.name, href: `${root}/project` }, { label: "Units" }]}
        aside={<Synthetic />}
        period={period}
      />

      <div className="ox-body">
        <section className="ox-plane">
          <div className="ox-section-head">
            <h2 className="ox-section-title">{pulse.buildingLabel}</h2>
            <p className="ox-section-note">
              The same {pulse.totals.units} flats the register below lists, arranged as the building
              rather than as a list. {pulse.totals.available} available, {pulse.totals.reserved}{" "}
              reserved, {pulse.totals.sold} sold.
            </p>
          </div>

          <StackPlan
            floors={pulse.floors}
            unitHrefs={unitHrefs}
            period={period}
            buildingLabel={pulse.buildingLabel}
            peakViews={pulse.peakViews}
          />
        </section>

        <DemandAttention
          states={attention.states}
          checks={attention.checks}
          period={period}
          meetingCount={attention.meetingCount}
          periodLabel={view.context.period.label}
        />

        {/*
         * THE PLATE. The one paper region on this screen, and the reason for it.
         *
         * A dense body of measurement reads better on warm paper inside a dark
         * frame, and the seam says which is which without a label: above it
         * what we conclude, below it what was measured. Nothing above this
         * point is a reading and nothing inside it is a verdict.
         */}
        <div className="ox-plate ox-paper">
          <div className="ox-plate-inner">
            <div className="ox-section-head">
              <h2 className="ox-section-title">The register</h2>
              <p className="ox-section-note">
                Measured in {view.context.period.label}, compared against{" "}
                {view.context.period.baselineLabel}.
              </p>
            </div>

            <UnitRegister
              rows={view.rows}
              base={base}
              query={registerQuery}
              period={period}
              periodLabel={periodLabel}
              caption={`Every unit in ${view.context.project.name}, with what buyers did with it in ${periodLabel}.`}
            />
          </div>
        </div>

        <section className="ox-plane">
          <div className="ox-section-head">
            <h2 className="ox-section-title">What the period says about the building</h2>
            <p className="ox-section-note">
              Each finding carries what it is measured against, what would make it wrong, and the
              number of meetings behind it.
            </p>
          </div>

          <FindingList
            findings={view.findings}
            period={period}
            sampleNoun="meetings"
            emptyNote="No finding was produced for the register in this period. That is the read model's answer, not a gap in it."
          />
        </section>
      </div>
    </div>
  );
}
