import { describe, expect, it } from "vitest";
import {
  CONSENT_SETTING_MEANING,
  EXPECTED_TYPICAL_EVENT_BYTES,
  OUTBOX_CAPACITY_STATEMENT,
  APPROVED_BACKEND_CEILINGS,
  BATCH_ACCEPTANCE_RULES,
  batchWithinCeilings,
  UE_BATCH_RANGE,
  UE_CONFIGURABLE_SETTINGS,
  UE_OUTBOX_DIRECTORY,
  UE_V1_CLIENT_DEFAULTS,
  batchSizeSupported,
  effectiveLimit,
  expectedEventCapacity,
  worstCaseEventCapacity,
} from "../../src/ue5/client-config";
import { HARNESS_LIMITS, UNSTATED_LIMITS, resolveLimits } from "../../src/ue5/limits";
import {
  DEFAULT_CLOCK_POLICY,
  validateEvent,
  type ValidationContext,
} from "../../src/ue5/validation";
import { serialisedBytes } from "../../src/ue5/ingestion";

/**
 * THE CONFIRMED V1 OPERATING PARAMETERS.
 *
 * Three numbers that look like one, and the whole file exists to keep them
 * apart: what the client ships as, what an operator may configure it to, and
 * what the backend absolutely refuses. Collapsing any two of those produces a
 * `413` on a legitimate setting, or a ceiling that cannot be enforced.
 *
 * And one claim that must not harden into an invariant: 50 MB is *expected* to
 * hold around fifty thousand events. At the 64 KB cap it holds eight hundred.
 */

const context: ValidationContext = {
  limits: HARNESS_LIMITS,
  acceptedSchemaVersions: { min: 1, max: 1 },
  registry: null,
  clock: DEFAULT_CLOCK_POLICY,
  now: new Date("2026-09-01T09:20:00.000Z"),
};

const event = (properties: Record<string, unknown>) => ({
  event_id: "6f1c9f6e-2c7a-4a4e-9b31-9b0f9a3f1a2b",
  event_name: "unit.viewed",
  schema_version: 1,
  occurred_at: "2026-09-01T09:14:02.881Z",
  session_id: "0c9f2d31-77a4-4b12-9e88-1f2a3b4c5d6e",
  sequence: 1,
  app: {
    version: "1.0.0",
    plugin: "0.2.0",
    build_id: "BUILD-2026-09-01",
    environment: "development",
  },
  properties,
});

describe("the confirmed defaults", () => {
  it("are the settings the UE plugin actually ships with", () => {
    expect(UE_V1_CLIENT_DEFAULTS).toEqual({
      defaultBatchEvents: 25,
      flushIntervalSeconds: 5,
      maxEventBytes: 65_536,
      maxLocalOutboxBytes: 52_428_800,
    });
    expect(UE_OUTBOX_DIRECTORY).toBe("Saved/Observer/Outbox/");
  });

  it("accepts the whole supported batch range and nothing outside it", () => {
    expect(UE_BATCH_RANGE).toEqual({ min: 25, max: 50 });
    expect(batchSizeSupported(25)).toBe(true);
    expect(batchSizeSupported(50)).toBe(true);
    expect(batchSizeSupported(37)).toBe(true);
    expect(batchSizeSupported(24)).toBe(false);
    expect(batchSizeSupported(51)).toBe(false);
    expect(batchSizeSupported(25.5)).toBe(false);
  });

  it("keeps the default inside the range it publishes", () => {
    expect(batchSizeSupported(UE_V1_CLIENT_DEFAULTS.defaultBatchEvents)).toBe(true);
  });
});

describe("the backend ceiling is a different number", () => {
  it("sits at or above the top of the client's operating range", () => {
    /*
     * The reason this is a test rather than a note: a ceiling equal to the
     * client's maximum means an operator turning a legitimate dial produces a
     * 413, and they would have no way of knowing they were allowed to.
     */
    expect(APPROVED_BACKEND_CEILINGS.maxBatchEvents).toBeGreaterThanOrEqual(UE_BATCH_RANGE.max);
  });

  it("matches the client exactly on the event cap, because a gap would help nobody", () => {
    expect(APPROVED_BACKEND_CEILINGS.maxEventBytes).toBe(UE_V1_CLIENT_DEFAULTS.maxEventBytes);
  });

  it("holds all three constraints independently, and they do not imply each other", () => {
    /*
     * THE MISREADING THIS EXISTS TO PREVENT. "200 events" and "8 MiB" are not
     * one budget expressed twice: 200 × 64 KiB is 12.5 MiB, half as much again
     * as the body ceiling allows. A batch is accepted only when the count, the
     * total bytes and every individual event size are each inside their own
     * limit.
     */
    const cap = APPROVED_BACKEND_CEILINGS;
    expect(cap.maxBatchEvents * cap.maxEventBytes).toBeGreaterThan(cap.maxBatchBytes);

    /* Within the count, over the bytes. */
    expect(batchWithinCeilings(200, cap.maxBatchBytes + 1, 1_024)).toBe(false);
    /* Within the bytes, over the count. */
    expect(batchWithinCeilings(201, 1_024, 1_024)).toBe(false);
    /* Within both, but one event is too large. */
    expect(batchWithinCeilings(2, 200_000, cap.maxEventBytes + 1)).toBe(false);
    /* All three satisfied. */
    expect(batchWithinCeilings(200, cap.maxBatchBytes, cap.maxEventBytes)).toBe(true);
  });

  it("says in words that the count ceiling does not imply the bytes are available", () => {
    const joined = BATCH_ACCEPTANCE_RULES.join(" ");
    expect(joined).toMatch(/each within their own ceiling/);
    expect(joined).toMatch(/The three are independent/);
    expect(joined).toMatch(/12\.5 MiB/);
  });

  it("does not set the batch byte ceiling to the worst-case product", () => {
    /* 200 × 64 KiB is 12.5 MB of maximal events, which no real batch resembles. */
    const worstCaseProduct =
      APPROVED_BACKEND_CEILINGS.maxBatchEvents * APPROVED_BACKEND_CEILINGS.maxEventBytes;
    expect(APPROVED_BACKEND_CEILINGS.maxBatchBytes).toBeLessThan(worstCaseProduct);
  });

  it("is what the harness enforces, so a boundary test is a contract test", () => {
    expect(HARNESS_LIMITS.maxEventBytes).toBe(APPROVED_BACKEND_CEILINGS.maxEventBytes);
    expect(HARNESS_LIMITS.maxBatchEvents).toBe(APPROVED_BACKEND_CEILINGS.maxBatchEvents);
  });
});

describe("the 64 KiB event boundary", () => {
  /*
   * Sized arithmetically rather than grown a character at a time. Every padding
   * character is one ASCII byte in the serialised form, so the overhead is
   * measurable once and the boundary is exact — and the test runs in a
   * millisecond instead of five seconds.
   */
  const OVERHEAD = serialisedBytes(event({ blob: "" }));
  const atSize = (bytes: number) => event({ blob: "x".repeat(bytes - OVERHEAD) });

  it("accepts an event of exactly the cap", () => {
    const candidate = atSize(UE_V1_CLIENT_DEFAULTS.maxEventBytes);
    expect(serialisedBytes(candidate), "the fixture really is at the boundary").toBe(
      UE_V1_CLIENT_DEFAULTS.maxEventBytes,
    );
    expect(validateEvent(candidate, context).ok, "exactly at the cap is inside it").toBe(true);
  });

  it("rejects one byte past the cap", () => {
    const candidate = atSize(UE_V1_CLIENT_DEFAULTS.maxEventBytes + 1);
    expect(serialisedBytes(candidate)).toBe(UE_V1_CLIENT_DEFAULTS.maxEventBytes + 1);
    const verdict = validateEvent(candidate, context);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.rejection.code).toBe("event_too_large");
  });
});

describe("the capacity claim, kept honest", () => {
  it("expects around fifty thousand events at typical sizes", () => {
    expect(expectedEventCapacity()).toBeGreaterThan(45_000);
    expect(EXPECTED_TYPICAL_EVENT_BYTES).toBeLessThan(UE_V1_CLIENT_DEFAULTS.maxEventBytes);
  });

  it("holds eight hundred at the cap, which is why the ceiling is bytes", () => {
    /*
     * THE POINT OF THIS FILE. A queue enforcing a fixed event count would
     * overrun its disk budget by roughly sixty times whenever events ran large —
     * which is exactly when a showroom is producing the most and can least
     * afford it.
     */
    expect(worstCaseEventCapacity()).toBe(800);
    expect(expectedEventCapacity() / worstCaseEventCapacity()).toBeGreaterThan(50);
  });

  it("describes the figure as expected rather than guaranteed", () => {
    expect(OUTBOX_CAPACITY_STATEMENT).toMatch(/not a\s+worst-case guarantee/);
    expect(OUTBOX_CAPACITY_STATEMENT).toMatch(/enforced by bytes actually used/);
    expect(OUTBOX_CAPACITY_STATEMENT).not.toMatch(/guarantees|at least 50,000/);
  });
});

describe("the stricter limit wins", () => {
  it("uses the client value when the server states nothing", () => {
    expect(effectiveLimit(50, null)).toBe(50);
  });

  it("uses the server value when it is stricter", () => {
    expect(effectiveLimit(50, 25)).toBe(25);
  });

  it("keeps the client value when the server is more permissive", () => {
    /*
     * A server saying "you may send 200" does not oblige a deployment that
     * deliberately configured 25 to start sending 200.
     */
    expect(effectiveLimit(25, 200)).toBe(25);
  });

  it("still treats a null stated limit as unstated rather than unlimited", () => {
    const resolved = resolveLimits(UNSTATED_LIMITS, HARNESS_LIMITS);
    expect(resolved).toEqual(HARNESS_LIMITS);
  });
});

describe("configuration is not a code change", () => {
  it("names every setting an operator can reach without touching C++", () => {
    for (const setting of [
      "Activation Endpoint",
      "Ingest Endpoint",
      "Batch Size",
      "Flush Interval Seconds",
      "Max Queue Disk Size MB",
      "Max Retry Attempts",
      "Consent Given",
    ]) {
      expect(UE_CONFIGURABLE_SETTINGS, setting).toContain(setting);
    }
  });
});

describe("consent is not an authorisation input", () => {
  it("is described as operational state, never as legal consent", () => {
    expect(CONSENT_SETTING_MEANING).toMatch(/Not legal consent/);
    expect(CONSENT_SETTING_MEANING).toMatch(/never a bypass/);
  });

  it("cannot be used to bypass the privacy guard", () => {
    /*
     * There is no consent field anywhere on the wire, and a payload that claims
     * one is still refused. A ticked checkbox in Project Settings is not a legal
     * basis for putting a buyer's email address in an analytics event.
     */
    const verdict = validateEvent(
      event({ consent_given: true, to: "nobody@example.invalid" }),
      context,
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.rejection.code).toBe("pii_suspected");
  });

  it("has no consent input in the validation context at all", () => {
    expect(Object.keys(context)).not.toContain("consent");
    expect(Object.keys(context)).not.toContain("consentGiven");
  });
});
