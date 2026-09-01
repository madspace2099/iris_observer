import { describe, expect, it } from "vitest";
import { HARNESS_LIMITS, UNSTATED_LIMITS, resolveLimits } from "../../src/ue5/limits";
import {
  DEFAULT_CLOCK_POLICY,
  validateEvent,
  type ValidationContext,
} from "../../src/ue5/validation";
import { DIAGNOSTIC_TEST_EVENT, isDiagnosticEvent } from "../../src/ue5/diagnostic";
import { depthOf, serialisedBytes, widestObject } from "../../src/ue5/ingestion";

/**
 * THE VALIDATION BOUNDARY, INCLUDING THE HOSTILE CASES.
 *
 * Three groups here earn their place. The **limits** group covers the shapes a
 * fuzzer finds and a reviewer does not: a kilobyte of nesting, an object with
 * ten thousand keys. The **clock** group proves that the undecided policy
 * (OPEN-3) really is undecided — the default accepts and flags, and rejection is
 * something a deployment has to switch on deliberately. The **order** group
 * proves the one deliberate exception in the check sequence.
 */

const base = {
  event_id: "6f1c9f6e-2c7a-4a4e-9b31-9b0f9a3f1a2b",
  event_name: "unit.viewed",
  schema_version: 1,
  occurred_at: "2026-09-01T09:14:02.881Z",
  session_id: "0c9f2d31-77a4-4b12-9e88-1f2a3b4c5d6e",
  sequence: 1,
  properties: { unit_code: "A-402" } as Record<string, unknown>,
};

const NOW = new Date("2026-09-01T09:20:00.000Z");

const context: ValidationContext = {
  limits: HARNESS_LIMITS,
  acceptedSchemaVersions: { min: 1, max: 1 },
  registry: null,
  clock: DEFAULT_CLOCK_POLICY,
  now: NOW,
};

function reject(raw: unknown, over: Partial<ValidationContext> = {}): string {
  const verdict = validateEvent(raw, { ...context, ...over });
  if (verdict.ok) throw new Error("expected a rejection");
  return verdict.rejection.code;
}

describe("the ordinary case", () => {
  it("accepts a well-formed event", () => {
    const verdict = validateEvent(base, context);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.warnings).toEqual([]);
  });

  it("requires session and sequence to travel together", () => {
    expect(reject({ ...base, sequence: null })).toBe("malformed_event");
    expect(reject({ ...base, session_id: null })).toBe("malformed_event");
    const verdict = validateEvent({ ...base, session_id: null, sequence: null }, context);
    expect(verdict.ok).toBe(true);
  });
});

describe("limits", () => {
  it("refuses an event past the byte ceiling", () => {
    const huge = { ...base, properties: { blob: "x".repeat(HARNESS_LIMITS.maxEventBytes) } };
    expect(reject(huge)).toBe("event_too_large");
  });

  it("refuses deeply nested properties without overflowing the stack", () => {
    /*
     * The cheapest denial of service in any JSON API: a kilobyte of brackets.
     *
     * This case caught a real defect. The size check ran first, and
     * `JSON.stringify` recurses — so the guard against a hostile payload was
     * itself crashed by one, with a `RangeError` instead of a rejection. The
     * iterative depth walk now runs first and makes everything after it safe.
     */
    let nested: unknown = "bottom";
    for (let index = 0; index < 5_000; index += 1) nested = [nested];
    expect(() => reject({ ...base, properties: { nested } })).not.toThrow();
    expect(reject({ ...base, properties: { nested } })).toBe("event_too_large");
  });

  it("terminates on a cycle instead of following it", () => {
    /*
     * A cycle cannot arrive over a JSON wire, but it can reach an in-process
     * caller — UE-OBS-005 validating locally before queueing, for instance. To a
     * depth walk a cycle is simply unbounded nesting, and it is refused the same
     * way and for the same reason. What matters is that it returns.
     */
    const cyclic: Record<string, unknown> = { unit_code: "A-402" };
    cyclic["self"] = cyclic;
    expect(reject({ ...base, properties: cyclic })).toBe("event_too_large");
  });

  it("refuses a value JSON cannot represent, rather than throwing on it", () => {
    /* Shallow, so it reaches the serialiser — where `JSON.stringify` throws. */
    expect(reject({ ...base, properties: { count: 10n } })).toBe("malformed_event");
  });

  it("refuses an object with more keys than the ceiling allows", () => {
    const wide = Object.fromEntries(
      Array.from({ length: HARNESS_LIMITS.maxPropertyCount + 1 }, (_, i) => [`k${i}`, i]),
    );
    expect(reject({ ...base, properties: wide })).toBe("event_too_large");
  });

  it("measures depth and breadth the way the ceilings assume", () => {
    expect(depthOf("scalar")).toBe(1);
    expect(depthOf({ a: { b: { c: 1 } } })).toBe(4);
    expect(depthOf([[[1]]])).toBe(4);
    expect(widestObject({ a: 1, b: { c: 1, d: 1, e: 1 } })).toBe(3);
  });

  it("counts UTF-8 bytes rather than characters", () => {
    /* A budget in characters is a budget a Hungarian payload silently doubles. */
    expect(serialisedBytes("ab")).toBe(4);
    expect(serialisedBytes("á")).toBe(4);
    expect(serialisedBytes("😀")).toBeGreaterThan(4);
  });

  it("states no limits at all in this candidate", () => {
    /* OPEN-12. A number arriving here must arrive in the register too. */
    for (const value of Object.values(UNSTATED_LIMITS)) expect(value).toBeNull();
  });

  it("falls back to the harness ceilings when the server states nothing", () => {
    expect(resolveLimits(UNSTATED_LIMITS, HARNESS_LIMITS)).toEqual(HARNESS_LIMITS);
  });

  it("lets a stated server value beat the client default", () => {
    const resolved = resolveLimits({ ...UNSTATED_LIMITS, max_batch_events: 25 }, HARNESS_LIMITS);
    expect(resolved.maxBatchEvents).toBe(25);
    expect(resolved.maxEventBytes).toBe(HARNESS_LIMITS.maxEventBytes);
  });
});

describe("schema versions", () => {
  it("refuses a version outside the accepted range", () => {
    expect(reject({ ...base, schema_version: 2 })).toBe("unsupported_version");
    expect(
      reject({ ...base, schema_version: 9 }, { acceptedSchemaVersions: { min: 2, max: 4 } }),
    ).toBe("unsupported_version");
  });

  it("accepts anything inside it", () => {
    const verdict = validateEvent(
      { ...base, schema_version: 3 },
      { ...context, acceptedSchemaVersions: { min: 1, max: 4 } },
    );
    expect(verdict.ok).toBe(true);
  });
});

describe("the registry", () => {
  const registry = { version: 1, names: new Set(["unit.viewed", "section.entered"]) };

  it("accepts any well-formed name while no registry exists", () => {
    /* The true state today. ADR-0013 defers the catalogue; this records it. */
    expect(validateEvent({ ...base, event_name: "something.invented" }, context).ok).toBe(true);
  });

  it("refuses an unregistered name once a registry does exist", () => {
    expect(reject({ ...base, event_name: "something.invented" }, { registry })).toBe(
      "schema_unknown",
    );
    expect(validateEvent(base, { ...context, registry }).ok).toBe(true);
  });

  it("always knows the diagnostic event, registry or not", () => {
    const diagnostic = {
      ...base,
      event_name: DIAGNOSTIC_TEST_EVENT,
      properties: { reason: "activation_check", note: null },
    };
    expect(validateEvent(diagnostic, { ...context, registry }).ok).toBe(true);
    expect(isDiagnosticEvent(DIAGNOSTIC_TEST_EVENT)).toBe(true);
  });

  it("refuses an invented name inside the reserved diagnostic namespace", () => {
    expect(reject({ ...base, event_name: "diagnostic.something_else" }, { registry })).toBe(
      "schema_unknown",
    );
  });
});

describe("the clock, which is deliberately undecided", () => {
  it("accepts and flags rather than rejecting, by default", () => {
    /*
     * OPEN-3. A rejecting window is the option that can lose a genuinely offline
     * showroom's whole backlog to a clock rule rather than a data problem, so a
     * reference implementation must not adopt one before anybody has chosen it.
     */
    const ancient = { ...base, occurred_at: "2026-06-01T09:00:00.000Z" };
    const verdict = validateEvent(ancient, context);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.warnings.map((w) => w.code)).toContain("late_arrival");
  });

  it("flags a clock that is ahead of the server", () => {
    const future = { ...base, occurred_at: "2026-09-02T09:00:00.000Z" };
    const verdict = validateEvent(future, context);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.warnings.map((w) => w.code)).toContain("future_skew");
  });

  it("rejects only when a deployment switches rejection on", () => {
    const policy = { kind: "reject_outside", maxFutureMs: 300_000, maxPastMs: null } as const;
    expect(reject({ ...base, occurred_at: "2026-09-02T09:00:00.000Z" }, { clock: policy })).toBe(
      "clock_out_of_range",
    );
    /* A null past bound means an offline backlog is still welcome. */
    expect(
      validateEvent(
        { ...base, occurred_at: "2026-06-01T09:00:00.000Z" },
        { ...context, clock: policy },
      ).ok,
    ).toBe(true);
  });

  it("never corrects the timestamp it was given", () => {
    const verdict = validateEvent({ ...base, occurred_at: "2026-06-01T09:00:00.000Z" }, context);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.event.occurred_at).toBe("2026-06-01T09:00:00.000Z");
  });
});

describe("the order of the checks", () => {
  it("reports forbidden content ahead of an unregistered name", () => {
    /*
     * The one deliberate exception. Both are true of this event; the registry
     * problem is a configuration mistake, and the other one is an email address
     * somewhere it must never be. The operator needs to be told about the second.
     */
    const registry = { version: 1, names: new Set(["unit.viewed"]) };
    expect(
      reject(
        {
          ...base,
          event_name: "share.sent",
          properties: { to: "nobody@example.invalid" },
        },
        { registry },
      ),
    ).toBe("pii_suspected");
  });

  it("reports a reserved key ahead of forbidden content", () => {
    /* Identity creep is a structural defect; content is a payload defect. */
    expect(
      reject({ ...base, properties: { project_id: "prj_x", to: "nobody@example.invalid" } }),
    ).toBe("reserved_property");
  });

  it("reports size ahead of everything, because it costs nothing to check", () => {
    const huge = {
      ...base,
      event_name: "NOT VALID",
      properties: { blob: "x".repeat(HARNESS_LIMITS.maxEventBytes) },
    };
    expect(reject(huge)).toBe("event_too_large");
  });
});
