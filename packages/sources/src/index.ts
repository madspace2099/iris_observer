/**
 * `@observer/sources` — the primitives an ingestion boundary authenticates with.
 *
 * Deliberately free of Next.js, Supabase and HTTP. What lives here is the part
 * that must behave identically whether it is called from a server action, a
 * local test harness or a deployed edge function — minting a credential,
 * parsing a presented one, and answering whether it verifies.
 *
 * The transport, the storage and the admin surface are elsewhere and depend on
 * this. Nothing here depends on them.
 */
export * from "./secrets";
