import "server-only";

import {
  CredentialUnreadableError,
  EncryptionUnavailableError,
  encryptionConfigured,
  lastFour,
  open,
  seal,
} from "./envelope";
import { classifyProviderFailure, impugnsCredential, type ConnectionFailure } from "./failure";
import {
  CredentialStorageError,
  OPENAI,
  credentialStore,
  type CredentialAction,
  type StoredCredential,
  type TestOutcome,
} from "./store";

/**
 * THE ONLY DOOR TO AN ACCOUNT'S PROVIDER CREDENTIAL.
 *
 * Everything above this file — the settings page, its server actions, the Ask
 * gate — goes through these functions, and every one of them takes the account
 * id as its first argument. There is no function here that reads "the current
 * credential" without being told whose, because a resolver with an implicit
 * subject is one refactor away from resolving somebody else's.
 *
 * ## Ownership
 *
 *   the key belongs to     an authenticated account
 *   never to               a project, a developer, a sales-agent profile, or a
 *                          browser session
 *   one account has        at most one active connection
 *   it is used for         every project that account is authorised to open
 *
 * The account id comes from the signed session cookie's subject and is resolved
 * server-side. It is never read from a form field, a query string, a header or
 * a request body — an account id that arrives from the client is an account id
 * the client chose.
 *
 * ## What leaves this module
 *
 * `connectionFor` returns METADATA: provider, last four characters, timestamps,
 * status. It cannot return a key because it never decrypts one. Exactly one
 * function decrypts — `resolveApiKey` — it is called from the server-side model
 * path, its result is handed to a request-scoped client, and it is not stored,
 * cached, logged or returned to any component that could serialise it.
 *
 * ## Extensibility, deliberately not taken
 *
 * The store is keyed by `(account, provider)` and the service takes an owner
 * argument rather than assuming one. An organisation-managed credential would
 * be a second owner kind resolved before the account, and the shapes here do
 * not stand in its way. It is NOT implemented: there is no organisation
 * lookup, no inheritance and no fallback, because a fallback that silently
 * charges somebody else's OpenAI project is exactly the behaviour a "bring your
 * own key" feature must not have.
 */

/** What a screen may know about a connection. Never the key. */
export interface ConnectionMetadata {
  readonly provider: string;
  readonly lastFour: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastTestedAt: string | null;
  readonly lastTestOutcome: TestOutcome | null;
}

export type ConnectionState =
  | { readonly kind: "connected"; readonly connection: ConnectionMetadata }
  | { readonly kind: "not_connected" }
  /** The server cannot hold credentials: no storage, or no encryption key. */
  | { readonly kind: "unavailable"; readonly failure: ConnectionFailure };

/**
 * Whether this deployment can hold a credential at all.
 *
 * Both halves are required and both are checked before anything else happens.
 * A server with storage and no encryption key must refuse rather than store
 * something it cannot protect; a server with a key and nowhere to put the
 * result must refuse rather than pretend to have saved.
 */
export function credentialsAvailable(source = process.env): boolean {
  return encryptionConfigured(source) && credentialStore(source).available;
}

function unavailableReason(source = process.env): ConnectionFailure | null {
  if (!credentialStore(source).available) return "storage_unavailable";
  if (!encryptionConfigured(source)) return "storage_unavailable";
  return null;
}

function nowIso(): string {
  return new Date().toISOString();
}

/*
 * A MONOTONIC WRITE TOKEN.
 *
 * Milliseconds, plus a counter for the case two writes land inside the same
 * one. Two replacements in flight can reach the database in either order, and
 * without a token the later-arriving-but-earlier-issued one wins — silently
 * reinstating a credential the reader believes they replaced. The upsert
 * applies only when this exceeds what is stored, in the database and in the
 * harness alike.
 *
 * Not a UUID and not a timestamp alone: it has to be comparable, and it has to
 * be different for two writes in the same millisecond.
 */
let lastRevision = 0;

function nextRevision(): number {
  const now = Date.now();
  lastRevision = now > lastRevision ? now : lastRevision + 1;
  return lastRevision;
}

function metadataOf(row: StoredCredential): ConnectionMetadata {
  return {
    provider: row.provider,
    lastFour: row.lastFour,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastTestedAt: row.lastTestedAt,
    lastTestOutcome: row.lastTestOutcome,
  };
}

async function writeAudit(
  accountId: string,
  action: CredentialAction,
  succeeded: boolean,
  category: string,
): Promise<void> {
  const storage = credentialStore();
  if (!storage.available) return;
  await storage.store.audit({
    accountId,
    provider: OPENAI,
    action,
    succeeded,
    category,
    at: nowIso(),
  });
}

/* ============================================================== reading state */

/**
 * The state of one account's connection.
 *
 * Safe to render. Safe to serialise. Contains nothing that would help anybody
 * who obtained it, which is the property that lets the settings page be an
 * ordinary server component.
 */
export async function connectionFor(accountId: string): Promise<ConnectionState> {
  const unavailable = unavailableReason();
  if (unavailable !== null) return { kind: "unavailable", failure: unavailable };

  const storage = credentialStore();
  if (!storage.available) return { kind: "unavailable", failure: "storage_unavailable" };

  try {
    const row = await storage.store.read(accountId, OPENAI);
    if (row === null) return { kind: "not_connected" };
    return { kind: "connected", connection: metadataOf(row) };
  } catch (error) {
    /*
     * A storage fault is not "no connection".
     *
     * Reporting it as not-connected would tell somebody who has a working key
     * to go and set one up, and the button they would then press would
     * overwrite the credential they already had.
     */
    if (error instanceof CredentialStorageError) {
      return { kind: "unavailable", failure: "provider_unavailable" };
    }
    throw error;
  }
}

/* ============================================================== writing state */

export type SaveResult =
  | { readonly ok: true; readonly connection: ConnectionMetadata; readonly replaced: boolean }
  | { readonly ok: false; readonly failure: ConnectionFailure };

/**
 * How a credential is checked before it is stored.
 *
 * Injected rather than imported so the suite can exercise every branch without
 * a network call and without a real key — and so this module has no import edge
 * to the OpenAI SDK at all. The route supplies the real one.
 */
export type ConnectionProbe = (apiKey: string) => Promise<ProbeResult>;

export type ProbeResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly status: number; readonly code: string | null };

/**
 * Saves a credential for one account, replacing any it already had.
 *
 * The probe runs FIRST and a failure stops the write. That ordering is the
 * whole of "replacement is atomic" from the reader's side: a key that OpenAI
 * rejects never reaches the database, so the connection that was working five
 * seconds ago is still working. The upsert itself is one statement, so the
 * database cannot be left holding half a row either.
 *
 * The raw value is a parameter and a local. It is not logged, not returned, not
 * attached to an error, and not kept after this function returns.
 */
export async function saveConnection(
  accountId: string,
  rawKey: string,
  probe: ConnectionProbe,
): Promise<SaveResult> {
  const trimmed = rawKey.trim();

  const unavailable = unavailableReason();
  if (unavailable !== null) {
    await writeAudit(accountId, "connected", false, unavailable);
    return { ok: false, failure: unavailable };
  }

  const storage = credentialStore();
  if (!storage.available) return { ok: false, failure: "storage_unavailable" };

  /*
   * Length only, and no prefix rule.
   *
   * `sk-` is a vendor convention, not a contract; it has already changed once
   * and a client that enforces it breaks on the day it changes again. What is
   * checked is that the value could not be a typo and is long enough for the
   * masked identifier not to reveal a third of it.
   */
  if (trimmed.length < 12) {
    await writeAudit(accountId, "connected", false, "rejected");
    return { ok: false, failure: "rejected" };
  }

  /*
   * The store's own rule, before the credential is sealed, probed or written.
   *
   * The real store has none — a vendor prefix is a convention that has already
   * changed once. The browser harness accepts only obviously synthetic values,
   * so a real key pasted into a test server is refused at the door rather than
   * living in a fixture nobody audits.
   */
  if (storage.store.accepts !== undefined && !storage.store.accepts(trimmed)) {
    await writeAudit(accountId, "connected", false, "rejected");
    return { ok: false, failure: "rejected" };
  }

  let existing: StoredCredential | null;
  try {
    existing = await storage.store.read(accountId, OPENAI);
  } catch {
    return { ok: false, failure: "provider_unavailable" };
  }
  const replacing = existing !== null;

  const probed = await probe(trimmed);
  if (!probed.ok) {
    const failure = classifyProviderFailure(probed.status, probed.code);
    await writeAudit(accountId, replacing ? "replaced" : "connected", false, failure);
    return { ok: false, failure };
  }

  const at = nowIso();
  let row: StoredCredential;
  try {
    row = {
      accountId,
      provider: OPENAI,
      sealed: seal(trimmed, { accountId, provider: OPENAI }),
      lastFour: lastFour(trimmed),
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
      lastTestedAt: at,
      lastTestOutcome: "passed",
      revision: nextRevision(),
    };
  } catch (error) {
    if (error instanceof EncryptionUnavailableError) {
      await writeAudit(accountId, "connected", false, "storage_unavailable");
      return { ok: false, failure: "storage_unavailable" };
    }
    throw error;
  }

  try {
    await storage.store.upsert(row);
  } catch {
    await writeAudit(
      accountId,
      replacing ? "replaced" : "connected",
      false,
      "provider_unavailable",
    );
    return { ok: false, failure: "provider_unavailable" };
  }

  await writeAudit(accountId, replacing ? "replaced" : "connected", true, "ok");
  return { ok: true, connection: metadataOf(row), replaced: replacing };
}

export type TestResult =
  | { readonly ok: true; readonly at: string }
  | { readonly ok: false; readonly failure: ConnectionFailure };

/**
 * Tests the credential an account already has.
 *
 * Decrypts, probes, records the outcome, and forgets the plaintext. The key is
 * never returned to the caller — the caller is a server action whose result is
 * serialised to a browser.
 */
export async function testConnection(
  accountId: string,
  probe: ConnectionProbe,
): Promise<TestResult> {
  const unavailable = unavailableReason();
  if (unavailable !== null) return { ok: false, failure: unavailable };

  const storage = credentialStore();
  if (!storage.available) return { ok: false, failure: "storage_unavailable" };

  let row: StoredCredential | null;
  try {
    row = await storage.store.read(accountId, OPENAI);
  } catch {
    return { ok: false, failure: "provider_unavailable" };
  }
  if (row === null) return { ok: false, failure: "rejected" };

  let key: string;
  try {
    key = open(row.sealed, { accountId, provider: OPENAI });
  } catch (error) {
    if (error instanceof CredentialUnreadableError || error instanceof EncryptionUnavailableError) {
      await writeAudit(accountId, "tested", false, "unreadable");
      return { ok: false, failure: "unreadable" };
    }
    throw error;
  }

  const probed = await probe(key);
  const at = nowIso();

  /*
   * ONLY A REFUSED CREDENTIAL IS RECORDED AS REJECTED.
   *
   * A key that cannot reach the model, has run out of credit, hit a spending
   * cap, was rate limited or met an outage is a good key having a bad day. It
   * keeps its connection and it keeps the word "connected"; the failure is
   * shown as what it is, once, and the credential is not impugned by it.
   *
   * Nothing here deletes. A failed test has never removed a stored credential
   * and must not start: the reader cannot retype what they were told would
   * never be shown again.
   */
  const failure = probed.ok ? null : classifyProviderFailure(probed.status, probed.code);
  const outcome: TestOutcome =
    failure === null ? "passed" : impugnsCredential(failure) ? "rejected" : "unavailable";

  await storage.store.recordTest(accountId, OPENAI, outcome, at);

  if (failure !== null) {
    await writeAudit(accountId, "tested", false, failure);
    return { ok: false, failure };
  }

  await writeAudit(accountId, "tested", true, "ok");
  return { ok: true, at };
}

/**
 * Deletes an account's credential.
 *
 * A delete, not a status column. A row marked inactive is a row that still
 * holds the ciphertext, and a reader who asked for their key to be removed did
 * not ask for it to be hidden.
 */
export async function removeConnection(accountId: string): Promise<boolean> {
  const storage = credentialStore();
  if (!storage.available) return false;

  let removed = false;
  try {
    removed = await storage.store.remove(accountId, OPENAI);
  } catch {
    await writeAudit(accountId, "removed", false, "provider_unavailable");
    return false;
  }

  await writeAudit(accountId, "removed", removed, removed ? "ok" : "rejected");
  return removed;
}

/* ========================================================= the model request path */

export type KeyResolution =
  | { readonly ok: true; readonly apiKey: string }
  | { readonly ok: false; readonly reason: "not_connected" | "unavailable" | "unreadable" };

/**
 * THE ONE FUNCTION THAT PRODUCES A PLAINTEXT KEY.
 *
 * Called on the server, on the request path, for the account that is asking.
 * Its result goes straight into a request-scoped provider client and is not
 * placed on a context object, an evidence record, a prompt, a response body, a
 * log line or a module-level variable.
 *
 * There is no ambient fallback. A server with `OPENAI_API_KEY` set in its
 * environment and an account with no connection resolves to `not_connected`,
 * because silently answering on the deployment's own key would bill MADSPACE
 * for a question asked by somebody who declined to connect an account.
 */
export async function resolveApiKey(accountId: string): Promise<KeyResolution> {
  if (unavailableReason() !== null) return { ok: false, reason: "unavailable" };

  const storage = credentialStore();
  if (!storage.available) return { ok: false, reason: "unavailable" };

  let row: StoredCredential | null;
  try {
    row = await storage.store.read(accountId, OPENAI);
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (row === null) return { ok: false, reason: "not_connected" };

  /*
   * The binding is rebuilt from the account that is ASKING, not from the row.
   *
   * If those two ever disagree — a mis-scoped query, a cache keyed wrongly, a
   * restore that moved rows between accounts — the tag fails and this returns
   * unreadable. The alternative, trusting `row.accountId`, would authenticate
   * the ciphertext against whatever the database happened to hand back.
   */
  try {
    return { ok: true, apiKey: open(row.sealed, { accountId, provider: OPENAI }) };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}
