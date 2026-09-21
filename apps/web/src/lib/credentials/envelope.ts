import "server-only";

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * AUTHENTICATED ENCRYPTION FOR ONE ACCOUNT'S PROVIDER CREDENTIAL.
 *
 * AES-256-GCM, a fresh 96-bit nonce per encryption, the tag kept, and the
 * account identifier and provider name bound in as additional authenticated
 * data. Nothing here is novel and nothing here should be: this is the reviewed
 * primitive applied in the ordinary way.
 *
 * ## What the AAD is for
 *
 * A ciphertext is not only secret, it belongs to somebody. Without binding, a
 * row moved from account A to account B — by a bug, a bad migration, a restore
 * from the wrong backup, or somebody with write access to one column — decrypts
 * perfectly and hands A's key to B. With the account id and provider inside the
 * authentication tag, that row fails to open. The binding costs nothing and it
 * is the difference between "encrypted" and "encrypted for one person".
 *
 * The key version is bound too, so a payload cannot be replayed under a
 * different master key by editing the version column beside it.
 *
 * ## The master key is mandatory
 *
 * There is no fallback. No plaintext mode, no key derived from a constant, no
 * file on disk, no value baked into the bundle. If `OBSERVER_CREDENTIAL_KEY`
 * is absent or malformed, sealing and opening both refuse, and every caller
 * above this module is built to refuse with them. That is the whole security
 * posture of this milestone in one sentence: **absent configuration means the
 * feature is unavailable, never that it is insecure.**
 */

/** 32 bytes of random, hex-encoded. `openssl rand -hex 32` produces one. */
const KEY_VARIABLE = "OBSERVER_CREDENTIAL_KEY";

/**
 * Which master key sealed a payload.
 *
 * Stored beside the ciphertext so a future rotation can keep old rows readable
 * while new ones are written under a new key. One version exists today; the
 * column exists so that adding the second is a migration and not a rescue.
 */
const VERSION_VARIABLE = "OBSERVER_CREDENTIAL_KEY_VERSION";
const DEFAULT_VERSION = "v1";

const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/** Why the master key could not be used. Never carries the value. */
export type KeyFault =
  | { readonly ok: true; readonly key: Buffer; readonly version: string }
  | { readonly ok: false; readonly reason: "absent" | "malformed" };

export type EnvSource = Readonly<Record<string, string | undefined>>;

/**
 * Reads and validates the master key.
 *
 * Shape is checked here rather than at first use, because a 31-byte key
 * produces a runtime throw deep inside the cipher at the moment somebody is
 * trying to save a credential. An operator wants to know at boot.
 */
export function masterKey(source: EnvSource = process.env): KeyFault {
  const raw = source[KEY_VARIABLE]?.trim();
  if (raw === undefined || raw.length === 0) return { ok: false, reason: "absent" };

  if (!/^[0-9a-fA-F]+$/.test(raw)) return { ok: false, reason: "malformed" };
  const key = Buffer.from(raw, "hex");
  if (key.length !== KEY_BYTES) return { ok: false, reason: "malformed" };

  const version = source[VERSION_VARIABLE]?.trim();
  return {
    ok: true,
    key,
    version: version === undefined || version.length === 0 ? DEFAULT_VERSION : version,
  };
}

/** Whether this deployment can hold credentials at all. Boolean, never a value. */
export function encryptionConfigured(source: EnvSource = process.env): boolean {
  return masterKey(source).ok;
}

/**
 * A sealed credential, as it is stored.
 *
 * Three opaque strings and a version. No field of this is a secret on its own,
 * and the whole of it is useless without the master key — which is the point of
 * keeping the key somewhere the database is not.
 */
export interface SealedCredential {
  readonly version: string;
  readonly nonce: string;
  readonly ciphertext: string;
  readonly tag: string;
}

/** What the ciphertext is bound to. Both parts are immutable for a row. */
export interface CredentialBinding {
  readonly accountId: string;
  readonly provider: string;
}

export class EncryptionUnavailableError extends Error {
  readonly reason: "absent" | "malformed";
  constructor(reason: "absent" | "malformed") {
    super(
      reason === "absent"
        ? `${KEY_VARIABLE} is not set on this server, so credentials cannot be stored.`
        : `${KEY_VARIABLE} is set but is not 32 bytes of hex, so credentials cannot be stored.`,
    );
    this.name = "EncryptionUnavailableError";
    this.reason = reason;
  }
}

/**
 * Thrown when a payload will not open.
 *
 * Deliberately one error for every cause — wrong key, wrong account, tampered
 * ciphertext, truncated tag. Distinguishing them for the caller would be a
 * decryption oracle, and none of the callers has anything useful to do with the
 * distinction anyway.
 */
export class CredentialUnreadableError extends Error {
  constructor() {
    super("The stored credential could not be read.");
    this.name = "CredentialUnreadableError";
  }
}

function aad(binding: CredentialBinding, version: string): Buffer {
  /*
   * NUL-separated, because concatenation without a separator is ambiguous:
   * ("ab", "c") and ("a", "bc") would produce the same bytes, and an account
   * id is attacker-influenced in any system where people choose their own.
   * A NUL cannot appear in either field.
   */
  return Buffer.from(`${binding.accountId}\u0000${binding.provider}\u0000${version}`, "utf8");
}

/**
 * Encrypts a credential for one account.
 *
 * The plaintext is a `string` in and is not retained: no cache, no module-level
 * variable, nothing that outlives the call.
 */
export function seal(
  plaintext: string,
  binding: CredentialBinding,
  source: EnvSource = process.env,
): SealedCredential {
  const resolved = masterKey(source);
  if (!resolved.ok) throw new EncryptionUnavailableError(resolved.reason);

  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", resolved.key, nonce, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(aad(binding, resolved.version));

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return {
    version: resolved.version,
    nonce: nonce.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

/**
 * Decrypts a credential, or refuses.
 *
 * Fail-closed in every branch: a missing key, a version this server has no key
 * for, a malformed field or a failed tag all end in the same error and no
 * plaintext. There is no path through this function that returns a partially
 * verified value.
 */
export function open(
  sealed: SealedCredential,
  binding: CredentialBinding,
  source: EnvSource = process.env,
): string {
  const resolved = masterKey(source);
  if (!resolved.ok) throw new EncryptionUnavailableError(resolved.reason);

  /*
   * The version must match the key in hand. Constant-time because the version
   * is data from the database and comparing it with === leaks its length and
   * prefix through timing — cheap to avoid, and the habit is worth keeping in
   * a file where the next comparison might matter more.
   */
  const want = Buffer.from(resolved.version, "utf8");
  const got = Buffer.from(sealed.version, "utf8");
  if (want.length !== got.length || !timingSafeEqual(want, got)) {
    throw new CredentialUnreadableError();
  }

  let nonce: Buffer;
  let ciphertext: Buffer;
  let tag: Buffer;
  try {
    nonce = Buffer.from(sealed.nonce, "base64");
    ciphertext = Buffer.from(sealed.ciphertext, "base64");
    tag = Buffer.from(sealed.tag, "base64");
  } catch {
    throw new CredentialUnreadableError();
  }

  if (nonce.length !== NONCE_BYTES || tag.length !== TAG_BYTES || ciphertext.length === 0) {
    throw new CredentialUnreadableError();
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", resolved.key, nonce, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(aad(binding, sealed.version));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    /* Tag mismatch, wrong key, wrong account, tampered bytes — one answer. */
    throw new CredentialUnreadableError();
  }
}

/**
 * The last four characters, for the masked identifier a reader sees.
 *
 * Four is what every vendor console shows and it is what people recognise their
 * own key by. It is stored in the clear on purpose: it is not a secret, and
 * deriving it at read time would mean decrypting to render a settings page.
 *
 * Short values are refused rather than echoed — a two-character "key" would put
 * half of itself on the screen.
 */
export function lastFour(plaintext: string): string {
  if (plaintext.length < 12) throw new Error("A credential this short is not a credential.");
  return plaintext.slice(-4);
}
