"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname, useSearchParams } from "next/navigation";

import type { PeriodPreset } from "@observer/readmodels";
import { ClosableDetails } from "@/components/ask-iris/ClosableDetails";
import { ContextSwitcher, type SwitchOption } from "@/components/ContextSwitcher";
import { PeriodSwitcher } from "@/components/PeriodSwitcher";
import { dynamicRoute } from "@/lib/href";
import { presetFrom, withPeriod } from "@/lib/period";
import { HOME_SEGMENT, PROJECT_NAV } from "@/lib/routes";

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
 * SWITCHING PROJECT KEEPS THE READER ON THE SAME SECTION.
 *
 * Every option the layout hands to a `ContextSwitcher` ends in
 * `/${HOME_SEGMENT}` — the layout is a server component that does not know
 * which of the project's own pages is rendering it, so it can only ever offer
 * the safe default. Reading Sales Flow and switching to a second project used
 * to land on that project's ASK IRIS regardless — a reader mid-comparison on
 * Sales Flow lost their place every time they moved.
 *
 * This substitutes the CURRENT top-level segment for the one the server
 * baked in. Only the first path piece survives the swap — `/units/A-402`
 * becomes `/units`, never `/units/A-402` on a project that may not have that
 * unit — which is the same reasoning `segmentOf` itself is built on: a drill
 * -down's specific id belongs to the project it was read from, and the
 * section it lives inside is the part that travels.
 *
 * Every one of these segments is a static route under the same dynamic
 * layout, valid for any tenant/project pair structurally — `requireSurface`
 * still gates what a role may see, exactly as it would if the reader had
 * typed the URL by hand.
 */
export function withCurrentSection(
  options: readonly SwitchOption[],
  segment: string,
): readonly SwitchOption[] {
  if (segment === "" || segment === HOME_SEGMENT) return options;
  const suffix = `/${HOME_SEGMENT}`;
  return options.map((option) =>
    option.href.endsWith(suffix)
      ? { ...option, href: `${option.href.slice(0, -suffix.length)}/${segment}` }
      : option,
  );
}

/**
 * THE WAY BACK TO THE PROJECTS LIST, FROM ASK IRIS.
 *
 * The Ask header is the export's: a name and a `Sign out` pill, no Projects
 * link — that lives on every other surface's header. Which left a reader who
 * signed in (every sign-in lands on Ask IRIS) with no way to the list of their
 * projects except the browser's Back button, and an E2E case that had said so
 * for as long as the variant existed. The project switch is the one control
 * the Ask header does carry, and "all of them" is a natural last entry in a
 * list of projects: the same select, one more row, no new chrome on the
 * composition the export fixes. `withCurrentSection` leaves it alone because
 * its href does not end in the home segment.
 */
export const ALL_PROJECTS_OPTION: SwitchOption = {
  value: "__all",
  label: "All projects",
  href: "/projects",
};

/**
 * The sub-navigation row, and which item in it is the page.
 *
 * Only Project owns one. It used to be that every OTHER section drew
 * `SECONDARY_NAV` — the four detail surfaces, Presentation DNA / Unit
 * Attention / Storytelling / Meetings — as a fallback row, reasoned as "the
 * product's second navigation, shown wherever a section has none of its own".
 *
 * ## Why that reasoning is retired, not merely relocated
 *
 * Every one of those four keys maps to the `project` SECTION in `SECTION_OF`
 * below — their content genuinely is about the project, which is exactly why
 * showing them under Sales Flow or Sales Agents broke on contact: clicking one
 * from Sales Flow navigated to a `project`-section URL, which reassigned the
 * PRIMARY nav highlight to Project and swapped this row to `PROJECT_NAV` —
 * which has no `presentation` key, so the tab just clicked vanished from the
 * row that replaced it. A control whose own click removes it from the screen
 * is broken regardless of where it is drawn, so this was not a placement bug
 * with one correct home; it was a control that could not have a home while
 * `SECTION_OF` and the tab row disagreed about which section it belonged to.
 *
 * `SECONDARY_NAV` itself is untouched — `reference-parity.test.ts` still pins
 * its four keys and labels as the reference's own wording — but it is no
 * longer rendered as a row anywhere. Its four destinations are reachable
 * through their natural homes instead, each named rather than merely present:
 * Units and Features are `PROJECT_NAV`'s own tabs (Storytelling permanently
 * redirects to Features, so the destination was always the same one);
 * "Unit Attention" is `/attention`, reached by name from Ask IRIS's quick
 * links (`AskQuickLinks`) rather than confused with `/units`, which is what
 * its old href pointed at; Presentation DNA is linked directly from `/project`,
 * the context the mandate says it must be reachable from.
 */
function rowFor(
  section: string,
  base: string,
  segment: string,
): { readonly tabs: readonly ShellTab[]; readonly label: string; readonly current: string | null } {
  if (section !== "project") return { tabs: [], label: "", current: null };

  return {
    tabs: PROJECT_NAV.map((item) => ({
      key: item.key,
      label: item.label,
      href: `${base}/${item.key}`,
    })),
    label: "Project sections",
    current: PROJECT_NAV.some((item) => item.key === segment) ? segment : null,
  };
}

/**
 * The mark from the design, as SVG.
 *
 * The artefact ships a 5963x1351 PNG for an element drawn 21px tall — 180KB of
 * logo on every page. The same wordmark exists as a 1.2KB vector, so that is
 * what ships.
 */
/**
 * The wordmark, and — per the founder's project-switching decision — the way
 * back to the current project's Ask IRIS from anywhere in the product.
 *
 * `href` is optional so the mark still renders unlinked wherever `Shell` is
 * given no project to return to; every caller today has one.
 */
function Brand({ href }: { readonly href?: Route }) {
  const mark = (
    <>
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
    </>
  );
  if (href === undefined) return <div className="irs-brand">{mark}</div>;
  return (
    <Link className="irs-brand" href={href} aria-label="IRIS by MADSPACE — this project's Ask IRIS">
      {mark}
    </Link>
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

/**
 * The mobile menu's own trigger mark — three bars, and an X.
 *
 * Both are always in the DOM; `irs-mobile-menu.css` rules keyed on the parent
 * `<details>`'s own `[open]` attribute show one and hide the other, so the
 * swap needs no script and no state duplicated outside the element that
 * already holds it.
 */
function MenuMark() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        className="irs-menu-mark-open"
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        className="irs-menu-mark-close"
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
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
  const mobileBarRef = useRef<HTMLDivElement>(null);

  /*
   * THE OPEN SHEET IS THE ONLY THING A READER CAN REACH.
   *
   * The sheet below is a native `<details>`, and a `<details>` is a
   * disclosure, not a dialog: opening it hides nothing else from the
   * keyboard. Measured on the real page at 412px: eleven controls inside the
   * sheet, then Tab lands on the page's own "Today" chip — visually under the
   * backdrop, focus ring and all — and 36 such controls were reachable in
   * total, the docked Ask composer's textarea among them. The backdrop did
   * not stop a pointer either: it is a `::after` on `.irs-mobile-bar`, which
   * is `pointer-events: none` so taps on its empty width fall through to the
   * brand mark, and a pseudo-element inherits that. `elementFromPoint` under
   * the open backdrop returned the page's `<h1>`.
   *
   * `inert` on the two regions a sheet covers — the page's `<main>` and the
   * docked composer — closes both at once: an inert subtree can take neither
   * focus nor a click, and leaves the accessibility tree. It is keyed on the
   * element's own `open` state through the native `toggle` event, so every
   * way the sheet closes (the close mark, Escape, an outside tap, a nav link)
   * clears it through one path, and unmounting clears it unconditionally.
   *
   * The composer lives outside `.irs-shell` altogether — a `<body>`-level
   * sibling rendered by the project layout — so it can only be reached by
   * selector. `#main` is queried the same way for symmetry; both are stable,
   * documented anchors (`AskDock.tsx`, this file's own `<main id="main">`).
   *
   * Crossing back above the breakpoint closes the sheet. Left open, it would
   * be `display: none` and still `open`, and `<main>` would stay inert under
   * a desktop header with nothing to explain it.
   */
  useEffect(() => {
    const details = mobileBarRef.current?.querySelector("details");
    if (details === null || details === undefined) return;

    const covered = () =>
      [document.getElementById("main"), document.querySelector<HTMLElement>(".ask-dock")].filter(
        (el): el is HTMLElement => el !== null,
      );
    const setInert = (on: boolean) => {
      for (const el of covered()) el.inert = on;
    };

    const onToggle = () => setInert(details.open);
    const wide = window.matchMedia("(min-width: 1200px)");
    const onWide = (event: MediaQueryListEvent) => {
      if (event.matches && details.open) details.open = false;
    };

    details.addEventListener("toggle", onToggle);
    wide.addEventListener("change", onWide);
    setInert(details.open);
    return () => {
      details.removeEventListener("toggle", onToggle);
      wide.removeEventListener("change", onWide);
      setInert(false);
    };
  }, []);

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
   *
   * ## THE SEGMENT, NOT THE SECTION
   *
   * This read `current === "ask"`, and `current` is a SECTION — `SECTION_OF`
   * maps `showroom` and `attention` onto `ask` so that all three light the same
   * nav item. The variant inherited that grouping and put the reduced Ask
   * header on two surfaces that are not Ask IRIS, silently removing Projects,
   * Settings, Administration and the demonstration badge from both. A reader on
   * the briefing had no way to reach their own settings at all.
   *
   * The nav item and the chrome are different questions about the same URL:
   * "which of the four sections is this" against "is this the one screen the
   * export composes". So the variant asks the segment directly.
   *
   * ## THE SEGMENT ALONE IS STILL NOT ENOUGH
   *
   * `segmentOf` returns the FIRST path piece below the project root, and that
   * piece is `"ask"` for three different routes: `/ask` itself, `/ask/history`
   * and `/ask/[threadId]`. The fix above repaired `/showroom` and `/attention`
   * and, by matching on the segment, silently gave the same reduced header to
   * the other two — real `ox-` screens that read `?period` and print a period
   * label (`ask/history/page.tsx`, `ask/[threadId]/page.tsx`) while the reduced
   * header hides the one control that could change it, and drops Projects,
   * Settings and Administration exactly as `/showroom` did before the first
   * fix.
   *
   * So this asks for the WHOLE remainder, not just its first piece: the export
   * composes exactly one screen, at exactly one address, and only that address
   * gets its header.
   */
  const remainder = pathname.startsWith(base) ? pathname.slice(base.length) : "";
  const variant = remainder === "" || remainder === "/ask" ? "ask" : "default";

  /**
   * The one thing a narrow header keeps visible without opening anything.
   *
   * "Preserve current project visibility" does not require the full switcher
   * to stay expanded — it requires a reader glancing at a narrow screen to be
   * able to tell which project they are in, which is a name, not a control.
   */
  const currentProjectLabel =
    projects.find((option) => option.value === scope.projectSlug)?.label ?? scope.projectSlug;

  return (
    <div className="irs-shell ox-root ox-graphite" data-variant={variant}>
      <header className="irs-header">
        <Brand href={dynamicRoute(withPeriod(`${base}/${HOME_SEGMENT}`, period))} />

        {/*
         * `aria-label="Sections"` rather than "Primary": it is what the
         * doctrine names these four, and what the accessibility suite asserts
         * the product's one primary navigation is called.
         *
         * `.irs-nav--wide` is hidden below the mobile-menu breakpoint —
         * `.irs-mobile-menu` below carries the same four links for a narrow
         * viewport, rather than this row shrinking until a destination
         * cannot be told from its neighbour.
         */}
        <nav className="irs-nav irs-nav--wide" aria-label="Sections">
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

        <div className="irs-header-end irs-header-end--wide">
          {/*
           * PROJECT SWITCHING ON ASK IRIS ITSELF.
           *
           * The founder's decision: an account authorised for several projects
           * must be able to move between them from inside Observer, and Ask
           * IRIS is where every sign-in lands — so the one place the export's
           * own composition has no room for a full context band is exactly the
           * one place a switch has to work anyway. Reusing `ContextSwitcher`
           * rather than a bespoke menu, restyled by `.irs-header-end .obs-action`
           * to sit beside `Sign out` at the same height. Gated on more than one
           * project so a single-project account (Martin) sees no new control —
           * the same gate the developer switcher already uses below.
           *
           * This is deliberately NOT the "which project this question is
           * about" control inside the Ask composer itself — that changes what
           * IRIS answers about without navigating; this changes where the
           * reader IS. Conflating the two would leak one project's comparison
           * scope onto another project's screen, which is the one thing this
           * decision must not do.
           */}
          {variant === "ask" && projects.length > 1 ? (
            <ContextSwitcher
              label="Switch project"
              value={scope.projectSlug}
              options={[...withCurrentSection(projects, segment), ALL_PROJECTS_OPTION]}
            />
          ) : null}
          <div className="irs-who">
            <div className="irs-who-name" title={viewer.displayName}>
              {viewer.displayName}
            </div>
            <div className="irs-who-role">{viewer.roleLabel}</div>
          </div>
          {variant === "ask" ? accountAsk : account}
        </div>
      </header>

      {/*
       * THE MOBILE MENU.
       *
       * A sibling of `<header>` rather than a child of it, on purpose:
       * `.irs-header` carries `backdrop-filter: blur(10px)`, and — like
       * `transform` or `filter` — a `backdrop-filter` other than `none`
       * makes an element the CONTAINING BLOCK for its own `position: fixed`
       * descendants. Nested inside the header, the fixed sheet below would
       * be positioned relative to the 70px header box instead of the
       * viewport. `iris-shell.css` positions this block to sit visually
       * where the header's trailing edge is at every width the header
       * itself does not already show it in.
       *
       * Hidden entirely above the mobile-menu breakpoint —
       * `.irs-nav--wide`/`.irs-header-end--wide` inside `<header>` above
       * carry the desktop header at every wider width and are themselves
       * hidden below it, so exactly one of the two renders sections/account
       * controls at any given width, never both and never neither.
       *
       * The project name stays visible outside the disclosure — a reader
       * glancing at a narrow screen can tell which project they are in
       * without opening anything — and everything a reader might need to
       * ACT on (sections, account, and on every non-Ask surface the
       * project/period switchers and connected sources) lives one tap away
       * inside it, reusing the exact popover mechanics already established
       * for Ask IRIS's own mobile sheets: `ClosableDetails` for
       * Escape/outside-click, a fixed bottom sheet with its own scrollable
       * body, `name` for native mutual exclusion with nothing else on this
       * header (there is nothing else to exclude, so the name is unused —
       * kept for the day a second disclosure joins it).
       *
       * NOT ON THE ASK VARIANT. The export's own header already reduces
       * itself at every width that matters — the nav gap steps down at
       * 1439/1199/768px and `.irs-who` drops below 1199px, all specific,
       * already-approved values read out of the delivered reference, not
       * chosen here. Rendering this menu on top of that would replace a
       * composition that already scored cleanly at every tested width with
       * a generic one it does not need, on the one screen this pass was
       * explicitly told not to touch.
       */}
      {variant === "ask" ? null : (
        <div className="irs-mobile-bar" ref={mobileBarRef}>
          <span className="irs-mobile-project" title={currentProjectLabel}>
            {currentProjectLabel}
          </span>
          <ClosableDetails className="irs-mobile-menu">
            <summary className="irs-mobile-menu-trigger" aria-label="Menu">
              <MenuMark />
            </summary>
            <div className="irs-mobile-menu-panel">
              <div className="irs-mobile-menu-head">
                <span className="irs-mobile-menu-title">Menu</span>
                <button
                  type="button"
                  className="irs-mobile-menu-close"
                  aria-label="Close menu"
                  onClick={(event) => {
                    const details = event.currentTarget.closest("details");
                    if (details !== null) details.open = false;
                  }}
                >
                  <MenuMark />
                </button>
              </div>

              <div className="irs-mobile-menu-scroll">
                <nav className="irs-mobile-nav" aria-label="Sections">
                  {NAV.map((item) => {
                    const active = item.key === current;
                    return (
                      <Link
                        key={item.key}
                        className="irs-mobile-nav-item"
                        href={dynamicRoute(withPeriod(`${base}${item.path}`, period))}
                        {...(active ? { "aria-current": "page" as const } : {})}
                      >
                        {item.sparkle === true ? <Sparkle /> : null}
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>

                {tabs === null || tabs.length === 0 ? null : (
                  <nav className="irs-mobile-nav irs-mobile-nav--tabs" aria-label={tabsLabel}>
                    {tabs.map((tab) => (
                      <Link
                        key={tab.key}
                        className="irs-mobile-nav-item"
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
                )}

                <div className="irs-mobile-context">
                  {tenants !== null && tenants.length > 1 ? (
                    <ContextSwitcher
                      label="Developer"
                      value={scope.tenantSlug}
                      options={withCurrentSection(tenants, segment)}
                    />
                  ) : null}
                  <ContextSwitcher
                    label="Project"
                    value={scope.projectSlug}
                    options={withCurrentSection(projects, segment)}
                  />
                  <PeriodSwitcher />
                  {sources.length === 0 ? null : (
                    <ul className="ox-sources" aria-label="Connected sources">
                      {sources.map((source) => (
                        <li key={source.name} className="ox-source" data-state={source.state}>
                          <span className="ox-source-dot" aria-hidden="true" />
                          <span>{source.name}</span>
                          <span className="ox-source-state">{source.stateLabel}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="irs-mobile-who">
                  <div className="irs-who-name" title={viewer.displayName}>
                    {viewer.displayName}
                  </div>
                  <div className="irs-who-role">{viewer.roleLabel}</div>
                </div>
                <div className="irs-mobile-account">{account}</div>
              </div>
            </div>
          </ClosableDetails>
        </div>
      )}

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
              <ContextSwitcher
                label="Developer"
                value={scope.tenantSlug}
                options={withCurrentSection(tenants, segment)}
              />
            ) : null}
            <ContextSwitcher
              label="Project"
              value={scope.projectSlug}
              options={withCurrentSection(projects, segment)}
            />
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
