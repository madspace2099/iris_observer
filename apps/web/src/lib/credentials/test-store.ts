import "server-only";

import type { EnvSource } from "@/lib/supabase-env";
import type { AuditEntry, CredentialStore, StoredCredential, TestOutcome } from "./store";

/**
 * THE BROWSER SUITE'S CREDENTIAL STORE. NOT A DEVELOPMENT CONVENIENCE.
 *
 * Isolated in its own module so that everything about it — the `globalThis`
 * backing, the synthetic-only credential rule, the four conditions that let it
 * run — is in one file a reviewer can read end to end and delete in one piece.
 *
 * ## What has to be true, all four at once
 *
 *   1. `OBSERVER_CREDENTIAL_TEST_STORE` is exactly `browser-tests-only`.
 *      Not "1", not "true" — a value nobody sets by accident and nobody
 *      mistakes for a feature switch.
 *   2. `OBSERVER_SYNTHETIC_HARNESS` is `1`. The suite's other seam, required
 *      simultaneously, so this cannot be turned on by one stray variable.
 *   3. `OBSERVER_ENVIRONMENT` is exactly `development`. An allow-list: unset,
 *      misspelled, `staging` and `production` all refuse.
 *   4. No deployment marker is present in the environment at all.
 *
 * An ordinary `pnpm dev` satisfies none of 1 and 2, so ordinary development has
 * no credential persistence — the settings page says secure storage is not
 * configured and the form is disabled, which is the same thing a production
 * deployment without Supabase would say.
 *
 * ## Why the deployment markers
 *
 * Condition 3 alone trusts a variable somebody could copy. Every serverless and
 * container platform stamps its own name into the environment and none of them
 * can be unset by a careless paste of an `.env` file, so a process carrying one
 * is a deployment whatever it has been told to call itself.
 *
 * ## It refuses a real credential
 *
 * The store accepts only values matching `SYNTHETIC_CREDENTIAL` — a shape no
 * vendor issues. Paste a real OpenAI key into a harness server and it is
 * refused before it is sealed, before it is probed and before it is stored. A
 * test fixture store that would happily hold a production secret is a place
 * production secrets end up.
 */

/* --------------------------------------------------------------- the gate */

const TEST_FLAG = "OBSERVER_CREDENTIAL_TEST_STORE";
const TEST_FLAG_VALUE = "browser-tests-only";
const SYNTHETIC_HARNESS = "OBSERVER_SYNTHETIC_HARNESS";

/**
 * Names a platform sets and a person does not.
 *
 * Presence is what counts, not value: `VERCEL_ENV=preview` is still Vercel.
 */
const DEPLOYMENT_MARKERS = [
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
  "AWS_REGION",
  "AWS_EXECUTION_ENV",
  "LAMBDA_TASK_ROOT",
  "NETLIFY",
  "RENDER",
  "FLY_APP_NAME",
  "DYNO",
  "WEBSITE_INSTANCE_ID",
  "KUBERNETES_SERVICE_HOST",
  "K_SERVICE",
] as const;

/**
 * The only credential shape this store will hold.
 *
 * Deliberately unlike anything OpenAI issues, and long enough that the four
 * visible characters of a masked identifier are not most of it.
 */
export const SYNTHETIC_CREDENTIAL = /^sk-observer-test-[a-z0-9-]{8,64}$/;

export function isSyntheticCredential(value: string): boolean {
  return SYNTHETIC_CREDENTIAL.test(value);
}

/** Whether this process may use the harness. All four conditions, no shortcuts. */
export function testStorePermitted(source: EnvSource = process.env): boolean {
  if (source[TEST_FLAG] !== TEST_FLAG_VALUE) return false;
  if (source[SYNTHETIC_HARNESS] !== "1") return false;
  if (source["OBSERVER_ENVIRONMENT"] !== "development") return false;
  return DEPLOYMENT_MARKERS.every((marker) => (source[marker] ?? "").length === 0);
}

/* ------------------------------------------------------------- the backing */

/*
 * ON `globalThis`, AND CONFINED TO THIS FILE.
 *
 * A module-level Map is per BUNDLE, not per process: Next builds route
 * handlers, server actions and pages separately, each with its own module
 * registry, so a credential saved by the settings action landed in one Map
 * while `/api/ask` read an empty one — the harness looked like it worked and
 * proved nothing.
 *
 * The real adapter has no such problem; Supabase is one database whichever
 * bundle asks. This is the only place in the CREDENTIAL feature that touches
 * `globalThis`, and a test asserts it stays that way. The Ask limiter keeps
 * its own store there for the same bundle-boundary reason (`ai/limits.ts`),
 * which is a separate, older decision and not a precedent for a third.
 */
const BACKING = Symbol.for("observer.credentials.test-store");

interface Backing {
  readonly rows: Map<string, StoredCredential>;
  readonly audit: AuditEntry[];
}

function backing(): Backing {
  const host = globalThis as unknown as Record<symbol, Backing | undefined>;
  const existing = host[BACKING];
  if (existing !== undefined) return existing;
  const created: Backing = { rows: new Map(), audit: [] };
  host[BACKING] = created;
  return created;
}

function key(accountId: string, provider: string): string {
  return `${accountId}::${provider}`;
}

/* --------------------------------------------------------------- the store */

export function testStore(): CredentialStore {
  return {
    kind: "test",

    /* The rule that keeps a real credential out. */
    accepts: isSyntheticCredential,

    read: (accountId, provider) =>
      Promise.resolve(backing().rows.get(key(accountId, provider)) ?? null),

    upsert: (record) => {
      /*
       * The same monotonic guard the database has. A replacement that arrives
       * out of order — a slow first request landing after a fast second —
       * must not reinstate the key it superseded.
       */
      const existing = backing().rows.get(key(record.accountId, record.provider));
      if (existing !== undefined && existing.revision >= record.revision) return Promise.resolve();
      backing().rows.set(key(record.accountId, record.provider), record);
      return Promise.resolve();
    },

    remove: (accountId, provider) =>
      Promise.resolve(backing().rows.delete(key(accountId, provider))),

    recordTest: (accountId, provider, outcome: TestOutcome, at: string) => {
      const existing = backing().rows.get(key(accountId, provider));
      if (existing !== undefined) {
        backing().rows.set(key(accountId, provider), {
          ...existing,
          lastTestedAt: at,
          lastTestOutcome: outcome,
        });
      }
      return Promise.resolve();
    },

    audit: (entry) => {
      backing().audit.push(entry);
      return Promise.resolve();
    },
  };
}

/** Test-only reader for the audit trail. Never routed to a browser. */
export function testAuditTrail(): readonly AuditEntry[] {
  return backing().audit;
}

/** Wipes the harness. For test setup only. */
export function resetTestStore(): void {
  backing().rows.clear();
  backing().audit.length = 0;
}
