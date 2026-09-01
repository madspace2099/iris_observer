/**
 * THE V1 OPERATING PARAMETERS — confirmed on the UE side, approved for V1.
 *
 * These were `OPEN-12` for as long as nobody had measured anything. Akhilesh has
 * now measured, and the numbers below are the configured V1 settings in the UE
 * plugin's Project Settings. They are recorded here so that the contract, the
 * reference implementation and the handoff all quote one source.
 *
 * ## Three different numbers, and conflating them is the mistake to avoid
 *
 *   **client default**   what the plugin ships configured to do.
 *   **client range**     what an operator may configure it to, without a code
 *                        change.
 *   **backend ceiling**  the absolute point at which a request is refused.
 *
 * They are not the same number and must not be made equal by accident. The
 * backend ceiling has to sit at or above the top of the client's operating
 * range — otherwise an operator turning a legitimate dial produces `413` — and
 * it is still `PROPOSED` here, because nobody has reviewed it.
 *
 * ## Configuration is not a code change
 *
 * Every value here is settable in Unreal Project Settings without touching C++.
 * That is an architecture rule, not a convenience: an operational limit that
 * needs a recompile is an operational limit nobody adjusts at 9pm in a showroom.
 * These constants are **defaults and bounds**, never a substitute for what the
 * deployment is actually configured to.
 *
 * ## The server is still authoritative
 *
 * When the server states a limit at activation and the client is configured
 * more permissively, **the stricter one wins**. `effectiveLimit` is that rule,
 * and it is deliberately a function rather than a sentence in a document.
 */

/* ==================================================== confirmed V1 defaults */

export interface ClientDeliveryDefaults {
  /** Events per batch, as shipped. */
  readonly defaultBatchEvents: number;
  /** Seconds between ordinary flushes. */
  readonly flushIntervalSeconds: number;
  /** Largest single serialised event. */
  readonly maxEventBytes: number;
  /** Disk the durable outbox may occupy. */
  readonly maxLocalOutboxBytes: number;
}

/**
 * The V1 settings, as configured in the UE plugin.
 *
 * `UE_IMPLEMENTATION_CONFIRMED` for the values, `DECIDED_BY_PRODUCT` for
 * adopting them as the V1 contract defaults.
 */
export const UE_V1_CLIENT_DEFAULTS: ClientDeliveryDefaults = Object.freeze({
  defaultBatchEvents: 25,
  flushIntervalSeconds: 5,
  maxEventBytes: 65_536,
  maxLocalOutboxBytes: 52_428_800,
});

/** What an operator may configure the batch size to, without a code change. */
export const UE_BATCH_RANGE = Object.freeze({ min: 25, max: 50 });

/** Where the durable outbox lives on disk. */
export const UE_OUTBOX_DIRECTORY = "Saved/Observer/Outbox/" as const;

/* ============================================== the capacity claim, honestly */

/**
 * What 50 MB actually holds, and what it is expected to hold.
 *
 * Akhilesh estimates roughly 50,000 events — about a week of offline showroom
 * activity — inside the 50 MB ceiling. That estimate is **operational**, drawn
 * from typical IRIS event sizes, and it is worth having.
 *
 * It is not an invariant, and encoding it as one would be a mistake with a very
 * specific failure mode. At the 64 KB per-event cap the same 50 MB holds **800**
 * events, which is two orders of magnitude fewer. A queue that enforced a fixed
 * event count instead of a byte count would therefore overrun its disk budget by
 * roughly sixty times whenever events ran large — which is exactly when a
 * showroom is producing the most data and can least afford it.
 *
 * **The ceiling is enforced in bytes.** `expectedEventCapacity` exists to be
 * quoted in an operator's diagnostics; `worstCaseEventCapacity` exists so that
 * nobody mistakes the first number for a guarantee.
 */
export const EXPECTED_TYPICAL_EVENT_BYTES = 1_024;

export function expectedEventCapacity(ceilingBytes = UE_V1_CLIENT_DEFAULTS.maxLocalOutboxBytes) {
  return Math.floor(ceilingBytes / EXPECTED_TYPICAL_EVENT_BYTES);
}

export function worstCaseEventCapacity(
  ceilingBytes = UE_V1_CLIENT_DEFAULTS.maxLocalOutboxBytes,
  maxEventBytes = UE_V1_CLIENT_DEFAULTS.maxEventBytes,
) {
  return Math.floor(ceilingBytes / maxEventBytes);
}

/**
 * How the capacity should be described anywhere a human reads it.
 *
 * Published as a string so the phrasing cannot drift into a promise.
 */
export const OUTBOX_CAPACITY_STATEMENT =
  "50 MB is the V1 disk ceiling. Roughly 50,000 events, about one week of offline showroom " +
  "activity, is an expected operational capacity based on typical event sizes — not a " +
  "worst-case guarantee. The ceiling is enforced by bytes actually used, never by an assumed " +
  "event count.";

/* ================================================ the proposed backend ceiling */

/**
 * What the backend would refuse. **PROPOSED — not reviewed.**
 *
 * `maxBatchEvents` is four times the top of the client's operating range. The
 * reason it is not 50 is backlog: a showroom returning after a week offline
 * wants to drain in larger batches than it accumulates in, and a ceiling equal
 * to the steady-state maximum turns recovery into a very long afternoon.
 *
 * `maxEventBytes` is exactly the client cap. There is no reason for the two to
 * differ, and a gap would only mean one side rejecting what the other allowed.
 *
 * `maxBatchBytes` is not `maxBatchEvents × maxEventBytes` — that product is
 * 12.5 MB of worst-case events, which no real batch resembles. A client that
 * genuinely holds large events must split on bytes, which `413` already tells
 * it to do.
 */
export const PROPOSED_BACKEND_CEILINGS = Object.freeze({
  maxBatchEvents: 200,
  maxBatchBytes: 8 * 1_024 * 1_024,
  maxEventBytes: UE_V1_CLIENT_DEFAULTS.maxEventBytes,
});

/* ========================================================= the stricter rule */

/**
 * The limit actually in force, given what the client is configured to and what
 * the server stated.
 *
 * A null server value means "the server states nothing", not "no limit". The
 * stricter of the two always wins — a client that ignored a tighter server value
 * would be refused anyway, and one that ignored a tighter local value would
 * overrun the disk budget an operator deliberately set.
 */
export function effectiveLimit(clientConfigured: number, serverStated: number | null): number {
  return serverStated === null ? clientConfigured : Math.min(clientConfigured, serverStated);
}

/** Whether a configured batch size is inside the supported operating range. */
export function batchSizeSupported(batchEvents: number): boolean {
  return (
    Number.isInteger(batchEvents) &&
    batchEvents >= UE_BATCH_RANGE.min &&
    batchEvents <= UE_BATCH_RANGE.max
  );
}

/* ============================================ what may be configured at runtime */

/**
 * The Project Settings surface, recorded so that a later change cannot quietly
 * move one of these into C++.
 *
 * The architecture rule this protects: **operational configuration changes must
 * not require editing plugin source.** Defaults may live in code; the deployment
 * remains authoritative within server-approved bounds.
 */
export const UE_CONFIGURABLE_SETTINGS: readonly string[] = Object.freeze([
  "Activation Endpoint",
  "Ingest Endpoint",
  "Environment",
  "App Version",
  "Build ID",
  "Batch Size",
  "Flush Interval Seconds",
  "Max Queue Disk Size MB",
  "Max Retry Attempts",
  "Consent Given",
  "Enable Debug Logging",
]);

/**
 * `Consent Given` is operational tracking state, and nothing more.
 *
 * It is **not** evidence of legal consent and **not** a backend authorisation
 * input. There is deliberately no consent field anywhere on the wire, and no
 * value of it relaxes the privacy guard: an event carrying a raw email address
 * is rejected whether or not somebody ticked a box in Project Settings.
 *
 * Analytics may be reduced or disabled by privacy mode; raw personal data stays
 * prohibited in the generic event stream regardless; and approved
 * visitor/contact matching is a separate future contract.
 */
export const CONSENT_SETTING_MEANING =
  "UE operational tracking state. Not legal consent, not a backend authorisation decision, " +
  "and never a bypass for the privacy guard.";
