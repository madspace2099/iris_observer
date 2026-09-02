"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { PRIMARY_NAV, SECONDARY_NAV } from "@/lib/routes";
import { dynamicRoute } from "@/lib/href";
import { presetFrom, withPeriod } from "@/lib/period";

/**
 * The four customer sections, and the detail surfaces beneath them.
 *
 * A horizontal rail rather than a permanent sidebar: the brief rules the
 * sidebar out, and on an analytical screen the horizontal axis is worth more
 * than a column of links that never changes.
 *
 * Sections the viewer's role cannot open are not rendered at all. A disabled
 * nav item advertises something they will never be given.
 */
export function PrimaryNav({ root, allowed }: { root: string; allowed: readonly string[] }) {
  const pathname = usePathname();
  /*
   * Navigation carries the period.
   *
   * Choosing "Last 28 days" and then opening Project silently returned to the
   * quarter, so the reader compared two screens measuring different spans
   * without being told they had changed.
   */
  const period = presetFrom(useSearchParams().get("period") ?? undefined);

  return (
    <nav className="iris-nav" aria-label="Sections">
      {PRIMARY_NAV.filter((item) => allowed.includes(item.key)).map((item) => {
        const href = `${root}/${item.key}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            className="iris-nav-item"
            key={item.key}
            href={dynamicRoute(withPeriod(href, period))}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The detail surfaces.
 *
 * A second, quieter row. These are drill-downs — where one meeting, one unit or
 * one presenter's sequence is read — and putting them level with the four views
 * would ask the reader to choose between a question and its own footnote. Not
 * rendering them at all was worse: it removed working analysis from the product
 * without removing the code.
 */
export function DetailNav({ root, allowed }: { root: string; allowed: readonly string[] }) {
  const pathname = usePathname();
  const period = presetFrom(useSearchParams().get("period") ?? undefined);
  const items = SECONDARY_NAV.filter((item) => allowed.includes(item.key));
  if (items.length === 0) return null;

  return (
    <nav className="iris-subnav" aria-label="Detail surfaces">
      {items.map((item) => {
        const href = `${root}/${item.key}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            className="iris-subnav-item"
            key={item.key}
            href={dynamicRoute(withPeriod(href, period))}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
