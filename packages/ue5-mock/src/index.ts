/**
 * `@observer/ue5-mock` — the deterministic reference implementation. MOCK-ONLY.
 *
 * A local, Supabase-free, egress-free implementation of the proposed UE5
 * contract, so that our contract tests and Akhilesh's future transport tests
 * exercise one protocol rather than two readings of a document.
 *
 * Nothing here is a production design. See `backend.ts` for what that means in
 * practice, and `scenarios.ts` for why recurring failure patterns live behind a
 * name that says they are scaffolding.
 *
 * ```ts
 * const backend = new MockObserverBackend();
 * const code = backend.issueActivationCode({ displayLabel: "Northgate · PC 1" });
 * const activated = backend.activate({ activation_code: code, ... });
 * const server = await startMockServer(backend);   // for an Unreal client
 * ```
 */

export { MockObserverBackend, FixedClock } from "./backend";
export type { BackendOptions, MockClock, MockOutcome, SourceRecord, StoredEvent } from "./backend";
export { MOCK_ONLY_FIXTURES, SUPPORTED_SCENARIOS } from "./scenarios";
export type { Directive, MockFixture, SupportedScenario } from "./scenarios";
export { startMockServer } from "./server";
export type { MockServer } from "./server";
export { Deterministic } from "./ids";
