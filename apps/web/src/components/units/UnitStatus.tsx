import type { UnitStatus } from "@observer/readmodels";

/**
 * ONE FIELD, PRINTED ONCE.
 *
 * `available | reserved | sold` is one field on one row, read by two different
 * people asking two different things:
 *
 *   "Can I still sell it?"      — the agent, scanning for what to show.
 *   "Has anything been closed?" — leadership, scanning for verified results.
 *
 * ## What this file used to say, and which half of it was false
 *
 * It said the register carried both, and that the verified column "is the only
 * column on that table a system of record stands behind". The first half is no
 * longer true — the register drew its thirteenth column from `row.status`, the
 * same field the Status column draws, and P2-08 removed it. The second half was
 * never true: a column fed the identical field is not standing on a second
 * source, and a reader who met Status=Sold beside Verified=Sold was entitled to
 * read two systems agreeing where there was one system, printed twice.
 *
 * It also said "there is no per-unit CRM fact anywhere in the read models".
 * That is false and falsifiable from the same route: `AssistedSale`
 * (`packages/readmodels/src/deal-source.ts:133-151`) is keyed by `unitCode` and
 * carries the CRM's stage, its stage date and its `dateBasis`, and the unit's
 * own page draws a finding from it whose baseline is the date the CRM states.
 * `docs/04-journey.md` separates observation from verification and ADR-0021
 * keeps an authoritative stage away from a signal; what was missing was never
 * the fact, only a place to put it.
 *
 * ## Where it survived, and how that was settled
 *
 * `VerifiedOutcome` kept one caller after the column went: the unit's own
 * page, in a tally beside a `StatusChip` reading the same `unit.status`. That
 * pair was the removed column's argument at closer range, and it was decided
 * the same way (2026-09-27): the row said what Status already says, so it is
 * gone, and with it the component. Status is the catalogue's word, printed
 * once.
 *
 * ## Never a colour alone
 *
 * `.ox-chip` gives six tones and six SHAPES, and the shape is what survives a
 * greyscale print and a reader who cannot separate the hues. Each chip below
 * also carries its word. Availability takes the settled-good circle, a
 * reservation takes the waiting ring, and a sale takes the closed square: the
 * three shapes say the same three things the three words do.
 */

const STATUS_TONE: Readonly<Record<UnitStatus, string>> = {
  available: "good",
  reserved: "watch",
  sold: "settled",
};

const STATUS_WORD: Readonly<Record<UnitStatus, string>> = {
  available: "Available",
  reserved: "Reserved",
  sold: "Sold",
};

/** Whether the unit can still be sold. The catalogue's word for it. */
export function StatusChip({ status }: { readonly status: UnitStatus }) {
  return (
    <span className="ox-chip" data-tone={STATUS_TONE[status]}>
      <span className="ox-chip-mark" aria-hidden="true" />
      {STATUS_WORD[status]}
    </span>
  );
}
