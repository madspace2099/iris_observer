import type { SectionUsage } from "@observer/readmodels";

/**
 * THE WORDS AND THE UNITS THE FEATURES SCREEN RENDERS IN.
 *
 * One pure module, no React, so that everything the screen has to decide about
 * WORDING sits in a single reviewable place rather than scattered through six
 * components. Nothing here computes an analytical value; every function takes a
 * figure the read model already produced and decides how to write it down.
 *
 * ## What is deliberately NOT here
 *
 * A feature's own name. `SectionUsage.label` carries it, and it comes from
 * `SHOWROOM_SECTIONS` in `@observer/contracts` by way of `sectionLabel`. A
 * second spelling of "Time & weather" in this file would be a second
 * vocabulary, and the whole reason the sections live in the contract is that
 * the showroom, the ingest layer, the read model and the screen must all call
 * a feature the same thing.
 */

/**
 * What a feature is FOR, in the reader's words rather than the schema's.
 *
 * `SectionUsage.kind` is widened to `string` on the read model even though the
 * contract's own values are the five below, so the lookup falls back to the raw
 * token rather than throwing or printing nothing. A kind this map has not met
 * is a kind somebody added to `SHOWROOM_SECTIONS`, and showing `wayfinding`
 * unstyled is a far better failure on a customer screen than a blank cell.
 *
 * These are display labels for a CATEGORY, not for a feature. The distinction
 * matters: a feature name is a fact the contract owns and this file may not
 * restate, whereas "the argument" is this screen's editorial framing of the
 * four sections whose job is to persuade rather than to show inventory.
 */
const KIND_LABELS: Readonly<Record<string, string>> = {
  frame: "Arrival",
  units: "The residences",
  argument: "The argument",
  storytelling: "Atmosphere",
  decision: "The decision",
};

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

/**
 * Why a stay cannot be reported, by availability.
 *
 * `MEASUREMENT_AVAILABILITY` in `@observer/contracts` exists so a screen can
 * say "this needs a UE5 event that does not exist yet" instead of rendering a
 * zero, and these are the sentences that say it. `legacy_available` has no
 * reason attached, which is the point of it: there is nothing to explain.
 *
 * Both non-available reasons are phrased about the BUILD rather than about the
 * feature. "Compare is not timed" reads as a fact about Compare; "the showroom
 * build in use does not emit a timing event for it" reads as a fact about the
 * instrument, which is what it is, and it tells the reader what would have to
 * change.
 */
export const STAY_UNAVAILABLE_REASONS: Readonly<
  Record<SectionUsage["availability"], string | null>
> = {
  legacy_available: null,
  partially_derivable:
    "the showroom reports a stay in this feature for some presentations and not for others, so no median stands for all of them",
  requires_ue5_v2_event:
    "the showroom build in use does not emit a timing event for this feature, so no stay was recorded",
};

/**
 * WHY A STAY IS MISSING, DECIDED IN ONE PLACE AND IN THIS ORDER.
 *
 * Two different absences reach a cell as the same null, and rendering them the
 * same way would tell the reader nothing about which decision to take.
 *
 *   NOT REACHED   the feature was opened in no presentation this period. There
 *                 is nothing to time. Nothing is broken.
 *   NOT TIMED     the feature was opened, and the build recorded no stay.
 *
 * The order is load-bearing. `SectionUsage.availability` is derived by the read
 * model from whether any dwell was observed, so a feature nobody opened is
 * reported as `requires_ue5_v2_event` — which is not what that flag means. The
 * reach check therefore runs FIRST, and the availability flag is only consulted
 * once the feature is known to have been opened. This is reported as a defect
 * in the read model rather than absorbed silently; the guard stays either way,
 * because a screen must not repeat an upstream conflation.
 */
export type StayAbsence =
  | { readonly kind: "present"; readonly seconds: number }
  | { readonly kind: "not_reached" }
  | { readonly kind: "not_timed"; readonly reason: string };

export function stayOf(section: SectionUsage): StayAbsence {
  if (section.meetings === 0) return { kind: "not_reached" };
  if (section.medianDwellSeconds === null) {
    return {
      kind: "not_timed",
      reason:
        STAY_UNAVAILABLE_REASONS[section.availability] ??
        "the showroom recorded no stay in this feature",
    };
  }
  return { kind: "present", seconds: section.medianDwellSeconds };
}

/**
 * Whether the glance share is a measurement or a placeholder.
 *
 * `glanceRate` is built over the opens that carried a recorded stay, and the
 * read model divides by `max(1, …)` so that an unopened or untimed feature
 * arrives as `0` rather than as `NaN`. That zero is not a reading — it is the
 * shape of the arithmetic — and printing it would be exactly the "absent value
 * rendered as zero" this product refuses. So the same two guards as the stay
 * decide whether the share may be shown at all.
 */
export function glanceIsMeasured(section: SectionUsage): boolean {
  return section.meetings > 0 && section.medianDwellSeconds !== null;
}

/**
 * Whether the return share is a measurement or a placeholder.
 *
 * Same argument, one guard: `returnRate` is divided by `max(1, meetings)`, so a
 * feature nobody opened reports `0%` returns. A feature that WAS opened and
 * never returned to genuinely returns `0%`, and that is a real answer which is
 * shown as one.
 */
export function returnIsMeasured(section: SectionUsage): boolean {
  return section.meetings > 0;
}

/**
 * A duration, in the read model's own convention.
 *
 * The synthetic implementation formats every duration it publishes as `41s` or
 * `4m 53s`, and this reproduces that exactly so a stay read here and a stay
 * read on Meeting Replay are the same string. It is duplicated rather than
 * imported for one reason: the function is private to `@observer/synthetic`,
 * and a customer surface may not import the fixture package (ADR-0007).
 *
 * That duplication is reported, not hidden. `SectionUsage` is the only shape in
 * the showroom read models that publishes a duration as a raw number with no
 * display string beside it — `ReplayStep` carries `dwellDisplay`, and a
 * `medianStayDisplay` on `SectionUsage` would delete this function.
 *
 * Nothing here depends on locale. A duration is not a currency and not a
 * thousands-separated count, which is why this is a formatting decision the
 * screen may make and the metric layer's rule about formatting does not reach.
 */
export function stayDisplay(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return minutes === 0 ? `${rest}s` : `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

/**
 * A share, as whole percent.
 *
 * Rounded rather than given to a decimal on purpose: the underlying quantity is
 * a count of presentations out of a few dozen, and a tenth of a percent is
 * precision the sample does not carry. The denominator is never inside this
 * string — it is always the column beside it or the sentence under the table,
 * because a percentage that has swallowed its own denominator is the figure
 * this product refuses to print.
 */
export function shareDisplay(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/**
 * Co-occurrence against chance, to two places.
 *
 * `1.00×` is what independent use of the two features would produce, and the
 * second decimal is what separates `1.14×` from `1.09×` — the whole of the
 * signal in the middle of this range. It is an association and it is labelled
 * as one wherever it appears.
 */
export function liftDisplay(lift: number): string {
  return `${lift.toFixed(2)}×`;
}
