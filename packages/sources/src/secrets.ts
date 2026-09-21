import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * SOURCE SECRETS — activation codes and source tokens, stored so they cannot be
 * read back.
 *
 * ## The one structural difference from the credential store beside this
 *
 * `apps/web/src/lib/credentials/envelope.ts` seals an OpenAI key with
 * AES-256-GCM, and it is **the wrong template for this file**. That key must be
 * replayed to a vendor, so it has to be recoverable; the encryption exists to
 * keep it useless in a dump, not to make it one-way.
 *
 * Nothing ever replays an activation code or a source token. The server only
 * ever needs to answer *is this the same value that was issued?* — so the
 * plaintext is returned once, at issuance, and what persists is an HMAC that
 * cannot produce it again. A dump of these tables is a pile of verifiers with
 * no path back to a credential, even holding the pepper, because the pepper
 * only lets you check a guess rather than reverse an answer.
 *
 * Copying `envelope.ts` here would give the database a reversible copy of every
 * live credential, which is exactly what this design refuses.
 *
 * ## Selector and secret, not one opaque blob
 *
 * A token is two parts, and the split is what makes verification both fast and
 * safe:
 *
 *   `obs.<selector>.<secret>`
 *
 * **The separator is `.`, and it has to be.** Both halves are base64url, whose
 * alphabet is `A-Za-z0-9-_` — so an underscore separator makes the token split
 * into an unpredictable number of parts the moment random material happens to
 * contain one. That is roughly a coin toss per token: a parser looking for
 * exactly three parts rejects most valid credentials, intermittently, in a way
 * that looks like a corrupt store rather than a format bug. `.` is outside the
 * alphabet, which is the same reason JWT uses it.
 *
 * The **selector** is public, random, and the indexed column. It finds exactly
 * one candidate row in one indexed lookup.
 *
 * The **secret** is 32 bytes of random material. Only its HMAC is stored, and
 * the comparison is constant-time.
 *
 * The alternative — hash the whole token and look it up by hash — forces the
 * lookup and the verification to be the same operation, which means either a
 * non-constant-time index probe on secret material or a full table scan. The
 * selector keeps the fast path away from the secret entirely.
 *
 * ## Two peppers, and they may never be the same value
 *
 * `OBSERVER_ACTIVATION_CODE_PEPPER` and `OBSERVER_SOURCE_TOKEN_PEPPER` key two
 * different secret classes with two different lifetimes. An activation code is
 * short-lived, single-use and typed by a person; a source token is long-lived,
 * machine-held and used on every request.
 *
 * Sharing one pepper would mean a compromise of either analysis compromises
 * both, and — more subtly — that a verifier computed for one class is a valid
 * verifier for the other. `assertDistinctPeppers` refuses that configuration at
 * boot rather than leaving it to a reviewer to notice.
 */

/** A bag of environment variables. Injected so this module is a pure function of its input. */
export type EnvSource = Readonly<Record<string, string | undefined>>;

export const ACTIVATION_CODE_PEPPER = "OBSERVER_ACTIVATION_CODE_PEPPER";
export const SOURCE_TOKEN_PEPPER = "OBSERVER_SOURCE_TOKEN_PEPPER";

/** Which secret class a pepper keys. Never interchangeable. */
export type SecretClass = "activation_code" | "source_token";

const PEPPER_VARIABLE: Readonly<Record<SecretClass, string>> = Object.freeze({
  activation_code: ACTIVATION_CODE_PEPPER,
  source_token: SOURCE_TOKEN_PEPPER,
});

/**
 * The domain separator mixed into every HMAC, per class.
 *
 * Belt and braces beside the two distinct peppers: even if a deployment
 * misconfigures both variables to the same value, a verifier computed for an
 * activation code still does not match one computed for a source token. The
 * pepper separation is the control; this is what stops a configuration mistake
 * from silently removing it.
 */
const DOMAIN: Readonly<Record<SecretClass, string>> = Object.freeze({
  activation_code: "observer.activation-code.v1",
  source_token: "observer.source-token.v1",
});

/** Raised when a pepper is missing or unusable. Never carries the value. */
export class PepperMisconfiguredError extends Error {
  constructor(
    readonly variable: string,
    readonly problem: string,
  ) {
    super(`${variable} ${problem}`);
    this.name = "PepperMisconfiguredError";
  }
}

export type PepperVerdict =
  { readonly ok: true } | { readonly ok: false; readonly problem: string };

/**
 * Values that are somebody's intention rather than a secret.
 *
 * Anchored to the whole value, so a genuinely random secret that happens to
 * contain "test" is not rejected for it. Same list as
 * `apps/web/src/lib/ai/identity.ts`, because these are the mistakes people
 * actually make in a dashboard field and they do not vary by which field it is.
 */
const PLACEHOLDER =
  /^(<.*>|\[.*\]|\{.*\}|change[-_ ]?me.*|replace[-_ ]?me.*|your[-_ ]?.*|example.*|placeholder.*|secret|password|todo.*|x+|\.+)$/i;

const SYNTHETIC_HARNESS = "OBSERVER_SYNTHETIC_HARNESS";

/**
 * Whether obvious test material is acceptable.
 *
 * A pepper of sixty-four `a`s is exactly what a test should use — explicit,
 * deterministic and unmistakably not a secret — and exactly what a deployment
 * must refuse. None of these three is set on Preview or Production, so the
 * failure mode of copying a harness configuration to a deployment is that it
 * refuses to issue anything, rather than that it runs on a known key.
 */
function inTestEnvironment(source: EnvSource): boolean {
  return (
    source["VITEST"] !== undefined ||
    source["NODE_ENV"] === "test" ||
    source[SYNTHETIC_HARNESS] === "1"
  );
}

/**
 * Whether what is configured could be 32 bytes of random secret.
 *
 * Shape only — nothing can prove entropy — but every rejection is a mistake
 * somebody actually makes.
 */
export function describePepper(variable: string, source: EnvSource): PepperVerdict {
  const raw = source[variable];
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
      problem: `is ${String(bytes)} bytes; at least 32 bytes of random material are required`,
    };
  }

  if (!inTestEnvironment(source) && new Set(raw).size < 8) {
    return { ok: false, problem: "repeats too few distinct characters to be random" };
  }

  return { ok: true };
}

/**
 * Both peppers, checked together, including that they are not each other.
 *
 * Called before anything is issued. A deployment either holds two distinct
 * secrets or it refuses to mint a credential — there is no fallback, for the
 * reason `identity.ts` sets out at length: a fallback that works is worse than
 * one that fails, because nothing tells you it happened.
 */
export function assertPeppersUsable(source: EnvSource): void {
  for (const variable of [ACTIVATION_CODE_PEPPER, SOURCE_TOKEN_PEPPER]) {
    const verdict = describePepper(variable, source);
    if (!verdict.ok) throw new PepperMisconfiguredError(variable, verdict.problem);
  }
  assertDistinctPeppers(source);
}

/**
 * The two peppers must not be the same value.
 *
 * Compared by HMAC rather than by string, so this function never holds both
 * plaintexts in a comparison a stack trace could surface — and so the check
 * itself is constant-time, which costs nothing and removes a question.
 */
export function assertDistinctPeppers(source: EnvSource): void {
  const a = source[ACTIVATION_CODE_PEPPER];
  const b = source[SOURCE_TOKEN_PEPPER];
  if (a === undefined || b === undefined) return;

  const label = "observer.pepper.distinctness.v1";
  const left = createHmac("sha256", a).update(label).digest();
  const right = createHmac("sha256", b).update(label).digest();
  if (timingSafeEqual(left, right)) {
    throw new PepperMisconfiguredError(
      `${ACTIVATION_CODE_PEPPER} and ${SOURCE_TOKEN_PEPPER}`,
      "hold the same value; two secret classes must not share one pepper",
    );
  }
}

function pepperFor(secretClass: SecretClass, source: EnvSource): string {
  const variable = PEPPER_VARIABLE[secretClass];
  const verdict = describePepper(variable, source);
  if (!verdict.ok) throw new PepperMisconfiguredError(variable, verdict.problem);
  return source[variable] as string;
}

/* ============================================================== the token */

/**
 * How much random material each half carries.
 *
 * The selector is a lookup key rather than a secret, so 16 bytes is ample — it
 * only has to make collisions impossible. The secret is 32 bytes, which is the
 * 256 bits the architecture requires; nothing about the verifier's strength
 * depends on the selector at all.
 */
const SELECTOR_BYTES = 16;
const SECRET_BYTES = 32;

/** A prefix so a value found in a log or a file says what it is. */
export const SOURCE_TOKEN_PREFIX = "obs" as const;

/** Base64url without padding: URL-safe, header-safe, and no `=` to strip. */
function randomToken(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

export interface IssuedSecret {
  /** Returned to the caller exactly once. Never stored, never logged. */
  readonly plaintext: string;
  /** Public. The indexed column. */
  readonly selector: string;
  /** What persists. An HMAC; the plaintext cannot be recovered from it. */
  readonly verifier: string;
}

/**
 * Mint a source token.
 *
 * The returned `plaintext` is the only time this value exists outside the
 * client that receives it. Callers must hand it straight to the response and
 * hold no other reference.
 */
export function issueSourceToken(source: EnvSource): IssuedSecret {
  return issue("source_token", source);
}

/**
 * Mint an activation code.
 *
 * Same construction as a token, deliberately. An activation code is typed by a
 * person, so a shorter, friendlier alphabet is tempting — and it is exactly the
 * temptation that produces guessable codes. Length is the whole defence for a
 * value that is accepted unauthenticated, so it stays a full random token and
 * an operator copies it rather than reads it aloud.
 */
export function issueActivationCode(source: EnvSource): IssuedSecret {
  return issue("activation_code", source);
}

function issue(secretClass: SecretClass, source: EnvSource): IssuedSecret {
  assertDistinctPeppers(source);
  const selector = randomToken(SELECTOR_BYTES);
  const secret = randomToken(SECRET_BYTES);
  return {
    plaintext: `${SOURCE_TOKEN_PREFIX}.${selector}.${secret}`,
    selector,
    verifier: verifierFor(secretClass, selector, secret, source),
  };
}

/**
 * The stored verifier.
 *
 * The selector is bound into the HMAC as well as the secret. Without that, a
 * verifier lifted from one row could be replayed under a different selector —
 * the row it names would then verify a secret it was never issued for.
 */
function verifierFor(
  secretClass: SecretClass,
  selector: string,
  secret: string,
  source: EnvSource,
): string {
  return createHmac("sha256", pepperFor(secretClass, source))
    .update(`${DOMAIN[secretClass]}${selector}${secret}`)
    .digest("hex");
}

/* ============================================================= parsing */

export interface ParsedToken {
  readonly selector: string;
  readonly secret: string;
}

/**
 * Split a presented token, strictly.
 *
 * Returns `null` for anything that is not exactly three parts with the right
 * prefix and plausible halves. **It never says which part was wrong**: a parser
 * that distinguishes "no such selector" from "bad secret" is an enumeration
 * oracle wearing an error message.
 */
export function parseToken(presented: string): ParsedToken | null {
  const parts = presented.split(".");
  if (parts.length !== 3) return null;
  const [prefix, selector, secret] = parts;
  if (prefix !== SOURCE_TOKEN_PREFIX) return null;
  if (selector === undefined || secret === undefined) return null;
  if (selector.length === 0 || secret.length === 0) return null;
  /* Base64url alphabet only, and bounded, so a pathological value cannot reach the HMAC. */
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(selector)) return null;
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(secret)) return null;
  return { selector, secret };
}

/**
 * Read a bearer token out of an Authorization header.
 *
 * Case-insensitive on the scheme, because HTTP says so, and strict about
 * everything else.
 */
export function bearerToken(header: string | null | undefined): string | null {
  if (header === null || header === undefined) return null;
  const match = /^Bearer[ ]+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

/* ======================================================== verification */

/**
 * Whether a presented secret matches a stored verifier.
 *
 * Constant-time, and constant-time in the case that matters most: a verifier of
 * the wrong length returns `false` **after** a comparison rather than before
 * one, because `timingSafeEqual` throws on a length mismatch and an early
 * return would leak length through timing.
 */
export function verifySecret(
  secretClass: SecretClass,
  selector: string,
  presentedSecret: string,
  storedVerifier: string,
  source: EnvSource,
): boolean {
  const expected = verifierFor(secretClass, selector, presentedSecret, source);
  return constantTimeEquals(expected, storedVerifier);
}

/**
 * Compare two hex strings without revealing where they differ, or whether they
 * are even the same length.
 *
 * A stored verifier is always 64 hex characters, so a different length means a
 * corrupt or forged row rather than an ordinary mismatch — but it still gets a
 * real comparison, against a fixed-width buffer, so the answer costs the same
 * either way.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) {
    /* Burn an equivalent comparison so the length is not readable from timing. */
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}
