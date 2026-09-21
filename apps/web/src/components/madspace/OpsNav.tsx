"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The MADSPACE operations rail.
 *
 * **Only routes that exist appear here.** Events is still a planned surface and
 * is deliberately absent rather than rendered disabled: a nav item that leads
 * nowhere teaches an operator that the product is broken, and a greyed-out one
 * advertises something they will never be given. Each becomes a line in the
 * list below on the day its route lands, and not before — Diagnostics is in the
 * list because `/madspace/diagnostics` now exists and reads the control plane.
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
  {
    /*
     * Diagnostics is account-wide rather than a drill-down, which is why it is
     * a sibling of Projects instead of a tab inside one: the question it answers
     * — which installation is wrong — is asked before anybody knows which
     * project to open.
     */
    href: "/madspace/diagnostics",
    label: "Diagnostics",
    exact: false,
    owns: [] as readonly string[],
  },
  {
    /* Tenants, agencies and people: account-wide, like Diagnostics. */
    href: "/madspace/directory",
    label: "Directory",
    exact: false,
    owns: [] as readonly string[],
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
