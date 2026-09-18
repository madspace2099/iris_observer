import Link from "next/link";
import type { PeriodPreset } from "@observer/readmodels";

import { dynamicRoute } from "@/lib/href";
import { withPeriod } from "@/lib/period";

export interface TabItem {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  /** Exactly one item should be current. Nothing enforces it but the caller. */
  readonly current: boolean;
}

/**
 * SUB-NAVIGATION INSIDE ONE SCREEN.
 *
 * Not the shell's row. `Shell.tsx` already draws `.ox-tabs` under the header for
 * the section's own faces — Project's four, or the detail surfaces — and that
 * row is a property of where the reader is in the product. This is the smaller
 * thing: a cut of the SAME screen. Which cohort, which block, which of three
 * ways of reading one register.
 *
 * The distinction is why this uses `.ox-toggle` chips rather than `.ox-tab`
 * underlines. Two rows of underlined tabs stacked one above the other would
 * read as one navigation with an arbitrary break in it, and the reader would
 * have no way to tell which row moves them to another surface and which
 * re-cuts the one they are on.
 *
 * ## Every chip is a link, and the state lives in the URL
 *
 * There is no `useState` here and there cannot be. A reader who chose a cut and
 * sent the URL to a colleague must be sending the cut as well, and there is no
 * browser storage anywhere in this application — a test scans `apps/web/src`
 * for `localStorage`, `sessionStorage` and `indexedDB` and expects zero hits.
 * Remembered tabs live in the query string or they are not remembered.
 *
 * `aria-current="true"` rather than `"page"`: these chips do not change the
 * page, they change what it is showing, and the stylesheet keys the selected
 * treatment off exactly that value.
 */
export function Tabs({
  label,
  tabs,
  period,
}: {
  /** What this row of chips selects between. Becomes the nav's accessible name. */
  readonly label: string;
  readonly tabs: readonly TabItem[];
  readonly period: PeriodPreset;
}) {
  if (tabs.length === 0) return null;

  return (
    <nav aria-label={label}>
      <ul className="ox-chipset">
        {tabs.map((tab) => (
          <li key={tab.key}>
            <Link
              className="ox-toggle"
              href={dynamicRoute(withPeriod(tab.href, period))}
              {...(tab.current ? { "aria-current": "true" as const } : {})}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
