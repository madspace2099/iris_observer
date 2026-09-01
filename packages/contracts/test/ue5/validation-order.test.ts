import { describe, expect, it } from "vitest";
import {
  DEFAULT_CLOCK_POLICY,
  LOCAL_VALIDATION_ORDER,
  locallyEnforceableSteps,
  validateEvent,
  type ValidationContext,
  type ValidationStage,
} from "../../src/ue5/validation";
import { HARNESS_LIMITS } from "../../src/ue5/limits";
import { EVENT_REJECTION_CODES } from "../../src/ue5/errors";

/**
 * THE PUBLISHED VALIDATION ORDER IS THE ORDER THE VALIDATOR RUNS.
 *
 * Akhilesh is writing UE-OBS-005 against `LOCAL_VALIDATION_ORDER`, which means
 * the list is now load-bearing rather than descriptive. A prose ordering in a
 * handoff document drifts from the function that enforces it within two
 * revisions, and the drift is invisible until a showroom starts quarantining
 * events for the wrong stated reason.
 *
 * So each step is fired in turn, against an event that violates that step **and
 * every step after it**, and the published code must be the one that comes
 * back. A step that has quietly moved fails here.
 */

const NOW = new Date("2026-09-01T09:20:00.000Z");

const context: ValidationContext = {
  limits: HARNESS_LIMITS,
  acceptedSchemaVersions: { min: 1, max: 1 },
  registry: { version: 1, names: new Set(["unit.viewed"]) },
  clock: DEFAULT_CLOCK_POLICY,
  now: NOW,
};

const good = {
  event_id: "6f1c9f6e-2c7a-4a4e-9b31-9b0f9a3f1a2b",
  event_name: "unit.viewed",
  schema_version: 1,
  occurred_at: "2026-09-01T09:14:02.881Z",
  session_id: "0c9f2d31-77a4-4b12-9e88-1f2a3b4c5d6e",
  sequence: 1,
  properties: { unit_code: "A-402" } as Record<string, unknown>,
};

/**
 * Violations, worst-first. Applying step N's violation together with every
 * later one must still answer step N's code.
 */
const VIOLATIONS: ReadonlyArray<{ order: number; apply: (event: typeof good) => unknown }> = [
  {
    order: 1,
    apply: (event) => {
      let nested: unknown = "bottom";
      for (let index = 0; index < 3_000; index += 1) nested = [nested];
      return { ...event, properties: { ...event.properties, nested } };
    },
  },
  {
    order: 2,
    apply: (event) => ({
      ...event,
      properties: { ...event.properties, blob: "x".repeat(HARNESS_LIMITS.maxEventBytes) },
    }),
  },
  { order: 3, apply: (event) => ({ ...event, event_name: "NOT A NAME" }) },
  { order: 4, apply: (event) => ({ ...event, sequence: null }) },
  { order: 5, apply: (event) => ({ ...event, schema_version: 7 }) },
  {
    order: 6,
    apply: (event) => ({
      ...event,
      /*
       * Spread rather than replace. Replacing wiped out the violations injected
       * by the earlier steps, so steps 1 and 2 fell through to the envelope
       * check and this test reported the wrong winner — which is precisely the
       * class of mistake it exists to catch, caught on itself.
       */
      properties: {
        ...event.properties,
        ...Object.fromEntries(
          Array.from({ length: HARNESS_LIMITS.maxPropertyCount + 1 }, (_, i) => [`k${i}`, i]),
        ),
      },
    }),
  },
  {
    order: 7,
    apply: (event) => ({
      ...event,
      properties: { ...event.properties, project_id: "prj_hostile" },
    }),
  },
  {
    order: 8,
    apply: (event) => ({
      ...event,
      properties: { ...event.properties, to: "nobody@example.invalid" },
    }),
  },
  { order: 9, apply: (event) => ({ ...event, event_name: "something.invented" }) },
];

describe("the published order is well formed", () => {
  it("numbers every step once, in sequence", () => {
    expect(LOCAL_VALIDATION_ORDER.map((step) => step.order)).toEqual(
      LOCAL_VALIDATION_ORDER.map((_, index) => index + 1),
    );
  });

  it("names only rejection codes the contract defines", () => {
    for (const step of LOCAL_VALIDATION_ORDER) {
      expect(EVENT_REJECTION_CODES, step.name).toContain(step.rejection);
    }
  });

  it("says what each step checks, in words a plugin author can act on", () => {
    for (const step of LOCAL_VALIDATION_ORDER) {
      expect(step.checks.length, step.name).toBeGreaterThan(0);
      expect(step.note.length, step.name).toBeGreaterThan(30);
    }
  });

  it("groups the stages contiguously, so they can be two passes", () => {
    /*
     * UE-OBS-005 is a structural validator and a privacy guard. If the stages
     * interleaved, it would have to be one checklist instead, and the split the
     * handoff describes would be fiction.
     */
    const stages = LOCAL_VALIDATION_ORDER.map((step) => step.stage);
    const firstOf = (stage: ValidationStage) => stages.indexOf(stage);
    const lastOf = (stage: ValidationStage) => stages.lastIndexOf(stage);
    expect(lastOf("structural")).toBeLessThan(firstOf("privacy"));
    expect(lastOf("privacy")).toBeLessThan(firstOf("semantic"));
  });

  it("marks the two server-only steps as not locally enforceable", () => {
    /*
     * A plugin holds neither the registry nor server time. One that guessed at
     * either would quarantine perfectly good events on its own authority.
     */
    const remote = LOCAL_VALIDATION_ORDER.filter((step) => !step.local);
    expect(remote.map((step) => step.name)).toEqual(["event registry", "clock window"]);
    expect(locallyEnforceableSteps()).toHaveLength(LOCAL_VALIDATION_ORDER.length - 2);
    for (const step of locallyEnforceableSteps()) expect(step.stage).not.toBe("semantic");
  });
});

describe("the validator runs the order it publishes", () => {
  it("accepts the baseline, so every failure below is the injected one", () => {
    expect(validateEvent(good, context).ok).toBe(true);
  });

  for (const violation of VIOLATIONS) {
    const step = LOCAL_VALIDATION_ORDER[violation.order - 1];
    it(`step ${violation.order} (${step?.name}) wins over every later step`, () => {
      /* Apply this violation and all the ones after it, then expect this code. */
      let event: unknown = good;
      for (const later of VIOLATIONS) {
        if (later.order >= violation.order) event = later.apply(event as typeof good);
      }
      const verdict = validateEvent(event, context);
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) expect(verdict.rejection.code).toBe(step?.rejection);
    });
  }
});
