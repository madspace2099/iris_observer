"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * What Tab is allowed to reach. Deliberately conservative.
 *
 * `[tabindex]` with any value other than -1 is included so a panel that made a
 * region focusable on purpose keeps it in the cycle; disabled controls are
 * excluded because a disabled control cannot take focus and including one would
 * make the trap skip a turn.
 */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * THE ONE THING IN THIS SYSTEM THAT FLOATS.
 *
 * `observer-product.css` §20 declares exactly one elevation in the whole
 * product and it is on `.ox-dialog-panel`. Nothing else on a product screen has
 * a shadow, because `docs/12-visual-autopsy.md` rejected the card stack and a
 * second floating thing would begin rebuilding it.
 *
 * This is the only client component in `components/product`. Everything else
 * here is a Server Component and takes hrefs rather than callbacks; a dialog
 * cannot be, because opening and closing is state and Escape is an event.
 *
 * ## Why this is not a native `<dialog>`, when `ConfirmDialog` is
 *
 * `apps/web/src/components/madspace/ConfirmDialog.tsx` uses `showModal()` and
 * gets the top layer, inertness and the platform's own focus handling for free.
 * That is the better mechanism and it is not available here, for one blunt
 * reason: `.ox-dialog` is written as an overlay element — `position: fixed`,
 * `inset: 0`, `display: grid`, `place-items: center`, with the scrim as its own
 * background and the panel as a child. Applied to a `<dialog>`, the author-level
 * `display: grid` would beat the user agent's `dialog:not([open]) { display:
 * none }` and the closed dialog would be permanently on screen, while the
 * agent's `width: fit-content`, border and padding would fight `inset: 0`.
 *
 * The stylesheet is not this brief's to edit, so the behaviour the native
 * element provides is reimplemented instead — copied from `ConfirmDialog`,
 * which is where this repository already proved it — and the shape the
 * stylesheet asks for is honoured exactly.
 *
 * ## Why it is portalled into `document.body`
 *
 * `iris-shell.css` sets `.irs-shell > * { position: relative; z-index: 1 }`, so
 * `<main>` is its own stacking context, and the sticky header above it is
 * `z-index: 4` at the shell's level. A dialog rendered in place would sit at
 * `z-index: 40` INSIDE main's context and would still be painted underneath the
 * header — the classic version of this bug, and the reason the ADR is emphatic
 * that the ground is applied by class and never by a filter on `body`.
 *
 * Escaping to `document.body` costs the ground tokens, because
 * `--ox-panel`, `--ox-ink` and the rest are declared on `.ox-graphite` and not
 * on `:root`. So the portal's own root carries `ox-root ox-graphite`: the
 * dialog is a conclusion and a choice, which is what the graphite ground means.
 *
 * ## The four behaviours, and why each is written out
 *
 * **Focus in, deliberately.** The element marked `data-autofocus` takes focus,
 * falling back to the first focusable control and then to the panel itself. On
 * a confirmation the safe half of the choice should carry the mark, so a
 * returning key press cannot commit anything.
 *
 * **Focus back, provably.** The opener is captured before the panel mounts and
 * restored on close only if it is still in the document. An element React has
 * since re-rendered away is not the opener any more, and focusing a detached
 * node silently sends focus to `<body>` — a reader who dismissed with the
 * keyboard would find themselves at the top of the page.
 *
 * **Tab cannot leave.** The listener is on the document in the capture phase,
 * so it sees the key before anything inside the panel does, and it wraps in
 * both directions. Without it, Tab from the last control lands on the page
 * behind — which is still there, since this is not the top layer and nothing
 * is inert.
 *
 * **The page behind does not scroll.** `body`'s overflow is taken and its
 * previous value restored, rather than set to `""`, because another component
 * may have had a reason for the value that was there.
 */
export function Dialog({
  open,
  onDismiss,
  labelledBy,
  describedBy,
  children,
}: {
  readonly open: boolean;
  /** Escape, the backdrop, or a control inside. Always the caller's to handle. */
  readonly onDismiss: () => void;
  /** The id of the heading inside `children`. Required: a dialog has a name. */
  readonly labelledBy: string;
  readonly describedBy?: string;
  readonly children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  /*
   * The current handler, held in a ref so the key listener can subscribe once
   * and still call the latest closure. Re-subscribing every render would add
   * and remove a document listener several times per keystroke for no gain.
   */
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  /*
   * `createPortal` needs a DOM, and this component is server-rendered like
   * everything else in the tree. Nothing is portalled until the first effect
   * has run on the client.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !mounted) return;

    returnTo.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const body = document.body;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    const element = panel.current;
    const landing =
      element?.querySelector<HTMLElement>("[data-autofocus]") ??
      element?.querySelector<HTMLElement>(FOCUSABLE) ??
      element;
    landing?.focus();

    return () => {
      body.style.overflow = previousOverflow;
      const opener = returnTo.current;
      returnTo.current = null;
      if (opener !== null && document.contains(opener)) opener.focus();
    };
  }, [open, mounted]);

  useEffect(() => {
    if (!open || !mounted) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        /*
         * The default is cancelled as well as handled. Nothing else in this
         * application should act on an Escape that closed a modal — a filter
         * bar or a disclosure behind the panel reacting to the same key press
         * would leave the reader having done two things they meant once.
         */
        event.preventDefault();
        dismiss.current();
        return;
      }

      if (event.key !== "Tab") return;

      const element = panel.current;
      if (element === null) return;

      const items = Array.from(element.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (item) => item.getClientRects().length > 0,
      );
      const first = items[0];
      const last = items[items.length - 1];

      if (first === undefined || last === undefined) {
        /* A panel with nothing focusable still may not leak focus behind it. */
        event.preventDefault();
        element.focus();
        return;
      }

      const active = document.activeElement;
      const outside = !element.contains(active);

      if (event.shiftKey && (active === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, mounted]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="ox-root ox-graphite ox-dialog"
      ref={scrim}
      onClick={(event) => {
        /* The scrim is this element; the panel is its child. */
        if (event.target === scrim.current) dismiss.current();
      }}
    >
      <div
        className="ox-dialog-panel"
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        {...(describedBy === undefined ? {} : { "aria-describedby": describedBy })}
        /*
         * Focusable but not tabbable, so it can be the landing point when the
         * panel holds no control of its own and so the trap has somewhere to
         * put focus that is not the page behind.
         */
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
