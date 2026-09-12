import type { Metadata } from "next";
import Link from "next/link";

import { dynamicRoute } from "@/lib/href";
import { CONTROL_PLANE_ACCOUNT_NAME, controlPlane } from "@/lib/sources/control-plane";
import { projectSummaries, type ProjectSummary } from "@/lib/madspace/estate";
import { ageSince, instant, lifecycleWord } from "@/lib/madspace/format";
import { StatusChip, type MarkTone } from "@/components/madspace/StatusMark";

export const metadata: Metadata = { title: "MADSPACE in Observer's own style" };

/**
 * ONE QUESTION: what does the real Projects estate look like drawn in
 * Observer's OWN component language instead of the client-portal system
 * `docs/20-madspace-admin-design-system.md` documents?
 *
 * Sits under `/design-lab`, so it inherits that route's gate
 * (`localControlPlaneEnabled()` and `madspace_admin`) and its "own the whole
 * viewport" rule rather than restating either — this is a second lab
 * question, not a second lab.
 *
 * The same real `projectSummaries` read `/madspace/projects` renders, not a
 * fixture: a stylistic comparison decided on fake rows would be judging a
 * layout against data nobody actually has to read.
 *
 * ## Why the Observer panel drops information the MADSPACE panel keeps
 *
 * Not an oversight. `.ox-thread-row` (`/projects`'s own row) is one action,
 * one title, one line of context — by design, the pattern this whole product
 * uses for a doorway into something else. MADSPACE's row carries three
 * INDEPENDENT ruled tallies and a six-shape status mark because a project's
 * lifecycle, its connected count and its verified count are three separate
 * questions an operator asks separately (`estate.tsx`'s own reasoning). Both
 * panels below read the identical five projects; what changes is only
 * whether that operational detail survives translation into the sparser
 * language, and that loss — not the colour — is the real tradeoff a reader
 * is being asked to judge here.
 */
export default async function ObserverStyleComparisonPage() {
  const plane = await controlPlane();
  const summaries = plane.ok ? await projectSummaries(plane.admin) : [];
  const now = new Date();

  return (
    <div style={{ minHeight: "100vh", background: "#07090c" }}>
      <div style={{ maxWidth: "70rem", margin: "0 auto", padding: "2.5rem 1.5rem 5rem" }}>
        <p
          style={{
            fontFamily: "var(--font-mono, ui-monospace)",
            fontSize: "0.75rem",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "#5b93c4",
            margin: "0 0 0.75rem",
          }}
        >
          Design lab — a second question, not a second lab
        </p>
        <h1
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "1.75rem",
            fontWeight: 700,
            color: "#f4f7fc",
            margin: "0 0 0.5rem",
          }}
        >
          The same estate, MADSPACE&rsquo;s system and Observer&rsquo;s, side by side
        </h1>
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "0.9375rem",
            color: "#98a4b8",
            maxWidth: "42rem",
            lineHeight: 1.6,
            margin: "0 0 2.5rem",
          }}
        >
          Both panels read {CONTROL_PLANE_ACCOUNT_NAME}&rsquo;s real projects, in the same order, at
          the same moment. Nothing below is clickable in a way that changes anything — this page
          exists to be looked at, not used.
        </p>

        <SectionLabel>Current — the documented client-portal system (ADR-0037)</SectionLabel>
        <MadspaceStylePanel summaries={summaries} now={now} />

        <div style={{ height: "3rem" }} />

        <SectionLabel>
          Alternative — Observer&rsquo;s own component language (/projects)
        </SectionLabel>
        <ObserverStylePanel summaries={summaries} now={now} />
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p
      style={{
        fontFamily: "var(--font-mono, ui-monospace)",
        fontSize: "0.75rem",
        letterSpacing: "0.04em",
        color: "#8592a8",
        margin: "0 0 0.75rem",
      }}
    >
      {children}
    </p>
  );
}

/* --- panel A: MADSPACE's own system, the real components unchanged -------- */

function MadspaceStylePanel({
  summaries,
  now,
}: {
  readonly summaries: readonly ProjectSummary[];
  readonly now: Date;
}) {
  return (
    <div className="mad-portal">
      <section className="mad-plane" aria-label="Projects, MADSPACE style">
        <div className="mad-rows">
          {summaries.map((summary) => {
            const last = instant(summary.lastActivity, "No activity recorded");
            const age = ageSince(summary.lastActivity, now);
            return (
              <article className="mad-row mad-row--project" key={summary.projectId}>
                <div className="mad-row-id">
                  <span className="mad-tally-label">Project</span>
                  <h3 className="mad-row-name">{summary.name}</h3>
                  <StatusChip tone={lifecycleTone(summary.status)}>
                    {lifecycleWord(summary.status)}
                  </StatusChip>
                </div>
                <dl className="mad-facts mad-facts--inline">
                  <div>
                    <dt>Sources</dt>
                    <dd>{summary.sourceCount}</dd>
                  </div>
                  <div>
                    <dt>Connected</dt>
                    <dd>
                      {summary.connectedCount}
                      <span className="mad-tally-of"> of {summary.sourceCount}</span>
                    </dd>
                  </div>
                  <div>
                    <dt>Ingestion verified</dt>
                    <dd>
                      {summary.verifiedCount}
                      <span className="mad-tally-of"> of {summary.sourceCount}</span>
                    </dd>
                  </div>
                </dl>
                <dl className="mad-facts">
                  <div className="mad-meta-item">
                    <dt className="mad-meta-label">Last activity</dt>
                    <dd className="mad-meta-value" data-missing={last.missing}>
                      {last.text}
                    </dd>
                    {age === null ? null : <dd className="mad-note">{age}</dd>}
                  </div>
                </dl>
                <Link
                  className="obs-action"
                  data-emphasis="secondary"
                  href={dynamicRoute(`/madspace/projects/${summary.projectId}`)}
                >
                  Open project
                </Link>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function lifecycleTone(state: string): MarkTone {
  if (state === "active") return "good";
  if (state === "suspended") return "operator";
  if (state === "archived") return "settled";
  return "wrong";
}

/* --- panel B: the same rows, translated into /projects's own vocabulary --- */

function ObserverStylePanel({
  summaries,
  now,
}: {
  readonly summaries: readonly ProjectSummary[];
  readonly now: Date;
}) {
  return (
    <div className="irs-shell ox-root ox-graphite" style={{ minHeight: 0 }}>
      <ul className="ox-threads">
        {summaries.map((summary) => {
          const last = instant(summary.lastActivity, "no activity recorded");
          const age = ageSince(summary.lastActivity, now);
          const context = [
            lifecycleWord(summary.status),
            `${summary.sourceCount} ${summary.sourceCount === 1 ? "source" : "sources"}`,
            `${summary.connectedCount} connected`,
            `${summary.verifiedCount} verified`,
            age === null ? last.text : `last activity ${age}`,
          ].join(" · ");
          return (
            <li className="ox-thread-row" key={summary.projectId}>
              <p className="ox-thread-title">{summary.name}</p>
              <Link
                className="ox-btn"
                data-weight="primary"
                href={dynamicRoute(`/madspace/projects/${summary.projectId}`)}
              >
                Open project
              </Link>
              <p className="ox-thread-context">{context}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
