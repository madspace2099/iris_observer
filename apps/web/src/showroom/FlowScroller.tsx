"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * THE JOURNEY CHART'S SCROLLER, FOCUSABLE EXACTLY WHEN IT SCROLLS.
 *
 * `.iris-flow-scroll` keeps the chart at its designed size below the width
 * the 1:1 drawing needs, and scrolls instead of shrinking (`charts.css`). A
 * region that scrolls has to be reachable from the keyboard — axe's
 * `scrollable-region-focusable` — so it carried `tabindex="0"`. But it
 * carried it at every width, and at 1440 and 1920 the drawing fits with
 * half the column to spare: a Tab stop that lands on nothing a keyboard can
 * do, measured as one of the page's stops at three of its four widths.
 *
 * Nothing in the server render can know the column, so this reads the real
 * overflow after layout and again whenever the wrapper resizes or scrolls:
 *
 *   - `tabindex` is present only while `scrollWidth > clientWidth`;
 *   - `data-overflow` names the edge(s) the drawing continues past, which
 *     `charts.css` turns into an edge fade — the only cue a reader gets that
 *     "Shortlisted" and "Progressed" exist to the right on a phone.
 *
 * Server markup carries neither attribute, so hydration has nothing to
 * disagree with, and without script the region is a plain scroller.
 */
export function FlowScroller({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;

    const sync = () => {
      const scrollable = el.scrollWidth > el.clientWidth + 1;
      if (scrollable) el.tabIndex = 0;
      else el.removeAttribute("tabindex");

      const edges: string[] = [];
      if (scrollable && el.scrollLeft > 1) edges.push("left");
      if (scrollable && el.scrollLeft + el.clientWidth < el.scrollWidth - 1) edges.push("right");
      if (edges.length > 0) el.dataset["overflow"] = edges.join(" ");
      else delete el.dataset["overflow"];
    };

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    el.addEventListener("scroll", sync, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", sync);
    };
  }, []);

  return (
    <div ref={ref} className="iris-flow-scroll" role="group" aria-label={label}>
      {children}
    </div>
  );
}
