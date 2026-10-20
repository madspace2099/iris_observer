import "server-only";

import { createHash, randomBytes } from "node:crypto";

import {
  ACTIVATION_REQUEST_BYTE_CEILING,
  bodyWithinCeiling,
  handleActivate,
  type HandlerDeps,
} from "@observer/sources";

import { localControlPlaneEnabled } from "@/lib/sources/local-db";
import { resolveServerSupabase } from "@/lib/supabase-env";

/**
 * SHORT ACTIVATION CODES ON THE LOCAL PLANE (ADR-0044, amended).
 *
 * The issuer mints `obs.<selector>.<secret>`, about seventy characters, and it
 * is frozen. Akhilesh's wizard hands an operator `ACT-66SV-J9RJ`, which can be
 * read aloud and typed into an engine. The wire contract allows any code of 8
 * to 64 characters with any prefix, so the short form is an ALIAS held here:
 * `sha256(alias)` points at the real code until the alias is spent or expires,
 * and the activation route swaps one for the other before the frozen verifier
 * sees the body.
 *
 * Only where the local control plane is the one in use: that is one server
 * process (ADR-0044), so process memory is the whole truth. A hosted plane runs
 * several instances, an alias minted on one would be unknown on the next, so
 * there none is minted and the long code is shown as before.
 *
 * Eight symbols from a 32 symbol alphabet: 40 bits, live for the real code's 15
 * minutes, single use, and every unknown alias gets the unknown code's 401 byte
 * for byte, because it IS that request: the body goes to the handler untouched.
 *
 * ON `globalThis` for the reason `company-keys.ts` gives: the server action that
 * mints and the route that resolves are different bundles.
 *
 * ponytail: process memory, lost on restart, so a code issued before a restart
 * is reissued from the source's page. That is the local plane's contract anyway.
 */

/**
 * Akhilesh's alphabet: no 0, 1, I or O. Upper case L stays, there being no 1
 * to read it as, and it keeps the count at 32, so a byte's low five bits pick a
 * symbol with no bias.
 */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const SHAPE = /^ACT-?([2-9A-HJ-NP-Z]{4})-?([2-9A-HJ-NP-Z]{4})$/;

/** How many codes the recent list keeps once they can no longer be used. */
const KEEP = 15;

/** Alias lookups one address may make in a window, before the handler's own 429. */
const ATTEMPTS = 10;
const WINDOW_MS = 60_000;

export type AliasStatus = "active" | "activated" | "expired";

interface Issue {
  /** The alias in full, while it can still be used; null after. */
  alias: string | null;
  /** The real code, while the alias can still be used; null after. */
  code: string | null;
  activated: boolean;
  readonly masked: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly client: string | null;
  readonly project: string;
  readonly source: string;
}

interface Store {
  readonly issues: Map<string, Issue>;
  readonly attempts: Map<string, { start: number; count: number }>;
}

const BACKING = Symbol.for("observer.madspace.activation-aliases");

function store(): Store {
  const host = globalThis as unknown as Record<symbol, Store | undefined>;
  const existing = host[BACKING];
  if (existing !== undefined) return existing;
  const created: Store = { issues: new Map(), attempts: new Map() };
  host[BACKING] = created;
  return created;
}

const digest = (alias: string): string => createHash("sha256").update(alias).digest("hex");

/**
 * Whether this process mints aliases: the local control plane, and only when
 * no hosted database would take precedence over it (`observerDepsAsync`).
 */
export function aliasesEnabled(): boolean {
  return localControlPlaneEnabled() && resolveServerSupabase() === null;
}

/** `act 66sv j9rj`, `ACT66SVJ9RJ` and `ACT-66SV-J9RJ` are one alias; anything else is none. */
export function normaliseAlias(raw: string): string | null {
  const match = SHAPE.exec(raw.replace(/\s+/g, "").toUpperCase());
  return match === null ? null : `ACT-${match[1]}-${match[2]}`;
}

/** Closes what has expired, then forgets the oldest closed codes beyond `KEEP`. */
function sweep(now: number): Map<string, Issue> {
  const { issues } = store();
  let surplus = issues.size - KEEP;
  for (const [hash, issue] of issues) {
    if (issue.alias !== null && Date.parse(issue.expiresAt) <= now) {
      issue.alias = null;
      issue.code = null;
    }
    if (surplus > 0 && issue.alias === null) {
      issues.delete(hash);
      surplus -= 1;
    }
  }
  return issues;
}

/** Mints the alias for a code just issued, and returns it. Plaintext once, as the code was. */
export function mintAlias(
  code: string,
  about: {
    readonly issuedAt: string;
    readonly expiresAt: string;
    readonly client: string | null;
    readonly project: string;
    readonly source: string;
  },
  now: number = Date.now(),
): string {
  const issues = sweep(now);
  for (;;) {
    const symbols = Array.from(randomBytes(8), (byte) => ALPHABET.charAt(byte & 31)).join("");
    const alias = `ACT-${symbols.slice(0, 4)}-${symbols.slice(4)}`;
    const hash = digest(alias);
    if (issues.has(hash)) continue;
    issues.set(hash, {
      ...about,
      alias,
      code,
      activated: false,
      masked: `${alias.slice(0, 9)}••••`,
    });
    return alias;
  }
}

/** What the recent list may show. The real code never; the alias only while it works. */
export interface RecentCode {
  /** The alias in full while active, `ACT-66SV-••••` after. */
  readonly code: string;
  readonly status: AliasStatus;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly client: string | null;
  readonly project: string;
  readonly source: string;
}

/** The codes this server issued, most recent first. */
export function recentCodes(now: number = Date.now()): readonly RecentCode[] {
  return [...sweep(now).values()]
    .reverse()
    .slice(0, KEEP)
    .map((issue) => ({
      code: issue.alias ?? issue.masked,
      status: issue.activated ? "activated" : issue.alias === null ? "expired" : "active",
      issuedAt: issue.issuedAt,
      expiresAt: issue.expiresAt,
      client: issue.client,
      project: issue.project,
      source: issue.source,
    }));
}

/**
 * Counts one alias lookup from `address`: null while it is allowed, else the
 * seconds until its window reopens.
 *
 * ponytail: keyed on the first `x-forwarded-for` entry, which `next start`
 * fills from the socket but a caller can also set. The plane is bound to
 * loopback (ADR-0044) and the 40 bits are the defence; this only slows a
 * careless loop. Upgrade: ADR-0028's shared ceiling once activation has one.
 */
function retryAfter(address: string, now: number): number | null {
  const { attempts } = store();
  if (attempts.size > 1_000) {
    for (const [key, held] of attempts) if (now - held.start >= WINDOW_MS) attempts.delete(key);
  }
  const held = attempts.get(address);
  if (held === undefined || now - held.start >= WINDOW_MS) {
    attempts.set(address, { start: now, count: 1 });
    return null;
  }
  held.count += 1;
  return held.count <= ATTEMPTS ? null : Math.ceil((held.start + WINDOW_MS - now) / 1000);
}

/**
 * The activation endpoint on the local plane: an alias becomes its real code,
 * everything else reaches the frozen handler exactly as it arrived.
 */
export async function activateWithAliases(
  request: Request,
  deps: HandlerDeps,
  now: number = Date.now(),
): Promise<Response> {
  const read = await bodyWithinCeiling(request.clone(), ACTIVATION_REQUEST_BYTE_CEILING);
  let payload: unknown = null;
  try {
    payload = read.ok ? JSON.parse(read.text) : null;
  } catch {
    /* Not JSON: the handler says so in its own words. */
  }
  const presented =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)["activation_code"]
      : undefined;
  const alias = typeof presented === "string" ? normaliseAlias(presented) : null;
  if (alias === null) return handleActivate(request, deps);

  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const wait = retryAfter(address, now);
  /* The handler's own 429, through the seam it was written with. */
  if (wait !== null) return handleActivate(request, { ...deps, rateLimit: async () => wait });

  const held = sweep(now).get(digest(alias));
  /* Unknown, spent or expired: the untouched body, so the unknown code's answer. */
  if (held === undefined || held.code === null) return handleActivate(request, deps);

  const headers = new Headers(request.headers);
  headers.delete("content-length");
  const answer = await handleActivate(
    new Request(request.url, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...(payload as object), activation_code: held.code }),
    }),
    deps,
  );
  if (answer.ok) {
    held.activated = true;
    held.alias = null;
    held.code = null;
  }
  return answer;
}

/** Forgets every alias and attempt. For test setup only. */
export function resetAliases(): void {
  store().issues.clear();
  store().attempts.clear();
}
