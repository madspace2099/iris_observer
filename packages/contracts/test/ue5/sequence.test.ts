import { describe, expect, it } from "vitest";
import { EventEnvelopeSchema, SESSION_SEQUENCE_RULES } from "../../src/ue5/ingestion";
import {
  DEFAULT_CLOCK_POLICY,
  validateEvent,
  type ValidationContext,
} from "../../src/ue5/validation";
import { HARNESS_LIMITS } from "../../src/ue5/limits";

/**
 * THE SESSION SEQUENCE CONTRACT — approved, and defended negatively.
 *
 * `StartSession()` mints a fresh `session_id` and resets the counter; the first
 * emitted event carries `1`; stamping is central; Blueprint callers cannot reach
 * it. Confirmed on the UE side, approved as `PD-04`, no longer a proposal.
 *
 * Almost every test here is a **negative** one, because the positive case was
 * never in doubt. What can go wrong is an off-by-one at session start, a caller
 * inventing its own ordering in `properties`, or a session event arriving with
 * nothing to order it by — and each of those is silent unless something refuses
 * it.
 */

const SESSION = "0c9f2d31-77a4-4b12-9e88-1f2a3b4c5d6e";

const event = (over: Record<string, unknown> = {}) => ({
  event_id: "6f1c9f6e-2c7a-4a4e-9b31-9b0f9a3f1a2b",
  event_name: "unit.viewed",
  schema_version: 1,
  occurred_at: "2026-09-01T09:14:02.881Z",
  session_id: SESSION,
  sequence: 1,
  app: {
    version: "1.0.0",
    plugin: "0.2.0",
    build_id: "BUILD-2026-09-01",
    environment: "development",
  },
  properties: {} as Record<string, unknown>,
  ...over,
});

const context: ValidationContext = {
  limits: HARNESS_LIMITS,
  acceptedSchemaVersions: { min: 1, max: 1 },
  registry: null,
  clock: DEFAULT_CLOCK_POLICY,
  now: new Date("2026-09-01T09:20:00.000Z"),
};

function reject(raw: unknown): string {
  const verdict = validateEvent(raw, context);
  if (verdict.ok) throw new Error("expected a rejection");
  return verdict.rejection.code;
}

describe("the published rules", () => {
  it("state the reset, the first value, and who may set it", () => {
    const joined = SESSION_SEQUENCE_RULES.join(" ");
    expect(joined).toMatch(/StartSession\(\) creates a fresh session_id and resets/);
    expect(joined).toMatch(/first event of a session carries sequence = 1/);
    expect(joined).toMatch(/Blueprint callers cannot supply or override/);
    expect(joined).toMatch(/sequence = 0 never represents a real emitted session event/);
  });

  it("warns that arrival order is not sequence order", () => {
    /*
     * A durable outbox delivers late and out of order — that is what makes it
     * durable. A server that assumed otherwise would be wrong on the first
     * reconnection after an outage, which is the busiest moment it will see.
     */
    expect(SESSION_SEQUENCE_RULES.join(" ")).toMatch(/Arrival order is not sequence order/);
  });
});

describe("a session event", () => {
  it("accepts the first event of a session at 1", () => {
    expect(validateEvent(event({ sequence: 1 }), context).ok).toBe(true);
  });

  it("accepts a monotonically increasing run", () => {
    for (const sequence of [1, 2, 3, 17, 1_000, 2_147_483_647]) {
      expect(validateEvent(event({ sequence }), context).ok, String(sequence)).toBe(true);
    }
  });

  it("refuses a session event with no sequence at all", () => {
    expect(reject(event({ sequence: null }))).toBe("malformed_event");
  });

  it("refuses sequence 0, which means the counter was read before it moved", () => {
    /*
     * The reset leaves the counter at zero and the first event is one, so a zero
     * on the wire is an off-by-one. Accepting it would sort that event ahead of
     * every genuine event in its session, permanently, and nothing downstream
     * could detect it.
     */
    expect(EventEnvelopeSchema.safeParse(event({ sequence: 0 })).success).toBe(false);
    expect(reject(event({ sequence: 0 }))).toBe("malformed_event");
  });

  it("refuses a negative or fractional sequence", () => {
    expect(reject(event({ sequence: -1 }))).toBe("malformed_event");
    expect(reject(event({ sequence: 1.5 }))).toBe("malformed_event");
  });
});

describe("a non-session event", () => {
  it("carries no sequence", () => {
    expect(validateEvent(event({ session_id: null, sequence: null }), context).ok).toBe(true);
  });

  it("may not invent sequence 0 to fill the gap", () => {
    /*
     * The tempting wrong answer: an event with no session still needs *a* value,
     * so use zero. It then sorts alongside real session events in any query that
     * forgets to filter on session, and it looks like the beginning of one.
     */
    expect(reject(event({ session_id: null, sequence: 0 }))).toBe("malformed_event");
  });

  it("may not carry a sequence at all", () => {
    expect(reject(event({ session_id: null, sequence: 4 }))).toBe("malformed_event");
  });
});

describe("a caller cannot build a second ordering", () => {
  it("refuses a sequence smuggled into properties", () => {
    /*
     * The subsystem owns the envelope's `sequence` and a Blueprint cannot reach
     * it — that is the UE-side guarantee. Nothing stopped a caller putting its
     * own `sequence` in `properties` and building an unauthoritative ordering
     * beside the real one, leaving a read model with two answers to the same
     * question and no way to know which was meant.
     */
    expect(reject(event({ properties: { sequence: 99 } }))).toBe("reserved_property");
  });

  it("refuses any property that shadows an envelope field", () => {
    for (const key of [
      "event_id",
      "event_name",
      "schema_version",
      "occurred_at",
      "session_id",
      "sequence",
    ]) {
      expect(reject(event({ properties: { [key]: "anything" } })), key).toBe("reserved_property");
    }
  });

  it("refuses the camelCase spelling of the same shadow", () => {
    expect(reject(event({ properties: { sessionId: SESSION } }))).toBe("reserved_property");
    expect(reject(event({ properties: { schemaVersion: 2 } }))).toBe("reserved_property");
  });

  it("still allows a differently named ordering of the caller's own", () => {
    /* `step_index` is a better name for a tour step than `sequence` anyway. */
    expect(validateEvent(event({ properties: { step_index: 3 } }), context).ok).toBe(true);
  });
});
