import { describe, expect, it } from "vitest";
import { FACT_IDS, isFactId } from "@observer/contracts";
import {
  ALL_METRICS,
  JOURNEY_ATTRIBUTION,
  getMetric,
  metricsForRole,
  metricsRequiringFact,
  requiredFacts,
  validateRegistry,
} from "../src/index.js";

describe("metric registry", () => {
  it("is structurally valid and free of duplicate ids", () => {
    expect(validateRegistry()).toEqual([]);
  });

  it("declares every metric the journey brief requires", () => {
    const required = [
      "webiris.anonymous_visitors",
      "webiris.identified_leads",
      "webiris.visitor_to_lead",
      "journey.lead_to_booking",
      "journey.meeting_attendance_rate",
      "journey.webiris_to_showroom",
      "journey.lead_to_attendance_days",
      "journey.online_to_offer",
      "journey.online_to_reservation",
      "journey.online_to_purchase",
      "journey.conversion_by_online_segment",
      "journey.preference_agreement",
      "journey.common_path",
      "journey.cross_channel_completeness",
      "journey.unmatched_contacts",
      "journey.unmatched_meetings",
    ];
    for (const id of required) {
      expect(getMetric(id), `${id} must be declared`).toBeDefined();
    }
  });

  it("only depends on facts that exist in the taxonomy", () => {
    for (const metric of ALL_METRICS) {
      for (const fact of metric.requiredFacts) {
        expect(isFactId(fact), `${metric.id} requires unknown fact ${fact}`).toBe(true);
      }
    }
  });

  it("never claims causation", () => {
    for (const metric of ALL_METRICS) {
      expect(metric.evidenceTier).not.toBe("causal_claim");
    }
  });

  it("states an attribution rule exactly when it attributes", () => {
    for (const metric of ALL_METRICS) {
      const attributed = metric.evidenceTier === "attributed_conversion";
      expect(metric.attribution !== undefined, `${metric.id}`).toBe(attributed);
    }
  });

  it("uses one shared attribution rule, so attributed metrics stay comparable", () => {
    const attributed = ALL_METRICS.filter((m) => m.attribution !== undefined);
    expect(attributed.length).toBeGreaterThan(1);
    for (const metric of attributed) {
      expect(metric.attribution).toEqual(JOURNEY_ATTRIBUTION);
    }
  });

  it("gives every ratio a denominator", () => {
    for (const metric of ALL_METRICS) {
      if (metric.kind === "ratio") {
        expect(metric.denominator, `${metric.id} is a ratio without a denominator`).not.toBeNull();
      }
    }
  });

  it("gives every metric all three states and a drill-down", () => {
    for (const metric of ALL_METRICS) {
      expect(metric.states.empty.length).toBeGreaterThan(0);
      expect(metric.states.insufficient.length).toBeGreaterThan(0);
      expect(metric.states.unavailable.length).toBeGreaterThan(0);
      expect(metric.drillTo.length).toBeGreaterThan(0);
    }
  });

  it("scopes agent-visible metrics away from cross-agency comparison", () => {
    // A sales agent must not be handed agency-wide conversion league tables.
    const agentMetrics = metricsForRole("sales_agent").map((m) => m.id);
    expect(agentMetrics).not.toContain("journey.webiris_to_showroom");
    expect(agentMetrics).not.toContain("journey.online_to_purchase");
  });

  it("can report which metrics a missing fact would break", () => {
    const breaks = metricsRequiringFact("lead.submitted").map((m) => m.id);
    expect(breaks).toContain("webiris.visitor_to_lead");
    expect(breaks).toContain("journey.webiris_to_showroom");
  });

  it("derives the instrumentation backlog from the registry", () => {
    const facts = requiredFacts();
    expect(facts.length).toBeGreaterThan(0);
    expect(new Set(facts).size).toBe(facts.length);
    expect(facts.every((f) => (FACT_IDS as readonly string[]).includes(f))).toBe(true);
  });
});
