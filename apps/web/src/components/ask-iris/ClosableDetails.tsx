"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * ESCAPE AND AN OUTSIDE CLICK CLOSE A `<details>` — WHICH NEITHER DOES ON ITS
 * OWN.
 *
 * The model and scope pickers are plain `<details>` on purpose: they open,
 * close and submit with scripting off, the same reason `AskField` is the only
 * other client piece on this screen. Neither behaviour here changes that —
 * a reader with JavaScript disabled loses exactly these two conveniences and
 * nothing else; the disclosure itself, and the form it sits in, still work.
 *
 * `name="ask-composer-menu"` on both call sites (native `<details>` exclusive
 * groups) already keeps the two mutually exclusive with no script at all —
 * opening one closes the other. What only script can add is closing one from
 * outside it, or from the keyboard without tabbing back to its own summary.
 */
export function ClosableDetails({
  className,
  /** A shared `name` makes a set of `<details>` mutually exclusive — no script. */
  name,
  children,
}: {
  readonly className?: string;
  readonly name?: string;
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function close(returnFocus: boolean) {
      const details = ref.current;
      if (details === null || !details.open) return;
      details.open = false;
      if (returnFocus) details.querySelector("summary")?.focus();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close(true);
    }

    function onPointerDown(event: PointerEvent) {
      const details = ref.current;
      if (details === null || !(event.target instanceof Node)) return;
      if (!details.contains(event.target)) close(false);
    }

    document.addEventListener("keydown", onKeyDown);
    // Capture phase: a tap on the mobile sheet's own backdrop (a pseudo
    // -element, painted behind the sheet but in front of everything else)
    // still reports its host element as the target, which is exactly what
    // `contains` needs to see as "outside".
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, []);

  return (
    <details ref={ref} className={className} name={name}>
      {children}
    </details>
  );
}
