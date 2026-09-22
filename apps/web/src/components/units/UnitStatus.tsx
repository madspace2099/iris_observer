import type { UnitStatus } from "@observer/readmodels";

/**
 * ONE FIELD, AND THE ONE PLACE THAT STILL PRINTS IT TWICE.
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
 * ## Where it survives, and that this is not settled
 *
 * `VerifiedOutcome` now has one caller: the unit's own page, where it sits in a
 * tally beside a `StatusChip` reading the same `unit.status`. That pair is the
 * removed column's argument at closer range, and it has not been decided. It is
 * recorded as open rather than quietly fixed, because the column's removal was
 * a product decision and this is the same decision.
 *
 * For as long as it is drawn: "verified outcome" means exactly what the
 * catalogue states and nothing more, and an available unit says **None
 * recorded** — a genuine zero and a real answer, not a missing measurement.
 * Rendering it as the missing mark would claim a source had failed to answer;
 * rendering it as a blank would let the reader supply their own meaning.
 *
 * ## Never a colour alone
 *
 * `.ox-chip` gives six tones and six SHAPES, and the shape is what survives a
 * greyscale print and a reader who cannot separate the hues. Each chip below
 * also carries its word. Availability takes the settled-good circle, a
 * reservation takes the waiting ring, and a sale takes the closed square: the
 * three shapes say the same three things the three words do.
 *
 * `VerifiedOutcome` takes the human diamond, which in this system means "a
 * person decided this, and a person can change it". A reservation and a sale
 * are exactly that — decisions recorded by people in a system of record — and
 * marking them with the diamond rather than with a green tick is the difference
 * between saying "this is confirmed" and saying "this is confirmed by somebody
 * who could confirm it".
 *
 * The diamond is also the strongest claim on this pair, and it is the reason
 * the surviving tally item is a live question rather than a leftover: a mark
 * meaning "somebody decided this" on a field its neighbour already printed is
 * the same overstatement the column was removed for.
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

/**
 * What a system of record confirms about this unit, and what it does not.
 *
 * `title` carries the source rather than a second visible line: the column is
 * one of thirteen and the sentence is the same on every row, so repeating it
 * forty-eight times would be the defect the visual autopsy recorded for
 * unavailable sources wearing a different costume. The table's own notes state
 * it once for the column.
 */
export function VerifiedOutcome({ status }: { readonly status: UnitStatus }) {
  if (status === "available") {
    return (
      <span className="ox-chip" data-tone="none" title="No commercial outcome recorded.">
        <span className="ox-chip-mark" aria-hidden="true" />
        None recorded
      </span>
    );
  }

  return (
    <span
      className="ox-chip"
      data-tone="human"
      title="Stated by the unit catalogue, which is a system of record about this unit."
    >
      <span className="ox-chip-mark" aria-hidden="true" />
      {STATUS_WORD[status]}
    </span>
  );
}
