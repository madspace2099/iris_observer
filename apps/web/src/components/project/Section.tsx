import type { ReactNode } from "react";

/**
 * THE TWO REGION SHAPES THIS SCREEN IS BUILT FROM.
 *
 * ADR-0034 divides the product by CONTENT rather than by page: graphite is what
 * we conclude and what a reader may do about it, paper is what was measured.
 * `observer-product.css` §7 gives each of them a shape — `.ox-plane` for a
 * graphite region and `.ox-plate` + `.ox-plate-inner` for a paper one — and the
 * two are DIRECT CHILDREN of `.ox-body`, never nested in one another.
 *
 * That last point is the whole reason these exist as components rather than as
 * markup repeated seven times down the page. The seam is governed by two
 * numbers: `--ox-inset` holds a plate off the graphite and `--ox-pad` is the
 * plate's own padding, so graphite copy — padded by their SUM through
 * `.ox-body` plus `.ox-plane` — stands on exactly the same left edge as the
 * text inside a plate. Nesting a plate inside a plane adds a second `--ox-pad`
 * and the two edges part company by 28px, which is precisely the "header pasted
 * above a page" reading the ADR says the alignment exists to prevent. A
 * component cannot be nested by accident if nobody writes the classes by hand.
 *
 * ## Why the note is a sibling of the head rather than inside it
 *
 * `.ox-section-head` is a baseline-aligned flex row and `.ox-section-note` is a
 * 58ch block of caption ink. The sheet declares them next to one another as two
 * parts of a region, so they are rendered as two children of the region and the
 * space between them is the container's own rhythm — 20px inside a plane, 28px
 * inside a plate. No margin is invented here to tighten it: the rhythm is
 * 8 / 12 / 20 / 28 and there is no other number in this system.
 *
 * ## Why both take an `id`
 *
 * Every region on this screen is a landmark a reader can be sent to, and a
 * `<section>` with no accessible name is not announced as one. The id is the
 * heading's, and `aria-labelledby` points the region at it, so the region is
 * named by the same words that are on the screen rather than by a second
 * string that can drift from them.
 */

/**
 * A GRAPHITE REGION — a conclusion, a control, or a chart that carries a
 * reading rather than a register of them.
 *
 * No border, no elevation, no card. `.ox-plane` is a region with a head and
 * some content standing directly on the shell's own atmosphere, which is what
 * `docs/12-visual-autopsy.md` chose over the rejected card stack.
 */
export function Plane({
  id,
  title,
  note = null,
  aside = null,
  children,
}: {
  readonly id: string;
  readonly title: string;
  /** What this region measures, precisely enough to argue with. */
  readonly note?: ReactNode;
  /** Provenance, a link, a chip. Sits at the far end of the head, baseline-aligned. */
  readonly aside?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section className="ox-plane" aria-labelledby={id}>
      <div className="ox-section-head">
        <h2 className="ox-section-title" id={id}>
          {title}
        </h2>
        {aside === null ? null : <div className="ox-btn-row">{aside}</div>}
      </div>
      {note === null ? null : <p className="ox-section-note">{note}</p>}
      {children}
    </section>
  );
}

/**
 * A PAPER REGION — a register of readings.
 *
 * Earned rather than decorative, which is the constraint ADR-0034 puts on this
 * ground: it appears where a dense measured body genuinely reads better on warm
 * paper — the stacking plan, the unit register, the table of filters buyers
 * applied — and nowhere else. A paragraph does not get a plate and a verdict
 * never does.
 *
 * `.ox-paper` also resets `color-scheme` to light, which is what stops the user
 * agent painting a native control inside the plate as though the plate were
 * dark. Applying the ground is this one class and nothing else.
 */
export function Plate({
  id,
  title,
  note = null,
  aside = null,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly note?: ReactNode;
  readonly aside?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section className="ox-plate ox-paper" aria-labelledby={id}>
      <div className="ox-plate-inner">
        <div className="ox-section-head">
          <h2 className="ox-section-title" id={id}>
            {title}
          </h2>
          {aside === null ? null : <div className="ox-btn-row">{aside}</div>}
        </div>
        {note === null ? null : <p className="ox-section-note">{note}</p>}
        {children}
      </div>
    </section>
  );
}
