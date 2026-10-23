import "server-only";

import { accountById, companyOf, type Account } from "@/lib/accounts";
import { demoWireModel, localDemonstration, type DemoModelAccess } from "@/lib/env";
import { RECOMMENDED_DEFAULT } from "@/lib/models/catalogue";
import { cleanKey } from "./clean-key";
import { lastFour } from "./envelope";
import { classifyProviderFailure, type ConnectionFailure } from "./failure";
import type { ConnectionProbe } from "./service";

/**
 * A COMPANY'S OPENAI KEY, ON A LOCAL DEMONSTRATION ONLY (ADR-0043).
 *
 * Keys belong to accounts and live sealed in Supabase (ADR-0030). A local
 * recording has no Supabase, so this is the one carve-out: the company's admin
 * pastes a key once, and every member of that company asks with it. A company
 * is the capacity's organisation (`companyOf`).
 *
 * Open only when `OBSERVER_DEMO_COMPANY_KEYS` is exactly `1` AND the server is
 * a local demonstration (`localDemonstration`: the synthetic directory on, a
 * development or harness environment, no deployment marker). The stream route
 * adds the third condition, a loopback `Host`, before it spends one.
 *
 * What leaves this module: `companyKeyState` carries the last four characters,
 * who set the key and when, and never the key. `companyModelAccess` is the one
 * function that returns it, to the stream route, for a request whose account
 * came from the signed session.
 *
 * ON `globalThis` for the reason `test-store.ts` gives: the server action that
 * saves the key and the route handler that spends it are different bundles with
 * different module registries, and a module-level Map would be two Maps.
 *
 * ponytail: process memory, in plaintext, never on disk; lost on restart, so the
 * admin pastes it again. Upgrade: seal it with `envelope.ts` and keep it in the
 * credential store once a company can own a row there.
 */

const FLAG = "OBSERVER_DEMO_COMPANY_KEYS";

type Source = Readonly<Record<string, string | undefined>>;

interface CompanyKey {
  readonly apiKey: string;
  readonly lastFour: string;
  readonly setAt: string;
  readonly setBy: string;
}

const BACKING = Symbol.for("observer.credentials.company-keys");

function keys(): Map<string, CompanyKey> {
  const host = globalThis as unknown as Record<symbol, Map<string, CompanyKey> | undefined>;
  const existing = host[BACKING];
  if (existing !== undefined) return existing;
  const created = new Map<string, CompanyKey>();
  host[BACKING] = created;
  return created;
}

/** Whether this server holds company keys at all. */
export function companyKeysEnabled(source: Source = process.env): boolean {
  return source[FLAG] === "1" && localDemonstration(source);
}

/** What a screen may know about a company's key. Never the key. */
export interface CompanyKeyState {
  readonly company: string;
  readonly role: Account["companyRole"];
  readonly adminName: string;
  /** Null while the company has no key. */
  readonly key: {
    readonly lastFour: string;
    readonly setAt: string;
    readonly setBy: string;
  } | null;
}

/** The company's key state for this account, or null where the store is closed. */
export function companyKeyState(
  account: Account,
  source: Source = process.env,
): CompanyKeyState | null {
  if (!companyKeysEnabled(source)) return null;
  const company = companyOf(account);
  const held = keys().get(company.name);
  return {
    company: company.name,
    role: company.role,
    adminName: company.adminName,
    key:
      held === undefined ? null : { lastFour: held.lastFour, setAt: held.setAt, setBy: held.setBy },
  };
}

export type CompanyKeyResult =
  { readonly ok: true } | { readonly ok: false; readonly failure: ConnectionFailure | "forbidden" };

/**
 * Stores the company's key, after one probe. The admin only.
 *
 * The same rules as an account's key (`saveConnection`): trimmed, at least
 * twelve characters, and probed before anything is kept. A key the provider
 * accepts but whose project cannot reach the model is still a working key and
 * is kept; every other failure keeps nothing.
 */
export async function setCompanyKey(
  account: Account,
  raw: string,
  probe: ConnectionProbe,
  source: Source = process.env,
): Promise<CompanyKeyResult> {
  if (!companyKeysEnabled(source)) return { ok: false, failure: "storage_unavailable" };
  const company = companyOf(account);
  if (company.role !== "admin") return { ok: false, failure: "forbidden" };

  const trimmed = cleanKey(raw);
  if (trimmed === null || trimmed.length < 12) return { ok: false, failure: "rejected" };

  const probed = await probe(trimmed, RECOMMENDED_DEFAULT);
  const failure = probed.ok ? null : classifyProviderFailure(probed.status, probed.code);
  if (failure !== null && failure !== "model_unavailable") return { ok: false, failure };

  keys().set(company.name, {
    apiKey: trimmed,
    lastFour: lastFour(trimmed),
    setAt: new Date().toISOString(),
    setBy: account.displayName,
  });
  return { ok: true };
}

/** Forgets the company's key. The admin only; true when one was removed. */
export function removeCompanyKey(account: Account, source: Source = process.env): boolean {
  if (!companyKeysEnabled(source)) return false;
  const company = companyOf(account);
  if (company.role !== "admin") return false;
  return keys().delete(company.name);
}

/**
 * The key and model a member of the account's company asks with, or null.
 *
 * The account id comes from the signed session through the gate; this module
 * never reads one from a request.
 */
export function companyModelAccess(
  accountId: string,
  source: Source = process.env,
): DemoModelAccess | null {
  if (!companyKeysEnabled(source)) return null;
  const account = accountById(accountId);
  if (account === null) return null;
  const held = keys().get(companyOf(account).name);
  return held === undefined ? null : { apiKey: held.apiKey, model: demoWireModel(source) };
}

/** The model the company key answers with, for the screen. Never the key. */
export function companyModelName(accountId: string, source: Source = process.env): string | null {
  return companyModelAccess(accountId, source)?.model ?? null;
}

/** Wipes every company key. For test setup only. */
export function resetCompanyKeys(): void {
  keys().clear();
}
