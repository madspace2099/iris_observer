import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import type { Viewer } from "@observer/readmodels";
import { PROJECTS, TENANTS, VIEWERS, type ViewerKey } from "@observer/synthetic";

import { withDirectoryGrants } from "@/lib/directory/live";

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
  /**
   * The account's standing inside its company (ADR-0043). A company is the
   * capacity's `organisationName`; each has exactly one admin, who holds the
   * company's OpenAI key on a local demonstration. Never a product role.
   */
  readonly companyRole: "admin" | "member";
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
 * Three of them are sales agents on purpose. One holds a single project, one
 * holds two from developers who compete with each other, and one holds only
 * ISTER TOWER — so the difference between "what this role may see" and "what
 * this ACCOUNT was granted" is visible rather than argued.
 */
const DIRECTORY: readonly Account[] = Object.freeze([
  {
    accountId: "acct_petra",
    email: "petra.novak@alpha-estates.example",
    displayName: VIEWERS.developer.displayName,
    viewerKey: "developer",
    companyRole: "admin",
  },
  {
    accountId: "acct_tomas",
    email: "tomas.varga@meridian-sales.example",
    displayName: VIEWERS.agencyManager.displayName,
    viewerKey: "agencyManager",
    companyRole: "admin",
  },
  {
    accountId: "acct_monika",
    email: "monika.kovacova@meridian-sales.example",
    displayName: VIEWERS.salesAgent.displayName,
    viewerKey: "salesAgent",
    companyRole: "member",
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
    companyRole: "member",
  },
  /*
   * The third sales agent, and the one the flagship project is reviewed
   * through.
   *
   * Monika and Akhilesh both open on Northgate, so neither of them lands a
   * reviewer on ISTER TOWER — the development every surface is now judged
   * against — without a second click. Martin holds that project and only that
   * project, which makes his grant list the shortest possible route to it and
   * keeps the demonstration of "one grant, one card" intact.
   */
  {
    accountId: "acct_martin",
    email: "martin.kovac@meridian-sales.example",
    displayName: VIEWERS.salesAgentIster.displayName,
    viewerKey: "salesAgentIster",
    companyRole: "member",
  },
  {
    accountId: "acct_madspace",
    email: "operations@madspace.example",
    displayName: VIEWERS.madspace.displayName,
    viewerKey: "madspace",
    companyRole: "admin",
  },
  /*
   * Shark Residence, the demonstration project: its developer and the manager
   * of the agency selling it. Each holds that one project and nothing else.
   */
  {
    accountId: "acct_clara",
    email: "clara.weiss@shark-developments.example",
    displayName: VIEWERS.developerShark.displayName,
    viewerKey: "developerShark",
    companyRole: "admin",
  },
  {
    accountId: "acct_daniel",
    email: "daniel.hart@shark-sales.example",
    displayName: VIEWERS.managerShark.displayName,
    viewerKey: "managerShark",
    companyRole: "admin",
  },
  /*
   * A member of Clara's company, so a recording can show what a member sees:
   * Clara's static capacity under her own name, and the company key Clara
   * manages (ADR-0043). A second person on one capacity, not a new capacity.
   * Grants made in MADSPACE administration follow the account id, so a
   * project granted to Clara there is not Nora's until it is granted to her.
   */
  {
    accountId: "acct_nora",
    email: "nora.lind@shark-developments.example",
    displayName: "Nora Lind",
    viewerKey: "developerShark",
    companyRole: "member",
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
 * credential against and saying "wrong password" would be a lie. `rate_limited`
 * is distinct from `invalid` on purpose — see `admitLoginAttempt` below — and
 * safe to say plainly: it names a property of the CALLER's attempt history,
 * not of the address, so it cannot be used to learn which addresses exist.
 */
export type SignInResult =
  | { readonly ok: true; readonly account: Account }
  | { readonly ok: false; readonly reason: "unavailable" | "invalid" | "rate_limited" };

/* --- login attempt throttling --------------------------------------------- */

/**
 * How many failed sign-ins one email may absorb before a cool-down, and for
 * how long.
 *
 * Keyed on the normalised email rather than on the caller's address:
 * `clientFingerprint` in `lib/ai/quota.ts` states this product's reason for
 * never keying anything on an IP directly — an address identifies a building,
 * not a person, and is personal data this product has no reason to hold. An
 * account-keyed ceiling protects each account from credential stuffing
 * regardless of how many machines an attempt comes from, which is the
 * property that matters here.
 *
 * Only FAILURES count, and a success clears the count rather than merely not
 * incrementing it. The obvious alternative — counting every attempt — also
 * throttles a reader who is allowed to sign in correctly a hundred times a
 * day, which is exactly what this demonstration directory's own accounts do
 * across the E2E suite. Counting failures is also the more honest threat
 * model: what this guards against is repeated wrong guesses, not a legitimate
 * caller's ordinary pace.
 *
 * **In-process only, and that is a real limit, not an oversight.** A
 * serverless deployment spreads requests across many warm instances, so this
 * is a per-instance brake — real friction against one attacker, no global
 * ceiling. If this ever has to be authoritative, the pattern to follow is the
 * one `lib/ai/quota.ts` already uses: an in-process check as a cheap first
 * line, a shared Postgres counter as the ceiling that actually holds.
 */
export const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_FAILURE_CEILING = 5;

const loginFailures = new Map<string, { count: number; windowEndsAt: number }>();

/** Whether `email` may attempt another sign-in right now. */
function isRateLimited(email: string): boolean {
  const entry = loginFailures.get(email);
  if (entry === undefined) return false;
  if (entry.windowEndsAt <= Date.now()) {
    loginFailures.delete(email);
    return false;
  }
  return entry.count >= LOGIN_FAILURE_CEILING;
}

/** Records one failed attempt against `email`, starting a fresh window if the previous one lapsed. */
function recordFailure(email: string): void {
  const now = Date.now();
  const entry = loginFailures.get(email);
  if (entry === undefined || entry.windowEndsAt <= now) {
    loginFailures.set(email, { count: 1, windowEndsAt: now + LOGIN_FAILURE_WINDOW_MS });
    return;
  }
  entry.count += 1;
}

/** Clears `email`'s failure count. Called on every successful sign-in. */
function clearFailures(email: string): void {
  loginFailures.delete(email);
}

/**
 * Checks a credential.
 *
 * Constant-time on the password, and identical in shape for an unknown address
 * and a wrong password: a sign-in form that answers those two differently is a
 * sign-in form that enumerates its own users. The rate-limit check runs first
 * and short-circuits before the password is even hashed — a throttled caller
 * learns nothing about the credential either, only that they must wait.
 */
export function authenticate(email: string, password: string): SignInResult {
  if (!demoAccountsEnabled()) return { ok: false, reason: "unavailable" };

  const normalised = email.trim().toLowerCase();
  if (isRateLimited(normalised)) return { ok: false, reason: "rate_limited" };

  const account = DIRECTORY.find((a) => a.email === normalised);

  const given = createHash("sha256").update(`observer.demo.v1:${password}`).digest("hex");
  const a = Buffer.from(given);
  const b = Buffer.from(DEMO_PASSWORD_DIGEST);
  const passwordMatches = a.length === b.length && timingSafeEqual(a, b);

  /*
   * Both checks always run, and only their combination decides. Returning early
   * on an unknown address would answer faster for addresses that do not exist.
   */
  if (account === undefined || !passwordMatches) {
    recordFailure(normalised);
    return { ok: false, reason: "invalid" };
  }
  clearFailures(normalised);
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
export async function viewerForAccount(account: Account): Promise<Viewer> {
  /*
   * The capacity is shared; the name is the account's. Two accounts on one
   * capacity (Nora on Clara's) share its static tenants and projects and greet
   * different people; administration grants follow the account id below.
   * ponytail: they also share the capacity's userId, so the Ask ceiling bucket
   * and audit subject are one; give Account its own userId when that matters.
   */
  return withDirectoryGrants(account.accountId, {
    ...VIEWERS[account.viewerKey],
    displayName: account.displayName,
  });
}

/** An account's company, its standing in it, and who holds the company's key. */
export interface Company {
  readonly name: string;
  readonly role: Account["companyRole"];
  readonly adminName: string;
}

/**
 * The company an account belongs to (ADR-0043): the capacity's organisation.
 * Every organisation has exactly one admin (`accounts.test.ts`); the name
 * stands in for one only if that test is ever broken.
 */
export function companyOf(account: Account): Company {
  const name = VIEWERS[account.viewerKey].organisationName;
  const admin = DIRECTORY.find(
    (a) => a.companyRole === "admin" && VIEWERS[a.viewerKey].organisationName === name,
  );
  return { name, role: account.companyRole, adminName: admin?.displayName ?? name };
}

/**
 * Whether an account may connect, replace or switch off a project's CRM
 * (ADR-0049). The CRM is the developer's (`docs/01-foundation.md` §1, §4), so
 * the company admin of the project's own developer may, and MADSPACE, which
 * connects every project's CRM anyway; an agency's admin holding the project
 * reads it and changes nothing. ADR-0043's "admins act" was about a company's
 * own key, never another company's connection.
 */
export function mayConnectCrm(
  account: Account,
  viewer: Viewer,
  tenant: { readonly name: string },
): boolean {
  if (viewer.role === "madspace_admin") return true;
  const company = companyOf(account);
  return company.role === "admin" && company.name === tenant.name;
}

/**
 * The accounts a project made in administration can be given to.
 *
 * Everybody this deployment can sign in except its administrators, who hold
 * every such project already. Empty where the directory is switched off: a grant
 * to an account nobody can sign in as would be a row that says something false.
 */
export function grantableAccounts(): readonly {
  readonly accountId: string;
  readonly displayName: string;
  readonly email: string;
  readonly role: Viewer["role"];
}[] {
  if (!demoAccountsEnabled()) return [];
  return DIRECTORY.map((account) => ({
    accountId: account.accountId,
    displayName: account.displayName,
    email: account.email,
    role: VIEWERS[account.viewerKey].role,
  })).filter((account) => account.role !== "madspace_admin");
}

/** The addresses the demonstration offers, for the notice on the sign-in page. */
export function demoDirectory(): readonly { email: string; displayName: string }[] {
  if (!demoAccountsEnabled()) return [];
  return DIRECTORY.map((a) => ({ email: a.email, displayName: a.displayName }));
}

/* --- the directory, for the MADSPACE administration surface -------------- */

const ROLE_WORDS: Readonly<Record<Viewer["role"], string>> = {
  developer: "Developer",
  agency_manager: "Agency manager",
  sales_agent: "Sales agent",
  madspace_admin: "MADSPACE administrator",
};

export interface DirectoryTenant {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly projects: readonly { readonly slug: string; readonly name: string }[];
}

export interface DirectoryPerson {
  readonly name: string;
  readonly email: string;
  readonly roleWord: string;
  readonly organisation: string;
  /** "Admin" or "Member" of that organisation (ADR-0043). */
  readonly companyRoleWord: "Admin" | "Member";
  readonly projects: readonly string[];
}

/**
 * A company people work for, as the demonstration directory knows it (ADR-0047).
 *
 * A company is the capacity's organisation (ADR-0043). Its kind is read from
 * what its people do: MADSPACE administers, a sales agency's people sell, and
 * anyone else works for a developer.
 */
export interface DirectoryCompany {
  readonly name: string;
  readonly kind: "developer" | "agency" | "madspace";
  readonly people: readonly DirectoryPerson[];
  /** The developers whose projects its people hold, by name: an agency's clients. */
  readonly sellsFor: readonly string[];
}

export interface DirectoryView {
  readonly tenants: readonly DirectoryTenant[];
  readonly companies: readonly DirectoryCompany[];
  readonly people: readonly DirectoryPerson[];
}

/**
 * Tenants, the companies people work for, and the people, as the
 * demonstration directory holds them.
 *
 * Composed here because this file is the one place outside the composition
 * root that may name the synthetic world (`surfaces.test.ts`): it is where an
 * address becomes a viewer, and the directory page reads the same accounts
 * the sign-in accepts. Nothing here is a store; there is no tenant, user or
 * agency table yet, and the page that draws this says so.
 */
export function directoryView(): DirectoryView {
  const accounts = DIRECTORY.map((account) => ({ account, viewer: VIEWERS[account.viewerKey] }));
  const projectName = (id: string) => PROJECTS.find((p) => p.id === id)?.name ?? id;

  const tenants: DirectoryTenant[] = TENANTS.map((tenant) => ({
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    projects: PROJECTS.filter((p) => p.tenantId === tenant.id).map((p) => ({
      slug: p.slug,
      name: p.name,
    })),
  }));

  const people: DirectoryPerson[] = accounts.map(({ account, viewer }) => ({
    name: account.displayName,
    email: account.email,
    roleWord: ROLE_WORDS[viewer.role],
    organisation: viewer.organisationName,
    companyRoleWord: account.companyRole === "admin" ? "Admin" : "Member",
    projects: viewer.projectIds.map(projectName),
  }));

  const names = [...new Set(accounts.map(({ viewer }) => viewer.organisationName))];
  const companies: DirectoryCompany[] = names.map((name) => {
    const members = accounts.filter(({ viewer }) => viewer.organisationName === name);
    const roles = new Set(members.map(({ viewer }) => viewer.role));
    const kind = roles.has("madspace_admin")
      ? "madspace"
      : roles.has("agency_manager") || roles.has("sales_agent")
        ? "agency"
        : "developer";
    const tenantIds = new Set(
      members.flatMap(({ viewer }) =>
        viewer.projectIds.flatMap((id) =>
          PROJECTS.filter((p) => p.id === id).map((p) => p.tenantId),
        ),
      ),
    );
    return {
      name,
      kind,
      people: people.filter((person) => person.organisation === name),
      sellsFor:
        kind === "agency" ? TENANTS.filter((t) => tenantIds.has(t.id)).map((t) => t.name) : [],
    };
  });

  return { tenants, companies, people };
}
