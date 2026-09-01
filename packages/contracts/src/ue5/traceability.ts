/**
 * TRACEABILITY — why every rule in this contract exists, and who approved it.
 *
 * The question this file answers, for any field or behaviour in the package:
 * **why is this here, and on whose authority?**
 *
 * A prose document cannot answer that reliably. Six revisions in, a convenient
 * proposal acquires the confident tone of an approved decision, a brief citation
 * gets attached to something the brief never said, and nobody can tell the
 * difference by reading. So the classification is data, the invariants are
 * tests, and `traceability.test.ts` fails if:
 *
 *   - anything claims `LOCKED_FROM_BRIEF` without citing a section;
 *   - anything `PROPOSED` cites the brief, which would be borrowing an authority
 *     it does not have;
 *   - a `DERIVED` rule does not name the locked rule it follows from;
 *   - a derivation rests on a `MOCK_ONLY` fixture;
 *   - the contract calls itself approved while OPEN decisions remain.
 *
 * The classifications are the ones the reviewer asked for, and they mean:
 *
 *   `LOCKED_FROM_BRIEF`        approved in the architecture brief. Restated with
 *                              a citation, never reopened here.
 *   `DERIVED_FROM_LOCKED_RULE` not stated in the brief, but follows from a rule
 *                              that is. The derivation is named.
 *   `PROPOSED`                 a concrete recommendation awaiting sign-off.
 *   `OPEN`                     genuinely unresolved, and left that way rather
 *                              than filled in with invented certainty.
 *   `MOCK_ONLY`                a test fixture. Never protocol.
 *
 * Brief section numbers refer to *IRIS Observer Analytics — UE5 Plugin
 * Architecture and Implementation Brief* v1.0. The brief is not held in this
 * repository; the citations were reviewed and accepted against
 * `docs/ue5-ingestion-contract.md` §1.
 */

export const CLASSIFICATIONS = [
  "LOCKED_FROM_BRIEF",
  "DERIVED_FROM_LOCKED_RULE",
  "UE_IMPLEMENTATION_CONFIRMED",
  "DECIDED_BY_PRODUCT",
  "PROPOSED",
  "OPEN",
  "MOCK_ONLY",
] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

/**
 * TWO CLASSES ADDED AFTER AKHILESH'S UE-OBS-001..004 REPORT.
 *
 * **`UE_IMPLEMENTATION_CONFIRMED`** — a fact evidenced by completed UE work that
 * the architecture brief never mandated as exact implementation detail. That the
 * engine is 5.6, that the credential currently lives at
 * `Saved/Observer/source_credential.json`, that monotonic sequencing exists: all
 * true, none of them architecture rules. Recording them as LOCKED would be
 * lending the brief's authority to an implementation detail that may change next
 * sprint, which is precisely the mislabelling this table exists to prevent — in
 * the opposite direction from the one originally guarded against.
 *
 * **`DECIDED_BY_PRODUCT`** — an approved decision that is neither in the brief
 * nor still a proposal. The legacy clean-slate decision is the first: nothing in
 * the brief speaks to it, and calling it PROPOSED would misrepresent a decision
 * that has been made. Without this class an approved decision has nowhere honest
 * to sit, and it will be needed again as the Matthew proposals are signed off.
 *
 * Neither class may be the antecedent of a derivation. A rule derived from
 * implementation evidence is an architecture rule justified backwards, and a
 * rule derived from a product decision is a wire constraint justified by scope.
 */

export const OWNERS = [
  "brief",
  "matthew",
  "akhilesh",
  "matthew_and_akhilesh",
  "backend_review",
  "product",
  "harness",
] as const;
export type Owner = (typeof OWNERS)[number];

export interface ContractRule {
  readonly id: string;
  readonly statement: string;
  readonly classification: Classification;
  /** Required for LOCKED, forbidden for everything else. */
  readonly briefSection: string | null;
  /** Required for DERIVED, empty for everything else. */
  readonly derivedFrom: readonly string[];
  /**
   * Required for `UE_IMPLEMENTATION_CONFIRMED` and `DECIDED_BY_PRODUCT`, and
   * forbidden for everything else: which UE package evidences the fact, or who
   * decided and when. A claim of either kind without its source is exactly the
   * unattributed assertion this table exists to make impossible.
   */
  readonly evidence: string | null;
  readonly owner: Owner;
  /** UE5 milestones that cannot be finished until this is settled. */
  readonly blocks: readonly string[];
  /** Where it lives, so a reader can go and check. */
  readonly where: string;
}

const locked = (
  id: string,
  statement: string,
  briefSection: string,
  where: string,
): ContractRule => ({
  id,
  statement,
  classification: "LOCKED_FROM_BRIEF",
  briefSection,
  derivedFrom: [],
  evidence: null,
  owner: "brief",
  blocks: [],
  where,
});

const derived = (
  id: string,
  statement: string,
  derivedFrom: readonly string[],
  where: string,
  blocks: readonly string[] = [],
): ContractRule => ({
  id,
  statement,
  classification: "DERIVED_FROM_LOCKED_RULE",
  briefSection: null,
  derivedFrom,
  evidence: null,
  owner: "matthew",
  blocks,
  where,
});

const proposed = (
  id: string,
  statement: string,
  owner: Owner,
  blocks: readonly string[],
  where: string,
): ContractRule => ({
  id,
  statement,
  classification: "PROPOSED",
  briefSection: null,
  derivedFrom: [],
  evidence: null,
  owner,
  blocks,
  where,
});

const open = (
  id: string,
  statement: string,
  owner: Owner,
  blocks: readonly string[],
  where: string,
): ContractRule => ({
  id,
  statement,
  classification: "OPEN",
  briefSection: null,
  derivedFrom: [],
  evidence: null,
  owner,
  blocks,
  where,
});

const mock = (id: string, statement: string, where: string): ContractRule => ({
  id,
  statement,
  classification: "MOCK_ONLY",
  briefSection: null,
  derivedFrom: [],
  evidence: null,
  owner: "harness",
  blocks: [],
  where,
});

/** A fact evidenced by completed UE work. Never an architecture rule. */
const ueConfirmed = (
  id: string,
  statement: string,
  evidence: string,
  where: string,
): ContractRule => ({
  id,
  statement,
  classification: "UE_IMPLEMENTATION_CONFIRMED",
  briefSection: null,
  derivedFrom: [],
  evidence,
  owner: "akhilesh",
  blocks: [],
  where,
});

/** An approved decision that is neither in the brief nor still a proposal. */
const decided = (id: string, statement: string, evidence: string, where: string): ContractRule => ({
  id,
  statement,
  classification: "DECIDED_BY_PRODUCT",
  briefSection: null,
  derivedFrom: [],
  evidence,
  owner: "product",
  blocks: [],
  where,
});

/* ================================================================== the rules */

export const CONTRACT_RULES: readonly ContractRule[] = Object.freeze([
  /* ---------------------------------------------------------------- LOCKED */
  locked(
    "L-01",
    "One shared Observer platform; no per-project clone or per-project website.",
    "§10.1",
    "docs",
  ),
  locked("L-02", "Identity spine: tenant → project → project_source.", "§3.3", "projection.ts"),
  locked(
    "L-03",
    "A project UUID is immutable; the project name is display metadata, never an identifier.",
    "§3.1, §10.1",
    "docs",
  ),
  locked("L-04", "An activation code is one-time and short-lived.", "§3.1, §3.4", "activation.ts"),
  locked(
    "L-05",
    "A code is exchanged for a source-scoped credential and is invalid thereafter.",
    "§3.1",
    "activation.ts",
  ),
  locked(
    "L-06",
    "The backend derives tenant_id, project_id and source_id from the credential.",
    "§3.2, §4.2, §9.2",
    "projection.ts",
  ),
  locked("L-07", "The client cannot select those identifiers.", "§3.4, §4.2", "ingestion.ts"),
  locked("L-08", "A source credential is revocable and rotatable.", "§3.4", "credential.ts"),
  locked(
    "L-09",
    "An invalid or expired code must not reveal whether anything exists.",
    "§9.1",
    "activation.ts",
  ),
  locked(
    "L-10",
    "Repeat activation requires explicit recovery; never a silent duplicate source.",
    "§9.1",
    "activation.ts",
  ),
  locked("L-11", "UE5 has no direct table access.", "§3.4, §10.1", "docs"),
  locked("L-12", "analytics_events is immutable and append-only.", "§3.2, §3.3", "projection.ts"),
  locked("L-13", "A versioned event envelope with the §4.1 field set.", "§4.1", "ingestion.ts"),
  locked(
    "L-14",
    "event_id is generated before the first send and is stable across retries.",
    "§4.1, §5.4",
    "ingestion.ts",
  ),
  locked(
    "L-15",
    "Replaying an accepted event_id never creates a second fact.",
    "§5.4, §5.5",
    "ingestion.ts",
  ),
  locked(
    "L-16",
    "Per-event accepted / duplicate / rejected, with a safe reason and retryability.",
    "§9.2",
    "ingestion.ts",
  ),
  locked("L-17", "Partial batch success is intended.", "§9.2", "ingestion.ts"),
  locked(
    "L-18",
    "Events leave the outbox only on an explicit accept or duplicate acknowledgement.",
    "§3.2, §5.4, §5.5",
    "errors.ts",
  ),
  locked("L-19", "401 and 403 mean stop, mark unauthorised, reactivate.", "§5.5", "credential.ts"),
  locked(
    "L-20",
    "400 means no endless retry: quarantine with a safe diagnostic.",
    "§5.5",
    "errors.ts",
  ),
  locked("L-21", "429 means respect Retry-After and retain.", "§5.5", "errors.ts"),
  locked(
    "L-22",
    "5xx means retain and back off, bounded, and never crash IRIS.",
    "§5.5",
    "errors.ts",
  ),
  locked(
    "L-23",
    "Queue limits are configurable and visible, and never discard silently.",
    "§5.4",
    "heartbeat.ts",
  ),
  locked("L-24", "No raw personal data in event properties.", "§5.6, §10.1", "privacy.ts"),
  locked(
    "L-25",
    "Personal and contact data live in a separate protected store.",
    "§3.3, §5.6",
    "docs",
  ),
  locked(
    "L-26",
    "Credentials and raw payloads never reach UE logs or crash reports.",
    "§3.4, §5.6",
    "privacy.ts",
  ),
  locked("L-27", "Client timestamps are never silently corrected.", "§4.1, §4.2", "validation.ts"),
  locked(
    "L-28",
    "A credential belongs to the registered source, not to an engine, plugin or build version.",
    "§3.3, §3.4",
    "wire.ts",
  ),

  /* --------------------------------------------------------------- DERIVED */
  derived(
    "D-01",
    "Envelopes are strict objects: a client-supplied identity field is rejected, not ignored.",
    ["L-06", "L-07"],
    "ingestion.ts",
    ["UE-OBS-004"],
  ),
  derived(
    "D-02",
    "Reserved property keys (identity and server-assigned) are refused at every nesting level.",
    ["L-06", "L-07"],
    "ingestion.ts",
    ["UE-OBS-004"],
  ),
  derived(
    "D-03",
    "The HTTP status describes whether the batch was processed; per-event status describes the events.",
    ["L-16", "L-17"],
    "ingestion.ts",
    ["UE-OBS-006"],
  ),
  derived(
    "D-04",
    "A non-2xx answer means nothing was stored, so the whole batch is safe to resend unchanged.",
    ["L-17", "L-18"],
    "errors.ts",
    ["UE-OBS-006", "UE-OBS-007"],
  ),
  derived(
    "D-05",
    "duplicate is a success for the client: the fact is stored, so the event may leave the outbox.",
    ["L-15", "L-18"],
    "errors.ts",
    ["UE-OBS-006"],
  ),
  derived(
    "D-06",
    "An event is never split, because splitting either invents a second event_id or reuses one.",
    ["L-14", "L-15"],
    "errors.ts",
    ["UE-OBS-006"],
  ),
  derived(
    "D-07",
    "There is no token-refresh channel; credential material reaches a device only through activation.",
    ["L-04", "L-05", "L-08"],
    "credential.ts",
    ["UE-OBS-003"],
  ),
  derived(
    "D-08",
    "Unknown, expired and consumed codes answer identically in status, body and timing.",
    ["L-09"],
    "activation.ts",
    ["UE-OBS-003"],
  ),
  derived(
    "D-09",
    "already_activated returns no token, which is what prevents a second source per installation.",
    ["L-10"],
    "activation.ts",
    ["UE-OBS-003"],
  ),
  derived(
    "D-10",
    "An authorisation failure retains the outbox: the events were never the problem.",
    ["L-18", "L-19"],
    "credential.ts",
    ["UE-OBS-006", "UE-OBS-007"],
  ),
  derived(
    "D-11",
    "Quarantine keeps the event on disk with its reason; it is never a discard.",
    ["L-20", "L-23"],
    "errors.ts",
    ["UE-OBS-006"],
  ),
  derived(
    "D-12",
    "Diagnostic events are excluded from read models by a published rule, not by convention.",
    ["L-12"],
    "diagnostic.ts",
    ["UE-OBS-010"],
  ),
  derived(
    "D-13",
    "A rejection detail names the offending key and never carries its value.",
    ["L-24", "L-26"],
    "privacy.ts",
    ["UE-OBS-005"],
  ),
  derived(
    "D-14",
    "Changing app, plugin, build or engine version never invalidates a credential or requires reactivation.",
    ["L-28"],
    "wire.ts",
    ["UE-OBS-003"],
  ),
  derived(
    "D-15",
    "A UE5 wire event projects onto the existing SourceObservation; there is no second store.",
    ["L-06", "L-12"],
    "projection.ts",
    ["UE-OBS-004"],
  ),
  derived(
    "D-16",
    "The server parses the batch frame only: validating events at the batch level would turn one bad event into a whole-batch 400.",
    ["L-16", "L-17"],
    "ingestion.ts",
    ["UE-OBS-006"],
  ),
  derived(
    "D-17",
    "Deduplication is scoped to the source, so a duplicate answer cannot reveal that another source stored an event.",
    ["L-06", "L-15"],
    "@observer/ue5-mock",
    ["UE-OBS-006"],
  ),

  /* -------------------------------------------------------------- PROPOSED */
  proposed(
    "P-01",
    "Activation endpoint, request shape and success body.",
    "matthew",
    ["UE-OBS-003"],
    "activation.ts",
  ),
  proposed(
    "P-02",
    "installation_nonce, plugin-generated, replaces a hardware machine fingerprint.",
    "matthew_and_akhilesh",
    ["UE-OBS-003"],
    "activation.ts",
  ),
  proposed(
    "P-03",
    "hostname_hint is removed; a server-authored display_label is returned instead.",
    "matthew",
    ["UE-OBS-003"],
    "activation.ts",
  ),
  proposed(
    "P-04",
    "environment is reported by the client but authoritative from the source record.",
    "matthew",
    ["UE-OBS-003"],
    "activation.ts",
  ),
  proposed(
    "P-05",
    "The activation response omits tenant_id and project_id; only source_id and a label return.",
    "matthew",
    ["UE-OBS-003"],
    "activation.ts",
  ),
  proposed(
    "P-06",
    "status distinguishes activated from reactivated; recovery reuses the ordinary flow.",
    "matthew",
    ["UE-OBS-003"],
    "activation.ts",
  ),
  proposed(
    "P-07",
    "Ingestion endpoint and batch envelope shape.",
    "matthew",
    ["UE-OBS-006", "UE-OBS-007"],
    "ingestion.ts",
  ),
  proposed(
    "P-08",
    "Per-event result shape, submission order, and redundant batch counters.",
    "matthew",
    ["UE-OBS-006"],
    "ingestion.ts",
  ),
  proposed(
    "P-09",
    "The rejection code vocabulary and each code's retry and outbox policy.",
    "matthew",
    ["UE-OBS-006", "UE-OBS-007"],
    "errors.ts",
  ),
  proposed(
    "P-10",
    "An unrecognised code is non-retryable and quarantines, overriding the server's retryable flag.",
    "matthew",
    ["UE-OBS-007"],
    "errors.ts",
  ),
  proposed(
    "P-11",
    "An unrecognised HTTP status retains the outbox and backs off; an unrecognised 4xx quarantines.",
    "matthew",
    ["UE-OBS-007"],
    "errors.ts",
  ),
  proposed(
    "P-12",
    "Source credentials do not expire; revocation and rotation are the operator's controls.",
    "matthew",
    ["UE-OBS-003"],
    "credential.ts",
  ),
  proposed(
    "P-13",
    "Credential and source lifecycle states and their observable transitions.",
    "matthew",
    ["UE-OBS-003"],
    "credential.ts",
  ),
  proposed(
    "P-14",
    "A dedicated heartbeat endpoint carries liveness and plugin health; an empty batch is not a heartbeat.",
    "matthew",
    ["UE-OBS-010"],
    "heartbeat.ts",
  ),
  proposed(
    "P-15",
    "diagnostic.test in a reserved namespace proves the storage path end to end, once.",
    "matthew",
    ["UE-OBS-010"],
    "diagnostic.ts",
  ),
  proposed(
    "P-16",
    "The limit field shape is contract; every value in this candidate is deliberately null.",
    "matthew",
    ["UE-OBS-006"],
    "limits.ts",
  ),
  /*
   * Narrowed after UE-OBS-004. Feasibility is no longer in question — U-10
   * records that monotonic sequencing exists in the V2 event engine — so what
   * remains is the semantic guarantee, which implementation evidence does not
   * establish on its own.
   */
  proposed(
    "P-17",
    "sequence is mandatory for every session-scoped event, cannot be overridden by a Blueprint caller, and has defined reset semantics at each new session_id.",
    "matthew_and_akhilesh",
    ["UE-OBS-004", "UE-OBS-009"],
    "ingestion.ts",
  ),
  proposed(
    "P-18",
    "Byte, depth and breadth ceilings all answer event_too_large, with the detail naming which.",
    "matthew",
    ["UE-OBS-005"],
    "validation.ts",
  ),
  proposed(
    "P-19",
    "The forbidden-content scan is a guardrail against accidents; the schema registry is the guarantee.",
    "matthew",
    ["UE-OBS-005"],
    "privacy.ts",
  ),
  proposed(
    "P-20",
    "An empty batch is valid and processed, returning received: 0. It is not a heartbeat.",
    "matthew",
    ["UE-OBS-006"],
    "ingestion.ts",
  ),
  proposed(
    "P-21",
    "SourceObservation.sequence should become nullable, rather than defaulting non-session events to zero.",
    "matthew",
    ["UE-OBS-004"],
    "projection.ts",
  ),
  proposed(
    "P-22",
    "The credential security properties an implementation must provide, stated behaviourally.",
    "backend_review",
    ["UE-OBS-003"],
    "credential.ts",
  ),

  /* ------------------------------------------------------------------ OPEN */
  open(
    "O-01",
    "Idempotency retention: how an accepted event_id stays remembered if raw events are ever deleted.",
    "backend_review",
    [],
    "docs",
  ),
  open("O-02", "Analytics event retention. No policy exists.", "product", [], "docs"),
  open(
    "O-03",
    "The clock acceptance window, if any. Four options, none chosen.",
    "matthew_and_akhilesh",
    [],
    "validation.ts",
  ),
  open(
    "O-04",
    "Batch-level clock skew: meaning, timestamp pair, diagnostic or validating.",
    "matthew",
    [],
    "docs",
  ),
  open("O-05", "Screenshot storage path and how events reference it.", "matthew", [], "docs"),
  open(
    "O-06",
    "event_schema_registry entries. The mechanism is contracted; the catalogue is not.",
    "product",
    ["UE-OBS-012"],
    "validation.ts",
  ),
  open("O-07", "The platform matrix beyond Unreal Engine 5.6.", "akhilesh", ["UE-OBS-002"], "docs"),
  open(
    "O-08",
    "Identity handoff: how a stable agent_id and approved visitor references enter the UE session.",
    "product",
    ["UE-OBS-009"],
    "docs",
  ),
  open(
    "O-09",
    "The schema support window: how long old IRIS builds remain accepted.",
    "matthew",
    [],
    "docs",
  ),
  /* O-10 (the legacy InsightAnalytics target) is closed. See PD-01 and U-12. */
  open(
    "O-11",
    "Credential internals: hash or KDF, prefix scheme, lookup index.",
    "backend_review",
    [],
    "credential.ts",
  ),
  open(
    "O-12",
    "The numeric limit values, pending measurement on real showroom hardware.",
    "akhilesh",
    ["UE-OBS-006"],
    "limits.ts",
  ),
  open(
    "O-13",
    "What protection is applied at rest to the persisted source credential, and whether a platform-appropriate protected store is practical for V1.",
    "matthew_and_akhilesh",
    ["UE-OBS-003"],
    "credential.ts",
  ),
  open(
    "O-14",
    "The exact wire representation of the UE event identifier: hyphenated canonical form, and whether it carries RFC 4122 version and variant bits.",
    "matthew_and_akhilesh",
    ["UE-OBS-007"],
    "wire.ts",
  ),
  open(
    "O-15",
    "Whether FObserverEvent serialises the envelope with the contract's snake_case field names rather than Unreal's default camelCase.",
    "matthew_and_akhilesh",
    ["UE-OBS-007"],
    "ingestion.ts",
  ),

  /* ------------------------------------- UE_IMPLEMENTATION_CONFIRMED */
  ueConfirmed("U-01", "The current target engine is Unreal Engine 5.6.", "UE-OBS-001", "wire.ts"),
  ueConfirmed(
    "U-02",
    "All hard-coded Supabase URLs and keys are removed from the V2 plugin; backend configuration comes through Unreal Project Settings.",
    "UE-OBS-001",
    "docs",
  ),
  ueConfirmed(
    "U-03",
    "The V2 plugin no longer depends on the legacy direct-table transport.",
    "UE-OBS-001",
    "docs",
  ),
  ueConfirmed(
    "U-04",
    "A one-time activation flow with source-token persistence and crash recovery is implemented.",
    "UE-OBS-003",
    "activation.ts",
  ),
  ueConfirmed(
    "U-05",
    "The source credential currently persists at Saved/Observer/source_credential.json.",
    "UE-OBS-003",
    "credential.ts",
  ),
  ueConfirmed(
    "U-06",
    "Mock activation codes currently use a DEV- prefix. A prefix is not semantic to the contract.",
    "UE-OBS-003",
    "@observer/ue5-mock",
  ),
  ueConfirmed(
    "U-07",
    "Multi-tenant and multi-source isolation has been exercised against mock activation behaviour.",
    "UE-OBS-003",
    "docs",
  ),
  ueConfirmed(
    "U-08",
    "FObserverEvent carries a stable identifier generated before the first send.",
    "UE-OBS-004",
    "ingestion.ts",
  ),
  ueConfirmed(
    "U-09",
    "FObserverEvent serialises UTC timestamps with millisecond precision as YYYY-MM-DDTHH:MM:SS.sssZ.",
    "UE-OBS-004",
    "wire.ts",
  ),
  ueConfirmed(
    "U-10",
    "Monotonic sequencing is implemented in the V2 event engine.",
    "UE-OBS-004",
    "ingestion.ts",
  ),
  ueConfirmed(
    "U-11",
    "JSON serialisation and deserialisation of the event envelope roundtrips inside Unreal.",
    "UE-OBS-004",
    "ingestion.ts",
  ),
  ueConfirmed(
    "U-12",
    "The legacy InsightAnalytics database holds only prototype snapshot blobs in user_sessions and global_analytics, written during Job 1 proof-of-concept testing. No live client analytics.",
    "Akhilesh, 2026-09-01",
    "docs",
  ),

  /* -------------------------------------------- DECIDED_BY_PRODUCT */
  decided(
    "PD-01",
    "Observer V2 analytics starts as a clean slate. No legacy importer, compatibility projection, blob migration or historical conversion layer is to be built for user_sessions or global_analytics.",
    "Matthew, 2026-09-01, on the evidence in U-12",
    "docs",
  ),
  decided(
    "PD-02",
    "The legacy direct-table transport is retired for V2 and is not a supported production path. No V2 code or document may imply otherwise.",
    "Matthew, 2026-09-01, on the evidence in U-03",
    "docs",
  ),

  /* ------------------------------------------------------------- MOCK_ONLY */
  mock(
    "M-01",
    "HARNESS_LIMITS: finite ceilings so the reference implementation has something to refuse.",
    "limits.ts",
  ),
  mock(
    "M-02",
    "Named fixtures such as rate_limit_every_nth. Test scaffolding, never protocol behaviour.",
    "@observer/ue5-mock",
  ),
  mock(
    "M-03",
    "A deterministic clock and deterministic token minting inside the reference backend.",
    "@observer/ue5-mock",
  ),
]);

/* ================================================================ summaries */

export function rulesByClassification(classification: Classification): readonly ContractRule[] {
  return CONTRACT_RULES.filter((rule) => rule.classification === classification);
}

export function classificationCounts(): Readonly<Record<Classification, number>> {
  const counts = Object.fromEntries(CLASSIFICATIONS.map((c) => [c, 0])) as Record<
    Classification,
    number
  >;
  for (const rule of CONTRACT_RULES) counts[rule.classification] += 1;
  return Object.freeze(counts);
}

/** Every milestone still waiting on something, and what it waits on. */
export function blockedMilestones(): ReadonlyMap<string, readonly string[]> {
  const blocked = new Map<string, string[]>();
  for (const rule of CONTRACT_RULES) {
    if (rule.classification !== "OPEN") continue;
    for (const milestone of rule.blocks) {
      const existing = blocked.get(milestone) ?? [];
      existing.push(rule.id);
      blocked.set(milestone, existing);
    }
  }
  return blocked;
}
