"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * THE MODAL MECHANICS, WRITTEN ONCE.
 *
 * A real `<dialog>` opened with `showModal()`, not a positioned `<div>` with a
 * `role`. The reason is that everything a hand-built modal has to reimplement
 * is already correct here and correct in the same way in every browser: the
 * page behind goes inert, Tab cannot leave, Escape closes, and the panel is in
 * the top layer so no `z-index` on any ancestor can bury it.
 *
 * What this shell adds to the native element is the two things the platform
 * does NOT do reliably:
 *
 *   - **Focus in, deliberately.** `showModal` focuses the first focusable
 *     descendant, which on a confirmation is whatever the markup happens to put
 *     first. The element marked `data-autofocus` is focused instead, and on a
 *     confirmation that is Cancel — the safe half of the choice should be the
 *     one under a returning key press.
 *   - **Focus back, provably.** Browsers return focus to the previously focused
 *     element on close, and an element that React has since re-rendered away is
 *     not that element any more. The trigger is captured before opening and
 *     restored afterwards if it is still in the document.
 *
 * Escape is intercepted rather than observed, which is a deliberate departure
 * from trusting the platform and is argued for at the listener below: the
 * `close` event was not dispatched at all in the runtime this was reviewed in,
 * and a dialog that reports no dismissal is a dialog whose contents stay in the
 * document after it is gone.
 *
 * ## Children are mounted only while open
 *
 * The caller renders nothing inside until it is open. That is a convenience for
 * most dialogs and a REQUIREMENT for one — the activation code — because an
 * unmounted child is a child whose text is no longer in the document. See
 * `ActivationCodeDialog`.
 */
export function ModalDialog({
  open,
  onDismiss,
  labelledBy,
  describedBy,
  children,
}: {
  readonly open: boolean;
  /** Called when the browser closed it: Escape, the backdrop, or a control. */
  readonly onDismiss: () => void;
  readonly labelledBy: string;
  readonly describedBy?: string;
  readonly children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  /*
   * The current `onDismiss`, held in a ref so the listener below can be
   * subscribed once and still call the latest closure. Re-subscribing on every
   * render would work too, and would mean adding and removing a listener on a
   * live `<dialog>` several times per keystroke for no gain.
   */
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  /*
   * Whether React still believes it is open. The listener below fires for the
   * caller's own `close()` too — the effect closes the element when the prop
   * goes false — and reporting a dismissal the caller just performed would run
   * its handler twice, which on the activation dialog means two page refreshes
   * for one press.
   */
  const isOpen = useRef(open);
  isOpen.current = open;

  /*
   * ESCAPE IS HANDLED, NOT OBSERVED — and this is the one place the platform is
   * not simply trusted.
   *
   * The obvious wiring is to let the browser close the dialog and to learn about
   * it afterwards, through React's `onClose` or a native `close` listener. Both
   * were tried and both were SILENT in the runtime this was reviewed in: the
   * element reported `open === false` while no `close` and no `cancel` event was
   * ever dispatched, so React went on rendering the panel — and on the
   * activation dialog that leaves the plaintext code in the document after the
   * operator has dismissed it. A verified dialog reduced to a one-line probe
   * (`createElement("dialog")`, `showModal()`, `close()`) fired nothing either,
   * so it is the environment rather than this component.
   *
   * A security property must not depend on an event that may not arrive. So the
   * key press is intercepted before the browser acts on it: `preventDefault`
   * cancels the native close, and React's state performs the close instead,
   * through exactly the path the Done and Cancel buttons take. One route out,
   * and it is the one whose effect is observable.
   *
   * The `close` listener stays as a backstop for a close this component did not
   * originate, and both are guarded by `isOpen` so a dismissal cannot be
   * reported twice.
   */
  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;

    const escaped = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !isOpen.current) return;
      event.preventDefault();
      dismiss.current();
    };
    const closed = () => {
      if (isOpen.current) dismiss.current();
    };

    element.addEventListener("keydown", escaped);
    element.addEventListener("close", closed);
    return () => {
      element.removeEventListener("keydown", escaped);
      element.removeEventListener("close", closed);
    };
  }, []);

  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;

    if (open) {
      if (!element.open) {
        returnTo.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        element.showModal();
        /*
         * The deliberate landing point. Queried rather than passed as a ref so
         * a caller marks it in the markup beside the control it belongs to,
         * where a reviewer can see which half of a choice is focused.
         */
        element.querySelector<HTMLElement>("[data-autofocus]")?.focus();
      }
      return;
    }

    if (element.open) element.close();
    const target = returnTo.current;
    returnTo.current = null;
    /*
     * `document.contains` because the trigger may be gone: an operation that
     * changes the lifecycle re-renders the action bar, and focusing a detached
     * node silently sends focus to the body — an operator who dismissed a
     * dialog with the keyboard would find themselves at the top of the page.
     */
    if (target !== null && document.contains(target)) target.focus();
  }, [open]);

  return (
    <dialog
      className="mad-dialog"
      ref={dialog}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onClick={(event) => {
        /* The backdrop is the dialog element itself; the panel is a child. */
        if (event.target === dialog.current) onDismiss();
      }}
    >
      {open ? <div className="mad-dialog-panel">{children}</div> : null}
    </dialog>
  );
}

/**
 * A consequential operation, stated in sentences before it is performed.
 *
 * ## Why the copy is prose and not a warning
 *
 * The operator reading this is deciding whether to switch off a showroom PC in
 * a building they may be standing in. What they need is what will happen to the
 * installation, to the events it is holding and to the record — three sentences
 * — not an exclamation mark. So `paragraphs` is a list of plain statements and
 * there is no icon, no "Are you sure?" and no shouting.
 *
 * ## Why `weight` exists
 *
 * Suspend is reversible and Archive is not, and rendering them alike is the
 * mistake this prop prevents. A reversible operation gets the ordinary
 * confirming button; only the terminal one takes the strongest treatment the
 * surface has. A red button on Suspend would teach an operator that the red
 * ones are routine, which is exactly the training that makes the terminal one
 * dangerous.
 */
export function ConfirmDialog({
  open,
  id,
  kicker,
  title,
  paragraphs,
  confirmLabel,
  cancelLabel = "Cancel",
  weight,
  busy,
  problem,
  onConfirm,
  onCancel,
}: {
  readonly open: boolean;
  /** Unique on the page: the heading and body ids are derived from it. */
  readonly id: string;
  readonly kicker: string;
  readonly title: string;
  readonly paragraphs: readonly string[];
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly weight: "reversible" | "terminal";
  readonly busy: boolean;
  /** A refusal from the last attempt, in a sentence, or null. */
  readonly problem: string | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  return (
    <ModalDialog
      open={open}
      onDismiss={onCancel}
      labelledBy={`${id}-title`}
      describedBy={`${id}-body`}
    >
      <header className="mad-dialog-head">
        <p className="mad-dialog-kicker">{kicker}</p>
        <h2 className="mad-dialog-title" id={`${id}-title`}>
          {title}
        </h2>
      </header>

      <div className="mad-dialog-body" id={`${id}-body`}>
        {paragraphs.map((paragraph) => (
          <p className="mad-dialog-line" key={paragraph}>
            {paragraph}
          </p>
        ))}
        {weight === "terminal" ? (
          <p className="mad-dialog-terminal">
            This cannot be undone. An archived source cannot be resumed, cannot be issued an
            activation code and cannot be suspended.
          </p>
        ) : null}
      </div>

      {/*
       * The refusal lands inside the dialog, where the press happened. Sending
       * it to the page behind would put the answer somewhere the operator is
       * not looking, and closing the dialog to show it would throw away the
       * choice they were in the middle of making.
       */}
      <p className="mad-said" data-tone={problem === null ? "quiet" : "weak"} role="alert">
        {problem ?? ""}
      </p>

      <footer className="mad-dialog-foot">
        {/*
         * Marked busy rather than disabled, for the reason argued in
         * `ActivationCodeDialog.issue`: a disabled element cannot hold focus,
         * so disabling the button that was just pressed throws the operator's
         * focus away mid-operation. The guards are in the handlers.
         */}
        <button
          className="mad-action"
          type="button"
          data-autofocus=""
          aria-disabled={busy}
          onClick={() => {
            if (!busy) onCancel();
          }}
        >
          {cancelLabel}
        </button>
        <button
          className="mad-action"
          type="button"
          data-weight={weight === "terminal" ? "terminal" : "confirm"}
          aria-disabled={busy}
          onClick={() => {
            if (!busy) onConfirm();
          }}
        >
          {busy ? `${confirmLabel}…` : confirmLabel}
        </button>
      </footer>
    </ModalDialog>
  );
}
