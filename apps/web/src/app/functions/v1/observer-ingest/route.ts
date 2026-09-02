import { handleIngest, failure } from "@observer/sources";

import { observerDeps } from "@/lib/sources/deps";

/**
 * `POST /functions/v1/observer-ingest`
 *
 * Accepts a bounded batch of events under an authenticated source and answers with one result per submitted event.
 *
 * Four lines of substance, and that is the point: every rule this endpoint
 * enforces lives in `@observer/sources`, where a test can call it with a
 * PGlite-backed database and a real `Request` and get a real `Response`.
 * Logic that lived here instead would be reachable only by starting Next.
 *
 * The path is backend-owned (`PD-13`). The `/functions/v1` prefix is where a
 * Supabase Edge Function is served from, so serving it here means the URL a
 * plugin is configured with does not change if this later moves.
 */

export const runtime = "nodejs";

/** Never cached, never statically rendered: every call mutates or authenticates. */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const deps = observerDeps();
  if (deps === null) {
    return failure("unavailable", "This deployment is not configured to accept Observer traffic.");
  }
  return handleIngest(request, deps);
}
