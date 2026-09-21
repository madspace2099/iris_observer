import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { dynamicRoute } from "@/lib/href";
import { localControlPlaneEnabled } from "@/lib/sources/local-db";

export const metadata: Metadata = { title: "Observer review index" };

/**
 * EVERY CANONICAL STATE OF THE PRODUCT, ON ONE PAGE, IN DEVELOPMENT ONLY.
 *
 * A reviewer should not have to remember which project proves which empty
 * state, or type a unit code from a screenshot. This lists every screen the
 * customer-facing product has, and every partial-data state it can be put into,
 * as links.
 *
 * ## Why the states are three different projects rather than a flag
 *
 * The three data conditions the product has to survive are not modes. They are
 * three real projects in the synthetic world, each built to force one of them:
 *
 *   ISTER TOWER      everything connected. Showroom, WEB IRIS, CRM, catalogue.
 *   Riverside Walk   no CRM. Every outcome figure must render its unavailable
 *                    state rather than a smaller number.
 *   Kingsford Yard   three weeks live. Every verdict must be suppressed for
 *                    want of sample, and no leaderboard may render.
 *
 * A "show me the empty state" switch would be a fourth thing to maintain and a
 * fourth thing that can disagree with the product. Opening the project that
 * genuinely has no CRM is the same act the reader performs, and it cannot drift
 * from what a customer sees because it IS what a customer sees.
 *
 * ## Why this is deliberately plain
 *
 * It is a signpost, not a surface. Anything designed here would be a second
 * visual language competing with the one being reviewed, so it uses the
 * product's own tokens for its ground and nothing else.
 *
 * ## It is not in the navigation, and it cannot render in production
 *
 * Gated on `localControlPlaneEnabled()`, which needs a non-production
 * `NODE_ENV` and an explicit environment variable, so a deployment does not
 * have this route at all. It is declared in `SURFACES` as `madspace_admin`
 * anyway: a surface with no declared audience is how a buyer-facing page
 * appears by accident, and "it cannot render in production" is a runtime fact
 * rather than a statement of who it is for.
 */

interface Entry {
  readonly id: string;
  readonly name: string;
  readonly href: string;
  readonly note: string;
}

const ISTER = "/alpha/ister-tower";

/** The product, in the order the brief asks to review it. */
const SCREENS: readonly Entry[] = [
  { id: "01", name: "Ask IRIS", href: `${ISTER}/ask`, note: "The landing surface." },
  {
    id: "02",
    name: "Ask IRIS — an answer",
    href: `${ISTER}/ask/history`,
    note: "Earlier questions, and one conversation in full.",
  },
  {
    id: "03",
    name: "Sales Flow",
    href: `${ISTER}/flow`,
    note: "The funnel, and where it slows.",
  },
  {
    id: "04",
    name: "Project — Overview",
    href: `${ISTER}/project`,
    note: "The building, demand signals, and what needs attention.",
  },
  {
    id: "05",
    name: "Project — Units",
    href: `${ISTER}/units`,
    note: "The unit demand register.",
  },
  {
    id: "06",
    name: "Unit detail",
    href: `${ISTER}/units/IT-A-12-07`,
    note: "One apartment: signals, timeline, funnel, related sessions.",
  },
  {
    id: "07",
    name: "Project — Meetings",
    href: `${ISTER}/meetings`,
    note: "Visitor journeys, with privacy-safe identities.",
  },
  {
    id: "09",
    name: "Project — Features",
    href: `${ISTER}/features`,
    note: "How the showroom software is actually used.",
  },
  {
    id: "10",
    name: "Sales Agents",
    href: `${ISTER}/agents`,
    note: "The team, compared responsibly and never ranked.",
  },
  {
    id: "12",
    name: "Attention",
    href: `${ISTER}/attention`,
    note: "What needs doing, ranked by severity.",
  },
  {
    id: "13",
    name: "Briefing",
    href: `${ISTER}/showroom`,
    note: "No longer a navigation item; reached by name from Ask IRIS.",
  },
];

/** The states a product has to survive, each from the project that forces it. */
const STATES: readonly Entry[] = [
  {
    id: "S1",
    name: "CRM not connected",
    href: "/alpha/riverside/flow",
    note: "Riverside Walk. Every outcome figure must state its absence rather than shrink.",
  },
  {
    id: "S2",
    name: "Below the minimum sample",
    href: "/beta/kingsford/agents",
    note: "Kingsford Yard, three weeks live. No verdict, no rank, no trend.",
  },
  {
    id: "S3",
    name: "Below sample — the project view",
    href: "/beta/kingsford/project",
    note: "The same suppression on an executive surface.",
  },
  {
    id: "S4",
    name: "A project with no CRM, at unit level",
    href: "/alpha/riverside/units",
    note: "The register with its verified-outcome column unavailable.",
  },
];

function Row({ entry }: { readonly entry: Entry }) {
  return (
    <li className="ox-thread-row">
      <p className="ox-thread-title">
        <Link href={dynamicRoute(entry.href)}>
          {entry.id} · {entry.name}
        </Link>
      </p>
      <span className="ox-thread-when">{entry.href}</span>
      <span className="ox-thread-context">{entry.note}</span>
    </li>
  );
}

export default function ObserverReviewIndex() {
  if (!localControlPlaneEnabled()) notFound();

  return (
    <div className="ox-root ox-graphite" style={{ minHeight: "100vh", padding: "3rem 2.5rem" }}>
      <main id="main" className="ox-page" style={{ maxWidth: "60rem", margin: "0 auto" }}>
        <div className="ox-head-text">
          <p className="ox-kicker">Development only</p>
          <h1 className="ox-title">Observer review index</h1>
          <p className="ox-lede">
            Every screen the customer-facing product has, and every partial-data state it can be put
            into. All of it reads the deterministic synthetic world through the same repository port
            a production adapter will replace; nothing here is a live customer figure. This page is
            not reachable from the product navigation and does not exist in a deployment.
          </p>
        </div>

        <section className="ox-plane" style={{ padding: 0 }}>
          <h2 className="ox-subhead">The product</h2>
          <ul className="ox-threads">
            {SCREENS.map((entry) => (
              <Row key={entry.id} entry={entry} />
            ))}
          </ul>
        </section>

        <section className="ox-plane" style={{ padding: 0 }}>
          <h2 className="ox-subhead">States, each from the project that forces it</h2>
          <ul className="ox-threads">
            {STATES.map((entry) => (
              <Row key={entry.id} entry={entry} />
            ))}
          </ul>
        </section>

        <p className="ox-section-note">
          The three visual directions for the MADSPACE control plane are a separate review, at{" "}
          <Link href="/design-lab">/design-lab</Link>. They are not this product and are not
          governed by the same design system.
        </p>
      </main>
    </div>
  );
}
