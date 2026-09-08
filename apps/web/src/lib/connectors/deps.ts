import "server-only";

import {
  postgrestCatalogueDb,
  postgrestDealsDb,
  postgrestSessionsDb,
  sqlCatalogueDb,
  sqlDealsDb,
  sqlSessionsDb,
  type CatalogueDb,
  type DealsDb,
  type SessionsDb,
} from "@observer/connectors";

import { resolveServerSupabase } from "@/lib/supabase-env";
import { localControlPlaneQuery } from "@/lib/sources/local-db";

/**
 * The catalogue port a deployment is given — the same two sources, in the same
 * strict order, as `sources/deps.ts`: the hosted database first, and only then
 * the DEV-ONLY local PGlite, so a configured deployment can never be shadowed
 * by a stray environment variable.
 *
 * Resolved per call rather than at module load, for the reason that file
 * gives: a variable added after a serverless instance evaluated its modules
 * is invisible until the instance is recycled.
 */

const platformFetch = (input: string, init?: RequestInit): Promise<Response> => fetch(input, init);

export async function catalogueDbAsync(): Promise<CatalogueDb | null> {
  const supabase = resolveServerSupabase();
  if (supabase !== null) {
    return postgrestCatalogueDb({ url: supabase.url, key: supabase.key, fetch: platformFetch });
  }
  const query = await localControlPlaneQuery();
  return query === null ? null : sqlCatalogueDb(query);
}

/** The deals port, resolved the same way and from the same database. */
export async function dealsDbAsync(): Promise<DealsDb | null> {
  const supabase = resolveServerSupabase();
  if (supabase !== null) {
    return postgrestDealsDb({ url: supabase.url, key: supabase.key, fetch: platformFetch });
  }
  const query = await localControlPlaneQuery();
  return query === null ? null : sqlDealsDb(query);
}

/** The showroom-session-snapshot port, resolved the same way and from the same database. */
export async function sessionsDbAsync(): Promise<SessionsDb | null> {
  const supabase = resolveServerSupabase();
  if (supabase !== null) {
    return postgrestSessionsDb({ url: supabase.url, key: supabase.key, fetch: platformFetch });
  }
  const query = await localControlPlaneQuery();
  return query === null ? null : sqlSessionsDb(query);
}
