/**
 * SCENARIOS — explicit configuration, never magic. MOCK-ONLY.
 *
 * A mock that decides on its own that "every seventh request is rate limited"
 * teaches whoever reads it that the pattern is protocol. It is not. So the
 * reference backend does exactly what it is told and nothing else: a test pushes
 * directives onto a queue, and each request consumes at most one.
 *
 * Recurring patterns still have their uses — a soak test wants intermittent
 * failure without scripting three hundred directives — so they exist, in one
 * clearly-named place, behind `MOCK_ONLY_FIXTURES`. Anything reached through
 * that object is scaffolding. Nothing reached through it appears in the OpenAPI
 * document, the handoff, or the decision register.
 */

/**
 * A forced outcome for the next request that consumes one.
 *
 * The two `drop` directives are the reason this file exists at all. From the
 * client they are indistinguishable — no response arrives in either case — and
 * the difference between them is exactly the difference between "the server
 * never saw it" and "the server stored it and the acknowledgement was lost".
 * A stable `event_id` is what makes the client's inability to tell them apart
 * harmless, and `idempotency.test.ts` proves it by running both.
 */
export type Directive =
  | { readonly kind: "rate_limit"; readonly retryAfterSeconds: number }
  | { readonly kind: "unavailable" }
  | { readonly kind: "batch_too_large" }
  | { readonly kind: "malformed_request" }
  /** The connection dies before anything is processed. Nothing is stored. */
  | { readonly kind: "drop_before_processing" }
  /** The batch is processed and stored; the response never arrives. */
  | { readonly kind: "drop_after_processing" }
  /** These specific events fail transiently. Everything else in the batch proceeds. */
  | { readonly kind: "storage_error"; readonly eventIds: readonly string[] };

/** A named recurring pattern. Test scaffolding. Never protocol. */
export interface MockFixture {
  readonly name: string;
  /** Called with a 1-based request index; a directive, or null for none. */
  readonly at: (requestIndex: number) => Directive | null;
}

export const MOCK_ONLY_FIXTURES = {
  /** `scenario = rate_limit_every_7th`, and it is a fixture, not a rule. */
  rateLimitEveryNth(n: number, retryAfterSeconds = 2): MockFixture {
    return {
      name: `rate_limit_every_${n}th`,
      at: (index) => (index % n === 0 ? { kind: "rate_limit", retryAfterSeconds } : null),
    };
  },

  unavailableEveryNth(n: number): MockFixture {
    return {
      name: `unavailable_every_${n}th`,
      at: (index) => (index % n === 0 ? { kind: "unavailable" } : null),
    };
  },

  /** Nothing ever goes wrong. The baseline every other run is compared against. */
  none(): MockFixture {
    return { name: "none", at: () => null };
  },
} as const;

/**
 * The activation and ingestion situations the harness can reproduce on demand.
 *
 * Listed as data so that a test can assert coverage rather than a reader having
 * to trust that the list in the specification and the list in the code still
 * match.
 */
export const SUPPORTED_SCENARIOS = [
  /* activation */
  "activation_success_first",
  "activation_invalid_code",
  "activation_expired_code",
  "activation_consumed_code",
  "activation_reactivation_same_source",
  "activation_already_activated_installation",
  "activation_source_suspended",
  "activation_rate_limited",
  "activation_unavailable",
  /* ingestion */
  "ingest_all_accepted",
  "ingest_duplicate_event",
  "ingest_partial_success",
  "ingest_all_rejected",
  "ingest_unsupported_schema",
  "ingest_malformed_event",
  "ingest_event_too_large",
  "ingest_reserved_property",
  "ingest_pii_suspected",
  "ingest_batch_too_large",
  "ingest_unauthorised_credential",
  "ingest_superseded_credential",
  "ingest_suspended_source",
  "ingest_rate_limited_retry_after",
  "ingest_unavailable_503",
  "ingest_transport_drop_before_processing",
  "ingest_transport_drop_after_processing",
  "ingest_storage_error_event_level",
  "ingest_empty_batch",
  /* diagnostics */
  "heartbeat_ok",
  "heartbeat_unauthorised",
  "diagnostic_test_event_accepted",
] as const;
export type SupportedScenario = (typeof SUPPORTED_SCENARIOS)[number];
