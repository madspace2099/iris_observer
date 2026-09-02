import type { ReactNode } from "react";
import Link from "next/link";

import type { Route } from "next";

/**
 * The IRIS shell — brand, primary navigation, and the ground everything sits on.
 *
 * One shell for the whole application, from the design the user approved. It
 * replaces nothing structural: the surfaces it wraps are the same surfaces, and
 * what changes is the frame around them and the four words at the top of it.
 *
 * ## The navigation changed, and that is a decision rather than a detail
 *
 * The approved information architecture was **Overview · Sales Flow · Project ·
 * People** (doctrine §7, ADR-0019). The design replaces it with **Ask IRIS ·
 * Sales Flow · Project · Sales Agents**, and the user chose that in
 * conversation — which the doctrine's own source hierarchy puts above the
 * documents.
 *
 * Two of those four are genuine changes rather than renames:
 *
 *   - `Overview` becomes `Ask IRIS`. The executive briefing was the landing
 *     surface; now a question is. The briefing's content does not disappear —
 *     it is what Ask IRIS answers with — but the first thing a reader meets is
 *     a prompt rather than a summary.
 *   - `People` becomes `Sales Agents`. Narrower by name: `People` covered
 *     agents and contacts, and the new label claims only the first.
 *
 * Both are recorded in `docs/adr/0033-ask-iris-is-the-landing-surface.md`.
 */

/** Where the four items go. Slug-scoped, because every surface is per project. */
export interface ShellScope {
  readonly tenantSlug: string;
  readonly projectSlug: string;
}

export interface ShellViewer {
  readonly displayName: string;
  readonly roleLabel: string;
}

interface NavItem {
  readonly key: string;
  readonly label: string;
  readonly path: string;
  /** The sparkle, on Ask IRIS alone. It marks the one surface that answers. */
  readonly sparkle?: boolean;
}

const NAV: readonly NavItem[] = [
  { key: "ask", label: "ASK IRIS", path: "", sparkle: true },
  { key: "flow", label: "Sales Flow", path: "/flow" },
  { key: "project", label: "Project", path: "/project" },
  { key: "agents", label: "Sales Agents", path: "/agents" },
];

/**
 * The mark from the design, as SVG.
 *
 * The artefact ships a 5963x1351 PNG for an element drawn 21px tall — 180KB of
 * logo on every page. The same wordmark exists as a 1.2KB vector, so that is
 * what ships.
 */
function Brand() {
  return (
    <div className="irs-brand">
      {/*
       * A plain `img`, not `next/image`. The optimiser exists to resize and
       * re-encode rasters; this is a 1.2KB vector at a fixed 21px height, so
       * there is nothing to optimise and a loader in front of it would only add
       * a request. The repository has no `@next/next` lint plugin configured,
       * so there is no rule here to satisfy either way.
       */}
      <img className="irs-brand-mark" src="/brand/iris-wordmark.svg" alt="IRIS" />
      <span className="irs-brand-sub" aria-label="by MADSPACE">
        by MADSPACE
      </span>
    </div>
  );
}

function Sparkle() {
  return (
    <svg
      className="irs-nav-icon"
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 2.6l2.05 5.5 5.5 2.05-5.5 2.05L12 17.7l-2.05-5.5L4.45 10.15l5.5-2.05z" />
      <path d="M18.6 15.4l.85 2.25 2.25.85-2.25.85-.85 2.25-.85-2.25-2.25-.85 2.25-.85z" />
    </svg>
  );
}

export function Shell({
  scope,
  viewer,
  current,
  wide = false,
  children,
}: {
  readonly scope: ShellScope;
  readonly viewer: ShellViewer;
  /** Which nav item is the page. Matched on {@link NavItem.key}. */
  readonly current: string;
  /** Analytical surfaces opt out of the reading measure. */
  readonly wide?: boolean;
  readonly children: ReactNode;
}) {
  const base = `/${scope.tenantSlug}/${scope.projectSlug}`;

  return (
    <div className="irs-shell">
      <header className="irs-header">
        <Brand />

        <nav className="irs-nav" aria-label="Primary">
          {NAV.map((item) => {
            const href = `${base}${item.path}` as Route;
            const active = item.key === current;
            return (
              <Link
                key={item.key}
                className="irs-nav-item"
                href={href}
                {...(active ? { "aria-current": "page" as const } : {})}
              >
                {item.sparkle === true ? <Sparkle /> : null}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="irs-header-end">
          <div className="irs-who">
            <div className="irs-who-name">{viewer.displayName}</div>
            <div className="irs-who-role">{viewer.roleLabel}</div>
          </div>
        </div>
      </header>

      <main className={wide ? "irs-main irs-main--wide" : "irs-main"} id="main">
        {children}
      </main>
    </div>
  );
}
