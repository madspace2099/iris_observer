import Link from "next/link";
import {
  INSIGHT_SOURCE_LABELS,
  isProducibleTier,
  type EvidenceTier,
  type InsightSource,
  type ProducibleEvidenceTier,
} from "@observer/contracts";
import type { EvidenceRef, PeriodPreset } from "@observer/readmodels";

import { dynamicRoute } from "@/lib/href";
import { withPeriod } from "@/lib/period";

/**
 * PROVENANCE — the two axes, rendered separately because they are separate.
 *
 * `docs/04-journey.md` and `packages/contracts/src/provenance.ts` keep apart two
 * facts about a claim that a single badge would silently merge:
 *
 *   TIER    how strong the claim is.  Observed · Attributed · Pattern.
 *   SOURCE  what kind of fact it rests on.  IRIS observed · IRIS calculated ·
 *           CRM outcome · WEBIRIS · AI interpretation.
 *
 * A surface may show one, the other or both. It may never show a single mark
 * that means both, because the confusion that produces is exactly the one the
 * separation exists to prevent: a showroom event proving a legal purchase.
 *
 * Neither label is written here as a string literal. The source words come from
 * `INSIGHT_SOURCE_LABELS` in `@observer/contracts`, which is the same map the
 * older `SourceChips` reads, so a source cannot be called two things on two
 * screens. The tier words come from {@link TIER_LABELS} below, which is the map
 * this layer owns because the contracts package deliberately carries no display
 * strings for tiers.
 *
 * ## There is no causal tier and this file cannot draw one
 *
 * `EVIDENCE_TIERS` has a fourth member, `causal_claim`. It exists so that the
 * prohibition is expressible and testable, not so that it can be rendered:
 * Observer does not produce it (`isProducibleTier`), the stylesheet declares no
 * treatment for it, and {@link Tier} returns nothing when handed one. That is a
 * deliberate silent refusal rather than a thrown error — a read model that
 * somehow produced a causal tier is a defect in the read model, and blanking a
 * badge is a far better failure on a customer screen than a crashed page that
 * takes every honest figure on it down as well.
 */

/**
 * The tier, in the reader's words.
 *
 * Three entries, keyed by `ProducibleEvidenceTier` rather than by
 * `EvidenceTier`, so that adding a renderable tier is a type error here and
 * `causal_claim` is not merely undrawn but unaddressable.
 *
 * The words are the stylesheet's own — `observer-product.css` §10 names the
 * axis "Observed · Attributed · Pattern" — so the chip and the comment that
 * explains the chip cannot drift apart.
 */
export const TIER_LABELS: Readonly<Record<ProducibleEvidenceTier, string>> = {
  observed_sequence: "Observed",
  attributed_conversion: "Attributed",
  statistical_association: "Pattern",
};

/**
 * The full sentence behind each tier word, for the chip's `title`.
 *
 * "Pattern" is short enough to be read as a hedge rather than as a statement of
 * strength, and the distance between an observation and an association is the
 * whole discipline of this product. The long form is not rendered inline
 * because it would then be repeated beside every finding on the screen; it is
 * available on hover and to a reader who asks for it.
 */
const TIER_MEANINGS: Readonly<Record<ProducibleEvidenceTier, string>> = {
  observed_sequence:
    "These facts were recorded, in this order. Nothing beyond the record is claimed.",
  attributed_conversion: "A conversion assigned under a stated attribution rule.",
  statistical_association: "Two things co-occur more often than chance at the stated sample size.",
};

/**
 * The stylesheet's spelling of a source, which is not the contract's spelling.
 *
 * `observer-product.css` §10 keys its two source treatments on
 * `data-source="ai_interpretation"` and `data-source="crm_outcome"` — lower
 * snake case, shortened, and written from the reader's side of the product.
 * `InsightSource` is the contract's spelling, SCREAMING_SNAKE with the
 * subsystem in it. They are two vocabularies for one idea and this map is the
 * only place they meet; every other file in this layer passes an `InsightSource`
 * and gets the right attribute without knowing that.
 *
 * The three kinds the sheet does not style are still given an attribute. A
 * styled-today/unstyled-tomorrow distinction is not one a component should
 * encode, and an attribute the sheet ignores costs nothing while an attribute
 * the sheet later wants and does not find costs a rendering pass.
 */
const SOURCE_TOKENS: Readonly<Record<InsightSource, string>> = {
  IRIS_SHOWROOM_OBSERVED: "iris_observed",
  IRIS_SHOWROOM_DERIVED: "iris_calculated",
  CRM_OUTCOME_CONTEXT: "crm_outcome",
  WEBIRIS_CONTEXT: "webiris",
  AI_INTERPRETATION: "ai_interpretation",
};

/**
 * How strong the claim is. One chip, never merged with a source.
 *
 * Returns nothing for `causal_claim`; see the file docblock for why that is a
 * silence rather than a throw.
 */
export function Tier({ tier }: { readonly tier: EvidenceTier }) {
  if (!isProducibleTier(tier)) return null;
  return (
    <span className="ox-tier" data-tier={tier} title={TIER_MEANINGS[tier]}>
      {TIER_LABELS[tier]}
    </span>
  );
}

/**
 * What kind of fact the claim rests on. One chip per source, in the order the
 * read model gave them.
 *
 * The order is the read model's on purpose. A finding that is observed first and
 * CRM-flavoured second is a different claim from one built the other way round,
 * and re-sorting these alphabetically would erase that.
 */
export function Sources({ sources }: { readonly sources: readonly InsightSource[] }) {
  if (sources.length === 0) return null;
  return (
    <ul className="ox-prov">
      {sources.map((source) => (
        <li className="ox-src" key={source} data-source={SOURCE_TOKENS[source]}>
          {INSIGHT_SOURCE_LABELS[source]}
        </li>
      ))}
    </ul>
  );
}

/**
 * What the claim rests on, and how to go and look at it.
 *
 * Three renderings, and the third is the one that matters. A reference with a
 * route is a link. A reference without one still states its record count and
 * its tier, because those are true and useful even when there is nowhere to
 * navigate. A reference that is `null` says **No evidence** in words rather
 * than rendering nothing at all — an absent evidence line and a line nobody
 * thought to add look identical on a screenshot, and only one of them is
 * honest.
 *
 * `period` is required rather than optional for the reason ADR-0033 and
 * `withPeriod` both record: navigation used to drop the period, and a reader
 * who chose "Last 28 days" and then opened a drill-down was silently returned
 * to the quarter. An evidence route resolves a fixed set of records, so
 * carrying the period changes nothing about what it shows — but it changes what
 * the reader comes back to, and a link that quietly resets the reader's scope is
 * the defect whether or not the destination cares.
 */
export function Evidence({
  evidence,
  period,
}: {
  readonly evidence: EvidenceRef | null;
  readonly period: PeriodPreset;
}) {
  if (evidence === null) {
    return <span className="ox-n">No evidence</span>;
  }

  const tier = isProducibleTier(evidence.tier) ? TIER_LABELS[evidence.tier] : null;
  const words =
    tier === null
      ? `${evidence.observationCount} records`
      : `${evidence.observationCount} records · ${tier}`;

  if (evidence.href.length === 0) {
    return <span className="ox-evidence">{words}</span>;
  }

  return (
    <Link className="ox-evidence" href={dynamicRoute(withPeriod(evidence.href, period))}>
      {words}
    </Link>
  );
}

/**
 * The sample size, printed rather than implied.
 *
 * "No verdict without a sample size" is one of the three page rules, and the
 * only way a rule like that survives eight authors is for the thing it demands
 * to be one component that is obviously missing when it is missing.
 *
 * `noun` is required and has no default. The denominator of a rate over
 * meetings and the denominator of a rate over units are different questions,
 * and a component that guessed "meetings" would be wrong on exactly the screens
 * where the difference is the finding.
 */
export function Sample({ n, noun }: { readonly n: number; readonly noun: string }) {
  return (
    <span className="ox-n">
      n = {n} {noun}
    </span>
  );
}
