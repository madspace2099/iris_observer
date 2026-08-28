"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, type ReactNode } from "react";
import { DEMO_PROJECTS } from "../fixtures";
import { CHANNEL_LABEL, RANGE_LABEL, type Selection } from "../metrics";
import { RANGES, CHANNELS } from "../params";
import { dynamicRoute } from "@/lib/href";

/**
 * The Observer application shell.
 *
 * ## Why the selection lives in the URL, and is read on the server
 *
 * Project, range and channel are in the query string rather than in a store.
 * A screen can then be linked to and reopened exactly as it was, and the back
 * button steps through what the reader actually looked at.
 *
 * It is read in the PAGE, on the server, and passed down — not read here with
 * `useSearchParams`. That hook suspends, and under a Suspense boundary the
 * fallback is what a reader sees: the first build of this surface rendered its
 * own skeleton over the real dashboard, which looked like a loading bug and was
 * really a rendering-model mistake. Reading the parameters where they arrive
 * removes the boundary, the fallback and the class of bug.
 *
 * Nothing is persisted anywhere else. There is no storage call, no cookie and
 * no service — the whole surface is a pure function of the URL and a frozen
 * fixture.
 */

const NAV: readonly { href: string; label: string; icon: ReactNode }[] = [
  {
    href: "/observer/overview",
    label: "Overview",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect
          x="1.5"
          y="1.5"
          width="5.5"
          height="6.5"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <rect
          x="9"
          y="1.5"
          width="5.5"
          height="4"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <rect
          x="1.5"
          y="9.5"
          width="5.5"
          height="5"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <rect
          x="9"
          y="7"
          width="5.5"
          height="7.5"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.3"
        />
      </svg>
    ),
  },
  {
    href: "/observer/units",
    label: "Units",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M2.5 14V4.2L8 1.5l5.5 2.7V14"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path d="M6 14v-3.6h4V14" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        <path
          d="M6 6.6h1.2M8.8 6.6H10"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    href: "/observer/insights",
    label: "Insights",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M8 1.6a4.4 4.4 0 0 0-2.6 7.95c.42.31.66.79.66 1.3v.35h3.88v-.35c0-.51.24-.99.66-1.3A4.4 4.4 0 0 0 8 1.6Z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path
          d="M6.4 13.4h3.2M6.9 15h2.2"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

/** Destinations that exist as a plan, shown as such rather than as dead links. */
const LATER: readonly string[] = ["Sales team", "Reports"];

/**
 * The selection, handed down from the page that read it.
 *
 * A context rather than prop-drilling through every panel: the shell and the
 * body are siblings under one page, and threading three values through six
 * components would obscure what they are for.
 */
const SelectionContext = createContext<Selection>({
  projectId: "ister-tower",
  range: "28d",
  channel: "all",
});

export function useSelection(): Selection {
  return useContext(SelectionContext);
}

export function Shell({
  selection,
  title,
  subtitle,
  children,
}: {
  selection: Selection;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams({
        project: selection.projectId,
        range: selection.range,
        channel: selection.channel,
      });
      next.set(key, value);
      router.replace(dynamicRoute(`${pathname}?${next.toString()}`), { scroll: false });
    },
    [pathname, router, selection],
  );

  /* Navigation carries the selection, so moving between pages keeps the window. */
  const withSelection = (href: string): string => {
    const q = new URLSearchParams({
      project: selection.projectId,
      range: selection.range,
      channel: selection.channel,
    });
    return `${href}?${q.toString()}`;
  };

  const project = DEMO_PROJECTS.find((p) => p.id === selection.projectId) ?? DEMO_PROJECTS[0];

  return (
    <SelectionContext.Provider value={selection}>
      <div className="od">
        <div className="od-shell">
          <aside className="od-side">
            <div className="od-brand">
              <span className="od-mark" aria-hidden="true">
                IO
              </span>
              <span>
                <span className="od-brand-name">IRIS Observer</span>
                <span className="od-brand-sub">MADSPACE</span>
              </span>
            </div>

            <nav className="od-navgroup" aria-label="Observer sections">
              <span className="od-navlabel">Analyse</span>
              {NAV.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    className="od-nav"
                    href={dynamicRoute(withSelection(item.href))}
                    aria-current={active ? "page" : undefined}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="od-navgroup">
              <span className="od-navlabel">Planned</span>
              {LATER.map((label) => (
                <span key={label} className="od-nav-soon">
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.3" />
                    <path
                      d="M8 4.8V8l2.2 1.5"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                    />
                  </svg>
                  {label}
                  <span className="od-soon">Later</span>
                </span>
              ))}
            </div>

            <div className="od-side-foot">
              <div className="od-workspace">
                <span className="od-avatar" aria-hidden="true">
                  MT
                </span>
                <span>
                  <span className="od-workspace-name">MADSPACE</span>
                  <span className="od-workspace-role">Demonstration workspace</span>
                </span>
              </div>
            </div>
          </aside>

          <div className="od-main">
            <header className="od-top">
              <div>
                <h1 className="od-title">{title}</h1>
                <p className="od-subtitle">{subtitle}</p>
              </div>

              <div className="od-top-controls">
                <label className="od-select">
                  <span className="od-visually-hidden">Project</span>
                  <select
                    value={selection.projectId}
                    onChange={(e) => setParam("project", e.target.value)}
                  >
                    {DEMO_PROJECTS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="od-segment" role="group" aria-label="Date range">
                  {RANGES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      aria-pressed={selection.range === r}
                      onClick={() => setParam("range", r)}
                    >
                      {r === "7d" ? "7d" : r === "28d" ? "28d" : "90d"}
                    </button>
                  ))}
                </div>

                <div className="od-segment" role="group" aria-label="Channel">
                  {CHANNELS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={selection.channel === c}
                      onClick={() => setParam("channel", c)}
                    >
                      {c === "all" ? "All" : CHANNEL_LABEL[c]}
                    </button>
                  ))}
                </div>

                {/*
                 * THE DEMONSTRATION FLAG IS PART OF THE CHROME, not a footnote.
                 * Every figure on every screen comes from a frozen fixture, and a
                 * reader who scrolls past one banner should still be told.
                 */}
                <span className="od-demo-flag" title="Every figure is synthetic and deterministic.">
                  <span className="od-demo-dot" aria-hidden="true" />
                  Demo data
                </span>
              </div>
            </header>

            <main className="od-body" id="main">
              <p className="od-visually-hidden" aria-live="polite">
                {project?.name} · {RANGE_LABEL[selection.range]} ·{" "}
                {CHANNEL_LABEL[selection.channel]}
              </p>
              {children}
            </main>
          </div>
        </div>
      </div>
    </SelectionContext.Provider>
  );
}
