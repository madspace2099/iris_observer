import { FACTS, type FactId } from "@observer/contracts";
import { ALL_METRICS, requiredFacts } from "../registry/index.js";
import type { MetricDefinition } from "../definition.js";

/**
 * Generates the measurement dependency matrix from the registry.
 *
 * Hand-written matrices go stale by the second milestone. This one cannot: it
 * is derived from the same declarations the query layer and the UI read, and a
 * test fails if the committed file drifts from the generator's output.
 *
 * Two columns are intentionally not filled yet. **Screen** and **Component**
 * arrive as the screens are built; **wire events** arrive with the event
 * catalogue, expanding the chain to metric → fact → event (ADR-0013).
 */

const HEADER = `<!--
  GENERATED FILE — do not edit by hand.
  Produced by: pnpm matrix        Verified by: packages/metrics/test/matrix.test.ts
  Source of truth: packages/metrics/src/registry/
-->`;

function list(values: readonly string[]): string {
  return values.length === 0 ? "—" : values.map((v) => `\`${v}\``).join(", ");
}

function metricRow(m: MetricDefinition): string {
  return [
    `\`${m.id}\``,
    m.displayName,
    m.kind,
    m.evidenceTier.replace(/_/g, " "),
    list(m.requiredFacts),
    list(m.requiredCrmFields),
    list(m.requiredUnitAttributes),
    String(m.minimumSampleSize),
    m.comparison.replace(/_/g, " "),
    m.drillTo,
    m.roles.join(", "),
  ].join(" | ");
}

function factRow(factId: FactId): string {
  const fact = FACTS[factId];
  const dependants = ALL_METRICS.filter((m) => m.requiredFacts.includes(factId));
  return [
    `\`${factId}\``,
    fact.owner,
    fact.producibleBy.join(", "),
    list(fact.required),
    String(dependants.length),
    dependants.map((m) => `\`${m.id}\``).join(", ") || "—",
  ].join(" | ");
}

export function renderMatrixMarkdown(): string {
  const facts = requiredFacts();

  const metricTable = [
    "| Metric | Name | Kind | Claim tier | Required facts | CRM fields | Unit attributes | Min n | Comparison | Drill-down | Roles |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...ALL_METRICS.map((m) => `| ${metricRow(m)} |`),
  ].join("\n");

  const factTable = [
    "| Fact | Owner | Producible by | Required attributes | Metrics | Which |",
    "| --- | --- | --- | --- | --- | --- |",
    ...facts.map((f) => `| ${factRow(f)} |`),
  ].join("\n");

  const unusedFacts = Object.keys(FACTS).filter((f) => !facts.includes(f as FactId));

  return `${HEADER}

# Measurement dependency matrix

Generated from the metric registry. Every displayed number traces from here to the facts that must be
produced for it to exist, and no further hand-maintained list stands between them.

**Chain:** Screen → Component → **Metric → Required facts** → Source system → Query → Refresh

The bold segment is generated today. Screen and Component are filled as screens are built; the
fact-to-event expansion arrives with the event catalogue (ADR-0013).

- Metrics declared: **${ALL_METRICS.length}**
- Facts depended upon: **${facts.length}**
- Facts declared but not yet used by any metric: **${unusedFacts.length}**

---

## 1. Metrics and what they need

${metricTable}

---

## 2. Facts and what breaks without them

This is the seed of the instrumentation backlog. A fact with dependants and no producer is a screen
that cannot work, visible here before anybody builds it.

${factTable}

---

## 3. Declared but not yet consumed

These facts are specified in the taxonomy and no metric requires them yet. They are not dead: several
feed the pre-meeting brief and the meeting timeline, which are read models rather than metrics.

${unusedFacts.length === 0 ? "_None._" : unusedFacts.map((f) => `- \`${f}\``).join("\n")}
`;
}

export interface MatrixJson {
  readonly generatedFrom: string;
  readonly metrics: readonly {
    readonly id: string;
    readonly displayName: string;
    readonly kind: string;
    readonly evidenceTier: string;
    readonly requiredFacts: readonly string[];
    readonly requiredCrmFields: readonly string[];
    readonly requiredUnitAttributes: readonly string[];
    readonly minimumSampleSize: number;
    readonly comparison: string;
    readonly drillTo: string;
    readonly roles: readonly string[];
  }[];
  readonly facts: readonly {
    readonly id: string;
    readonly owner: string;
    readonly producibleBy: readonly string[];
    readonly required: readonly string[];
    readonly requiredBy: readonly string[];
  }[];
}

export function renderMatrixJson(): MatrixJson {
  return {
    generatedFrom: "packages/metrics/src/registry",
    metrics: ALL_METRICS.map((m) => ({
      id: m.id,
      displayName: m.displayName,
      kind: m.kind,
      evidenceTier: m.evidenceTier,
      requiredFacts: [...m.requiredFacts],
      requiredCrmFields: [...m.requiredCrmFields],
      requiredUnitAttributes: [...m.requiredUnitAttributes],
      minimumSampleSize: m.minimumSampleSize,
      comparison: m.comparison,
      drillTo: m.drillTo,
      roles: [...m.roles],
    })),
    facts: requiredFacts().map((id) => ({
      id,
      owner: FACTS[id].owner,
      producibleBy: [...FACTS[id].producibleBy],
      required: [...FACTS[id].required],
      requiredBy: ALL_METRICS.filter((m) => m.requiredFacts.includes(id)).map((m) => m.id),
    })),
  };
}
