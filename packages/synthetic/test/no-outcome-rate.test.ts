import { describe, expect, it } from "vitest";
import { DEFAULT_LANGUAGE } from "@observer/readmodels";
import { VIEWERS, syntheticRepository } from "../src";

/**
 * NO OUTCOME RECORDED IS NOT "0% PROGRESSING".
 *
 * Riverside and Kingsford record no meeting outcome. The Briefing's figure
 * already says so ("—", "no outcome recorded on this project"), but the door
 * to Sales Flow beside it still read "29 meetings · 0% progressing": a rate
 * over no decided meeting, printed as a measured zero.
 */
const home = (tenantSlug: string, projectSlug: string, viewer = VIEWERS.developer) =>
  syntheticRepository.getHome({
    viewer,
    tenantSlug,
    projectSlug,
    period: "quarter_to_date",
    language: DEFAULT_LANGUAGE,
  });

const flowDoor = async (tenantSlug: string, projectSlug: string) =>
  (await home(tenantSlug, projectSlug)).doors.find((d) => d.id === "flow")?.headline;

describe("the Briefing's door to Sales Flow", () => {
  it("says no outcome is recorded where none is", async () => {
    const headline = await flowDoor("alpha", "riverside");
    expect(headline).toMatch(/ · no outcome recorded$/);
    expect(headline).not.toMatch(/0% progressing/);
  });

  it("keeps the rate where outcomes are recorded", async () => {
    expect(await flowDoor("alpha", "northgate")).toMatch(/ · \d+% progressing$/);
  });
});
