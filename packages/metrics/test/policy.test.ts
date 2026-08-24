import { describe, expect, it } from "vitest";
import {
  DEFAULT_ATTRIBUTION_POLICY,
  DEFAULT_DWELL_POLICY,
  POLICY_AUTHORITY,
  comparisonRefusalReason,
  isMeaningfulDwell,
  meaningfulDwellThresholdMs,
  policiesComparable,
} from "../src/policy.js";

describe("attribution policy", () => {
  it("defaults to a 90-day window on deterministic links only", () => {
    expect(DEFAULT_ATTRIBUTION_POLICY.windowDays).toBe(90);
    expect(DEFAULT_ATTRIBUTION_POLICY.qualifyingLink).toBe("deterministic_only");
    expect(DEFAULT_ATTRIBUTION_POLICY.touchModel).toBe("both_reported");
  });

  it("is versioned and dated, so a change cannot pass unnoticed", () => {
    expect(DEFAULT_ATTRIBUTION_POLICY.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(Date.parse(DEFAULT_ATTRIBUTION_POLICY.effectiveFrom)).not.toBeNaN();
  });

  it("is changeable only by MADSPACE, never by a dashboard user", () => {
    expect(POLICY_AUTHORITY).toBe("madspace_admin");
  });

  it("keeps direct bookings in their own bucket", () => {
    expect(DEFAULT_ATTRIBUTION_POLICY.directBookingTreatment).toBe("separate_bucket");
  });

  it("refuses to compare across a changed window", () => {
    const wider = { ...DEFAULT_ATTRIBUTION_POLICY, version: "2.0.0", windowDays: 120 };
    expect(policiesComparable(DEFAULT_ATTRIBUTION_POLICY, wider)).toBe(false);
    expect(comparisonRefusalReason(DEFAULT_ATTRIBUTION_POLICY, wider)).toContain("90");
  });

  it("refuses to compare across a changed qualifying link", () => {
    const looser = {
      ...DEFAULT_ATTRIBUTION_POLICY,
      version: "2.0.0",
      qualifyingLink: "deterministic_or_verified" as const,
    };
    expect(comparisonRefusalReason(DEFAULT_ATTRIBUTION_POLICY, looser)).toContain("link");
  });

  it("allows comparison when only presentation changed", () => {
    const presentational = {
      ...DEFAULT_ATTRIBUTION_POLICY,
      version: "1.1.0",
      touchModel: "first_touch" as const,
    };
    expect(policiesComparable(DEFAULT_ATTRIBUTION_POLICY, presentational)).toBe(true);
    expect(comparisonRefusalReason(DEFAULT_ATTRIBUTION_POLICY, presentational)).toBeNull();
  });
});

describe("meaningful dwell", () => {
  it("uses a lower threshold online than in the showroom", () => {
    // Online a buyer dismisses quickly and alone; in the showroom an agent is
    // talking over the screen, so a unit stays up longer before it means much.
    expect(meaningfulDwellThresholdMs("webiris")).toBe(10_000);
    expect(meaningfulDwellThresholdMs("showroom")).toBe(15_000);
    expect(meaningfulDwellThresholdMs("webiris")).toBeLessThan(
      meaningfulDwellThresholdMs("showroom"),
    );
  });

  it("counts a view that clears the threshold", () => {
    expect(isMeaningfulDwell(12_000, "webiris", "active_foreground")).toBe(true);
  });

  it("does not count a view below the threshold", () => {
    expect(isMeaningfulDwell(12_000, "showroom", "active_foreground")).toBe(false);
  });

  it("refuses to threshold a duration it cannot trust", () => {
    // Twelve seconds of ungated wall clock is not twelve seconds of attention.
    expect(isMeaningfulDwell(12_000, "webiris", "elapsed_wall_clock")).toBe(false);
    expect(isMeaningfulDwell(999_000, "webiris", "occurrence_only")).toBe(false);
  });

  it("treats an absent duration as not meaningful rather than as zero", () => {
    expect(isMeaningfulDwell(null, "webiris", "active_foreground")).toBe(false);
  });

  it("names what must never count as active time", () => {
    expect(DEFAULT_DWELL_POLICY.excludes.join(" ")).toContain("idle");
    expect(DEFAULT_DWELL_POLICY.excludes.join(" ")).toContain("hidden");
  });
});
