import { describe, expect, it } from "vitest";
import { DEFAULT_CLOCK_POLICY, HARNESS_LIMITS, validateEvent } from "@observer/contracts/ue5";

import { walkScopes, type Ue5EventRow } from "../src/ue5-events";

/**
 * THE WALK EVENTS, AND THE CAPTURE THAT NAMES A UNIT.
 *
 * `walk.entered` (optional `context_unit_id`) and `walk.exited` (`duration_ms`,
 * measured on the device) are live in the showroom, translated and tested on
 * the UE5 side (Akhilesh, 2026-09-30). Expected values are written out by hand
 * from the streams below, never computed with the helper under test.
 */

const SESSION = "7a1c9f6e-2c7a-4a4e-9b31-0000000000bb";
const OTHER = "7a1c9f6e-2c7a-4a4e-9b31-0000000000cc";

let sequence = 0;
function at(
  clock: string,
  name: string,
  properties: Record<string, unknown> = {},
  session: string = SESSION,
): Ue5EventRow {
  sequence += 1;
  return {
    event_name: name,
    occurred_at: `2026-09-30T${clock}.000Z`,
    session_id: session,
    sequence,
    agent_id: null,
    entity_type: null,
    entity_id: null,
    properties,
  };
}

describe("the wire takes both events as they are sent", () => {
  /*
   * The contract holds no event catalogue (ADR-0013): with no registry any
   * well-formed name is accepted. These fix that the two names and their
   * properties, as the showroom sends them, pass the real validation.
   */
  const context = {
    limits: HARNESS_LIMITS,
    acceptedSchemaVersions: { min: 1, max: 1 },
    registry: null,
    clock: DEFAULT_CLOCK_POLICY,
    now: new Date("2026-09-30T10:05:00.000Z"),
  };
  const envelope = (event_name: string, properties: Record<string, unknown>) => ({
    event_id: "6f1c9f6e-2c7a-4a4e-9b31-9b0f9a3f1a2c",
    event_name,
    schema_version: 1,
    occurred_at: "2026-09-30T10:00:00.000Z",
    session_id: SESSION,
    sequence: 1,
    app: {
      version: "1.0.0",
      plugin: "0.3.0",
      build_id: "BUILD-2026-09-30",
      environment: "production",
    },
    properties,
  });

  it("walk.entered, with and without the unit it starts from", () => {
    expect(validateEvent(envelope("walk.entered", {}), context).ok).toBe(true);
    expect(validateEvent(envelope("walk.entered", { context_unit_id: "A-204" }), context).ok).toBe(
      true,
    );
  });

  it("walk.exited, with the device's duration as a number or as the plugin's string", () => {
    expect(validateEvent(envelope("walk.exited", { duration_ms: 42000 }), context).ok).toBe(true);
    expect(validateEvent(envelope("walk.exited", { duration_ms: "42000" }), context).ok).toBe(true);
  });
});

describe("walks fold into scopes by the showroom's own rule", () => {
  it("exited carries the device's measure; a second entered closes the first; session.ended closes the last", () => {
    sequence = 0;
    const scopes = walkScopes([
      at("10:00:00", "session.started"),
      at("10:01:00", "walk.entered", { context_unit_id: "A-204" }),
      at("10:01:42", "walk.exited", { duration_ms: "42000" }),
      at("10:02:00", "walk.entered"),
      at("10:03:00", "walk.entered", { context_unit_id: "B-101" }),
      at("10:04:00", "session.ended"),
    ]);
    expect(scopes).toEqual([
      {
        sessionId: SESSION,
        enteredAt: "2026-09-30T10:01:00.000Z",
        contextUnitId: "A-204",
        closedBy: "walk.exited",
        closedAt: "2026-09-30T10:01:42.000Z",
        durationMs: 42000,
      },
      {
        sessionId: SESSION,
        enteredAt: "2026-09-30T10:02:00.000Z",
        contextUnitId: null,
        closedBy: "walk.entered",
        closedAt: "2026-09-30T10:03:00.000Z",
        durationMs: null,
      },
      {
        sessionId: SESSION,
        enteredAt: "2026-09-30T10:03:00.000Z",
        contextUnitId: "B-101",
        closedBy: "session.ended",
        closedAt: "2026-09-30T10:04:00.000Z",
        durationMs: null,
      },
    ]);
  });

  it("drops an exit with no walk open, and keeps a walk the stream never closed as unclosed", () => {
    sequence = 0;
    const scopes = walkScopes([
      at("10:00:00", "walk.exited", { duration_ms: 5000 }),
      at("10:00:10", "walk.entered"),
    ]);
    expect(scopes).toEqual([
      {
        sessionId: SESSION,
        enteredAt: "2026-09-30T10:00:10.000Z",
        contextUnitId: null,
        closedBy: "unclosed",
        closedAt: null,
        durationMs: null,
      },
    ]);
  });

  it("keeps sessions apart: an entered in one session does not close a walk in another", () => {
    sequence = 0;
    const scopes = walkScopes([
      at("10:00:00", "walk.entered", {}, SESSION),
      at("10:00:05", "walk.entered", {}, OTHER),
      at("10:00:30", "walk.exited", { duration_ms: 30000 }, SESSION),
      at("10:00:40", "walk.exited", { duration_ms: 35000 }, OTHER),
    ]);
    expect(scopes.map((s) => [s.sessionId, s.closedBy, s.durationMs])).toEqual([
      [SESSION, "walk.exited", 30000],
      [OTHER, "walk.exited", 35000],
    ]);
  });
});
