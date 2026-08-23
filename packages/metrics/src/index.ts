/**
 * `@observer/metrics` — the metric registry and, from later milestones, the
 * typed query layer that implements it.
 *
 * One definition per metric, in one place. The UI reads results; it never
 * calculates. See ADR-0006.
 */

export * from "./definition.js";
export * from "./registry/index.js";
