import { describe, expect, it } from "vitest";
import { FACTS, FACT_IDS, factsProducibleBy, getFact, isFactId } from "../src/observables.js";
import { SOURCE_SYSTEMS } from "../src/sources.js";

describe("observable fact taxonomy", () => {
  it("keys and ids agree", () => {
    for (const id of FACT_IDS) {
      expect(getFact(id).id).toBe(id);
    }
  });

  it("names an owner that can produce the fact, or Observer as the reconciler", () => {
    for (const id of FACT_IDS) {
      const fact = getFact(id);
      const ownerProduces = (fact.producibleBy as readonly string[]).includes(fact.owner);
      const reconciledByObserver = fact.owner === "observer";
      expect(
        ownerProduces || reconciledByObserver,
        `${id}: owner ${fact.owner} neither produces the fact nor reconciles it`,
      ).toBe(true);
    }
  });

  it("only names Observer as owner where more than one channel produces the fact", () => {
    // Observer owns a fact when it has to reconcile two channels into one.
    // A single-producer fact belongs to its producer; calling it ours would
    // hide who is actually accountable for the data.
    for (const id of FACT_IDS) {
      const fact = getFact(id);
      if (fact.owner === "observer" && fact.producibleBy.length === 1) {
        expect(fact.producibleBy[0], `${id} has one producer, so that producer owns it`).toBe(
          "observer",
        );
      }
    }
  });

  it("uses only known source systems", () => {
    for (const id of FACT_IDS) {
      const fact = getFact(id);
      for (const system of fact.producibleBy) {
        expect(SOURCE_SYSTEMS as readonly string[]).toContain(system);
      }
    }
  });

  it("gives every fact required attributes and a timestamp to order it by", () => {
    for (const id of FACT_IDS) {
      const fact = getFact(id);
      expect(fact.required.length, `${id} has no required attributes`).toBeGreaterThan(0);
      const hasTime = fact.required.some((a) => a.endsWith("_at"));
      expect(hasTime, `${id} has no timestamp, so it cannot be placed on a timeline`).toBe(true);
    }
  });

  it("states the product question each fact answers", () => {
    for (const id of FACT_IDS) {
      expect(getFact(id).question.endsWith("?"), `${id}: question must be a question`).toBe(true);
    }
  });

  it("contains no wire event names — facts are not events", () => {
    // Event names carry a verb in the past tense at the wire level and are
    // owned by the later event catalogue. Facts must stay source-neutral, so
    // none of them may name a producer system inside the id.
    for (const id of FACT_IDS) {
      expect(id).not.toMatch(/^(webiris|showroom|ue5|crm)\./);
    }
  });

  it("treats cross-channel interest as one fact, not two", () => {
    const viewed = getFact("unit.viewed");
    expect(viewed.producibleBy).toEqual(expect.arrayContaining(["webiris", "showroom"]));
  });

  it("reports what a source system is expected to supply", () => {
    const showroom = factsProducibleBy("showroom").map((f) => f.id);
    expect(showroom).toContain("meeting.attended");
    expect(showroom).toContain("unit.examined.balcony");
    expect(showroom).not.toContain("online.session.observed");
  });

  it("rejects unknown fact ids", () => {
    expect(isFactId("unit.viewed")).toBe(true);
    expect(isFactId("unit.teleported")).toBe(false);
  });

  it("keeps anonymous-capable facts genuinely anonymous", () => {
    // Attendance must work for a walk-in who declines to give details.
    expect(FACTS["meeting.attended"].identity).toBe("anonymous_ok");
    // A share is a message to a person, so it cannot be anonymous.
    expect(FACTS["unit.shared"].identity).toBe("requires_contact");
  });
});
