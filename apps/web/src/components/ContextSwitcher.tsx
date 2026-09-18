"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { dynamicRoute } from "@/lib/href";

/**
 * Project, developer and period selection.
 *
 * ## Why this stopped being a native `<select>`
 *
 * It was one, deliberately, and the reasoning held for everything except the
 * part a reader actually sees. A `<select>` can be styled down to its closed
 * state and no further: the open list is drawn by the operating system, in the
 * system's ground, the system's font and the system's highlight. On this
 * product that meant a white panel with a bright blue bar opening out of a
 * graphite header — the one surface in the whole application that belonged to
 * no design system at all. It is also the surface a reader opens most often.
 *
 * So the list is ours now, and the options are what they always were
 * underneath: LINKS. Each one carries its own href already, which a `<select>`
 * could only ever simulate by navigating on change — so middle-click, ⌘-click
 * and "open in new tab" now work on a project the way they work on every other
 * link in the product, and the browser's own status bar says where each row
 * goes before it is pressed.
 *
 * `<details>` carries the open state, so the control is operable by keyboard
 * before any script runs: the summary takes focus, Enter and Space toggle it,
 * Tab walks the rows. The effect below adds the two things `<details>` has no
 * opinion about — Escape, and a press outside.
 *
 * ## Why the list says what it is
 *
 * Every one of these controls lists a subset with a rule behind it, and the
 * closed button shows only the current value, so the rule was invisible. A
 * reader who had just counted seven projects on `/projects` opened the project
 * switcher, found three, and had nothing on screen to tell them the list is
 * this developer's rather than theirs. {@link ContextSwitcher.caption} states
 * the rule at the moment it is needed, and {@link ContextSwitcher.footer}
 * carries the way to the fuller list where one exists.
 */
export interface SwitchOption {
  readonly value: string;
  readonly label: string;
  readonly href: string;
}

export function ContextSwitcher({
  label,
  caption,
  value,
  options,
  footer = null,
}: {
  /** The control's accessible name. Never rendered: the value is the button. */
  readonly label: string;
  /** One sentence naming what the list holds, and any rule that shapes it. */
  readonly caption: string;
  readonly value: string;
  readonly options: readonly SwitchOption[];
  /** A last row out of this list, where a wider one exists. */
  readonly footer?: SwitchOption | null;
}) {
  const box = useRef<HTMLDetailsElement>(null);

  /*
   * The two gestures `<details>` does not know about.
   *
   * Escape returns focus to the summary rather than dropping it on the body:
   * a reader who dismisses a menu by keyboard is still standing where they
   * opened it. `pointerdown` rather than `click`, so the menu is gone before
   * whatever was pressed underneath reacts.
   */
  useEffect(() => {
    const el = box.current;
    if (el === null) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !el.open) return;
      el.open = false;
      el.querySelector("summary")?.focus();
    };
    const onDown = (event: PointerEvent) => {
      if (el.open && !el.contains(event.target as Node)) el.open = false;
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, []);

  const chosen = options.find((option) => option.value === value);

  return (
    <details className="ox-menu" ref={box}>
      {/*
       * `aria-label` rather than a wrapping label: a label folds its own text
       * and every row into the control's accessible name, which is what made
       * the old select ambiguous to every query and every screen reader.
       */}
      <summary className="ox-menu-button" aria-label={label}>
        <span className="ox-menu-value">{chosen?.label ?? value}</span>
        <Caret />
      </summary>

      {/*
       * Closed on navigation. Next routes on the client, so nothing about
       * following one of these links would otherwise take the panel away.
       */}
      <div
        className="ox-menu-panel"
        onClick={() => {
          if (box.current !== null) box.current.open = false;
        }}
      >
        <p className="ox-menu-caption">{caption}</p>
        <ul className="ox-menu-list">
          {options.map((option) => {
            const here = option.value === value;
            return (
              <li key={option.value}>
                <Link
                  className="ox-menu-row"
                  href={dynamicRoute(option.href)}
                  aria-current={here ? "true" : undefined}
                >
                  <span className="ox-menu-row-label">{option.label}</span>
                  {/*
                   * The current row is marked, not merely coloured: colour
                   * alone is not a statement, and this list is read at a
                   * glance by somebody checking where they are.
                   */}
                  {here ? <Tick /> : null}
                </Link>
              </li>
            );
          })}
        </ul>
        {footer === null ? null : (
          <Link className="ox-menu-foot" href={dynamicRoute(footer.href)}>
            {footer.label}
          </Link>
        )}
      </div>
    </details>
  );
}

/** The one chevron. Rotates to point at the panel while it is open. */
function Caret() {
  return (
    <svg className="ox-menu-caret" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path
        d="M2.75 4.5 6 7.75 9.25 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Drawn at the same stroke as the chevron, so the two read as one family. */
function Tick() {
  return (
    <svg className="ox-menu-tick" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path
        d="M2.5 6.4 4.9 8.8 9.5 3.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
