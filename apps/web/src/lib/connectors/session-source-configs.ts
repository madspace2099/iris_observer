import { z } from "zod";
import { SHOWROOM_SOURCE_KINDS, type ShowroomSourceKind } from "@observer/contracts";

/**
 * A SHOWROOM TELEMETRY SOURCE'S CONFIG AND CREDENTIAL — a separate file from
 * `configs.ts` on purpose. `ShowroomSourceKind` is not a `ConnectorKind`
 * (`packages/contracts/src/showroom.ts` says why): it delivers sessions, not
 * a catalogue or deals, and giving it its own schemas here keeps that true
 * in code as well as in the type system, rather than widening the CRM
 * connectors' own maps to cover a shape they were never written for.
 *
 * The generic per-project config/credential STORAGE (`connector_configs`/
 * `connector_credentials`, sealed the same way) is shared with the CRM
 * connectors — only the vendor-specific schemas below are new.
 */

/**
 * The one authorised source host for this project, pinned exactly.
 *
 * `docs/18-deployment.md`'s own warning: "reading one label of a hostname
 * is not checking the hostname." The full origin is compared, not a prefix
 * or a substring — `https://thxjxjrtubnxnvmpzefc.supabase.co.evil.test`
 * must fail this the same way a wrong project would.
 */
export const AUTHORISED_SUPABASE_SHOWROOM_URL = "https://thxjxjrtubnxnvmpzefc.supabase.co";

export const SupabaseShowroomConfigSchema = z.strictObject({
  url: z.literal(AUTHORISED_SUPABASE_SHOWROOM_URL),
});
export type SupabaseShowroomConfig = z.infer<typeof SupabaseShowroomConfigSchema>;

export const SupabaseShowroomCredentialSchema = z.strictObject({
  /** The project's anon key, as issued — a legacy Supabase anon JWT, not a service-role key. */
  token: z.string().trim().min(20).max(2000),
});
export type SupabaseShowroomCredential = z.infer<typeof SupabaseShowroomCredentialSchema>;

export const SESSION_SOURCE_CONFIG_SCHEMAS: Readonly<
  Record<ShowroomSourceKind, typeof SupabaseShowroomConfigSchema>
> = {
  supabase_showroom: SupabaseShowroomConfigSchema,
};

export const SESSION_SOURCE_CREDENTIAL_SCHEMAS: Readonly<
  Record<ShowroomSourceKind, typeof SupabaseShowroomCredentialSchema>
> = {
  supabase_showroom: SupabaseShowroomCredentialSchema,
};

export const SESSION_SOURCE_NAMES: Readonly<Record<ShowroomSourceKind, string>> = {
  supabase_showroom: "Showroom telemetry (Supabase)",
};

export const SESSION_SOURCE_CREDENTIAL_WORDS: Readonly<Record<ShowroomSourceKind, string>> = {
  supabase_showroom: "the project's anon API key from Supabase",
};

export function isShowroomSourceKind(value: string): value is ShowroomSourceKind {
  return (SHOWROOM_SOURCE_KINDS as readonly string[]).includes(value);
}

/** The last four characters of what an operator recognises their credential by. */
export function sessionSourceCredentialTail(credential: Record<string, unknown>): string {
  const value = credential["token"];
  const text = typeof value === "string" ? value : "";
  return text.length >= 4 ? text.slice(-4) : text.padStart(4, "·");
}
