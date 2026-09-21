/**
 * `@observer/connectors` — the CRM and catalogue connectors (ADR-0036).
 *
 * Pure adapters: each turns a credential, a configuration and an injected
 * HTTP function into one canonical `CatalogueSnapshot` or a refusal that
 * names a category and never a body. No `fetch` here, no database, no
 * logging — those live above, in the application, in exactly one place each.
 */

export * from "./http";
export * from "./shared";
export * from "./record";
export * from "./csv";
export * from "./realpad";
export * from "./realpad-deals";
export * from "./xlsx";
export * from "./lomnio";
export * from "./monday";
export * from "./sync";
export * from "./deals";
export * from "./db";
export * from "./deals-db";
export * from "./supabase-showroom";
export * from "./ue5-events";
export * from "./sessions-db";
