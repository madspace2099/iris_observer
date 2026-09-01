/**
 * `@observer/contracts/ue5` — the UE5 ↔ Observer wire contract candidate.
 *
 * **Status: PROPOSED.** Nothing here is implemented, no endpoint exists, and no
 * database has been touched. It is a reviewable contract package: schemas an
 * Unreal transport can be written against, an error taxonomy with a policy for
 * every code including the ones that do not exist yet, a projection proving this
 * is the existing ingestion boundary rather than a second architecture, and a
 * machine-readable record of which rule came from where.
 *
 * Exported under its own subpath rather than from the package root, so that
 * `EventRegistry`, `Limits` and friends cannot collide with the domain
 * vocabulary in `index.ts`. A wire contract is a different layer and reads
 * better as one.
 *
 * Companion documents:
 *   `docs/ue5-ingestion-contract.md`    the contract in prose, with the rationale
 *   `docs/ue5-integration-handoff.md`   what Akhilesh needs, without our source
 *   `docs/ue5-contract/openapi.json`    generated; `pnpm contracts:ue5`
 */

export * from "./wire";
export * from "./limits";
export * from "./errors";
export * from "./activation";
export * from "./ingestion";
export * from "./heartbeat";
export * from "./diagnostic";
export * from "./credential";
export * from "./privacy";
export * from "./validation";
export * from "./projection";
export * from "./traceability";
