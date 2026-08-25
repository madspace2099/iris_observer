import type {
  BehaviourChange,
  MetricValue,
  PresentationCoverage,
  PresentationLane,
  ShowroomFinding,
} from "@observer/readmodels";
import { INSIGHT_SOURCE_LABELS, type InsightSource } from "@observer/contracts";
import { defineMeasurement } from "@observer/readmodels";
import { Measure } from "./Measure";
import { dynamicRoute } from "@/lib/href";
import Link from "next/link";

/**
 * The pieces every Showroom Intelligence surface is built from.
 *
 * Server components with no state. They exist so that provenance, sample size
 * and honest gaps are rendered the same way everywhere — a source chip that
 * looks different on two screens is a source chip nobody reads.
 */

/* --- provenance ------------------------------------------------------------ */

export function SourceChips({ sources }: { sources: readonly InsightSource[] }) {
  return (
    <span className="iris-srcs">
      {sources.map((source) => (
        <span className="iris-src" key={source} data-src={source}>
          {INSIGHT_SOURCE_LABELS[source]}
        </span>
      ))}
    </span>
  );
}

/**
 * The synthetic-data marker.
 *
 * Required by the brief and by simple honesty: every figure on these screens
 * is generated, and a reader who mistakes them for their own project's numbers
 * would make decisions on them.
 */
export function SyntheticBadge() {
  return <span className="iris-synthetic">Synthetic demonstration data</span>;
}

/* --- findings -------------------------------------------------------------- */

export function Finding({ finding, lead = false }: { finding: ShowroomFinding; lead?: boolean }) {
  return (
    <article className="iris-finding" data-lead={lead ? "true" : undefined}>
      <p className="iris-finding-statement">{finding.statement}</p>
      {finding.baseline === null ? null : (
        <p className="iris-code" style={{ margin: 0 }}>
          against {finding.baseline}
        </p>
      )}
      <p className="iris-finding-so-what">{finding.soWhat}</p>
      {finding.caveat === null ? null : <p className="iris-finding-caveat">{finding.caveat}</p>}
      <div className="iris-finding-foot">
        <SourceChips sources={finding.sources} />
        <a className="iris-evidence" href={finding.evidence.href}>
          <i />
          {finding.evidence.observationCount} records · {finding.evidence.tier.replace(/_/g, " ")}
        </a>
        <span>n = {finding.sampleSize} meetings</span>
        {finding.nextStep === null ? null : (
          <Link className="iris-action" href={dynamicRoute(finding.nextStep.href)}>
            {finding.nextStep.label}
          </Link>
        )}
      </div>
    </article>
  );
}

/* --- figures --------------------------------------------------------------- */

/**
 * The figure strip.
 *
 * Each label carries its own explanation, so the reader can open the rule
 * behind a number without leaving the screen. A headline figure with no stated
 * definition is what the legacy dashboard did when it graded one click "High".
 */
export function Figures({ figures }: { figures: readonly MetricValue[] }) {
  return (
    <dl className="iris-figures">
      {figures.map((m) => (
        <div key={m.metricId}>
          <dt>
            {defineMeasurement(m.metricId) === undefined ? m.label : <Measure id={m.metricId} />}
          </dt>
          <dd>
            <b>{m.display ?? "—"}</b>
            {m.comparison === null ? (
              <span className="iris-code">{m.qualifier ?? m.message ?? ""}</span>
            ) : (
              <span
                className="iris-delta"
                data-tone={
                  m.comparison.better === "up"
                    ? m.comparison.direction === "up"
                      ? "good"
                      : "bad"
                    : "flat"
                }
              >
                {m.comparison.deltaDisplay}
                <span className="iris-code">{m.qualifier}</span>
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* --- Presentation DNA ------------------------------------------------------ */

/**
 * One presentation lane.
 *
 * Width is reach rate, fill is meaningful dwell, a dashed edge means the source
 * cannot report timing. Sections are ordered by their mean position, so the
 * lane reads left to right as the story was actually told.
 */
export function DnaLane({
  lane,
  highlight,
  compact = false,
}: {
  lane: PresentationLane;
  highlight?: string;
  compact?: boolean;
}) {
  const peakDwell = Math.max(1, ...lane.steps.map((s) => s.medianDwellSeconds ?? 0));

  return (
    <div className="iris-dna-lane">
      <div className="iris-dna-name">
        <b>{lane.label}</b>
        <span>
          {lane.meetingCount} meetings · {Math.round(lane.coverage * 100)}% core
          {lane.medianDurationSeconds === null
            ? ""
            : ` · ${Math.round(lane.medianDurationSeconds / 60)}m median`}
        </span>
      </div>
      <div className="iris-dna-track">
        {lane.steps.map((step) => (
          <span
            key={step.sectionId}
            className="iris-dna-step"
            data-timing={step.medianDwellSeconds === null ? "unknown" : undefined}
            data-return={step.returnRate > 0.25 ? "true" : undefined}
            data-highlight={highlight === step.sectionId ? "true" : undefined}
            style={
              {
                "--reach": Math.max(0.35, step.reachRate).toFixed(3),
                "--fill": ((step.medianDwellSeconds ?? 0) / peakDwell).toFixed(3),
              } as React.CSSProperties
            }
            title={`${step.label} · reached in ${Math.round(step.reachRate * 100)}% of meetings${
              step.medianDwellSeconds === null
                ? " · timing not recorded by this source"
                : ` · median ${step.medianDwellSeconds}s`
            }${step.returnRate > 0 ? ` · returned to in ${Math.round(step.returnRate * 100)}%` : ""}`}
          >
            {compact ? step.label.slice(0, 3) : step.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* --- coverage -------------------------------------------------------------- */

/**
 * Coverage, for one meeting or for many.
 *
 * "Routinely skipped, 100%" is a nonsense reading of a single presentation —
 * routine needs more than one occasion. With one meeting the same figures are a
 * plain statement of what was not opened.
 */
export function Coverage({
  coverage,
  singleMeeting = false,
}: {
  coverage: PresentationCoverage;
  singleMeeting?: boolean;
}) {
  return (
    <div className="iris-stack">
      <p className="iris-kicker">Coverage</p>
      <div className="iris-bars">
        <div className="iris-bar">
          <span className="iris-bar-label">Core story</span>
          <span
            className="iris-bar-track"
            style={{ "--v": coverage.coreReached.toFixed(3) } as React.CSSProperties}
          >
            <i />
          </span>
          <span className="iris-bar-value">{Math.round(coverage.coreReached * 100)}%</span>
        </div>
        <div className="iris-bar">
          <span className="iris-bar-label">Median depth</span>
          <span
            className="iris-bar-track"
            style={
              {
                "--v": (coverage.medianDepth / Math.max(1, coverage.sectionsTotal * 1.5)).toFixed(
                  3,
                ),
              } as React.CSSProperties
            }
          >
            <i />
          </span>
          <span className="iris-bar-value">{coverage.medianDepth} steps</span>
        </div>
      </div>
      {coverage.routinelySkipped.length === 0 ? null : singleMeeting ? (
        <p className="iris-meta">
          Never opened: {coverage.routinelySkipped.map((s) => s.label).join(" · ")}
        </p>
      ) : (
        <p className="iris-meta">
          Routinely skipped:{" "}
          {coverage.routinelySkipped
            .slice(0, 3)
            .map((s) => `${s.label} (${Math.round(s.skipRate * 100)}%)`)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}

/* --- behaviour changes ----------------------------------------------------- */

export function Changes({ changes }: { changes: readonly BehaviourChange[] }) {
  return (
    <div className="iris-stack">
      <p className="iris-kicker">What changed</p>
      {changes.map((change) => (
        <div key={change.id} style={{ display: "grid", gap: ".25rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "1rem",
              alignItems: "baseline",
            }}
          >
            <Link
              className="iris-body"
              href={dynamicRoute(change.href)}
              style={{ fontWeight: 600 }}
            >
              {change.label}
            </Link>
            <span
              className="iris-delta"
              data-tone={
                change.direction === "flat" ? "flat" : change.direction === "up" ? "good" : "bad"
              }
              style={{ flexDirection: "row", gap: ".375rem", marginTop: 0 }}
            >
              {change.deltaDisplay}
            </span>
          </div>
          <p className="iris-meta" style={{ margin: 0 }}>
            {change.detail}
          </p>
        </div>
      ))}
    </div>
  );
}

/* --- honest gaps ----------------------------------------------------------- */

/**
 * What this source could not tell us.
 *
 * Stated once, in outline, rather than repeated as a footnote beside every
 * affected figure. `docs/14-design-system.md` §10.
 */
export function Gaps({
  gaps,
  title = "What this source cannot say",
}: {
  gaps: readonly string[];
  title?: string;
}) {
  if (gaps.length === 0) return null;
  return (
    <div className="iris-gap">
      <b>{title}</b>
      <ul>
        {gaps.map((gap) => (
          <li key={gap}>{gap}</li>
        ))}
      </ul>
    </div>
  );
}

/* --- outcome context ------------------------------------------------------- */

/**
 * The CRM's account, kept in its place.
 *
 * A thin strip in secondary ink beneath the behavioural findings, never a row
 * of figure cards at the top of the screen. ADR-0023.
 */
export function OutcomeContext({
  outcomes,
  total,
}: {
  outcomes: readonly { readonly outcome: string; readonly label: string; readonly count: number }[];
  total: number;
}) {
  return (
    <div>
      <p className="iris-kicker" style={{ marginBottom: ".5rem" }}>
        How those meetings ended
      </p>
      <div className="iris-outcomes">
        {outcomes.map((o) => (
          <span key={o.outcome}>
            {o.label} <b>{o.count}</b>
          </span>
        ))}
        <span style={{ marginLeft: "auto" }}>of {total} meetings</span>
      </div>

    </div>
  );
}
