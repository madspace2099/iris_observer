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
  "APPROVED_PRODUCT_DECISION",
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
 * **`APPROVED_PRODUCT_DECISION`** — an approved decision that is neither in the brief
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
   * Required for `UE_IMPLEMENTATION_CONFIRMED` and `APPROVED_PRODUCT_DECISION`, and
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
  classification: "APPROVED_PRODUCT_DECISION",
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
  decided(
    "P-01",
    "Activation endpoint, request shape and success body.",
    "Matthew, prior review 2026-09-01 — Activation v1 architecture",
    "activation.ts",
  ),
  decided(
    "P-02",
    "installation_nonce, plugin-generated, replaces a hardware machine fingerprint.",
    "Matthew, prior review 2026-09-01 — Activation v1 architecture",
    "activation.ts",
  ),
  decided(
    "P-03",
    "hostname_hint is removed; a server-authored display_label is returned instead.",
    "Matthew, prior review 2026-09-01 — Activation v1 architecture",
    "activation.ts",
  ),
  decided(
    "P-04",
    "environment is reported by the client but authoritative from the source record.",
    "Matthew, prior review 2026-09-01 — Activation v1 architecture",
    "activation.ts",
  ),
  decided(
    "P-05",
    "The activation response omits tenant_id and project_id; only source_id and a label return.",
    "Matthew, prior review 2026-09-01 — Activation v1 architecture",
    "activation.ts",
  ),
  decided(
    "P-06",
    "status distinguishes activated from reactivated; recovery reuses the ordinary flow.",
    "Matthew, prior review 2026-09-01 — Activation v1 architecture",
    "activation.ts",
  ),
  decided(
    "P-07",
    "Ingestion endpoint and batch envelope shape.",
    "Matthew, prior review 2026-09-01 — Batch Ingestion v1 architecture",
    "ingestion.ts",
  ),
  decided(
    "P-08",
    "Per-event result shape, submission order, and redundant batch counters.",
    "Matthew, prior review 2026-09-01 — Batch Ingestion v1 architecture",
    "ingestion.ts",
  ),
  decided(
    "P-09",
    "The rejection code vocabulary and each code's retry and outbox policy.",
    "Matthew, prior review 2026-09-01 — error model with durable fail-safe quarantine",
    "errors.ts",
  ),
  decided(
    "P-10",
    "An unrecognised code is non-retryable and quarantines, overriding the server's retryable flag.",
    "Matthew, prior review 2026-09-01 — error model with durable fail-safe quarantine",
    "errors.ts",
  ),
  decided(
    "P-11",
    "An unrecognised HTTP status retains the outbox and backs off; an unrecognised 4xx quarantines.",
    "Matthew, prior review 2026-09-01 — error model with durable fail-safe quarantine",
    "errors.ts",
  ),
  decided(
    "P-12",
    "Source credentials do not expire; revocation and rotation are the operator's controls.",
    "Matthew, prior review 2026-09-01 — no mandatory expiry in V1, expires_at nullable",
    "credential.ts",
  ),
  decided(
    "P-13",
    "Credential and source lifecycle states and their observable transitions.",
    "Matthew, prior review 2026-09-01 — Activation v1 architecture",
    "credential.ts",
  ),
  decided(
    "P-14",
    "A dedicated heartbeat endpoint carries liveness and plugin health; an empty batch is not a heartbeat.",
    "Matthew, prior review 2026-09-01 — dedicated heartbeat and diagnostic.test",
    "heartbeat.ts",
  ),
  decided(
    "P-15",
    "diagnostic.test in a reserved namespace proves the storage path end to end, once.",
    "Matthew, prior review 2026-09-01 — dedicated heartbeat and diagnostic.test",
    "diagnostic.ts",
  ),
  decided(
    "P-16",
    "The limit field shape is contract; every value in this candidate is deliberately null.",
    "Matthew, 2026-09-01 — shape approved; the values are PD-03",
    "limits.ts",
  ),
  /* P-17 is superseded by PD-04: the sequence semantics are confirmed and approved. */
  decided(
    "P-18",
    "Byte, depth and breadth ceilings all answer event_too_large, with the detail naming which.",
    "Matthew, prior review 2026-09-01 — error model with durable fail-safe quarantine",
    "validation.ts",
  ),
  decided(
    "P-19",
    "The forbidden-content scan is a guardrail against accidents; the schema registry is the guarantee.",
    "Matthew, prior review 2026-09-01 — error model with durable fail-safe quarantine",
    "privacy.ts",
  ),
  decided(
    "P-20",
    "An empty batch is valid and processed, returning received: 0. It is not a heartbeat.",
    "Matthew, prior review 2026-09-01 — Batch Ingestion v1 architecture",
    "ingestion.ts",
  ),
  decided(
    "P-21",
    "SourceObservation.sequence is nullable with a minimum of 1, rather than defaulting non-session events to zero. APPLIED TO CODE 2026-09-02: the decision was recorded as approved on 2026-09-01 while observation.ts still declared it required and non-negative, which is why toSourceObservation refused every non-session event. Null is the honest value for an event belonging to no session; zero is not a neutral placeholder, because it sorts before every real event in its session, permanently, in a way no read model could detect.",
    "Matthew, prior review 2026-09-01 — applied to observation.ts 2026-09-02",
    "observation.ts",
  ),
  decided(
    "PD-29",
    "max_property_depth 8 and max_property_count 128 are approved protocol values, not harness fixtures. They were the last two invented numbers in HARNESS_LIMITS, which declared itself MOCK_ONLY while UE-OBS-005 validated against it and validateEvent could not run without it. A number a client validates against and a server enforces is a protocol value whatever the comment above it says. They bound WORK rather than size: the byte ceilings already bound size, but a small payload nested very deeply still costs a recursive validator its stack, which is why depth is checked iteratively before any recursive pass. M-01 is retired: every HARNESS_LIMITS field now sources from APPROVED_BACKEND_CEILINGS.",
    "Matthew, 2026-09-02",
    "client-config.ts",
  ),
  decided(
    "P-23",
    "Backend absolute ceilings: 200 events, 8 MiB per batch and 64 KiB per event, as three independent constraints a batch must satisfy simultaneously. Deliberately uncoupled from any Unreal configuration.",
    "Matthew, 2026-09-02",
    "client-config.ts",
  ),
  decided(
    "P-24",
    "At the TOP LEVEL of properties only, a key may not shadow an envelope, identity or credential name. Nested domain keys are permitted; no payload value participates in identity resolution at any depth.",
    "Matthew, 2026-09-02 — narrowed from the recursive form",
    "ingestion.ts",
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
  ueConfirmed(
    "U-23",
    "V1 targets packaged Windows (Win64) showroom and kiosk PCs on Unreal Engine 5.6, and no other runtime platform.",
    "Akhilesh, 2026-09-02 — platform matrix answered",
    "credential.ts",
  ),
  decided(
    "PD-11",
    "Windows DPAPI is the approved V1 production credential-at-rest mechanism, wrapped under #if PLATFORM_WINDOWS so a second platform can be added without unpicking it.",
    "Matthew, 2026-09-02 — on the confirmed Windows-only V1 platform",
    "credential.ts",
  ),
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
  /* O-12 is closed by PD-03 (client values) and P-23 (the backend ceiling). */
  /* O-13 is closed by PD-06, on the evidence in U-18 and U-19. */
  ueConfirmed(
    "U-24",
    "Event identifiers are FGuid::NewGuid().ToString(EGuidFormats::DigitsWithHyphensLower): canonical lower-case 36-character hyphenated form, generated once before enqueueing and immutable across retries.",
    "Akhilesh, 2026-09-02 — both published examples parse under the strict schema",
    "wire.ts",
  ),
  decided(
    "PD-12a",
    "SUPERSEDES PD-12. The event and session identifier schema is CanonicalIdSchema: canonical lowercase hex in 8-4-4-4-12 form, with no RFC 4122 version or variant requirement. PD-12 kept the strict schema on the reasoning that CoCreateGuid backs FGuid on the Windows-only V1 platform — true, but it made the contract depend on a platform accident that the first non-Windows target, or a change inside the engine, would silently break. Lowercase is required in the other direction because PostgreSQL's native uuid type normalises case, so an uppercase identifier would be echoed back in results[] altered and never pair with its outbox entry.",
    "Matthew, 2026-09-02 — identifier requirement is 128 stable bits, not RFC semantics",
    "wire.ts",
  ),
  ueConfirmed(
    "U-25",
    "FObserverEvent serialises snake_case field names, matching the contract's wire vocabulary rather than Unreal's default camelCase.",
    "Akhilesh, 2026-09-02 — envelope sample supplied",
    "ingestion.ts",
  ),

  ueConfirmed(
    "U-26",
    "Exhausting Max Retry Attempts never deletes an event: it stays in queue.json on disk and is removed only on a confirmed delivery response.",
    "Akhilesh, 2026-09-02 — retry-exhaustion semantics answered",
    "outbox.ts",
  ),
  open(
    "O-19",
    "Whether the outbox removes an event on the 2xx itself or on the per-event accepted/duplicate status inside it. Removing on the 2xx alone would delete a non-retryable rejection that must be quarantined. REPORTED FIXED by Akhilesh in two rounds, both PENDING SOURCE VERIFICATION — reported behaviour is not yet evidence, and this stays OPEN until the drop is read. Round one fixed the policy but kept the wire shape: the client still read accepted_ids/duplicate_ids, which BatchResponseSchema forbids (additionalProperties false) and never emits, so it would have acknowledged nothing at all and grown its outbox to the 50 MiB ceiling while the backend returned 200 and stored every event. That divergence was put to him and round two reports the canonical single results array, with accepted/duplicate removing only that event, retryable rejections retained, non-retryable quarantined, and missing, conflicting, foreign-id and malformed-2xx bodies all acknowledging nothing. Automation test Observer.Transport.CanonicalPerEventResults is reported green, and a run log shows the quarantine path writing a file with a reason code, which is behaviour rather than a claim. What remains unverified is which assertions sit inside that one test: four distinct negative cases are folded into it, and the foreign-id rule is about MATCHING rather than queue depth — a result whose event_id was not in the submitted batch must never be paired with any queued event.",
    "akhilesh",
    ["UE-OBS-006"],
    "outbox.ts",
  ),
  ueConfirmed(
    "U-28",
    "Outbox capacity exhaustion refuses new admission and returns false; the FIFO deletion of previously accepted unacknowledged events is gone from the source.",
    "Akhilesh, 2026-09-02 — verified in ObserverDurableOutbox::Enqueue, second source drop",
    "outbox.ts",
  ),
  ueConfirmed(
    "U-29",
    "Sequence is stamped in exactly one place, immediately before validation and enqueue, and resets to zero on session start so the first event is 1.",
    "Akhilesh, 2026-09-02 — verified in ObserverAnalyticsSubsystem::TrackObserverEvent, second source drop",
    "ingestion.ts",
  ),
  ueConfirmed(
    "U-30",
    "Windows DPAPI CryptProtectData persistence is implemented under PLATFORM_WINDOWS, writing source_credential.dat, and a legacy plaintext file is migrated then deleted on load.",
    "Akhilesh, 2026-09-02 — verified in the second source drop; see O-22 for the fallback",
    "credential.ts",
  ),
  ueConfirmed(
    "U-27",
    "Endpoint URLs are treated as entirely backend-owned; the UE side enters whatever final production URLs are supplied into Project Settings.",
    "Akhilesh, 2026-09-02 — endpoint ownership answered",
    "openapi.ts",
  ),
  decided(
    "PD-13",
    "The production endpoint names are /functions/v1/observer-activate, /observer-ingest and /observer-heartbeat. Namespaced because Edge Functions share one flat namespace with everything else the project deploys.",
    "Matthew, 2026-09-02 — backend-owned, so decided here",
    "openapi.ts",
  ),

  open(
    "O-18",
    "Evidence that the production credential store is implemented rather than planned, survives crash recovery and updates, and cannot be switched to plaintext in a production package. REPORTED FIXED by Akhilesh 2026-09-02, PENDING SOURCE VERIFICATION in the next drop — not yet evidence, and this stays OPEN until the source is read: Six Unreal Automation Tests are reported passing, covering activation, envelope serialisation, validation and privacy, outbox persistence and recovery, acknowledgement handling, and retry/backoff. Crash-recovery evidence specifically remains the thing to check.",
    "akhilesh",
    ["UE-OBS-003"],
    "credential.ts",
  ),

  decided(
    "PD-25",
    "CLOSES O-20. app, agent_id, visitor_subject and entity are envelope fields, folded into EventEnvelopeSchema itself rather than into a parallel schema. app is required; the other three are optional and absent rather than null, matching FObserverEvent::ToJsonObject, which omits empty keys. Folding them into the base schema is what makes the decision reach validation.ts, BatchEnvelopeSchema and the published OpenAPI at once — a parallel schema would have left three of those four still refusing every real event. Binding condition: app.environment is reported provenance, never authoritative and never an authorisation input; the stored environment comes from the source record. A reported value outside the published vocabulary is carried and warned about, never a rejection.",
    "Matthew, 2026-09-02 — the four fields are envelope fields",
    "ingestion.ts",
  ),
  decided(
    "PD-26",
    "The published environment vocabulary is production, staging, development and demo. demo was added with PD-25; the set is authoritative for the source record only. normaliseReportedEnvironment folds client case, which resolves the shipped client's capitalised Development without the envelope having to refuse it.",
    "Matthew, 2026-09-02",
    "wire.ts",
  ),
  decided(
    "PD-27",
    "NARROWS the activation failure vocabulary. already_activated is removed, 409 is not an activation outcome, and ActivationFailureSchema.source_id is typed null. The earlier carve-out cited LOCKED §9.1 for indistinguishability and then broke it: a 409 carrying a source_id turned a guessed code into an unauthenticated existence oracle, confirming the code was genuine and handing over the source identifier. It also authorised on installation_nonce, which the architecture defines as operational metadata and never an authorisation input. The installation-clash branch is removed entirely, not merely restatused.",
    "Matthew, 2026-09-02 — more faithful to §9.1 than the shipped contract was",
    "activation.ts",
  ),
  open(
    "O-21",
    "Whether agent_id may be derived from a person's name. The sample value agent_john carries one, which is the kind of identifier that turns a pseudonymous reference back into personal data.",
    "product",
    ["UE-OBS-009"],
    "privacy.ts",
  ),

  open(
    "O-22",
    "The credential store falls back to plaintext silently when DPAPI fails or the platform is not Windows, with no log line and no state change. A production package must not be able to select plaintext at all. REPORTED FIXED by Akhilesh 2026-09-02, PENDING SOURCE VERIFICATION in the next drop — not yet evidence, and this stays OPEN until the source is read: The plaintext fallback is removed; a DPAPI failure now refuses to persist, logs an error, and the legacy .json is deleted only after the encrypted .dat is written. NOTE the state correction Matthew issued: a LOCAL credential-storage failure must set Error, not Unauthorised — Unauthorised is reserved for a backend 401.",
    "akhilesh",
    ["UE-OBS-003"],
    "credential.ts",
  ),
  open(
    "O-23",
    "The client invents a 365-day credential expiry when the server omits expires_at, and refuses to send once it passes. The approved V1 decision is no mandatory expiry, so a working showroom would lock itself out after a year. REPORTED FIXED by Akhilesh 2026-09-02, PENDING SOURCE VERIFICATION in the next drop — not yet evidence, and this stays OPEN until the source is read: The invented 365-day expiry is removed; absent or null expires_at means non-expiring, stored as null. This matches the V1 decision that there is no mandatory credential expiry.",
    "matthew_and_akhilesh",
    ["UE-OBS-003"],
    "credential.ts",
  ),
  open(
    "O-24",
    "Capacity refusals and validation failures share one counter, so an operator cannot tell a full disk from a plugin emitting bad events. The two have different remedies. REPORTED FIXED by Akhilesh 2026-09-02, PENDING SOURCE VERIFICATION in the next drop — not yet evidence, and this stays OPEN until the source is read: Validation failures, capacity/disk refusals and backend-quarantined events now have separate counters, with the combined TotalEventsFailed retained. This is what makes the heartbeat contract able to distinguish a full disk from a malformed-event bug.",
    "akhilesh",
    ["UE-OBS-006"],
    "heartbeat.ts",
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

  ueConfirmed(
    "U-13",
    "Project Settings configure Batch Size = 25 and Flush Interval Seconds = 5.0.",
    "UE-OBS-006 settings",
    "client-config.ts",
  ),
  ueConfirmed(
    "U-14",
    "The maximum single event payload is 64 KiB.",
    "UE-OBS-006 settings",
    "client-config.ts",
  ),
  ueConfirmed(
    "U-15",
    "The durable outbox has a 50 MB disk ceiling and lives at Saved/Observer/Outbox/.",
    "UE-OBS-006 settings",
    "client-config.ts",
  ),
  ueConfirmed(
    "U-16",
    "StartSession() mints a fresh session_id and resets the counter; the first emitted session event carries 1; stamping is central; Blueprint callers cannot override it.",
    "UE-OBS-004",
    "ingestion.ts",
  ),
  ueConfirmed(
    "U-17",
    "The proposed 401/403 pause-and-preserve behaviour is practical and intended on the UE side.",
    "UE-OBS-006",
    "outbox.ts",
  ),
  ueConfirmed(
    "U-18",
    "Development builds persist the credential as plain JSON at Saved/Observer/source_credential.json.",
    "UE-OBS-003",
    "credential.ts",
  ),
  ueConfirmed(
    "U-19",
    "The production Windows plan is Windows DPAPI: no hard-coded key in the binary, compatible with crash recovery, surviving ordinary updates.",
    "UE-OBS-003",
    "credential.ts",
  ),
  ueConfirmed(
    "U-20",
    "Endpoints, environment, app version, build id, batch size, flush interval, queue disk size, retry attempts, consent and debug logging are all configurable in Project Settings without a C++ edit.",
    "UE-OBS-001",
    "client-config.ts",
  ),
  ueConfirmed(
    "U-21",
    "The configured endpoints are https://observer.madspace.io/functions/v1/activate and /ingest, which differ from the contract's proposed names.",
    "UE-OBS-001 settings",
    "openapi.ts",
  ),
  ueConfirmed(
    "U-22",
    "Max Retry Attempts is configured to 5. Its exact semantics are not yet stated.",
    "UE-OBS-006 settings",
    "outbox.ts",
  ),

  /* -------------------------------------------- APPROVED_PRODUCT_DECISION */
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

  decided(
    "PD-03",
    "V1 client delivery defaults are adopted: 25 events per batch, a 5 second flush, a 64 KiB event cap and a 50 MB outbox ceiling, with a supported batch range of 25-50.",
    "Matthew, 2026-09-01, on the evidence in U-13, U-14 and U-15",
    "client-config.ts",
  ),
  decided(
    "PD-04",
    "Every session-scoped event carries a subsystem-generated monotonic sequence starting at 1; Blueprint callers cannot supply it; non-session events carry null; and 0 never represents a real emitted event.",
    "Matthew, 2026-09-01, on the evidence in U-16. Supersedes P-17",
    "ingestion.ts",
  ),
  decided(
    "PD-05",
    "On 401 or 403 the plugin pauses delivery, preserves the whole outbox, continues bounded local capture, surfaces an operator-visible state, and never reactivates automatically.",
    "Matthew, 2026-09-01, on the evidence in U-17",
    "outbox.ts",
  ),
  decided(
    "PD-06",
    "A production package may not persist a plaintext credential. Windows DPAPI is the approved platform mechanism; the contract is stated as a persistence abstraction, and no backend logic depends on it.",
    "Matthew, 2026-09-01, on the evidence in U-18 and U-19",
    "credential.ts",
  ),
  decided(
    "PD-07",
    "The outbox ceiling is enforced by bytes actually used. The ~50,000 event / one week figure is an expected operational capacity at typical event sizes, never a worst-case guarantee.",
    "Matthew, 2026-09-01",
    "client-config.ts",
  ),
  decided(
    "PD-08",
    "Operational configuration must remain changeable without editing plugin C++. Defaults may live in code; the deployment is authoritative within server-approved bounds, and a stricter server value always wins.",
    "Matthew, 2026-09-01, on the evidence in U-20",
    "client-config.ts",
  ),

  /* ------------------------------------------------------------- MOCK_ONLY */
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
