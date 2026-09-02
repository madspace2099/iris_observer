import "server-only";

import { postgrestDb, type HandlerDeps } from "@observer/sources";

import { resolveServerSupabase } from "@/lib/supabase-env";

/**
 * What the three Observer endpoints are given in a deployment.
 *
 * The handlers themselves take their dependencies as an argument and know
 * nothing about Next.js, `process.env` or Supabase — which is what lets the
 * end-to-end proof call the same functions against PGlite and get real statuses
 * and headers back. This file is the other half of that arrangement, and it is
 * deliberately the only place in the application that knows both halves.
 *
 * ## Why this can return null, and what the routes do about it
 *
 * A deployment without Supabase credentials cannot serve these endpoints at
 * all, and the honest answer to a client is `503 unavailable` — a code whose
 * policy in `REQUEST_FAILURES` already says retain the outbox and keep trying,
 * which is exactly right for a misconfiguration somebody is about to fix.
 *
 * The alternative — constructing a client against an empty URL and letting the
 * first fetch fail — produces a 500 with a stack in it, and a UE outbox that
 * quarantines a batch over an operator's missing environment variable.
 *
 * ## Why the resolution happens per request rather than at module load
 *
 * On a serverless platform a module is evaluated once, at a moment nobody
 * chose, and a variable added after that evaluation is invisible until the
 * instance is recycled. Reading it per request costs a property lookup and
 * means a corrected configuration takes effect on the next call rather than on
 * the next deployment.
 */
/**
 * The platform's `fetch`, wrapped rather than handed over.
 *
 * `postgrest.ts` warns that a detached `fetch` throws `Illegal invocation` in
 * several runtimes because it needs its receiver, so the obvious
 * `globalThis.fetch.bind(globalThis)` was the first version of this.
 *
 * It was also the fifth file in the application to mention `globalThis`, and
 * `credentials.test.ts` refused it. That guard is right and the code was wrong:
 * it exists to catch somebody reaching for process-global STATE in the product,
 * and widening its allow-list to admit a file that only wanted the platform's
 * own API would have blunted it for the next reader who really did stash
 * something there.
 *
 * A closure calls `fetch` as a free identifier, which the runtime binds
 * correctly, so the receiver problem never arises and no global is named.
 */
const platformFetch = (input: string, init?: RequestInit): Promise<Response> => fetch(input, init);

export function observerDeps(): HandlerDeps | null {
  const supabase = resolveServerSupabase();
  if (supabase === null) return null;

  return {
    db: postgrestDb({
      url: supabase.url,
      key: supabase.key,
      fetch: platformFetch,
    }),
    env: process.env,
    now: () => new Date(),
    /*
     * No rate-limit hook yet, and its absence is deliberate rather than
     * forgotten. The repository already has a shared Postgres-backed ceiling
     * (ADR-0028) and activation is the endpoint that most needs one, but wiring
     * it in needs its own migration and its own counters. The seam is in
     * `HandlerDeps` so the endpoints are written against it now instead of
     * being retrofitted around it later.
     */
  };
}
