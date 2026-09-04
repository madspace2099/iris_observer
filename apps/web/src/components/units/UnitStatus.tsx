import type { UnitStatus } from "@observer/readmodels";

/**
 * THE TWO QUESTIONS A UNIT'S STATUS ANSWERS, AND WHY THEY ARE DRAWN TWICE.
 *
 * `available | reserved | sold` is one field on one row and it is read by two
 * different people asking two different things:
 *
 *   "Can I still sell it?"      — the agent, scanning for what to show.
 *   "Has anything been closed?" — leadership, scanning for verified results.
 *
 * The register carries both, and the second is not a decoration of the first:
 * it is the only column on that table a system of record stands behind.
 * Everything else there was observed by the showroom, and observation is not
 * verification — `docs/04-journey.md` separates the two axes and ADR-0021 keeps
 * an authoritative stage away from a signal. A register whose columns all look
 * equally solid invites a reader to treat forty-one views as the same kind of
 * fact as a sale.
 *
 * ## What is missing, and stated rather than filled
 *
 * The unit catalogue is the only system of record this product holds about a
 * unit. There is no per-unit CRM fact anywhere in the read models: the offer
 * stage on the unit's own page is explicitly `unavailable` with the reason that
 * the deal ladder is the CRM's and no offer fact reaches Observer, and a
 * meeting outcome belongs to the meeting rather than to one of the five flats
 * that were open during it.
 *
 * So "verified outcome" here means exactly what the catalogue states and
 * nothing more, and an available unit's cell says **None recorded** — which is
 * a genuine zero and a real answer, not a missing measurement. Rendering it as
 * the missing mark would claim a source had failed to answer; rendering it as a
 * blank would let the reader supply their own meaning.
 *
 * ## Never a colour alone
 *
 * `.ox-chip` gives six tones and six SHAPES, and the shape is what survives a
 * greyscale print and a reader who cannot separate the hues. Each chip below
 * also carries its word. Availability takes the settled-good circle, a
 * reservation takes the waiting ring, and a sale takes the closed square: the
 * three shapes say the same three things the three words do.
 *
 * The verified column takes the human diamond, which in this system means "a
 * person decided this, and a person can change it". A reservation and a sale
 * are exactly that — decisions recorded by people in a system of record — and
 * marking them with the diamond rather than with a green tick is the difference
 * between saying "this is confirmed" and saying "this is confirmed by somebody
 * who could confirm it".
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
