import type { FactId } from "@observer/contracts";
import type { MetricDefinition, Role } from "../definition.js";
import { validateMetric } from "../definition.js";
import { EXECUTIVE_METRICS } from "./executive.js";
import { FLOW_METRICS } from "./flow.js";
import { JOURNEY_METRICS } from "./journey.js";
import { PEOPLE_METRICS } from "./people.js";
import { UNIT_METRICS } from "./units.js";

/**
 * The registry. Every metric the product can display is reachable from here,
 * and nothing outside it may compute one.
 *
 * Registries are added per subject area as later milestones land. The lookups
 * below are what the query layer, the dependency-matrix generator and the
 * instrumentation-specification generator all read.
 */
export const ALL_METRICS: readonly MetricDefinition[] = [
  ...EXECUTIVE_METRICS,
  ...FLOW_METRICS,
  ...UNIT_METRICS,
  ...PEOPLE_METRICS,
  ...JOURNEY_METRICS,
];

const BY_ID = new Map<string, MetricDefinition>(ALL_METRICS.map((m) => [m.id, m]));

export function getMetric(id: string): MetricDefinition | undefined {
  return BY_ID.get(id);
}

export function metricsForRole(role: Role): readonly MetricDefinition[] {
  return ALL_METRICS.filter((m) => m.roles.includes(role));
}

/** Which metrics stop working if a given fact is never produced. */
export function metricsRequiringFact(factId: FactId): readonly MetricDefinition[] {
  return ALL_METRICS.filter((m) => m.requiredFacts.includes(factId));
}

/** Every fact the product depends on. The seed of the Unreal backlog. */
export function requiredFacts(): readonly FactId[] {
  return [...new Set(ALL_METRICS.flatMap((m) => m.requiredFacts))].sort();
}

/** Duplicate ids and structural violations, collected. Empty means healthy. */
export function validateRegistry(): readonly string[] {
  const problems = ALL_METRICS.flatMap(validateMetric);
  const seen = new Set<string>();
  for (const metric of ALL_METRICS) {
    if (seen.has(metric.id)) problems.push(`duplicate metric id: ${metric.id}`);
    seen.add(metric.id);
  }
  return problems;
}

export { EXECUTIVE_METRICS } from "./executive.js";
export { FLOW_METRICS } from "./flow.js";
export { UNIT_METRICS } from "./units.js";
export { PEOPLE_METRICS } from "./people.js";
export { JOURNEY_METRICS, JOURNEY_ATTRIBUTION } from "./journey.js";
