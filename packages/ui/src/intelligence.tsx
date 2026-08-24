import type {
  ActionItem,
  AiBriefing,
  AlertItem,
  ChangeItem,
  DataHealth,
  EvidenceRef,
  FunnelStep,
  MetricValue,
  Verdict,
} from "@observer/readmodels";
import { Badge, Card, StateMessage } from "./primitives";

/**
 * The intelligence layer: the components that carry a claim.
 *
 * Each one enforces a rule from `docs/02-views.md` in markup rather than
 * leaving it to whoever assembles the page:
 *
 *  - a figure below its minimum sample cannot render a trend;
 *  - a statement cannot render without its evidence link;
 *  - an unavailable metric renders its reason, never a zero.
 */

const TIER_LABEL: Record<string, string> = {
  observed_sequence: "Observed",
  attributed_conversion: "Attributed",
  statistical_association: "Pattern",
  causal_claim: "Unsupported",
};

/**
 * The link from a claim to what it rests on.
 *
 * Never optional in the markup: if a component is handed a statement with no
 * evidence, it renders the absence rather than the sentence alone, because a
 * confident sentence with nothing behind it is the failure mode this whole
 * product is trying to avoid.
 */
export function EvidenceLink({ evidence }: { evidence: EvidenceRef | null }) {
  if (evidence === null) {
    return (
      <span className="obs-evidence" data-tier="none" title="No evidence attached">
        <span className="obs-evidence-dot" aria-hidden="true" />
        No evidence
      </span>
    );
  }
  const label = TIER_LABEL[evidence.tier] ?? evidence.tier;
  return (
    <a
      className="obs-evidence"
      data-tier={evidence.tier}
      data-evidence-id={evidence.evidenceId}
      href={evidence.href}
    >
      <span className="obs-evidence-dot" aria-hidden="true" />
      {label} · {evidence.observationCount.toLocaleString()}{" "}
      {evidence.observationCount === 1 ? "record" : "records"}
    </a>
  );
}

const VERDICT_LABEL: Record<Verdict["state"], string> = {
  positive: "Positive",
  attention_needed: "Attention needed",
  critical: "Critical",
  insufficient_data: "Not enough data",
};

/** Verdict states map onto the three visual tones plus neutral. */
const VERDICT_TONE: Record<Verdict["state"], "good" | "watch" | "weak" | "unknown"> = {
  positive: "good",
  attention_needed: "watch",
  critical: "weak",
  insufficient_data: "unknown",
};

const OUTCOME_TONE = {
  pass: "good",
  watch: "watch",
  fail: "weak",
  unknown: "unknown",
} as const;

/**
 * The first thing on the screen, and the only thing some readers will read.
 *
 * Actions sit inside it rather than at the foot of the page: a verdict a
 * reader has to scroll past three sections to act on is a verdict they will
 * not act on.
 *
 * `components` renders the rules that produced the state. That is what stops
 * this being an opaque judgement — the reader can see the thresholds and
 * disagree with them.
 */
export function VerdictStrip({
  verdict,
  actions,
}: {
  verdict: Verdict;
  actions?: readonly ActionItem[];
}) {
  return (
    <section className="obs-verdict" data-state={verdict.state} aria-labelledby="verdict-heading">
      <div className="obs-verdict-head">
        <Badge state={VERDICT_TONE[verdict.state]}>{VERDICT_LABEL[verdict.state]}</Badge>
        <EvidenceLink evidence={verdict.evidence} />
      </div>
      <h1 className="obs-verdict-headline" id="verdict-heading">
        {verdict.headline}
      </h1>
      <p className="obs-verdict-support">{verdict.supporting}</p>

      {verdict.components.length === 0 ? null : (
        <details className="obs-rules">
          <summary>
            How this verdict was reached · {verdict.components.length} rules ·{" "}
            {verdict.rulesetVersion}
          </summary>
          <ul className="obs-rule-list">
            {verdict.components.map((component) => (
              <li key={component.metricId} data-outcome={component.outcome}>
                <span className="obs-rule-dot" aria-hidden="true" />
                <span className="obs-rule-label">{component.label}</span>
                <span className="obs-rule-value">{component.display}</span>
                <span className="obs-rule-rule">{component.rule}</span>
                <Badge state={OUTCOME_TONE[component.outcome]}>{component.outcome}</Badge>
              </li>
            ))}
          </ul>
        </details>
      )}

      {actions === undefined || actions.length === 0 ? null : (
        <div className="obs-actions">
          {actions.map((action) => (
            <a
              className="obs-action"
              data-emphasis={action.emphasis}
              key={action.id}
              href={action.href}
            >
              {action.label}
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

function sentiment(metric: MetricValue): "good" | "bad" | "neutral" {
  const c = metric.comparison;
  if (c === null || c.direction === "flat" || c.better === "neither") return "neutral";
  return c.direction === c.better ? "good" : "bad";
}

export function MetricCard({ metric }: { metric: MetricValue }) {
  if (metric.state === "unavailable" || metric.state === "error") {
    return (
      <Card className="obs-metric">
        <span className="obs-metric-label">{metric.label}</span>
        <StateMessage
          title={metric.state === "error" ? "Could not be loaded" : "Not available"}
          detail={metric.message ?? undefined}
        />
      </Card>
    );
  }

  return (
    <Card className="obs-metric">
      <span className="obs-metric-label">{metric.label}</span>
      <span className="obs-metric-figure">{metric.display ?? "—"}</span>
      {metric.qualifier === null ? null : (
        <span className="obs-metric-qualifier">{metric.qualifier}</span>
      )}

      <div className="obs-metric-foot">
        {/* A figure below its minimum sample never shows a trend. The number is
            still shown — hiding it would be patronising — but it is not a
            verdict, and the note says so. */}
        {metric.state === "insufficient" || metric.comparison === null ? (
          <span className="obs-metric-note">{metric.message ?? "No baseline to compare."}</span>
        ) : (
          <>
            <span className="obs-delta" data-sentiment={sentiment(metric)}>
              {metric.comparison.deltaDisplay}
            </span>
            <span className="obs-baseline">vs {metric.comparison.baselineLabel}</span>
          </>
        )}
        {metric.evidence === null ? null : <EvidenceLink evidence={metric.evidence} />}
      </div>
    </Card>
  );
}

export function MetricGrid({ metrics }: { metrics: readonly MetricValue[] }) {
  return (
    <div className="obs-metric-grid">
      {metrics.map((metric) => (
        <MetricCard key={metric.metricId} metric={metric} />
      ))}
    </div>
  );
}

export function FunnelChart({ steps }: { steps: readonly FunnelStep[] }) {
  return (
    <div className="obs-funnel">
      {steps.map((step) => {
        const state = step.metric.state;
        const ratio = state === "unavailable" ? 0 : Math.max(0, Math.min(1, step.metric.raw ?? 0));
        return (
          <div className="obs-funnel-step" key={step.label} data-state={state}>
            <div>
              <div style={{ fontWeight: 600 }}>{step.label}</div>
              <div className="obs-baseline">
                {/* An absent count is never rendered as a zero. "38 → 0" says
                    nobody converted; the truth is that nobody can see. */}
                {step.fromCount === null || step.toCount === null
                  ? "counts unavailable"
                  : `${step.fromCount.toLocaleString()} → ${step.toCount.toLocaleString()}`}
              </div>
            </div>
            <div
              className="obs-funnel-track"
              role="img"
              aria-label={`${step.label}: ${step.metric.display ?? step.metric.message ?? "unavailable"}`}
            >
              {state === "unavailable" ? null : (
                <div className="obs-funnel-fill" style={{ width: `${ratio * 100}%` }} />
              )}
            </div>
            <div className="obs-funnel-value">
              {state === "unavailable" ? (
                <span className="obs-dim">Unavailable</span>
              ) : (
                step.metric.display
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AiSummary({ briefing }: { briefing: AiBriefing }) {
  return (
    <section className="obs-briefing" aria-labelledby="briefing-heading">
      <div className="obs-section-head">
        <h2 id="briefing-heading">{briefing.heading}</h2>
        <Badge tone="accent">Generated</Badge>
      </div>

      <ul>
        {briefing.statements.map((statement) => (
          <li key={statement.text} data-tier={statement.tier}>
            <p>{statement.text}</p>
            <EvidenceLink evidence={statement.evidence} />
          </li>
        ))}
      </ul>

      <div className="obs-briefing-foot">
        <span>{briefing.generatorVersion}</span>
        <span>·</span>
        <span>Every sentence links to the records behind it.</span>
        {briefing.caveat === null ? null : (
          <>
            <span>·</span>
            <span style={{ color: "var(--verdict-watch)" }}>{briefing.caveat}</span>
          </>
        )}
      </div>
    </section>
  );
}

export function AlertList({ alerts }: { alerts: readonly AlertItem[] }) {
  if (alerts.length === 0) {
    return (
      <StateMessage title="Nothing needs attention" detail="No alert is open for this period." />
    );
  }
  return (
    <ul className="obs-list">
      {alerts.map((alert) => (
        <li className="obs-alert" key={alert.id} data-severity={alert.severity}>
          <span className="obs-alert-rail" aria-hidden="true" />
          <div className="obs-alert-body">
            <span className="obs-alert-title">{alert.title}</span>
            <p className="obs-alert-detail">{alert.detail}</p>
            <div className="obs-metric-foot">
              <EvidenceLink evidence={alert.evidence} />
              {alert.actionHref === null || alert.actionLabel === null ? null : (
                <a className="obs-evidence" href={alert.actionHref}>
                  {alert.actionLabel} →
                </a>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ChangeList({ changes }: { changes: readonly ChangeItem[] }) {
  if (changes.length === 0) {
    return (
      <StateMessage
        title="Nothing moved enough to report"
        detail="No metric exceeded its change threshold."
      />
    );
  }
  return (
    <ul className="obs-list">
      {changes.map((change) => (
        <li className="obs-change" key={change.id}>
          <span
            className="obs-delta"
            data-sentiment={change.direction === change.better ? "good" : "bad"}
          >
            {change.deltaDisplay}
          </span>
          <div>
            <div style={{ fontWeight: 600 }}>{change.label}</div>
            <p className="obs-alert-detail" style={{ marginTop: "var(--space-1)" }}>
              {change.detail}
            </p>
            <div className="obs-metric-foot" style={{ marginTop: "var(--space-2)" }}>
              <EvidenceLink evidence={change.evidence} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * How much of the picture is actually visible.
 *
 * Permanently on screen rather than tucked into a settings page: every other
 * number is reliable only in proportion to this one, and a reader who cannot
 * see it has no way to weigh what they are looking at.
 */
export function DataHealthBar({ health }: { health: DataHealth }) {
  const value = health.completeness.raw ?? 0;
  return (
    <div className="obs-health" data-low={value < 0.8}>
      <span className="obs-metric-label">{health.completeness.label}</span>
      <div
        className="obs-health-bar"
        role="img"
        aria-label={`${Math.round(value * 100)} per cent complete`}
      >
        <div className="obs-health-fill" style={{ width: `${value * 100}%` }} />
      </div>
      <span style={{ fontWeight: 600 }}>{health.completeness.display}</span>
      {health.sourcesMissing.length > 0 ? (
        <Badge state="watch">Missing: {health.sourcesMissing.join(", ")}</Badge>
      ) : (
        <Badge state="good">All sources connected</Badge>
      )}
      {health.note === null ? null : <span className="obs-baseline">{health.note}</span>}
    </div>
  );
}
