import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RadialHistogram, type RadialData } from "@/showroom/forms";

/**
 * THE DIAL DRAWS AN HOUR ONLY WHERE A MEETING STARTED, AND GLOWS ONLY AT THE PEAK.
 *
 * The gallery glowed every bar at half the peak or more; on Shark Residence
 * every hour clears that, so every bar glowed and the glow said nothing. A
 * spoke stands for all twenty-four hours; a bar only for an hour with a
 * meeting, never a stub for nought.
 */

const counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 24, 20, 18, 15, 24, 12, 19, 16, 0, 0, 0, 0, 0, 0, 0];
const DATA: RadialData = {
  hours: counts.map((count, hour) => ({
    hour,
    label: `${String(hour).padStart(2, "0")}:00`,
    count,
  })),
  peak: 24,
  total: counts.reduce((a, b) => a + b, 0),
};

describe("RadialHistogram", () => {
  for (const size of ["xl", "l"] as const) {
    const html = renderToStaticMarkup(createElement(RadialHistogram, { data: DATA, size }));

    it(`${size}: draws a spoke for every hour`, () => {
      expect(html.match(/class="dld-radial-spoke"/g)).toHaveLength(24);
    });

    it(`${size}: draws a bar only for an hour with a meeting`, () => {
      expect(html.match(/class="dld-radial-bar"/g)).toHaveLength(8);
    });

    it(`${size}: lets only the busiest hours glow`, () => {
      expect(html.match(/data-long="true"/g)).toHaveLength(2);
    });
  }
});
