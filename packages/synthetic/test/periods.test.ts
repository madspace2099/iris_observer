import { describe, expect, it } from "vitest";

import { periodsAt } from "../src/time";

/**
 * Expected instants are written out by hand, with the offset a calendar gives
 * them — never computed with the helpers under test. The first case is the
 * synthetic world's own constants: derived periods must agree with them to the
 * millisecond, or a project moving from synthetic to real data would silently
 * change what "quarter to date" means.
 */
const at = (iso: string): number => Date.parse(iso);
const bounds = (p: { from: string; to: string; baselineFrom: string; baselineTo: string }) =>
  [p.from, p.to, p.baselineFrom, p.baselineTo].map(at);

describe("the period presets against a real today", () => {
  const periods = periodsAt(new Date("2026-08-24T09:00:00.000+02:00"), "Europe/Bratislava");

  it("reproduces the synthetic world's last 28 days", () => {
    expect(bounds(periods.last_28_days)).toEqual(
      [
        "2026-07-27T00:00:00.000+02:00",
        "2026-08-24T00:00:00.000+02:00",
        "2026-06-29T00:00:00.000+02:00",
        "2026-07-27T00:00:00.000+02:00",
      ].map(at),
    );
  });

  it("reproduces its quarter to date, baseline clipped to the same 54 days", () => {
    expect(bounds(periods.quarter_to_date)).toEqual(
      [
        "2026-07-01T00:00:00.000+02:00",
        "2026-08-24T00:00:00.000+02:00",
        "2026-04-01T00:00:00.000+02:00",
        "2026-05-25T00:00:00.000+02:00",
      ].map(at),
    );
    expect(periods.quarter_to_date.baselineLabel).toBe("the same 54 days of the previous quarter");
    expect(periods.quarter_to_date.baselineClipped).toBe(true);
  });

  it("reproduces its last completed quarter, across the March clock change", () => {
    expect(bounds(periods.last_quarter)).toEqual(
      [
        "2026-04-01T00:00:00.000+02:00",
        "2026-07-01T00:00:00.000+02:00",
        "2026-01-01T00:00:00.000+01:00",
        "2026-04-01T00:00:00.000+02:00",
      ].map(at),
    );
  });

  it("reproduces its year to date against the same span last year", () => {
    expect(bounds(periods.year_to_date)).toEqual(
      [
        "2026-01-01T00:00:00.000+01:00",
        "2026-08-24T00:00:00.000+02:00",
        "2025-01-01T00:00:00.000+01:00",
        "2025-08-24T00:00:00.000+02:00",
      ].map(at),
    );
  });

  it("steps back over a year boundary in January", () => {
    const january = periodsAt(new Date("2027-01-15T10:00:00.000+01:00"), "Europe/Bratislava");
    expect(bounds(january.last_quarter)).toEqual(
      [
        "2026-10-01T00:00:00.000+02:00",
        "2027-01-01T00:00:00.000+01:00",
        "2026-07-01T00:00:00.000+02:00",
        "2026-10-01T00:00:00.000+02:00",
      ].map(at),
    );
    expect(bounds(january.quarter_to_date)).toEqual(
      [
        "2027-01-01T00:00:00.000+01:00",
        "2027-01-15T00:00:00.000+01:00",
        "2026-10-01T00:00:00.000+02:00",
        "2026-10-15T00:00:00.000+02:00",
      ].map(at),
    );
    expect(bounds(january.last_28_days)[0]).toBe(at("2026-12-18T00:00:00.000+01:00"));
  });

  it("reads the day in the project's zone, not the host's", () => {
    /* 23:30 UTC on the 30th is already the 1st of October in Bratislava. */
    const late = periodsAt(new Date("2026-09-30T23:30:00.000Z"), "Europe/Bratislava");
    expect(at(late.quarter_to_date.from)).toBe(at("2026-10-01T00:00:00.000+02:00"));
    /* And still the 30th of September in New York, four hours behind UTC. */
    const newYork = periodsAt(new Date("2026-09-30T23:30:00.000Z"), "America/New_York");
    expect(at(newYork.quarter_to_date.from)).toBe(at("2026-07-01T00:00:00.000-04:00"));
  });
});
