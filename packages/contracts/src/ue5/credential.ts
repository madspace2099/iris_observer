/**
 * THE CREDENTIAL LIFECYCLE — external behaviour only. PROPOSED.
 *
 * What an operator can do, and what the plugin observes when they do it. The
 * internals — hash or KDF, prefix scheme, lookup index — are OPEN-11 and
 * deliberately absent: they are a credential-review decision, and a wire
 * contract that pinned them would be pretending to have made it.
 *
 * ## The premise this is built on
 *
 * A packaged Unreal application cannot keep a secret. Anyone with the binary and
 * patience gets the token; the approved architecture accepts that (§3.4) and so
 * does this. Nothing here depends on the token being unextractable. What it
 * depends on is that an extracted token is **narrow, revocable and observable**:
 * it can only append events to one source, an operator can kill it in one click
 * with effect on the next request, and every use of it is attributed to that
 * source and visible.
 *
 * ## Why there is no expiry
 *
 * Expiry sounds like security and here it is the opposite. It forces a refresh
 * channel — a second door for credential material to reach a device — which is
 * new attack surface, new failure modes, and new code on both sides. In exchange
 * for what? An extracted token stays valid until it expires either way, and the
 * window is exactly as long as the operator's inattention. The brief asks for
 * credentials that are *revocable* and *rotatable* (LOCKED §3.4). Both are
 * operator actions that take effect immediately, which is strictly better than
 * waiting for a clock.
 *
 * A showroom that has run untouched for a year should still be sending. An
 * operator who wants it stopped should not have to wait for a timer.
 */

/* ================================================================== states */

/** An activation code, from issuance to death. */
export const ACTIVATION_CODE_STATES = ["issued", "consumed", "expired", "revoked"] as const;
export type ActivationCodeState = (typeof ACTIVATION_CODE_STATES)[number];

/** A source credential. No time-based state, by design. */
export const CREDENTIAL_STATES = ["active", "superseded", "revoked"] as const;
export type CredentialState = (typeof CREDENTIAL_STATES)[number];

/** A project source. Suspension is reversible; archival is not. */
export const SOURCE_STATES = ["active", "suspended", "archived"] as const;
export type SourceState = (typeof SOURCE_STATES)[number];

/* ============================================================= transitions */

export interface CredentialTransition {
  readonly name: string;
  readonly trigger: string;
  /** What the plugin sees. The only part of this that is contract. */
  readonly observable: string;
  readonly operatorOnly: boolean;
}

export const CREDENTIAL_TRANSITIONS: readonly CredentialTransition[] = Object.freeze([
  {
    name: "issuance",
    trigger: "An operator creates a source and requests an activation code.",
    observable: "Nothing. The plugin has not been contacted. The code is shown once, in Admin.",
    operatorOnly: true,
  },
  {
    name: "activation",
    trigger: "The plugin exchanges a valid, unexpired, unconsumed code.",
    observable:
      "200 with status 'activated'. The token is returned exactly once and never again; the " +
      "code becomes consumed and every later attempt with it answers an indistinguishable 401.",
    operatorOnly: false,
  },
  {
    name: "rotation",
    trigger: "An operator rotates the credential for an existing source.",
    observable:
      "Nothing changes until the plugin activates with the new code. On that success the " +
      "previous credential becomes superseded and stops working — so a rotation that is issued " +
      "but never used leaves a working installation working, which is the safe order.",
    operatorOnly: true,
  },
  {
    name: "revocation",
    trigger: "An operator revokes the credential.",
    observable:
      "The very next request answers 401, with no deploy and no restart. Immediate by design: " +
      "revocation exists for the moment somebody realises a build leaked.",
    operatorOnly: true,
  },
  {
    name: "suspension",
    trigger: "An operator suspends the source.",
    observable:
      "403 source_suspended. The token itself is still valid, which is why this is a different " +
      "status from 401 — the operator's remedy is to resume the source, not to reactivate it.",
    operatorOnly: true,
  },
  {
    name: "archival",
    trigger: "An operator archives the source.",
    observable: "403, permanently. History is retained; nothing further is accepted.",
    operatorOnly: true,
  },
  {
    name: "reactivation",
    trigger: "An operator issues a fresh code for the same source after loss or revocation.",
    observable:
      "The ordinary activation flow, answering status 'reactivated'. Same source_id, same " +
      "history, new credential. There is no separate recovery endpoint and no token refresh: " +
      "credential material reaches a device through exactly one door.",
    operatorOnly: false,
  },
]);

/* ================================================== what the plugin must do */

/**
 * The six rules after a `401` or a `403`.
 *
 * Rule 2 is the one that gets omitted in a hurry and matters most. A plugin that
 * clears its outbox on an authorisation failure has turned a five-minute
 * operator task into permanent data loss, and it will do it silently.
 */
export const UNAUTHORISED_RULES: readonly string[] = Object.freeze([
  "Stop sending immediately. Never retry with a credential the server has just refused.",
  "Keep the outbox. The events are not the problem and must not be discarded.",
  "Mark the source unauthorised, keeping 401 and 403 visibly distinct on the diagnostic screen.",
  "Do not attempt self-recovery: no silent re-activation, no stored fallback code. Reactivation " +
    "is an operator action with a new code.",
  "Keep capturing locally within the queue limits, so an authorisation problem does not also " +
    "become a data gap.",
  "Never log the token, on failure least of all.",
]);

/* ============================================== persistence, at rest */

/**
 * THE CREDENTIAL PERSISTENCE ABSTRACTION — behaviour, not platform.
 *
 * Four operations, and the contract is expressed in terms of them rather than in
 * terms of any particular store. Windows DPAPI is the approved mechanism for the
 * initial Windows implementation; it is **an implementation of this interface,
 * not the interface**. Other platforms wait on the platform matrix, and nothing
 * on the backend may depend on which one is in use — the token is opaque, and how
 * a client keeps it is the client's business right up until it is plaintext.
 */
export const CREDENTIAL_PERSISTENCE_OPERATIONS = [
  "SaveCredential",
  "LoadCredential",
  "DeleteCredential",
  "ReplaceCredential",
] as const;
export type CredentialPersistenceOperation = (typeof CREDENTIAL_PERSISTENCE_OPERATIONS)[number];

export const CREDENTIAL_STORE_MODES = [
  /** Plain JSON on disk. The current development state, and only that. */
  "plaintext_development",
  /** Encrypted by a platform-provided mechanism with no key in the binary. */
  "platform_protected",
] as const;
export type CredentialStoreMode = (typeof CREDENTIAL_STORE_MODES)[number];

/**
 * The approved platform mechanism, per platform.
 *
 * Windows is answered. Everything else is deliberately absent rather than
 * guessed: the platform matrix is still open, and inventing a macOS Keychain
 * requirement for a platform nobody has committed to shipping on would be
 * inventing work.
 */
export const PLATFORM_PROTECTED_MECHANISM: Readonly<Record<string, string>> = Object.freeze({
  windows: "Windows DPAPI",
});

/**
 * What DPAPI does and does not buy, stated so nobody oversells it later.
 *
 * It removes a hard-coded key from the binary and encrypts the credential at
 * rest with protection the OS manages, which meaningfully raises the bar: a
 * backup, a shared machine or a support engineer with filesystem access no longer
 * hands over a working token. That is a real improvement over plain JSON and it
 * is worth doing.
 *
 * **It does not make the credential unextractable**, and the architecture never
 * assumed it would. Anything the application can decrypt, code running as that
 * user can decrypt. Security continues to rest on the same eight properties it
 * always did — source scope, narrow authority, revocation, rotation, rate
 * limiting, monitoring, no direct table access, and an operator-visible
 * unauthorised state.
 */
export const CREDENTIAL_AT_REST_CAVEAT =
  "Platform protection raises the bar against filesystem access. It does not make the " +
  "credential unextractable, and no part of this contract depends on it doing so.";

export interface CredentialStorePolicy {
  readonly environment: "production" | "staging" | "development";
  readonly mode: CredentialStoreMode;
  readonly platform: string;
}

export type CredentialStoreVerdict =
  { readonly ok: true } | { readonly ok: false; readonly refusal: string };

/**
 * The packaging gate: **a production package may not persist a plaintext
 * credential.**
 *
 * Plain JSON is a perfectly reasonable development state and is not being
 * criticised as one. What it must never be is shipped: it lowers the bar from
 * "extract it from a packaged binary" to "read a file", and those are not the
 * same threat however similar they sound.
 *
 * A function rather than a paragraph, because a paragraph is not something a
 * packaging step can fail on.
 */
export function verifyCredentialStore(policy: CredentialStorePolicy): CredentialStoreVerdict {
  if (policy.environment !== "production") return { ok: true };
  if (policy.mode === "plaintext_development") {
    return {
      ok: false,
      refusal:
        "PLAINTEXT CREDENTIAL: a production package may not persist the source credential in " +
        "plain text. Configure the platform-protected store for this platform.",
    };
  }
  const mechanism = PLATFORM_PROTECTED_MECHANISM[policy.platform.toLowerCase()];
  if (mechanism === undefined) {
    return {
      ok: false,
      refusal:
        `NO APPROVED MECHANISM: platform-protected storage is required in production, and no ` +
        `mechanism is approved for "${policy.platform}". The platform matrix is still open.`,
    };
  }
  return { ok: true };
}

/**
 * The security properties an implementation must provide. PROPOSED.
 *
 * Behavioural requirements, testable from outside, deliberately silent about
 * mechanism.
 */
export const CREDENTIAL_SECURITY_PROPERTIES: readonly string[] = Object.freeze([
  "An activation code carries at least 60 bits of entropy from a cryptographic source.",
  "Codes and tokens are compared in constant time.",
  "The server stores a verifier, never anything from which a token can be recovered.",
  "Unknown, expired and consumed codes are indistinguishable in status, body and timing.",
  "Activation attempts are rate limited per caller and per source, and exhausting the limit " +
    "answers 429 rather than revealing which code was closer.",
  "A token is scoped to one source and to appending events. It can read nothing.",
  "Revocation takes effect on the next request, without a deployment.",
  "Neither a code nor a token ever appears in a log line, an error report, a crash dump or a " +
    "test artefact.",
]);
