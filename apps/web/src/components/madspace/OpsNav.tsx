"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The MADSPACE operations rail.
 *
 * **Only routes that exist appear here.** Diagnostics and Events are planned
 * surfaces and are deliberately absent rather than rendered disabled: a nav
 * item that leads nowhere teaches an operator that the product is broken, and a
 * greyed-out one advertises something they will never be given. Each becomes a
 * line in the list below on the day its route lands, and not before.
 *
 * Sources has no index of its own either — a source is always reached through
 * the project that owns it, which is also the only place the operator has the
 * context to tell two showroom installations apart.
 */
const ITEMS = [
  {
    href: "/madspace",
    label: "Administration",
    /* Exact, because this href is a prefix of every other one. */
    exact: true,
    owns: [] as readonly string[],
  },
  {
    href: "/madspace/projects",
    label: "Projects",
    exact: false,
    /* Source Detail is a drill-down of a project, so Projects stays current. */
    owns: ["/madspace/sources"] as readonly string[],
  },
] as const;

export function OpsNav() {
  const pathname = usePathname();

  return (
    <nav className="obs-nav" aria-label="MADSPACE operations">
      {ITEMS.map((item) => {
        const onItem = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const onOwned = item.owns.some(
          (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
        );
        return (
          <Link
            className="obs-nav-item"
            key={item.href}
            href={item.href}
            aria-current={onItem || onOwned ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
