"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import type { PeriodPreset } from "@observer/readmodels";
import { ContextSwitcher, type SwitchOption } from "@/components/ContextSwitcher";
import { PeriodSwitcher } from "@/components/PeriodSwitcher";
import { dynamicRoute } from "@/lib/href";
import { presetFrom, withPeriod } from "@/lib/period";
import { PROJECT_NAV, SECONDARY_NAV } from "@/lib/routes";

/**
 * The IRIS shell — brand, navigation, context, and the ground everything sits on.
 *
 * One shell for the whole customer-facing product. The surfaces it wraps are
 * the same surfaces; what changes is the frame around them, the four words at
 * the top of it, and the fact that the frame now carries the two values every
 * analytical surface underneath depends on.
 *
 * ## The navigation is a decision rather than a detail
 *
 * The approved information architecture was **Overview · Sales Flow · Project ·
 * People** (doctrine §7, ADR-0019). It is now **Ask IRIS · Sales Flow ·
 * Project · Sales Agents**, chosen by the user in conversation — which the
 * doctrine's own source hierarchy puts above the documents — and recorded in
 * `docs/adr/0033-ask-iris-is-the-landing-surface.md`.
 *
 * Two of the four are genuine changes rather than renames:
 *
 *   - `Overview` becomes `Ask IRIS`. The executive briefing was the landing
 *     surface; now a question is. The briefing's content does not disappear —
 *     it is what Ask IRIS answers with, and it is still reachable by name — but
 *     the first thing a reader meets is a prompt rather than a summary.
 *   - `People` becomes `Sales Agents`. Narrower by name: `People` covered
 *     agents and contacts, and the new label claims only the first.
 *
 * ## What ADR-0033 left open, and what this settles
 *
 * ADR-0033 recorded one consequence it could not answer from the artefact: the
 * artefact shows a single screen, so it shows neither a project switcher nor a
 * period switcher, and **every analytical surface depends on both**. A chart
 * without a period is a chart of nothing in particular.
 *
 * They live HERE, in a context band directly under the header, and nowhere
 * else. Not inside a chart, not repeated per panel: a screen where two panels
 * carry their own period controls is a screen where two panels can silently
 * measure different spans, and that defect has already been fixed twice in this
 * codebase. The band is sticky for the same reason the header is — the values
 * it states are the ones every figure below is qualified by, so they must not
 * scroll away from the figures they qualify.
 *
 * Both values live in the URL rather than in client state, so any screen can be
 * linked to and shared exactly as it was read. That is also why every nav link
 * below is built through `withPeriod`: navigation used to drop the period, and
 * a reader who chose "Last 28 days" and then opened Project was silently
 * returned to the quarter.
 *
 * ## WHERE THE PERIOD COMES FROM, AND WHY THIS FILE IS A CLIENT COMPONENT
 *
 * The shell is rendered by the project LAYOUT, because it is the frame the
 * surfaces underneath share — one header, one navigation, one context band and
 * one `<main id="main">` for the skip link to target. Three surfaces cannot
 * each own a landmark.
 *
 * A layout does not receive `searchParams`. The App Router hands the query to a
 * PAGE and to nothing else, on purpose: a layout is not re-rendered when only
 * the query changes, so a period read there would go stale the moment somebody
 * used the period switcher.
 *
 * So the shell reads the URL itself, through `useSearchParams` and
 * `usePathname` — which is the mechanism Next provides for exactly this, and
 * the one this codebase was already using in this position: `PrimaryNav`,
 * `DetailNav` and `PeriodSwitcher` all sat in this layout and all read the URL
 * this way. What is NOT done here is sniffing the request with `headers()`: the
 * URL a proxy reports is not the URL the router is on, and a layout that reads
 * one and links with the other is a layout that lies about where the reader is.
 *
 * The consequence is that three props are OPTIONAL rather than required, and
 * omitting them is the normal case:
 *
 *   - `period`  — omitted, the URL decides. A caller that already holds the
 *                 period (a page, which does get `searchParams`) may pass it.
 *   - `current` — omitted, the pathname decides. Derivation cannot disagree
 *                 with the address bar; a hand-passed value can, and did.
 *   - `tabs`    — omitted, the section's own row is drawn. Explicit `null`
 *                 means "this surface has no sub-navigation", which is a
 *                 different statement and stays available.
 *
 * A client component still receives server-rendered children: `children` and
 * `account` arrive as nodes, which is why the sign-out server action can live
 * in the layout and still be rendered inside this frame.
 *
 * ## Why `dynamicRoute` and not `as Route`
 *
 * Typed routes verify links written in source. They cannot verify a path
 * assembled from a tenant slug and a project slug at runtime. `dynamicRoute` is
 * the one place that widening is named, and this file used a bare `as Route`
 * before — the only customer surface that did.
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

/**
 * A named installation and whether it is reporting.
 *
 * The customer surfaces used to describe their inputs only as a string union —
 * `webiris | showroom | crm | catalogue` — which is enough to decide whether a
 * figure can be computed and not enough to tell a reader WHICH machine went
 * quiet. A source with a name is a source somebody can go and look at.
 *
 * `state` carries a word as well as a colour, because roughly one man in twelve
 * cannot separate the green from the amber and greyscale print loses both.
 */
export interface ShellSource {
  readonly name: string;
  readonly state: "live" | "offline" | "absent";
  readonly stateLabel: string;
}

/** One tab in the sub-navigation, when a section has one. */
export interface ShellTab {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  /** A count beside the label, where the section has an honest one to show. */
  readonly count?: string | null;
}

interface NavItem {
  readonly key: string;
  readonly label: string;
  readonly path: string;
  /** The sparkle, on Ask IRIS alone. It marks the one surface that answers. */
  readonly sparkle?: boolean;
}

/**
 * The four items, and the reason the first one has a path at all.
 *
 * It used to be `path: ""`, which resolved to `/{tenant}/{project}` — a URL
 * with no page behind it. The approved design's own first navigation item
 * returned a 404 on every project. Ask IRIS is now a surface like the other
 * three, and the bare project URL redirects to it.
 */
const NAV: readonly NavItem[] = [
  { key: "ask", label: "ASK IRIS", path: "/ask", sparkle: true },
  { key: "flow", label: "Sales Flow", path: "/flow" },
  { key: "project", label: "Project", path: "/project" },
  { key: "agents", label: "Sales Agents", path: "/agents" },
];

/**
 * WHICH OF THE FOUR A URL IS INSIDE.
 *
 * Every project surface belongs to one section, including the ones that are not
 * themselves navigation items: a reader looking at one unit is inside Project,
 * and a reader looking at the briefing is inside Ask IRIS, because that is
 * where the link to it lives.
 *
 * Written as a table rather than as prefix matching so that a surface which
 * does NOT belong to the section its path suggests can say so — `showroom` and
 * `attention` are both reached from Ask IRIS and neither is under `/ask`.
 */
const SECTION_OF: Readonly<Record<string, string>> = {
  "": "ask",
  ask: "ask",
  showroom: "ask",
  attention: "ask",
  flow: "flow",
  audience: "flow",
  overview: "flow",
  people: "flow",
  project: "project",
  units: "project",
  meetings: "project",
  features: "project",
  presentation: "project",
  storytelling: "project",
  agents: "agents",
};

/** The first path segment below the project root, or "" at the root itself. */
function segmentOf(pathname: string, base: string): string {
  if (!pathname.startsWith(base)) return "";
  return pathname.slice(base.length).split("/")[1] ?? "";
}

/**
 * The sub-navigation row, and which item in it is the page.
 *
 * Project owns its own four faces (`PROJECT_NAV`). Every other section shows
 * the detail surfaces (`SECONDARY_NAV`) — the row that was global before this
 * rollout, and which is what keeps Presentation DNA and Storytelling reachable
 * rather than merely present in the repository.
 */
function rowFor(
  section: string,
  base: string,
  segment: string,
): { readonly tabs: readonly ShellTab[]; readonly label: string; readonly current: string | null } {
  /*
   * ASK IRIS CARRIES NO SUB-NAVIGATION, AND THAT IS THE DESIGN'S DECISION.
   *
   * The delivered artefact for this route draws the header, then the composer,
   * and nothing between them. Rendering the detail-surfaces row there put four
   * links a reader did not ask for — Presentation DNA, Unit Attention,
   * Storytelling, Meetings — directly under a screen whose whole proposition is
   * one empty field, and pushed the composer 43px down the page for the
   * privilege.
   *
   * Those four surfaces do not become unreachable: they are still the row on
   * every other section, and `surfaces.test.ts` checks reachability against
   * `SECONDARY_NAV` itself rather than against where it is drawn.
   */
  if (section === "ask") return { tabs: [], label: "", current: null };

  const row = section === "project" ? PROJECT_NAV : SECONDARY_NAV;
  return {
    tabs: row.map((item) => ({
      key: item.key,
      label: item.label,
      href: `${base}/${item.key}`,
    })),
    label: section === "project" ? "Project sections" : "Detail surfaces",
    current: row.some((item) => item.key === segment) ? segment : null,
  };
}

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
  current: givenCurrent,
  period: givenPeriod,
  projects,
  tenants = null,
  sources = [],
  tabs: givenTabs,
  tabsLabel: givenTabsLabel,
  currentTab: givenCurrentTab,
  account = null,
  accountAsk = null,
  wide = true,
  children,
}: {
  readonly scope: ShellScope;
  readonly viewer: ShellViewer;
  /**
   * Which nav item is the page. Matched on {@link NavItem.key}.
   *
   * Omit it and the pathname decides, which is what the layout does — a value
   * derived from the address bar cannot disagree with the address bar.
   */
  readonly current?: string;
  /** The period. Omit it and the URL decides; see the note above. */
  readonly period?: PeriodPreset;
  /** Every project this account may open, each carrying its own href. */
  readonly projects: readonly SwitchOption[];
  /** The developer switcher, and only when the account holds more than one. */
  readonly tenants?: readonly SwitchOption[] | null;
  readonly sources?: readonly ShellSource[];
  /**
   * The sub-navigation. Omitted draws the section's own row; explicit `null`
   * says this surface has none. Those are different statements.
   */
  readonly tabs?: readonly ShellTab[] | null;
  readonly tabsLabel?: string;
  readonly currentTab?: string | null;
  /** The account controls. A server action cannot cross into this file. */
  readonly account?: ReactNode;
  /**
   * The same controls, reduced to what the Ask IRIS reference draws.
   *
   * A second node rather than a flag, for the same reason `account` is a node
   * at all: the sign-out is a server action, and a client component cannot
   * build one. The layout knows how to make both; this file only chooses.
   */
  readonly accountAsk?: ReactNode;
  /**
   * Analytical surfaces take the full measure; a reading surface may opt into
   * the narrow column. It defaults to WIDE, because all but one of the
   * product's surfaces carry a table, a roster or a chart.
   */
  readonly wide?: boolean;
  readonly children: ReactNode;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  const base = `/${scope.tenantSlug}/${scope.projectSlug}`;

  /*
   * The three values the URL owns, resolved once and used everywhere below.
   *
   * `givenTabs === undefined` is "nobody said", which draws the section's own
   * row; `givenTabs === null` is "this surface has none". They are different
   * answers and the distinction is the reason `tabs` has no default.
   */
  const period = givenPeriod ?? presetFrom(params.get("period") ?? undefined);
  const segment = segmentOf(pathname, base);
  const current = givenCurrent ?? SECTION_OF[segment] ?? "ask";
  const derived = rowFor(current, base, segment);
  const tabs = givenTabs === undefined ? derived.tabs : givenTabs;
  const tabsLabel = givenTabsLabel ?? derived.label;
  const currentTab = givenCurrentTab ?? derived.current;

  /**
   * ASK IRIS WEARS THE HEADER ITS OWN DESIGN SPECIFIES; NOTHING ELSE MOVES.
   *
   * The user delivered an HTML export as the visual source of truth for
   * `/ask` and, separately, asked that Sales Flow, Project, Sales Agents,
   * Briefing, Units, Meetings and Meeting Detail not change. Those two
   * instructions meet in exactly one place — the header is shared — so the
   * difference is a VARIANT rather than a second shell.
   *
   * One attribute carries it. `iris-shell.css` holds three rules keyed on
   * `[data-variant="ask"]`: the export's nav gap and its two steps, its
   * `Sign out` pill, and dropping the reader's name at the width the export
   * drops it. Every other surface reads the attribute as `default` and renders
   * exactly what it rendered before.
   *
   * Duplicating the shell to change one button was the alternative, and it is
   * how two headers end up disagreeing about the navigation six months later.
   */
  const variant = current === "ask" ? "ask" : "default";

  return (
    <div className="irs-shell ox-root ox-graphite" data-variant={variant}>
      <header className="irs-header">
        <Brand />

        {/*
         * `aria-label="Sections"` rather than "Primary": it is what the
         * doctrine names these four, and what the accessibility suite asserts
         * the product's one primary navigation is called.
         */}
        <nav className="irs-nav" aria-label="Sections">
          {NAV.map((item) => {
            const active = item.key === current;
            return (
              <Link
                key={item.key}
                className="irs-nav-item"
                href={dynamicRoute(withPeriod(`${base}${item.path}`, period))}
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
          {variant === "ask" ? accountAsk : account}
        </div>
      </header>

      {/*
       * THE CONTEXT BAND — which project, over what period, from which sources.
       *
       * The three facts every figure below is qualified by, stated once. The
       * sources are here rather than on a diagnostics screen because a reader
       * looking at a figure needs to know it is still being fed: an installation
       * that stopped reporting on Tuesday does not make a chart look wrong, it
       * makes it look finished.
       */}
      {/*
       * ASK IRIS DOES NOT DRAW IT, AND LOSES NOTHING BY NOT DRAWING IT.
       *
       * The reference has no second utility row, and a band of selectors above
       * the composer is the one thing that would stop the composition reading
       * as the design. So the band is omitted there — visually. The CONTEXT is
       * untouched: the project is in the route, the period is in the query and
       * is read by the page, and every link this header builds still carries it
       * through `withPeriod`. A reader who arrives on Ask IRIS having chosen
       * "Last 28 days" is still on 28 days, and leaves on 28 days.
       *
       * What they cannot do is CHANGE either from this screen, which is the
       * trade the design makes: one keystroke to Sales Flow, where both
       * controls are, against a composition the artefact does not have.
       */}
      {variant === "ask" ? null : (
        <div className="ox-context">
          <div className="ox-context-set">
            {tenants !== null && tenants.length > 1 ? (
              <ContextSwitcher label="Developer" value={scope.tenantSlug} options={tenants} />
            ) : null}
            <ContextSwitcher label="Project" value={scope.projectSlug} options={projects} />
            <PeriodSwitcher />
          </div>

          {sources.length > 0 ? (
            <ul className="ox-sources" aria-label="Connected sources">
              {sources.map((source) => (
                <li key={source.name} className="ox-source" data-state={source.state}>
                  <span className="ox-source-dot" aria-hidden="true" />
                  <span>{source.name}</span>
                  <span className="ox-source-state">{source.stateLabel}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      {tabs !== null && tabs.length > 0 ? (
        <nav className="ox-tabs" aria-label={tabsLabel}>
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              className="ox-tab"
              href={dynamicRoute(withPeriod(tab.href, period))}
              {...(tab.key === currentTab ? { "aria-current": "page" as const } : {})}
            >
              {tab.label}
              {tab.count !== undefined && tab.count !== null ? (
                <span className="ox-tab-count">{tab.count}</span>
              ) : null}
            </Link>
          ))}
        </nav>
      ) : null}

      <main className={wide ? "irs-main irs-main--wide" : "irs-main"} id="main">
        {children}
      </main>
    </div>
  );
}
