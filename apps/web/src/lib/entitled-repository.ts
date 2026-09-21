import "server-only";

import type { MetricValue, ObserverRepository } from "@observer/readmodels";

import {
  ACCESS_REGISTRY,
  decideAccess,
  deniesAnythingUnder,
  planForTenant,
  type Plan,
} from "./entitlements";

/**
 * THE COMMERCIAL GATE, SPENT IN ONE PLACE.
 *
 * `gate.ts` states the rule this file follows, about the AI routes: "One
 * implementation, because the streaming and non-streaming routes must not be
 * able to disagree about who is allowed to ask what. A security control that
 * exists in two places is a security control that exists in one place and a
 * copy that will drift." Twenty-one project pages read the repository. A plan
 * check written into each of them is twenty-one copies.
 *
 * ## Above the port, not inside it
 *
 * The obvious home is the repository, which already knows the tenant. It is the
 * wrong one. `ObserverRepository` is a CONTRACT with more than one implementor —
 * the synthetic world today, a database repository later (ADR-0007) — so a
 * filter written inside the synthetic class is a filter the database class must
 * remember to write again. That is the drift, arriving by a different door.
 *
 * So this wraps whatever implements the port, in the composition root that is
 * already "the single place in the application that knows which repository is
 * in use". Swapping implementations cannot lose the gate, because the gate is
 * not in the implementation.
 *
 * ## A proxy rather than thirty delegating methods
 *
 * The port has thirty-odd methods and will grow. Hand-written delegation covers
 * exactly the methods somebody remembered, and the failure mode of forgetting
 * one is silent: a new read model ships, nothing filters it, and it looks
 * finished. A proxy covers the method added next week without being told.
 *
 * ## What it removes, and what it can never do
 *
 * It removes the FIGURE — `display`, `raw`, `qualifier`, `sampleSize`,
 * `comparison`, `evidence`, `drillHref` — from any `MetricValue` the plan does
 * not reach, and the formatted value from any verdict component quoting the
 * same metric. The number never reaches the process that renders the page, so
 * it cannot be in the payload, in a hidden element, in a chart's data, in a
 * tooltip or in a summary sentence. A component cannot leak what it was never
 * given, which is the only version of this that is true regardless of how
 * careful the next component is.
 *
 * It does NOT loosen anything. Tenant and project are settled by the repository
 * before this sees a result at all; role is settled by `requireSurface` in the
 * page. This is a third refusal composed with those two, never a substitute.
 */

/**
 * What a refused figure says, instead of what it was.
 *
 * ONE CONSTANT, and that is the point rather than a convenience. The redaction
 * must not vary with what stood behind it — a refusal that reads differently
 * when there is data from when there is none tells the reader the record
 * exists, which is the disclosure the whole refusal was for. So every refused
 * figure produces the identical object, and the only thing that survives is
 * which metric was asked for: that comes from the price list, which is public
 * by nature, and not from the record.
 */
export const NOT_IN_PLAN =
  "This figure is not included in this project's plan. Nothing about whether it has a value is stated here.";

/**
 * `state: "unavailable"` because that is the state this product already draws
 * for "there is no figure to show", and adding a sixth member to `METRIC_STATES`
 * would change a read-model contract for a rendering distinction. The MESSAGE
 * carries the reason, which is where the reason belongs and which the `Figure`
 * component already prints. Nothing here claims a source is disconnected.
 */
function redactedMetric(value: MetricValue): MetricValue {
  return {
    metricId: value.metricId,
    label: value.label,
    state: "unavailable",
    display: null,
    raw: null,
    qualifier: null,
    sampleSize: null,
    minimumSampleSize: 0,
    comparison: null,
    message: NOT_IN_PLAN,
    evidence: null,
    drillHref: null,
    policyVersion: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * A PLAIN object — one this filter may safely take apart and put back together.
 *
 * A `Date`, a `Map`, a `URL` or any class instance is an object whose meaning
 * lives in its prototype, and rebuilding one from `Object.entries` throws that
 * meaning away: a `Date` came back as `{}`. Read models are plain data today,
 * so this guards a door nothing is walking through — which is the moment to fix
 * it, rather than after something does.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** A `MetricValue`: it names a metric and carries a state for it. */
function isMetricValue(
  value: Record<string, unknown>,
): value is Record<string, unknown> & MetricValue {
  return typeof value["metricId"] === "string" && typeof value["state"] === "string";
}

/**
 * A `VerdictComponent`: it names a metric and quotes an already-formatted
 * value. The second door out for a refused figure, and the easier one to miss
 * because it is not a `MetricValue` and does not look like one.
 */
function isVerdictComponent(value: Record<string, unknown>): boolean {
  return (
    typeof value["metricId"] === "string" &&
    typeof value["display"] === "string" &&
    typeof value["rule"] === "string"
  );
}

/** The first resolved tenant id in a response, or null when there is none. */
function tenantIdIn(value: unknown, seen = new Set<unknown>()): string | null {
  if (!isRecord(value) || seen.has(value)) return null;
  seen.add(value);
  const tenant = value["tenant"];
  if (isRecord(tenant) && typeof tenant["id"] === "string") return tenant["id"];
  for (const child of Object.values(value)) {
    const found = tenantIdIn(child, seen);
    if (found !== null) return found;
  }
  return null;
}

/** Whether a response holds anything this gate would have to decide about. */
function holdsMetrics(value: unknown, seen = new Set<unknown>()): boolean {
  if (!isRecord(value) || seen.has(value)) return false;
  seen.add(value);
  if (isMetricValue(value) || isVerdictComponent(value)) return true;
  return Object.values(value).some((child) => holdsMetrics(child, seen));
}

/**
 * The response with every figure this plan does not reach taken out of it.
 *
 * Structural rather than a list of known fields: a read model nests metrics
 * wherever its screen needs them, and a filter that walked a list of paths
 * would miss the next one.
 *
 * ONLY ARRAYS AND PLAIN OBJECTS ARE REBUILT, and the word plain is doing work.
 * An earlier version of this comment claimed a date or a class instance passed
 * through untouched; it did not. `isRecord` accepts anything of type object, so
 * a `Date` was rebuilt field by field and came out as `{}` — verified by the
 * P1-10 access matrix, which is what an access matrix is for. Read models carry
 * strings where they carry instants (`ViewContext.generatedAt`), so nothing
 * shipped was affected, and a filter that silently empties an object it does
 * not understand is a defect whether or not anything reaches it today.
 */
function filtered(
  value: unknown,
  plan: unknown,
  registry: Readonly<Record<string, Plan>>,
): unknown {
  if (Array.isArray(value)) return value.map((item) => filtered(item, plan, registry));
  if (!isPlainObject(value)) return value;

  if (isMetricValue(value)) {
    const decision = decideAccess(plan, `metric.${value.metricId}`, registry);
    if (!decision.allowed) return redactedMetric(value);
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) out[key] = filtered(child, plan, registry);

  if (isVerdictComponent(value)) {
    const decision = decideAccess(plan, `metric.${String(value["metricId"])}`, registry);
    // The rule and the outcome stay: they are the verdict's own reasoning and
    // say nothing about the figure. The figure goes.
    if (!decision.allowed) out["display"] = NOT_IN_PLAN;
  }
  return out;
}

/**
 * Wrap a repository so nothing it returns carries a figure the plan refuses.
 *
 * `registry` is a parameter so a test can price something this product does not
 * price yet and drive THIS function with it, rather than a copy of it.
 */
export function entitled(
  inner: ObserverRepository,
  registry: Readonly<Record<string, Plan>> = ACCESS_REGISTRY,
): ObserverRepository {
  return new Proxy(inner, {
    get(target, property, receiver) {
      const member: unknown = Reflect.get(target, property, receiver);
      if (typeof member !== "function") return member;
      return (...args: unknown[]) => {
        const result: unknown = (member as (...a: unknown[]) => unknown).apply(target, args);
        if (!(result instanceof Promise)) return result;
        return result.then((value: unknown) => {
          /*
           * Nothing to decide about: no figure in the response, so no walk and
           * no clone. Checked before the tenant, because a response with no
           * metrics has nothing to fail closed about.
           */
          if (!holdsMetrics(value)) return value;

          const tenantId = tenantIdIn(value);
          /*
           * FAIL CLOSED. A response carrying figures whose tenant this cannot
           * work out is a response whose plan is unknown, and an unknown plan
           * reaches nothing — `deniesAnythingUnder` answers true for it, and
           * `decideAccess` refuses every key. Guessing a plan here would make
           * the gate depend on the shape of a read model.
           */
          const plan: Plan | null = tenantId === null ? null : planForTenant(tenantId);
          if (!deniesAnythingUnder(plan, "metric", registry)) return value;
          return filtered(value, plan, registry);
        });
      };
    },
  });
}
