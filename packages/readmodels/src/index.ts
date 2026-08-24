/**
 * `@observer/readmodels` — the shapes screens consume and the port they read
 * through.
 *
 * Types and interfaces only. No implementation lives here, which is what lets
 * the synthetic repository and the eventual database repository be swapped
 * without a component noticing.
 */

export * from "./context";
export * from "./metric-value";
export * from "./views";
export * from "./pulse";
export * from "./ports";
