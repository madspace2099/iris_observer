"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A table's horizontal scroll region, keyboard-reachable only while it scrolls.
 *
 * `.mad-table-wrap` lets a wide table scroll sideways on a phone instead of
 * breaking the page. A scroll region a keyboard cannot reach is a region a
 * keyboard cannot read past the second column, and one that is reachable when
 * nothing overflows is a tab stop that does nothing. So the wrapper measures
 * itself: while the table is wider than the wrapper it is a focusable, named
 * group and the arrow keys scroll it; otherwise it is the plain wrapper it
 * always was. The name is the section heading it already sits under. A group
 * rather than a region, because the section is already the landmark with
 * that name and a second one would announce the same words twice.
 */
export function TableWrap({
  labelledBy,
  children,
}: {
  /** The id of the heading that names this table. */
  readonly labelledBy: string;
  readonly children: ReactNode;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const element = wrap.current;
    if (element === null) return undefined;
    const measure = () => setOverflowing(element.scrollWidth > element.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    const table = element.firstElementChild;
    if (table !== null) observer.observe(table);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className="mad-table-wrap"
      ref={wrap}
      tabIndex={overflowing ? 0 : undefined}
      role={overflowing ? "group" : undefined}
      aria-labelledby={overflowing ? labelledBy : undefined}
    >
      {children}
    </div>
  );
}
