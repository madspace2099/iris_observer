import type { SectionUsage } from "@observer/readmodels";

import { glanceIsMeasured, returnIsMeasured } from "./vocabulary";

/**
 * THE CUTS OF THE REGISTER, AND THE ORDER IT IS READ IN.
 *
 * Both live in the URL and both are therefore pure functions of a string. There
 * is no state here and there cannot be: this application stores nothing in the
 * browser — a test scans `apps/web/src` for `localStorage`, `sessionStorage`
 * and `indexedDB` and expects zero hits — so a reader who cut the register to
 * the features nobody opened and sent that screen to a colleague is sending the
 * cut as well, or the cut did not survive being shared.
 *
 * Neither a cut nor an order computes anything. A cut is a filter on a
 * categorical fact the read model already stated, and an order is a comparison
 * of two figures it already published. Nothing in this file produces a number
 * that was not returned (ADR-0012).
 */

/**
 * The four ways to read the register, and the one that is deliberately absent.
 *
 * "Most used" is not a cut, it is the default order, and giving it a chip would
 * have made the register's own ordering look like one option among four rather
 * than the answer to the question the screen opens with.
 *
 * **"Underused" is not offered at all**, and its absence is the considered
 * position rather than an omission. Calling a feature underused requires an
 * expectation to fall short of, and `SectionUsage` carries no target, no
 * benchmark and no intended reach. A threshold invented here — "reached in
 * under a third of presentations" — would be this screen quietly legislating a
 * verdict nobody agreed to, on the surface whose entire subject is how easily a
 * usage figure turns into a vanity one. The register is ordered by reach and
 * the bottom of it is visible; where the line falls is the reader's judgement
 * and it is stated as theirs.
 *
 * The three cuts that ARE offered each rest on a fact the read model states in
 * its own words: an adoption label, a count of zero, and an availability flag.
 */
export const FEATURE_CUTS = [
  { key: "all", label: "All features" },
  { key: "new", label: "Newly adopted" },
  { key: "unopened", label: "Never opened" },
  { key: "untimed", label: "Not yet timed" },
] as const;

export type FeatureCut = (typeof FEATURE_CUTS)[number]["key"];

/**
 * The cut a URL asks for, or the default.
 *
 * An unrecognised value falls back rather than throwing, for the same reason
 * `presetFrom` does: a stale link in somebody's notes should show them the
 * whole register, not an error page.
 */
export function cutFrom(value: string | undefined): FeatureCut {
  return FEATURE_CUTS.some((cut) => cut.key === value) ? (value as FeatureCut) : "all";
}

/**
 * The register, cut.
 *
 * `untimed` reads the availability flag rather than a null stay, because the
 * cut is a question about the INSTRUMENT — which features this showroom build
 * cannot time — and a feature nobody opened this period has an untimed stay
 * without the build being at fault. The register's own cells make the same
 * distinction; see `stayOf` in `./vocabulary`.
 */
export function applyCut(
  sections: readonly SectionUsage[],
  cut: FeatureCut,
): readonly SectionUsage[] {
  switch (cut) {
    case "new":
      return sections.filter((section) => section.adoption === "new_in_period");
    case "unopened":
      return sections.filter((section) => section.meetings === 0);
    case "untimed":
      return sections.filter(
        (section) => section.meetings > 0 && section.availability !== "legacy_available",
      );
    case "all":
      return sections;
  }
}

/** The columns a reader may reorder the register by. */
export const REGISTER_ORDERS = ["feature", "reach", "opens", "stay", "glance", "returns"] as const;
export type RegisterOrder = (typeof REGISTER_ORDERS)[number];

export function orderFrom(value: string | undefined): RegisterOrder | null {
  return REGISTER_ORDERS.some((key) => key === value) ? (value as RegisterOrder) : null;
}

export type OrderDirection = "ascending" | "descending";

export function directionFrom(value: string | undefined): OrderDirection {
  return value === "asc" ? "ascending" : "descending";
}

/**
 * The figure a column sorts on, or `null` where the column has no figure.
 *
 * The nulls are the whole reason this is a function rather than a field name.
 * `glanceRate` and `returnRate` arrive as `0` for a feature that was never
 * opened or never timed, and a sort that read those zeros would file four
 * absences at the bottom of an ascending column as though they were the
 * smallest measurements on the screen — which is the same lie as printing them
 * as `0%`, told in a different place.
 */
function figureOf(section: SectionUsage, order: Exclude<RegisterOrder, "feature">): number | null {
  switch (order) {
    case "reach":
      return section.meetings;
    case "opens":
      return section.opens;
    case "stay":
      return section.medianDwellSeconds;
    case "glance":
      return glanceIsMeasured(section) ? section.glanceRate : null;
    case "returns":
      return returnIsMeasured(section) ? section.returnRate : null;
  }
}

/**
 * The register in the reader's chosen order.
 *
 * Two rules, and both are about honesty rather than about sorting.
 *
 * **An absence never sorts as a value.** Rows with no figure in the ordered
 * column go last in BOTH directions, so reversing the order never promotes a
 * missing measurement to the top of the screen.
 *
 * **The read model's own order is the default**, and it is returned untouched
 * when no column is chosen. `getStorytelling` returns the sections by reach,
 * descending; that ordering is a statement the read model made and this screen
 * does not silently replace it with one of its own.
 */
export function orderSections(
  sections: readonly SectionUsage[],
  order: RegisterOrder | null,
  direction: OrderDirection,
): readonly SectionUsage[] {
  if (order === null) return sections;
  const sign = direction === "ascending" ? 1 : -1;

  if (order === "feature") {
    return [...sections].sort((a, b) => sign * a.label.localeCompare(b.label));
  }

  return [...sections].sort((a, b) => {
    const left = figureOf(a, order);
    const right = figureOf(b, order);
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return sign * (left - right);
  });
}
