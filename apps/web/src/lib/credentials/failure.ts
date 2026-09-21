/**
 * WHAT A READER IS TOLD WHEN A CONNECTION DOES NOT WORK.
 *
 * Six categories and one sentence each, written for the person who pasted the
 * key rather than for the operator who deployed the server. Every one of them
 * is a constant in this file: nothing a provider says reaches a screen, a log,
 * an audit row or a test report.
 *
 * ## Why the provider's own words are thrown away
 *
 * An upstream error message is not a safe string. It can quote the request back
 * — a header, a parameter, a fragment of the body — and the request carried a
 * credential. `provider.ts` already carries a capped 400-message through for
 * operators, deliberately and with a note explaining the risk; this path is the
 * opposite case. It is rendered to an end user in a browser, so it is a closed
 * vocabulary and the mapping is one-way.
 *
 * This module is NOT `server-only`: the category strings render in a page and
 * are imported by tests. It never sees a key, a ciphertext or an upstream body.
 */

/**
 * The status reason Ask reports when the asking account has no connection.
 *
 * A constant rather than a sentence written twice, because the answer sheet
 * compares against it to decide whether to offer a way to fix it. Matching on
 * prose is how a UI silently stops offering help the day somebody improves the
 * wording.
 */
export const NO_ACCOUNT_CONNECTION = "this account has no OpenAI connection";

/** Where a reader goes to fix that. One place, named once. */
export const SETTINGS_PATH = "/settings/ai";

export type ConnectionFailure =
  /** The key is wrong, revoked, or the provider will not accept it. */
  | "rejected"
  /** Authenticated, but the account cannot reach the model Observer uses. */
  | "model_unavailable"
  /** Too many requests, right now. */
  | "rate_limited"
  /** Billing: the OpenAI project has run out of credit. */
  | "insufficient_credits"
  /** Billing: a spending limit was reached. Different money problem, different fix. */
  | "spending_limit"
  /** The provider or the network did not answer. Nobody's mistake. */
  | "provider_unavailable"
  /** This server cannot store credentials at all. An operator's problem. */
  | "storage_unavailable"
  /** A stored credential exists but will not decrypt. */
  | "unreadable";

interface Message {
  readonly title: string;
  readonly detail: string;
  /** Whether retrying the same key could plausibly work. Drives the button. */
  readonly retryable: boolean;
}

const MESSAGES: Readonly<Record<ConnectionFailure, Message>> = Object.freeze({
  rejected: {
    title: "That key was not accepted",
    detail:
      "OpenAI rejected the credential itself. It may have been revoked, deleted or copied incompletely. Create a new key and paste it again.",
    retryable: false,
  },
  model_unavailable: {
    title: "The key works, but not for the model Observer needs",
    detail:
      "The credential is valid. The OpenAI project it belongs to is not entitled to the model Observer asks with — check that project's model permissions, or use a key from one that has them. Your connection is kept.",
    retryable: false,
  },
  rate_limited: {
    title: "OpenAI is rate limiting this key",
    detail:
      "The credential is valid; too many requests have been made recently. Wait a moment and test again. Your connection is kept.",
    retryable: true,
  },
  insufficient_credits: {
    title: "That OpenAI project has no credit left",
    detail:
      "The key is valid and Observer can reach the model — the OpenAI project behind it has run out of balance. Add credit in the OpenAI dashboard. Your connection is kept.",
    retryable: true,
  },
  spending_limit: {
    title: "That OpenAI project has hit its spending limit",
    detail:
      "The key is valid and there is credit; a monthly limit on the OpenAI project or organisation has been reached. Raise it in the OpenAI dashboard, or wait for the limit to reset. Your connection is kept.",
    retryable: true,
  },
  provider_unavailable: {
    title: "OpenAI could not be reached",
    detail:
      "The request did not complete, which is usually temporary and says nothing about the credential. Test again in a moment. Your connection is kept.",
    retryable: true,
  },
  storage_unavailable: {
    title: "Secure credential storage is not configured",
    detail:
      "This deployment has no encrypted credential store, so a key cannot be saved and the form below is disabled. Ask MADSPACE to configure it. Nothing typed here is kept in the meantime.",
    retryable: false,
  },
  unreadable: {
    title: "The stored connection could not be read",
    detail:
      "The saved credential did not decrypt. This happens when the deployment's encryption key changes. Remove the connection and add the key again.",
    retryable: false,
  },
});

export function describeFailure(failure: ConnectionFailure): Message {
  return MESSAGES[failure];
}

/** Every category, for the tests that render each one. */
export const ALL_FAILURES: readonly ConnectionFailure[] = Object.keys(
  MESSAGES,
) as ConnectionFailure[];

/**
 * Turns whatever the provider threw into one of the six.
 *
 * Takes an HTTP status and an optional short vendor code — both already
 * extracted upstream — and never the error object, so there is no route by
 * which a message or a header could arrive here and be forwarded by accident.
 * Anything unrecognised is "unavailable", the least alarming and least
 * informative answer, which is the right default for a mapping that must not
 * guess.
 */
export function classifyProviderFailure(status: number, code: string | null): ConnectionFailure {
  /*
   * THE CODE BEFORE THE STATUS, ALWAYS.
   *
   * OpenAI returns 429 for three different problems — no credit, a spending
   * cap, and ordinary rate limiting — and they need three different things
   * from the reader: top up, raise a limit, or simply wait. Reading the status
   * first would collapse all three into "slow down", which is advice that
   * cannot work for two of them.
   */
  if (code === "insufficient_quota") return "insufficient_credits";
  if (code === "billing_hard_limit_reached" || code === "billing_not_active") {
    return "spending_limit";
  }
  if (code === "model_not_found" || code === "model_not_available") return "model_unavailable";
  if (code === "invalid_api_key" || code === "account_deactivated") return "rejected";
  if (code === "rate_limit_exceeded") return "rate_limited";

  if (status === 401 || status === 403) return "rejected";
  if (status === 404) return "model_unavailable";
  if (status === 429) return "rate_limited";
  return "provider_unavailable";
}

/**
 * WHETHER A FAILURE MEANS THE STORED CREDENTIAL IS BAD.
 *
 * Exactly one of them does. A key that cannot reach a model, has run out of
 * credit, hit a spending cap, was rate limited or met an outage is a perfectly
 * good key having a bad day — marking it invalid would tell the reader to go
 * and create a new one, which fixes none of those and costs them the working
 * credential they had.
 *
 * The stored connection is never deleted by a failed test in any case. This is
 * what decides the WORD written next to it.
 */
export function impugnsCredential(failure: ConnectionFailure): boolean {
  return failure === "rejected";
}

/**
 * The short category written to the audit trail.
 *
 * The same closed vocabulary, so the audit and the screen cannot disagree, and
 * so a grep of the audit table can never turn up anything but these words.
 */
export function auditCategory(failure: ConnectionFailure | null): string {
  return failure ?? "ok";
}
