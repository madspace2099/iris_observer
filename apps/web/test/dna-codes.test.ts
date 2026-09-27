import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PresentationLane } from "@observer/readmodels";
import { DnaLane } from "@/showroom/parts";

/**
 * A SECTION CODE NEVER STANDS WITHOUT ITS NAME.
 *
 * The plan's R11: HOM / AMN / SUR / TWX must not carry the reading alone. Every
 * step of a lane, compact or not, renders the section's full name as well as
 * its code, the code as an abbreviation titled with the name, and the step's
 * own title led by the name. Which of the two a box shows is the stylesheet's
 * container query; that the name is always there to show is this test's.
 */
const step = (sectionId: "home" | "amenities" | "surroundings" | "environment", label: string) =>
  ({
    sectionId,
    label,
    position: 0,
    reachRate: 0.8,
    returnRate: 0,
    medianDwellSeconds: 40,
    availability: "legacy_available",
  }) as const;

const LANE: PresentationLane = {
  id: "agt_test",
  label: "A presenter",
  meetingCount: 22,
  steps: [
    step("home", "Home"),
    step("amenities", "Amenities"),
    step("surroundings", "Surroundings"),
    step("environment", "Time & weather"),
  ],
  coverage: 0.9,
  medianDurationSeconds: 780,
  outcomeMix: [],
} as unknown as PresentationLane;

describe("a Presentation DNA lane", () => {
  for (const compact of [false, true]) {
    it(`gives every code its full name${compact ? ", in the compact comparison lanes too" : ""}`, () => {
      const html = renderToStaticMarkup(createElement(DnaLane, { lane: LANE, compact }));
      for (const [name, code] of [
        ["Home", "HOM"],
        ["Amenities", "AMN"],
        ["Surroundings", "SUR"],
        ["Time &amp; weather", "TWX"],
      ] as const) {
        expect(html, name).toContain(`<span class="iris-dna-full">${name}</span>`);
        expect(html, code).toContain(`<abbr class="iris-dna-code" title="${name}">${code}</abbr>`);
        expect(html, `${name} step title`).toContain(`title="${name} · reached in 80% of meetings`);
      }
    });
  }
});
