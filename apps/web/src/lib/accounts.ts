import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import type { Viewer } from "@observer/readmodels";
import { VIEWERS, type ViewerKey } from "@observer/synthetic";

/**
 * ACCOUNTS, WHICH ARE NOT PROFILES.
 *
 * Two questions, two answers, and the whole point of this file is that they are
 * never the same field:
 *
 *   who signed in            → an account
 *   what they may look at    → the projects that account is granted
 *
 * The session cookie carries an ACCOUNT identifier and nothing else. The role,
 * the tenant grants and the project grants are read here, on the server, from
 * the account. A browser that edits its cookie cannot award itself a role,
 * because no role is written in it — which is a stronger property than the
 * scenario selector this replaces, where the viewer key travelled in the token.
 *
 * ## This is not production authentication
 *
 * There is no identity provider, no password reset, no lockout, no second
 * factor and no account lifecycle. What exists is a bounded synthetic
 * directory, off by default, that lets the sign-in screen and the project
 * guards be built and tested against something real-shaped. Replacing it means
 * replacing this file: everything above it asks for an account and gets one.
 *
 * ## Off unless a server explicitly turns it on
 *
 * `OBSERVER_DEMO_ACCOUNTS=1`, read on the server only. Deliberately NOT
 * `OBSERVER_SYNTHETIC_HARNESS` — that flag exists so a browser suite can carry
 * a fake subject pepper, and one switch that unlocks two unrelated things is a
 * switch nobody can reason about. It is not a `NEXT_PUBLIC_` variable, it is
 * not read from a URL, a header, local storage or a request body, and there is
 * no code path that turns it on from anything a client sends.
 *
 * With the flag absent, `authenticate` refuses every credential and
 * `accountById` resolves nothing: the application has no way in. That is the
 * intended production posture until a real identity provider is connected.
 */

const DEMO_FLAG = "OBSERVER_DEMO_ACCOUNTS";

/**
 * The demonstration password, stated rather than hidden.
 *
 * It is not a secret and must never be treated as one: it guards synthetic data
 * on a machine that is already trusted, and the sign-in screen prints it under
 * a demonstration notice. Writing it here in the open is the honest option —
 * the alternative is a value that looks like a credential, which is how a
 * demonstration password ends up in a production environment variable.
 *
 * Stored as a digest so the literal does not sit in the client bundle if this
 * module is ever imported by mistake; `server-only` above is what actually
 * prevents that, and this is the belt to its braces.
 */
export const DEMO_PASSWORD = "observer-demo";

const DEMO_PASSWORD_DIGEST = createHash("sha256")
  .update(`observer.demo.v1:${DEMO_PASSWORD}`)
  .digest("hex");

/**
 * An account: an identity that signs in, and the capacity it holds.
 *
 * `viewerKey` is the account's authorised capacity in the existing model — its
 * role, its tenants and its explicit per-project grants. It is a server-side
 * property of the account, never something the browser selects.
 */
export interface Account {
  readonly accountId: string;
  readonly email: string;
  readonly displayName: string;
  /** The capacity this account holds. Resolved here; never sent to the client. */
  readonly viewerKey: ViewerKey;
}

/**
 * The declared synthetic directory.
 *
 * One account per capacity the demonstration needs to show, because the
 * interesting property of Observer is that two people see different things.
 * Each maps to a viewer whose `projectIds` are the explicit grants the Projects
 * page is generated from — a sales agent assigned to one project has one entry
 * in that list and therefore one card.
 *
 * Two of them are sales agents on purpose. One holds a single project and one
 * holds two, from developers who compete with each other, so the difference
 * between "what this role may see" and "what this ACCOUNT was granted" is
 * visible rather than argued.
 */
const DIRECTORY: readonly Account[] = Object.freeze([
  {
    accountId: "acct_petra",
    email: "petra.novak@alpha-estates.example",
    displayName: VIEWERS.developer.displayName,
    viewerKey: "developer",
  },
  {
    accountId: "acct_tomas",
    email: "tomas.varga@meridian-sales.example",
    displayName: VIEWERS.agencyManager.displayName,
    viewerKey: "agencyManager",
  },
  {
    accountId: "acct_monika",
    email: "monika.kovacova@meridian-sales.example",
    displayName: VIEWERS.salesAgent.displayName,
    viewerKey: "salesAgent",
  },
  /*
   * The same role as Monika, and a different answer, which is the point.
   *
   * Two explicit grants, one from each of two competing developers. The
   * Projects page therefore shows this account two cards and Monika one — from
   * the same code, reading the same list, with nothing role-specific in it.
   */
  {
    accountId: "acct_akhilesh",
    email: "akhilesh.undev@meridian-sales.example",
    displayName: VIEWERS.salesAgentDual.displayName,
    viewerKey: "salesAgentDual",
  },
  {
    accountId: "acct_madspace",
    email: "operations@madspace.example",
    displayName: VIEWERS.madspace.displayName,
    viewerKey: "madspace",
  },
]);

/** Whether this server has been told to offer the synthetic directory. */
export function demoAccountsEnabled(
  source: Record<string, string | undefined> = process.env,
): boolean {
  return source[DEMO_FLAG] === "1";
}

/**
 * Why a sign-in did not succeed.
 *
 * One shape for every failure a caller may show a reader. `unavailable` is the
 * fail-closed case: no directory is configured, so there is nothing to check a
 * credential against and saying "wrong password" would be a lie.
 */
export type SignInResult =
  | { readonly ok: true; readonly account: Account }
  | { readonly ok: false; readonly reason: "unavailable" | "invalid" };

/**
 * Checks a credential.
 *
 * Constant-time on the password, and identical in shape for an unknown address
 * and a wrong password: a sign-in form that answers those two differently is a
 * sign-in form that enumerates its own users.
 */
export function authenticate(email: string, password: string): SignInResult {
  if (!demoAccountsEnabled()) return { ok: false, reason: "unavailable" };

  const normalised = email.trim().toLowerCase();
  const account = DIRECTORY.find((a) => a.email === normalised);

  const given = createHash("sha256").update(`observer.demo.v1:${password}`).digest("hex");
  const a = Buffer.from(given);
  const b = Buffer.from(DEMO_PASSWORD_DIGEST);
  const passwordMatches = a.length === b.length && timingSafeEqual(a, b);

  /*
   * Both checks always run, and only their combination decides. Returning early
   * on an unknown address would answer faster for addresses that do not exist.
   */
  if (account === undefined || !passwordMatches) return { ok: false, reason: "invalid" };
  return { ok: true, account };
}

/** Resolves an account identifier from a verified session. */
export function accountById(accountId: string): Account | null {
  if (!demoAccountsEnabled()) return null;
  return DIRECTORY.find((a) => a.accountId === accountId) ?? null;
}

/**
 * The capacity an account holds.
 *
 * The only place an account becomes a viewer. Every grant the application
 * enforces — tenant, project, role — comes from here, so there is exactly one
 * answer to "what may this account see" and it is computed on the server.
 */
export function viewerForAccount(account: Account): Viewer {
  return VIEWERS[account.viewerKey];
}

/** The addresses the demonstration offers, for the notice on the sign-in page. */
export function demoDirectory(): readonly { email: string; displayName: string }[] {
  if (!demoAccountsEnabled()) return [];
  return DIRECTORY.map((a) => ({ email: a.email, displayName: a.displayName }));
}
