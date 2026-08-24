/**
 * `@observer/contracts` — the shared vocabulary.
 *
 * Everything here is a contract, not an implementation: identifiers, domain
 * entities, the observable-fact taxonomy, evidence discipline and the
 * pre-meeting brief. No database access, no HTTP, no React.
 *
 * Concrete wire event names are deliberately absent. See ADR-0013.
 */

export * from "./version";
export * from "./ids";
export * from "./sources";
export * from "./identity";
export * from "./engagement";
export * from "./observables";
export * from "./evidence";
export * from "./brief";
export * from "./intent";
export * from "./observation";
