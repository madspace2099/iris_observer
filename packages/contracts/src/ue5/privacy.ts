/**
 * FORBIDDEN CONTENT — a guardrail, and honest about being one.
 *
 * LOCKED §5.6 and §10.1: no raw personal data in event properties. Names,
 * emails and phone numbers live in the restricted contacts store; events carry
 * references.
 *
 * ## What this can and cannot do
 *
 * It **cannot** prove an absence of personal data. "Anna" and "Kitchen" are the
 * same shape to a regular expression, and any heuristic that tried to tell them
 * apart would either miss most names or reject most payloads. Anyone who claims
 * a scanner guarantees the absence of PII is selling something.
 *
 * What actually provides the guarantee is the **per-event schema registry**: a
 * whitelist of property keys and types per event name, so an unlisted key is
 * rejected by construction. That is a later milestone (ADR-0013).
 *
 * This scanner is the guardrail in the meantime, and it is aimed at accidents
 * rather than adversaries — a debug field left in a build, an exception message
 * pasted into a payload, a form value that got attached to the wrong event. It
 * catches those reliably.
 *
 * ## Two rules
 *
 * **Detect names by key, never by value.** `first_name` is a certainty;
 * `"Anna"` is a guess. Guessing at values produces false positives that teach
 * people to ignore the check.
 *
 * **Never carry the value.** Every finding names the offending key and the kind
 * of match. It never contains what matched. A diagnostic that quotes a leaked
 * email into a rejection record, a log line and a support ticket has tripled the
 * leak while appearing to prevent it.
 */

export const FORBIDDEN_KINDS = [
  /** Something shaped like an email address. */
  "email",
  /** Something shaped like an international telephone number. */
  "phone",
  /** Something shaped like a secret: an API key, a bearer token, a JWT, a PEM block. */
  "credential",
  /** A key whose name says it holds personal data, whatever the value is. */
  "personal_key",
] as const;
export type ForbiddenKind = (typeof FORBIDDEN_KINDS)[number];

export interface ForbiddenFinding {
  /** Dotted path to the offending key. Never the value. */
  readonly path: string;
  readonly kind: ForbiddenKind;
}

/**
 * Key names that hold personal data by definition.
 *
 * Matched after normalisation, so `firstName`, `first_name` and `First Name` are
 * one entry. `name` alone is deliberately absent — `unit_name`, `preset_name`
 * and `scene_name` are ordinary and rejecting them would make the scanner an
 * obstacle instead of a guardrail. The compound forms are what actually carry
 * people.
 */
export const PERSONAL_KEY_NAMES = [
  "email",
  "emailaddress",
  "phone",
  "phonenumber",
  "mobile",
  "telephone",
  "firstname",
  "lastname",
  "surname",
  "familyname",
  "givenname",
  "fullname",
  "personname",
  "contactname",
  "buyername",
  "visitorname",
  "customername",
  "displayname",
  "address",
  "streetaddress",
  "postaladdress",
  "dateofbirth",
  "dob",
  "nationalid",
  "passportnumber",
  "taxid",
  "iban",
  "creditcard",
  "cardnumber",
] as const;

const PERSONAL_KEYS = new Set<string>(PERSONAL_KEY_NAMES);

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
/* +36 20 123 4567, +1 (555) 010-9999 — an international prefix and enough digits. */
const PHONE = /\+\d[\d\s().-]{7,}\d/;
/*
 * There is deliberately no payment-card *value* detector.
 *
 * The obvious one — a long run of digits with optional separators — cannot tell
 * a card number from a UUID: strip the letters out of
 * `6f1c9f6e-2c7a-4a4e-9b31-9b0f9a3f1a2b` and seventeen digits in neat groups
 * remain. Adding a Luhn check and an issuer-prefix test still leaves false
 * positives on a meaningful fraction of ordinary identifiers, and a false
 * rejection here loses a real event permanently. Card-shaped *keys* are caught
 * by name above, which is where a payload would realistically carry one.
 */
const CREDENTIAL_SHAPES: readonly RegExp[] = [
  /*
   * Observer's own credentials come first, because they are by far the likeliest
   * secret to end up in an Observer payload — a plugin author debugging an
   * authorisation failure attaches the token to an event, and it is the one
   * secret that build definitely holds. The scanner did not know these shapes
   * until a test put a real mock token through it and watched it pass.
   *
   * The exact format is OPEN-11. These patterns follow the prefix convention the
   * reference implementation uses, and they must be revisited when the
   * credential design is settled.
   */
  /\bobs_[0-9a-f]{32,}/i,
  /*
   * An activation code, prefix-agnostic.
   *
   * It was `OBS-` only, which is the prefix our own reference implementation
   * happens to mint. Akhilesh's UE build tests against `DEV-` codes, and a
   * scanner that catches one prefix and not the other catches whichever one
   * nobody happens to be using that week. The prefix is not semantic to the
   * contract, so the pattern should not treat it as though it were.
   */
  /\b[A-Z]{2,6}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}\b/,
  /\bsk-[A-Za-z0-9_-]{16,}/,
  /\bBearer\s+[A-Za-z0-9._-]{16,}/i,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bghp_[A-Za-z0-9]{20,}/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/,
];

/** Normalise a key the way `isReservedPropertyKey` does, so both agree. */
function normalise(key: string): string {
  return key.replace(/[-_\s]/g, "").toLowerCase();
}

function scanString(path: string, value: string, into: ForbiddenFinding[]): void {
  if (CREDENTIAL_SHAPES.some((shape) => shape.test(value))) {
    into.push({ path, kind: "credential" });
    /*
     * One finding per value for a credential, and stop. Continuing would report
     * the same secret twice under two kinds, and every extra report is another
     * place its existence is written down.
     */
    return;
  }
  if (EMAIL.test(value)) into.push({ path, kind: "email" });
  if (PHONE.test(value)) into.push({ path, kind: "phone" });
}

/**
 * Every forbidden-content finding in a properties bag.
 *
 * Iterative, with a visited set: the input is untrusted, and a payload that a
 * client built with a cycle in it must produce a rejection rather than a hung
 * request. Depth is bounded separately by `depthOf`.
 */
export function scanForForbiddenContent(properties: Record<string, unknown>): ForbiddenFinding[] {
  const findings: ForbiddenFinding[] = [];
  const seen = new WeakSet<object>();
  const stack: Array<{ path: string; node: unknown }> = [{ path: "", node: properties }];

  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined) break;
    const { path, node } = frame;

    if (typeof node === "string") {
      scanString(path, node, findings);
      continue;
    }
    if (node === null || typeof node !== "object") continue;
    if (seen.has(node)) continue;
    seen.add(node);

    if (Array.isArray(node)) {
      node.forEach((child, index) => stack.push({ path: `${path}[${index}]`, node: child }));
      continue;
    }
    for (const [key, child] of Object.entries(node)) {
      const childPath = path === "" ? key : `${path}.${key}`;
      if (PERSONAL_KEYS.has(normalise(key))) {
        findings.push({ path: childPath, kind: "personal_key" });
      }
      stack.push({ path: childPath, node: child });
    }
  }

  /* Deterministic order, so a rejection detail is stable across runs. */
  return findings.sort((a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind));
}

/* ================================================================ redaction */

/**
 * Everything that must never reach a log, an error report, a crash dump or a
 * test artefact.
 *
 * Published as data so the same list drives the plugin, the server and the
 * secret audit, rather than three lists drifting apart.
 */
export const NEVER_LOGGED = [
  "activation_code",
  "source_token",
  "authorization",
  "Authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
] as const;

/**
 * A rejection detail that is safe to store and to show.
 *
 * Names the kind and the path; never the value. The path is deliberately kept —
 * without it an operator cannot find the offending field, and a rejection nobody
 * can act on is a rejection that gets ignored.
 */
export function safeDetail(findings: readonly ForbiddenFinding[]): string {
  if (findings.length === 0) return "no forbidden content";
  const shown = findings.slice(0, 5).map((finding) => `${finding.path} (${finding.kind})`);
  const more = findings.length - shown.length;
  return more > 0 ? `${shown.join(", ")} and ${more} more` : shown.join(", ");
}
