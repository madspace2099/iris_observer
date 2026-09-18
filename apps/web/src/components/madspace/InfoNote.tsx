"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * The information disclosure: an `i` beside a title, and the explanation behind it.
 *
 * ## Why it exists
 *
 * The operations screens explained themselves in front of their own answers. A
 * reader looking for whether an installation is delivering had to read a
 * paragraph about why the figure is shaped the way it is before reaching the
 * figure. The design system's second principle is the rule that was being
 * broken: every screen leads with the state, the party waited on and the date,
 * and detail sits below the fold, never in front of the answer.
 *
 * So the doctrine moves behind a control, and the screen keeps the answer.
 *
 * ## What may hide here, and what may never
 *
 * MAY: definitions, doctrine, the reason a figure is shaped as it is, the
 * difference between two states that look alike.
 *
 * MAY NEVER: the state itself, the party waited on, the date, a refusal's
 * reason, an error, or anything a reader has to act on. Hiding one of those
 * would not be following the principle, it would be inverting it. This is
 * enforced by review rather than by types, so the rule is written here where
 * the next person to reach for the component will read it.
 *
 * ## Why a button and a panel rather than a tooltip
 *
 * `title` and hover-only tooltips are unreachable by touch, unreliable for
 * screen readers, and cannot hold a sentence. This is a real button carrying
 * `aria-expanded` and `aria-controls`, which the system's accessibility
 * contract names for disclosures, and the panel is one of the two elevations
 * that contract permits.
 */
export function InfoNote({
  label,
  children,
  align = "start",
}: {
  /**
   * What this explains, as a phrase.
   *
   * It becomes the button's accessible name, so a screen reader announces
   * "About the three states, collapsed, button" rather than "i". Write it as
   * the thing being explained, not as an instruction.
   */
  readonly label: string;
  readonly children: ReactNode;
  /** Where the panel hangs. `end` when the control sits near the right edge. */
  readonly align?: "start" | "end";
}) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  const close = useCallback(
    (restoreFocus: boolean) => {
      setOpen(false);
      /*
       * Focus goes back to the control that opened the panel, but ONLY when the
       * panel was dismissed deliberately. Stealing focus after a click
       * somewhere else on the page would drag the reader back to a control they
       * had just left.
       */
      if (restoreFocus) button.current?.focus();
    },
    [setOpen],
  );

  useEffect(() => {
    if (!open) return undefined;

    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.stopPropagation();
        close(true);
      }
    }

    function onPointer(event: PointerEvent): void {
      const node = event.target;
      if (node instanceof Node && wrap.current?.contains(node) === true) return;
      close(false);
    }

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, close]);

  return (
    <span className="mad-info" ref={wrap}>
      <button
        ref={button}
        type="button"
        className="mad-info-button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`About ${label}`}
        onClick={() => {
          setOpen((was) => !was);
        }}
      >
        {/*
         * Drawn rather than typed. A letter "i" inherits the text font and
         * would change shape with it; this is one glyph that is always the same
         * size and always centred, and `aria-hidden` keeps it out of the name
         * the button already carries.
         */}
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle cx="8" cy="8" r="7" fill="none" strokeWidth="1.25" />
          <circle cx="8" cy="4.6" r="0.95" stroke="none" />
          <path d="M8 7.1v4.6" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </svg>
      </button>

      {/*
       * Rendered only while open rather than hidden with CSS.
       *
       * A panel that is present but invisible is still in the accessibility
       * tree of some combinations and is still found by in-page search, which
       * is how a reader ends up looking at an explanation for a control they
       * cannot see.
       */}
      {/*
       * A DIV, not a span.
       *
       * Every call site puts paragraphs in here, and a span accepts phrasing
       * content only. It rendered because the sheet forces display:block, which
       * is exactly the kind of thing that works until something parses it.
       */}
      {open ? (
        <div className="mad-info-panel" id={panelId} role="note" data-align={align}>
          {children}
        </div>
      ) : null}
    </span>
  );
}
