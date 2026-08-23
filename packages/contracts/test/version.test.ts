import { describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS,
  isSupportedSchemaVersion,
} from "../src/index.js";

describe("schema version", () => {
  it("declares the current version as supported", () => {
    expect(isSupportedSchemaVersion(SCHEMA_VERSION)).toBe(true);
  });

  it("rejects a version the server does not know", () => {
    expect(isSupportedSchemaVersion("0.9.0")).toBe(false);
  });

  it("keeps the supported list sorted oldest first", () => {
    const sorted = [...SUPPORTED_SCHEMA_VERSIONS].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
    expect([...SUPPORTED_SCHEMA_VERSIONS]).toEqual(sorted);
  });
});
