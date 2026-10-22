"use client";

import { useEffect, useState } from "react";

export interface FlowScreen {
  readonly id: string;
  readonly label: string;
}

/**
 * WHERE YOU ARE ON SALES FLOW (the owner, 2026-10-22, ADR-0059).
 *
 * Sales Flow is a sequence of screens moved through by scrolling. This is the
 * quiet way to know which one you are on and to go to another: a column of
 * dots, one per screen, each a link to it, the current one marked. The dots
 * are links rather than buttons because each goes to a place on the page, and
 * a fragment link moves the keyboard's starting point there too.
 *
 * The current screen is the one under the middle of the viewport: an observer
 * whose root is shrunk to that one line, so a screen taller than the viewport
 * stays current for as long as it is the one being read. With no script the
 * dots still go where they say, and the first stays marked.
 */
export function FlowRail({ screens }: { readonly screens: readonly FlowScreen[] }) {
  const [current, setCurrent] = useState(screens[0]?.id);
  const ids = screens.map((screen) => screen.id).join(" ");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setCurrent(entry.target.id);
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    for (const id of ids.split(" ")) {
      const element = document.getElementById(id);
      if (element !== null) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [ids]);

  return (
    <nav className="flow-rail" aria-label="Sales Flow screens">
      <ol>
        {screens.map((screen) => (
          <li key={screen.id}>
            <a
              href={`#${screen.id}`}
              aria-label={screen.label}
              data-label={screen.label}
              aria-current={screen.id === current ? "location" : undefined}
            />
          </li>
        ))}
      </ol>
    </nav>
  );
}
