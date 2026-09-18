"use client";

import { Close } from "./icons";

/**
 * Closes the nearest `<details>` this button is rendered inside.
 *
 * Desktop already closes on Escape or an outside click (`ClosableDetails`) —
 * a mouse-and-keyboard reader has both. Neither reads naturally on a phone:
 * there is no Escape key, and a full-width sheet's own backdrop is the only
 * "outside" left to tap. `ask-iris.css` keeps this visible only in the mobile
 * sheet header; the button itself works regardless of where it is shown.
 */
export function MenuCloseButton({ label }: { readonly label: string }) {
  return (
    <button
      type="button"
      className="ask-menu-close"
      aria-label={label}
      onClick={(event) => {
        const details = event.currentTarget.closest("details");
        if (details !== null) details.open = false;
      }}
    >
      <Close size={15} />
    </button>
  );
}
