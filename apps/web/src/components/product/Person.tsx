import type { ReactNode } from "react";
import Link from "next/link";
import type { PeriodPreset } from "@observer/readmodels";

import { dynamicRoute } from "@/lib/href";
import { withPeriod } from "@/lib/period";

/**
 * Initials, and the reason there is no picture.
 *
 * There is no photograph in this product and there will not be one. A generated
 * avatar — a coloured circle, an identicon, a cartoon — is a decoration
 * standing exactly where an identity should be, and on a roster it invites the
 * reader to tell people apart by hue rather than by name.
 *
 * The mark is `aria-hidden` because the name it abbreviates is always rendered
 * beside it. A screen reader that announced "P M, Petra Molnár" would be
 * reading the same person twice, once badly.
 *
 * The derivation takes the first letter of the first word and of the last, which
 * is right for "Petra Molnár" and for "Petra van der Berg" and produces one
 * letter for a mononym rather than an empty circle. It is string handling, not
 * a metric: nothing here counts, ranks or compares.
 */
export function Initials({ name }: { readonly name: string }) {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  const first = words[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1] ?? "") : "";
  const mark = `${first.slice(0, 1)}${last.slice(0, 1)}`.toUpperCase();

  return (
    <span className="ox-person-initials" aria-hidden="true">
      {mark.length === 0 ? "·" : mark}
    </span>
  );
}

/**
 * ONE PERSON ON A ROSTER THAT IS NOT A LEADERBOARD.
 *
 * `observer-product.css` §22 states the rule and the reason: no rank number, no
 * medal, no ordering by outcome. The doctrine's §1 is that the sales agent's
 * data supply is what every upstream figure rests on — without their meetings
 * there is nothing for leadership to read — and a scoreboard degrades that
 * supply, because the fastest way to a better ranking is to record less.
 *
 * So this component has no `rank` prop and no `position` prop, and it never
 * will. What goes in `children` is activity and verified outcome side by side,
 * each with its own completeness, which is what the surfaces above assemble
 * from `Tally`, `Figure` and the chart frame.
 *
 * ## Privacy
 *
 * This is for AGENTS — the people who operate the showroom — and their names
 * are the organisation's own staff. It is not for buyers, and it must never be
 * handed a contact.
 *
 * An earlier version of this comment said no contact name appears on any
 * surface of this product. That was never true of the whole product — the
 * pre-meeting brief names its participants, and an e2e test requires it to —
 * and it is not what makes this component safe. What makes it safe is narrower
 * and still holds: the visitor label it sits beside is a privacy-safe
 * identifier built from a closed vocabulary, and nothing routes a contact here.
 * See `docs/22-visitor-name-display.md`.
 *
 * It renders an `<li>`, because `.ox-people` is the grid that holds them and a
 * roster is a list. The screen writes `<ul className="ox-people">` around the
 * set; wrapping it here would stop a surface from putting one person beside
 * something that is not a person.
 */
export function PersonCard({
  name,
  role = null,
  href = null,
  period,
  children = null,
}: {
  readonly name: string;
  /** What they do, not how well they do it. */
  readonly role?: string | null;
  /** Their detail surface. Omitted where the viewer may not open one. */
  readonly href?: string | null;
  readonly period: PeriodPreset;
  readonly children?: ReactNode;
}) {
  return (
    <li className="ox-person">
      <div className="ox-person-head">
        <Initials name={name} />
        <div>
          <h3 className="ox-person-name">
            {href === null ? (
              name
            ) : (
              <Link href={dynamicRoute(withPeriod(href, period))}>{name}</Link>
            )}
          </h3>
          {role === null ? null : <span className="ox-person-role">{role}</span>}
        </div>
      </div>
      {children}
    </li>
  );
}
