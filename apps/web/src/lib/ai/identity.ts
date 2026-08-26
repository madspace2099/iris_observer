import "server-only";
import { createHmac } from "node:crypto";
import type { EnvSource } from "@/lib/supabase-env";

/**
 * Who OpenAI is told is asking, without telling it who is asking.
 *
 * The Responses API takes a `safety_identifier` so abuse can be traced to one
 * account rather than to a whole deployment. That is worth having. Sending a
 * user id, an email or a display name to get it is not: the vendor gains a
 * stable handle on a named individual for a benefit that a hash delivers just
 * as well.
 *
 * So the identifier is an HMAC over the viewer and the tenant, keyed by a
 * server-side pepper. It is:
 *
 * - **stable** — the same viewer produces the same identifier across requests
 *   and restarts, which is what makes it useful for rate-abuse correlation;
 * - **opaque** — the input cannot be recovered from it;
 * - **non-enumerable** — without the pepper, an attacker holding a list of
 *   plausible user ids cannot confirm which of them is present, which a bare
 *   SHA-256 of a short id would allow;
 * - **tenant-scoped** — the same person in two tenants is two identifiers, so
 *   the vendor cannot join a person's activity across customers.
 *
 * This one is keyed by `DEVICE_CREDENTIAL_PEPPER` and is **not** the pseudonym
 * key below. Two different secrets for two different jobs, deliberately: one
 * names a viewer to a vendor, the other names them in this product's own
 * counters, and a single value doing both would build a correlation between a
 * vendor's records and ours that nobody asked for.
 *
 * A missing `DEVICE_CREDENTIAL_PEPPER` is not a crash — the safety identifier
 * is a refinement, and the vendor gets an opaque string either way. A missing
 * pseudonym key *is* a crash, for reasons set out where it lives.
 */

const PREFIX = "obs";

/**
 * Where the pepper comes from.
 *
 * `DEVICE_CREDENTIAL_PEPPER` already exists in this deployment's vocabulary for
 * exactly this class of use, so it is reused rather than multiplied. Falling
 * back to a fixed string is safe in the way that matters: the identifier is
 * still opaque to the vendor, and only resistance to offline enumeration by
 * somebody who already has the source is lost.
 */
function pepper(): string {
  const configured = process.env["DEVICE_CREDENTIAL_PEPPER"];
  if (configured !== undefined && configured.length > 0) return configured;
  return "observer-safety-identifier-unpeppered";
}

/**
 * The pseudonym key is mandatory, and it is derived from nothing.
 *
 * It used to fall back: to a subkey of `SUPABASE_SECRET_KEY`, and failing that
 * to a per-process random value. Both were wrong, for different reasons.
 *
 * Deriving from another credential couples two lifecycles that have no business
 * being coupled. `SUPABASE_SECRET_KEY` gets rotated for a leak, a policy, a new
 * project — and every subject and client fingerprint changes with it, orphaning
 * every rate-limit bucket and restarting all four ceilings from zero, mid-day.
 * A key whose value is a function of another key is also a key whose compromise
 * is a function of another key's compromise.
 *
 * The per-process fallback was worse in a quieter way: it worked. A deployment
 * with nothing configured answered questions, protected the subject, and
 * silently counted one viewer into one bucket *per lambda* — a distributed
 * ceiling that was not one, with no symptom to notice.
 *
 * So there is no fallback. A deployment either holds 32 bytes of random secret
 * in `OBSERVER_SUBJECT_PEPPER` or it refuses to answer, before any ceiling is
 * consulted, any audit row is written, or any model is called.
 */

/** Raised when the pepper is missing or unusable. Never carries the value. */
export class PepperMisconfiguredError extends Error {
  constructor(readonly problem: string) {
    super(`OBSERVER_SUBJECT_PEPPER ${problem}`);
    this.name = "PepperMisconfiguredError";
  }
}

/**
 * Why a pepper was rejected — an operator's sentence, never the value.
 *
 * Separated by cause because each has a different fix. An absent variable and
 * one that arrived wrapped in the quotes somebody copied it with look identical
 * from outside and are not the same mistake.
 */
export type PepperVerdict =
  { readonly ok: true } | { readonly ok: false; readonly problem: string };

/**
 * Values that are somebody's intention rather than a secret.
 *
 * Anchored to the whole value, so a genuinely random secret that happens to
 * contain "test" is not rejected for it.
 */
const PLACEHOLDER =
  /^(<.*>|\[.*\]|\{.*\}|change[-_ ]?me.*|replace[-_ ]?me.*|your[-_ ]?.*|example.*|placeholder.*|secret|password|todo.*|x+|\.+)$/i;

/**
 * Whether obvious test material is acceptable.
 *
 * A pepper of sixty-four `a`s is exactly what a test should use — explicit,
 * deterministic and unmistakably not a secret — and exactly what a deployment
 * must refuse. `VITEST` is set by the runner; neither it nor `NODE_ENV=test` is
 * set on Preview or Production.
 *
 * Read from the same source as everything else rather than from `process.env`
 * directly, so `describePepper` is a function of its argument and nothing more.
 * A test can then describe a deployment — a bag with no `VITEST` in it — instead
 * of mutating the runner's own environment to pretend to be one.
 */
function inTestEnvironment(source: EnvSource): boolean {
  return source["VITEST"] !== undefined || source["NODE_ENV"] === "test";
}

/**
 * Whether what is configured could be 32 bytes of random secret.
 *
 * Shape only — nothing can prove entropy — but every rejection below is a
 * mistake somebody actually makes in a dashboard field.
 */
export function describePepper(source: EnvSource = process.env): PepperVerdict {
  const raw = source["OBSERVER_SUBJECT_PEPPER"];
  if (raw === undefined) return { ok: false, problem: "is not set" };
  if (raw.trim().length === 0) return { ok: false, problem: "is empty or whitespace" };

  /*
   * A value that arrived with its container. The quotes are the paste, not the
   * secret, and a pepper carrying them is a different key on every host that
   * strips them differently — the same bug as the OpenAI key that spent an
   * afternoon wrapped in angle brackets.
   */
  if (/^["'`]|["'`]$/.test(raw) || /^[<[{(]/.test(raw) || /[>\]})]$/.test(raw)) {
    return { ok: false, problem: "is wrapped in quotes or brackets" };
  }
  if (raw !== raw.trim()) return { ok: false, problem: "has leading or trailing whitespace" };
  if (/\s/.test(raw)) return { ok: false, problem: "contains whitespace" };
  if (PLACEHOLDER.test(raw)) return { ok: false, problem: "is a placeholder, not a secret" };

  const bytes = Buffer.byteLength(raw, "utf8");
  if (bytes < 32) {
    return {
      ok: false,
      problem: `is ${bytes} bytes; at least 32 bytes of random material are required`,
    };
  }

  // Sixty-four of the same character is 64 bytes and no entropy whatsoever.
  if (!inTestEnvironment(source) && new Set(raw).size < 8) {
    return { ok: false, problem: "repeats too few distinct characters to be random" };
  }

  return { ok: true };
}

/** Whether this deployment may answer questions at all. */
export function pepperConfigured(source: EnvSource = process.env): boolean {
  return describePepper(source).ok;
}

/**
 * The key itself. Throws rather than falling back, deliberately.
 *
 * Nothing returns it, nothing logs it, nothing stores it. The only things that
 * leave this module are HMACs of it.
 */
export function pseudonymKey(): string {
  const verdict = describePepper();
  if (!verdict.ok) throw new PepperMisconfiguredError(verdict.problem);
  return process.env["OBSERVER_SUBJECT_PEPPER"] as string;
}

/**
 * A non-secret name for the key in use.
 *
 * Sixteen hex characters of an HMAC of the key under a fixed label: preimage
 * resistant, useless to an attacker, and different the instant the key is.
 *
 * It is stored on every version-2 audit row, not merely written to a boot line.
 * A startup log is ephemeral — it ages out of a platform's retention and is
 * gone — while the question a rotation raises is asked afterwards, sometimes
 * much later: *why did the counters restart on the 14th?* A column answers
 * that. An expired log line does not.
 */
export function pseudonymKeyId(): string {
  return createHmac("sha256", pseudonymKey())
    .update("observer.pseudonym.key-id.v1")
    .digest("hex")
    .slice(0, 16);
}

/**
 * A stable, privacy-preserving identifier for one viewer in one tenant.
 *
 * Truncated to 32 hex characters. 128 bits is far beyond what is needed to keep
 * two viewers apart, and a shorter string keeps request bodies small and logs
 * readable.
 */
export function safetyIdentifier(userId: string, tenantSlug: string): string {
  const digest = createHmac("sha256", pepper())
    .update(`${tenantSlug}\u0000${userId}`)
    .digest("hex")
    .slice(0, 32);
  return `${PREFIX}_${digest}`;
}

/**
 * Which derivation the pseudonyms below use.
 *
 * Stored on every version-2 audit row beside `key_id`, because the two answer
 * different questions and either can change without the other. The key id says
 * *which secret*; this says *which scheme*. Tenant-scoping changed every
 * pseudonym while leaving the pepper — and therefore the key id — untouched, so
 * a row carrying only a key id could not say whether its subject was comparable
 * with the row above it.
 *
 * ## Two types, and the difference is the point
 *
 * `PseudonymVersion` is `1 | 2` because *rows* carry both: the live database
 * holds version-1 rows and will keep receiving them from the deployed build for
 * as long as it is reachable. Anything reading the audit must be able to say
 * "one or the other".
 *
 * `PSEUDONYM_VERSION` is the narrower thing — what code written *now* emits —
 * so it is declared `as const` and its type is the literal `2`.
 *
 * The previous line read `export const PSEUDONYM_VERSION: PseudonymVersion = 2`,
 * and an independent review caught what that actually says: the annotation
 * *widens* the constant back to `1 | 2`. A report claimed it was a literal `2`;
 * it was not, and `pseudonymVersion: PSEUDONYM_VERSION` would have accepted a 1
 * from anywhere. The emitter's field is typed `typeof PSEUDONYM_VERSION`, so
 * new application code that tries to admit under the superseded, cross-tenant
 * linkable derivation fails to compile.
 *
 * This changes nothing at the database. The deployed `3f298a6` build sends
 * thirteen arguments and never mentions a scheme at all; its rows still resolve
 * to version 1 through the migration's defaults, honestly labelled.
 *
 * 1 — viewer only. Cross-tenant linkable. Superseded, still readable, still
 *     arriving from a build that predates the scoping work.
 * 2 — tenant-scoped. What this code emits, and the only thing it can emit.
 */
export type PseudonymVersion = 1 | 2;
export const PSEUDONYM_VERSION = 2 as const;

/** The one version current code may emit. Narrower than `PseudonymVersion`. */
export type CurrentPseudonymVersion = typeof PSEUDONYM_VERSION;

/**
 * A short, non-reversible tag for telemetry, the rate buckets and the audit.
 *
 * Distinct from the safety identifier on purpose — reusing one value in two
 * systems is how a correlation nobody intended gets built — but keyed for the
 * same reason, which it was not.
 *
 * It used to be `sha256(userId)` with no key, on the argument that telemetry
 * goes to this product's own logs. That argument stopped holding the moment the
 * same value became the shared ceiling's bucket key and a column in a durable
 * audit table. An unkeyed digest of a short, guessable id is not a pseudonym:
 * anybody holding the table and the source recovers the viewer by enumeration.
 *
 * Sixteen hex characters rather than twelve. 64 bits is ample to keep viewers
 * apart and leaves no reason to think about collisions in a bucket key.
 *
 * ## Scoped to a tenant, and to the *authorised* one
 *
 * It hashed the viewer alone, and one pepper is shared by the whole
 * deployment — so a sales agent working for two developers wrote the *same*
 * subject into both tenants' audit rows. Anybody holding the table could follow
 * a named person between customers, which is the correlation ADR-0023's tenancy
 * model exists to prevent, built into the one table meant to hold nothing
 * identifying.
 *
 * The tenant argument is the canonical id the repository returned after
 * authorising the viewer — never the slug from the request body. A caller who
 * could choose the scoping input could choose to be un-scoped, and a
 * pseudonym whose namespace the untrusted side picks is not scoped at all.
 */
export function telemetrySubject(userId: string, tenantId: string): string {
  return createHmac("sha256", pseudonymKey())
    .update(`subject\u0000v2\u0000${tenantId}\u0000${userId}`)
    .digest("hex")
    .slice(0, 16);
}
