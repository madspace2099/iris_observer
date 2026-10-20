"use client";

import type { ReactNode } from "react";

/**
 * AN `i` BESIDE A TITLE, AND THE EXPLANATION BEHIND IT (Sales Flow, 2026-10-20).
 *
 * The owner, recording a demonstration, read the paragraphs under Sales Flow's
 * cards as noise: how a figure is drawn, what a rung counts, what a direction
 * does not claim. They are true and a reader may want them, so they move behind
 * a control instead of going away. The rule is `madspace/InfoNote`'s: MAY hide a
 * definition or the reason a figure is shaped as it is; MAY NEVER hide the
 * figure, its denominator, a state or anything a reader has to act on. A card
 * whose note carried its own count keeps that count as one short visible line.
 *
 * ## Why the native popover, and not `InfoNote`
 *
 * `InfoNote` renders its panel only while open, from React state, so without
 * JavaScript the explanation is not in the page at all. Here the panel is in
 * the server's HTML and `popovertarget` opens it with no script: the browser
 * closes it on Escape and on a press outside (`popover="auto"`), puts it in the
 * top layer so no card's overflow can clip it, and tells assistive technology
 * the button expands it. The one thing the platform does not do is close it
 * when Tab moves on, which would leave focus on a control beneath the panel;
 * the `onBlur` below does that, and is the only reason this is a client file.
 *
 * Where it stands is the stylesheet's (`showroom.css`, `.iris-info-panel`):
 * anchored under its button where the browser can anchor, centred where it
 * cannot, and a sheet along the bottom on a phone.
 */
export function InfoTip({
  id,
  label,
  children,
}: {
  /** Unique on the page; the panel is `info-<id>`. Letters, digits, `-` and `_` only. */
  readonly id: string;
  /** What this explains, as a phrase: the button is named "About <label>". */
  readonly label: string;
  readonly children: ReactNode;
}) {
  const panel = `info-${id}`;
  const anchor = `--${panel}`;
  return (
    <>
      <button
        type="button"
        className="iris-info"
        popoverTarget={panel}
        aria-label={`About ${label}`}
        style={{ anchorName: anchor }}
        onBlur={(event) => {
          // Focus moved to another control: close, as `Measure` does. A press on
          // the panel's own text moves focus nowhere and leaves it open.
          if (event.relatedTarget !== null) document.getElementById(panel)?.hidePopover();
        }}
      >
        {/* `Measure`'s own mark, so a card that carries both shows one `i`. */}
        <span className="iris-measure-dot" aria-hidden="true">
          i
        </span>
      </button>
      <div
        id={panel}
        popover="auto"
        role="note"
        className="iris-info-panel"
        style={{ positionAnchor: anchor }}
      >
        {children}
      </div>
    </>
  );
}
