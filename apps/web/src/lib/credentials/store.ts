import "server-only";

import { resolveServerSupabase, type EnvSource } from "@/lib/supabase-env";
import { testStore, testStorePermitted } from "./test-store";
import type { SealedCredential } from "./envelope";

/**
 * WHERE A SEALED CREDENTIAL LIVES, BEHIND ONE PORT.
 *
 * Two adapters implement it and neither is chosen by a caller:
 *
 *   - **Supabase**, the real one and the only one a deployment can reach. It
 *     calls five `security definer` functions owned by a private non-login
 *     role, which are the sole path to tables no browser role holds a single
 *     privilege on (see `20260829173000_observer_account_credentials.sql`).
 *
 *   - **test**, for the browser suite, isolated in `test-store.ts`. It needs
 *     four simultaneous conditions, refuses every deployment, refuses ordinary
 *     development, and holds only obviously synthetic credentials.
 *
 * When neither is available the port says so and every caller above it refuses.
 * That is the fail-closed default and it is what this machine runs: no
 * `SUPABASE_URL`, no test flags, therefore no credential storage, therefore no
 * per-account model access. Ask Observer stays evidence-only.
 *
 * ## What is stored, and what is not
 *
 * Metadata is separate from the secret by construction. The row holds the
 * account id, the provider, the sealed payload, the key version, the last four
 * characters, a status and three timestamps. It does not hold the key, and no
 * function in this file can produce one — `open` lives in `envelope.ts` and is
 * called by the service, once, on the request path.
 */

/** Which provider a credential is for. One today; the column is not a boolean. */
export const OPENAI = "openai";

/** The row, as stored. `sealed` is opaque without the master key. */
export interface StoredCredential {
  readonly accountId: string;
  readonly provider: string;
  readonly sealed: SealedCredential;
  readonly lastFour: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastTestedAt: string | null;
  readonly lastTestOutcome: TestOutcome | null;
  /**
   * A monotonic write token, so a late replacement cannot win.
   *
   * Two replacements in flight can arrive in either order — a slow first
   * request landing after a fast second one would otherwise reinstate the key
   * it superseded, silently reactivating a credential the reader believed they
   * had replaced. The upsert applies only when this exceeds the stored value.
   */
  readonly revision: number;
}

/**
 * What a connection test concluded.
 *
 * A category, never a message. The provider's own words are translated in
 * `failure.ts` for the screen and are not written down anywhere.
 */
export type TestOutcome = "passed" | "rejected" | "unavailable";

/** The four things an audit row may say. Nothing else is recorded. */
export type CredentialAction = "connected" | "tested" | "replaced" | "removed";

export interface AuditEntry {
  readonly accountId: string;
  readonly provider: string;
  readonly action: CredentialAction;
  readonly succeeded: boolean;
  /** A short category, never a provider message and never a payload. */
  readonly category: string;
  readonly at: string;
}

export interface CredentialStore {
  /** Named so a diagnostic can say which one answered, without leaking values. */
  readonly kind: "supabase" | "test";
  /**
   * Whether this store will hold a given credential at all.
   *
   * The real one holds anything a provider might issue — a vendor prefix is a
   * convention, not a contract, and one has changed already. The browser
   * harness holds only obviously synthetic values, so a real key pasted into a
   * test server is refused before it is sealed rather than sitting in a
   * fixture nobody audits.
   */
  readonly accepts?: (plaintext: string) => boolean;
  read(accountId: string, provider: string): Promise<StoredCredential | null>;
  /** Atomic. A failed write leaves the previous credential exactly as it was. */
  upsert(record: StoredCredential): Promise<void>;
  /** True when a row was deleted. Deletion, never a status flag. */
  remove(accountId: string, provider: string): Promise<boolean>;
  recordTest(accountId: string, provider: string, outcome: TestOutcome, at: string): Promise<void>;
  audit(entry: AuditEntry): Promise<void>;
}

/* ============================================================ the Supabase one */

function post(
  url: string,
  key: string,
  fn: string,
  body: Record<string, unknown>,
): Promise<Response> {
  /*
   * The same transport `quota.ts` uses, and the same reason for no schema
   * profile header: PostgREST answers 406 for a schema it does not expose, and
   * `observer` is deliberately not exposed. The door is a function in `public`;
   * only the secret key opens it.
   */
  return fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

/**
 * Fails loudly rather than silently.
 *
 * A storage error must not read as "no credential" — that would silently
 * disconnect an account whose database hiccuped, and the reader would be told
 * to go and set up a connection they already have. The service turns this into
 * a temporary-unavailable state instead.
 */
export class CredentialStorageError extends Error {
  constructor(what: string) {
    super(`Credential storage did not answer: ${what}`);
    this.name = "CredentialStorageError";
  }
}

function rowToStored(row: Record<string, unknown>): StoredCredential {
  const text = (k: string): string => {
    const v = row[k];
    if (typeof v !== "string" || v.length === 0) throw new CredentialStorageError(`missing ${k}`);
    return v;
  };
  const maybe = (k: string): string | null => {
    const v = row[k];
    return typeof v === "string" && v.length > 0 ? v : null;
  };
  const outcome = maybe("last_test_outcome");

  return {
    accountId: text("account_id"),
    provider: text("provider"),
    sealed: {
      version: text("key_version"),
      nonce: text("nonce"),
      ciphertext: text("ciphertext"),
      tag: text("auth_tag"),
    },
    lastFour: text("last_four"),
    revision: Number(row["revision"] ?? 0),
    createdAt: text("created_at"),
    updatedAt: text("updated_at"),
    lastTestedAt: maybe("last_tested_at"),
    lastTestOutcome:
      outcome === "passed" || outcome === "rejected" || outcome === "unavailable" ? outcome : null,
  };
}

function supabaseStore(url: string, key: string): CredentialStore {
  return {
    kind: "supabase",

    async read(accountId, provider) {
      const response = await post(url, key, "observer_credential_read", {
        p_account: accountId,
        p_provider: provider,
      });
      if (!response.ok) throw new CredentialStorageError(`read returned ${response.status}`);
      const rows: unknown = await response.json();
      if (!Array.isArray(rows) || rows.length === 0) return null;
      return rowToStored(rows[0] as Record<string, unknown>);
    },

    async upsert(record) {
      /*
       * One statement, so replacement is atomic.
       *
       * The alternative — delete then insert — has a window in which an account
       * that had a working credential has none, and a crash inside it is a
       * permanent loss of something the reader can no longer retype because
       * they were told the key would never be shown again.
       */
      const response = await post(url, key, "observer_credential_upsert", {
        p_account: record.accountId,
        p_provider: record.provider,
        p_key_version: record.sealed.version,
        p_nonce: record.sealed.nonce,
        p_ciphertext: record.sealed.ciphertext,
        p_auth_tag: record.sealed.tag,
        p_last_four: record.lastFour,
        p_revision: record.revision,
      });
      if (!response.ok) throw new CredentialStorageError(`upsert returned ${response.status}`);
    },

    async remove(accountId, provider) {
      const response = await post(url, key, "observer_credential_delete", {
        p_account: accountId,
        p_provider: provider,
      });
      if (!response.ok) throw new CredentialStorageError(`delete returned ${response.status}`);
      const deleted: unknown = await response.json();
      return deleted === true;
    },

    async recordTest(accountId, provider, outcome, at) {
      const response = await post(url, key, "observer_credential_record_test", {
        p_account: accountId,
        p_provider: provider,
        p_outcome: outcome,
        p_at: at,
      });
      if (!response.ok) throw new CredentialStorageError(`record test returned ${response.status}`);
    },

    async audit(entry) {
      const response = await post(url, key, "observer_credential_audit", {
        p_account: entry.accountId,
        p_provider: entry.provider,
        p_action: entry.action,
        p_succeeded: entry.succeeded,
        p_category: entry.category,
        p_at: entry.at,
      });
      /*
       * An audit failure is logged as a category, not raised. Losing the record
       * of a removal is bad; refusing to remove a credential because the audit
       * table is unreachable is worse — the reader asked for their key to be
       * deleted and the answer must not be "the log is down".
       */
      if (!response.ok) {
        console.warn(`[observer.credentials] audit write returned ${response.status}`);
      }
    },
  };
}

/* ==================================================================== selection */

export type StorageAvailability =
  | { readonly available: true; readonly store: CredentialStore }
  | { readonly available: false; readonly reason: "not_configured" };

/**
 * Which store this server has, if any.
 *
 * Supabase first, always — a deployment with a database never reaches the
 * harness whatever else is set. The harness needs all four of its own
 * conditions (`test-store.ts`), none of which an ordinary `pnpm dev` or any
 * deployment satisfies.
 *
 * Neither available is the fail-closed default and it is what this workstation
 * runs: no Supabase, no test flags, therefore no credential storage, therefore
 * no per-account model access and a settings page that says so.
 */
export function credentialStore(source: EnvSource = process.env): StorageAvailability {
  const supabase = resolveServerSupabase(source);
  if (supabase !== null) {
    return { available: true, store: supabaseStore(supabase.url, supabase.key) };
  }

  if (testStorePermitted(source)) return { available: true, store: testStore() };

  return { available: false, reason: "not_configured" };
}
