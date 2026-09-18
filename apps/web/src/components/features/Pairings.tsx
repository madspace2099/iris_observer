import { sectionLabel } from "@observer/contracts";
import type { FeaturePairing, PeriodPreset } from "@observer/readmodels";

import { DataTable, Sources, Tier, type DataRow } from "@/components/product";
import { Count } from "./Reading";
import { liftDisplay } from "./vocabulary";

/**
 * WHICH FEATURES TRAVEL TOGETHER.
 *
 * Two sections that appear in the same presentation more often than independent
 * use would produce are, as often as not, one argument in the presenter's head:
 * the aspect and the view, the plan and the shortlist. That is worth knowing,
 * and it is worth knowing at the exact strength the data supports and no more.
 *
 * ## What this may say, and what it may never say
 *
 * `lift` is co-occurrence WITHIN a presentation. It carries no order, so it
 * cannot support a sentence about one feature leading to another, and it
 * carries no counterfactual, so it cannot support a sentence about one feature
 * producing an outcome. The tier is therefore `statistical_association`, drawn
 * as the dashed chip the stylesheet reserves for exactly that claim, and the
 * caveat under the table says the same thing in words for a reader who does not
 * read chips.
 *
 * Observer produces no causal tier and this component could not render one if a
 * read model handed it one: `Tier` returns nothing for `causal_claim`.
 *
 * ## The rows are the read model's, in the read model's order
 *
 * `getStorytelling` filters to pairs seen together in at least five
 * presentations and returns the strongest eight, ordered. Both decisions are
 * the read model's and neither is repeated here — a second threshold in the
 * screen would be a second policy the day somebody changes the first one.
 *
 * ## Below the minimum sample this is not reported at all
 *
 * A table of pairs ordered by strength of association IS a ranking, and the
 * page rule is that below `AGENT_MIN_SAMPLE` there is no verdict, no rank and
 * no trend. It applies here more sharply than anywhere else on the screen: a
 * lift is a ratio of two small counts, and at fifteen presentations one meeting
 * moving from one pair to another shifts an index by a whole step. Showing the
 * table with a caveat beside it would put the most confident-looking figure on
 * the screen exactly where it is least supported.
 *
 * So the region states the refusal instead, in a `.ox-result` panel rather than
 * a dashed empty slot: "nothing is reported at this sample" is a statement, and
 * a dashed slot would say the panel failed to fill.
 */
export function Pairings({
  pairings,
  meetingsTotal,
  period,
  periodLabel,
  ranked,
  minimumSample,
}: {
  readonly pairings: readonly FeaturePairing[];
  /** Presentations in the period. The denominator every pair is counted out of. */
  readonly meetingsTotal: number;
  readonly period: PeriodPreset;
  readonly periodLabel: string;
  /** Whether the sample supports an association at all. Decided by the screen. */
  readonly ranked: boolean;
  readonly minimumSample: number;
}) {
  if (!ranked) {
    return (
      <p className="ox-result">
        <span className="ox-chip" data-tone="none">
          <span className="ox-chip-mark" aria-hidden="true" />
          Not reported
        </span>
        <span>
          Co-occurrence between features is not reported at this sample. {meetingsTotal}{" "}
          presentations is short of the {minimumSample} this product holds to before it will state
          an association, and a figure of this kind moves by a whole step when one presentation
          falls the other way.
        </span>
      </p>
    );
  }

  const rows: readonly DataRow[] = pairings.map((pairing) => ({
    key: `${pairing.a}-${pairing.b}`,
    cells: {
      pair: `${sectionLabel(pairing.a)} and ${sectionLabel(pairing.b)}`,
      together: <Count n={pairing.together} of={meetingsTotal} />,
      lift: liftDisplay(pairing.lift),
    },
  }));

  return (
    <>
      <DataTable
        caption={`Features reached in the same presentation, ${periodLabel}. A pair appears here once it has been seen together in at least five presentations; the strongest eight are listed.`}
        columns={[
          { key: "pair", label: "Pair" },
          { key: "together", label: "Presentations with both", numeric: true },
          { key: "lift", label: "Against chance", numeric: true },
        ]}
        rows={rows}
        codeColumn="pair"
        period={period}
        empty={{
          title: "No pair reached the reporting threshold",
          note: "No two features were reached together in at least five presentations in this period. That is the read model's answer, and it is a statement about how few presentations combined them rather than a gap in the data.",
        }}
      />

      <p className="ox-section-note">
        1.00&times; is what independent use of the two features would produce. A figure above it
        says the two were reached together more often than that, at the sample stated in the
        caption. It is co-occurrence inside one presentation: it carries no order between the two
        features and no claim about what either one did to the buyer.
      </p>

      <div className="ox-finding-foot">
        <Tier tier="statistical_association" />
        <Sources sources={["IRIS_SHOWROOM_DERIVED"]} />
      </div>
    </>
  );
}
