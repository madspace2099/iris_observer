/**
 * `@observer/sources` — the primitives an ingestion boundary authenticates with.
 *
 * Deliberately free of Next.js and of any Supabase client. What lives here is
 * the part that must behave identically whether it is called from a server
 * action, a local test harness or a deployed edge function — minting a
 * credential, parsing a presented one, answering whether it verifies, and
 * reaching the database through a port with two interchangeable implementations.
 *
 * It does know about HTTP, and that is a deliberate narrowing of the original
 * claim. `http.ts` deals in the Fetch `Request` and `Response` types, which are
 * platform primitives rather than a framework, and putting the three endpoints'
 * shared refusal shape anywhere else is how `401` and `403` eventually get
 * answered with each other's status.
 *
 * The storage engine and the admin surface are elsewhere and depend on this.
 * Nothing here depends on them.
 */
export * from "./secrets";
export * from "./db";
export * from "./http";
export * from "./pglite";
export * from "./postgrest";
export * from "./authenticate";
export * from "./admin";
export * from "./activate";
export * from "./ingest";
export * from "./heartbeat";
