/**
 * The event contract is versioned independently of the application. A showroom
 * installation in the field may be several releases behind the server, so the
 * server states plainly which versions it still accepts rather than guessing.
 */
export const SCHEMA_VERSION = "1.0.0" as const;

/** Versions the ingest endpoint accepts. Oldest first. */
export const SUPPORTED_SCHEMA_VERSIONS = ["1.0.0"] as const;

export type SchemaVersion = (typeof SUPPORTED_SCHEMA_VERSIONS)[number];

export function isSupportedSchemaVersion(value: string): value is SchemaVersion {
  return (SUPPORTED_SCHEMA_VERSIONS as readonly string[]).includes(value);
}
