/**
 * `@observer/contracts/ue5` — the UE5 ↔ Observer wire contract candidate.
 *
 * **Status: the wire subset is frozen for V1; the product decisions around it
 * are not.** Activation, ingestion and heartbeat — the envelope, the three
 * limits, the route names, the per-event result shape and the closed rejection
 * vocabulary — are settled and generate the published artefacts. What remains
 * genuinely `OPEN` is recorded as such in `traceability.ts` and is mostly
 * product rather than protocol: the business event catalogue (ADR-0013), event
 * retention, and idempotency retention.
 *
 * It is still a contract package rather than an implementation, and the
 * distinction matters when reading it: schemas an Unreal transport can be
 * written against, an error taxonomy with a policy for every code including the
 * ones that do not exist yet, a projection proving this is the existing
 * ingestion boundary rather than a second architecture, and a machine-readable
 * record of which rule came from where.
 *
 * What has changed since this said "no database has been touched": the source
 * identity spine, activation codes, source credentials and `analytics_events`
 * now exist as forward-only migrations under `supabase/migrations`, proved
 * against PGlite. Nothing here depends on them — the dependency runs the other
 * way, and `@observer/sources` is where the two meet.
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
export * from "./client-config";
export * from "./limits";
export * from "./errors";
export * from "./activation";
export * from "./ingestion";
export * from "./heartbeat";
export * from "./diagnostic";
export * from "./credential";
export * from "./privacy";
export * from "./validation";
export * from "./outbox";
export * from "./projection";
export * from "./traceability";
