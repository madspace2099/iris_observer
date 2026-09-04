import type { ReactNode } from "react";
import Link from "next/link";
import type { PeriodPreset } from "@observer/readmodels";

import { dynamicRoute } from "@/lib/href";
import { withPeriod } from "@/lib/period";

/**
 * One crumb. The last one is the page itself and carries no route.
 *
 * A breadcrumb whose final item links to where the reader already is teaches
 * them that a crumb might not move them, which makes the ones that do move them
 * less trustworthy.
 */
export interface Crumb {
  readonly label: string;
  /** Omitted on the current page. Everything else must be reachable. */
  readonly href?: string;
}

/**
 * THE HEAD OF A SCREEN — and the reason the frame is dark.
 *
 * `observer-product.css` §6 and ADR-0034 make one argument: above the seam is
 * what we CONCLUDE, below it is what we MEASURED. This component is everything
 * above the seam, and it always renders on graphite. It must never be wrapped in
 * a `.ox-paper` plate, and there is no prop that would let it be.
 *
 * The four pieces of text are four different jobs and they are not
 * interchangeable:
 *
 *   kicker  where the reader is, and over what period. Uppercase, quiet.
 *   title   what this screen is. A noun, not a sentence.
 *   answer  THE CONCLUSION. One sentence with its number inside it. This is
 *           the ten-second answer Stano's principles require, and it is the
 *           reason the whole head exists rather than a bare `<h1>`.
 *   lede    what to know before reading the measurements. Optional, and it is
 *           the first thing to cut when a screen gets long.
 *
 * `answer` is optional in the type and should be present on every analytical
 * surface. A screen with a title and no conclusion is a collection of data
 * boxes with a name on it, which is the thing the doctrine's §2 is written
 * against. It is optional because a small number of surfaces — a register, a
 * single meeting replay — genuinely state their subject rather than a verdict
 * about it, and forcing those to invent one would produce exactly the confident
 * sentence with nothing behind it that everything else here works to prevent.
 *
 * ## Hrefs, and why this takes a period
 *
 * `typedRoutes` verifies links written as literals; a crumb assembled from a
 * tenant slug and a project slug is not one, so it goes through
 * `dynamicRoute`. And every internal link carries the period, because
 * navigation used to drop it: a reader who chose "Last 28 days" and then used a
 * crumb was silently returned to the quarter and compared two screens measuring
 * different spans without being told.
 *
 * ## The aside
 *
 * A slot rather than a set of props, because what belongs there differs by
 * surface: an export control on the executive view, the synthetic-data
 * statement on all of them, a link to the meeting behind a replay. It renders
 * right-aligned above 64rem and left-aligned below it, which is the sheet's
 * decision and not this component's.
 */
export function PageHead({
  kicker,
  title,
  answer = null,
  lede = null,
  crumbs = [],
  aside = null,
  period,
}: {
  readonly kicker: string;
  readonly title: ReactNode;
  /** The conclusion, in one sentence, with its figure inside it. */
  readonly answer?: ReactNode;
  readonly lede?: ReactNode;
  readonly crumbs?: readonly Crumb[];
  /** Actions and statements belonging to the whole screen. */
  readonly aside?: ReactNode;
  readonly period: PeriodPreset;
}) {
  return (
    <header className="ox-head">
      <div className="ox-head-text">
        {crumbs.length === 0 ? null : (
          <nav aria-label="Breadcrumb">
            <ol className="ox-crumbs">
              {crumbs.map((crumb) => (
                <li key={`${crumb.label}:${crumb.href ?? ""}`}>
                  {crumb.href === undefined ? (
                    /*
                     * `aria-current="page"` rather than a link to here. The last
                     * crumb is the reader's own position, and saying so is more
                     * use than offering to take them to it.
                     */
                    <span aria-current="page">{crumb.label}</span>
                  ) : (
                    <Link href={dynamicRoute(withPeriod(crumb.href, period))}>{crumb.label}</Link>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}

        <p className="ox-kicker">{kicker}</p>
        <h1 className="ox-title">{title}</h1>
        {answer === null ? null : <p className="ox-answer">{answer}</p>}
        {lede === null ? null : <p className="ox-lede">{lede}</p>}
      </div>

      {aside === null ? null : <div className="ox-head-aside">{aside}</div>}
    </header>
  );
}
