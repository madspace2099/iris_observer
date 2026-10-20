import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChartDefs } from "@/showroom/forms";

/**
 * THE SHELL'S PAINT SERVERS HOLD WHAT THE PORTED FORMS NAME, ONCE EACH.
 *
 * The parallel lines name `url(#dld-lift)` and the bubble lens places
 * `#dld-sphere-*` with `<use>`. In the lab they came from the gallery's own
 * defs; on a product page only the shell's `ChartDefs` is there, and an id
 * declared twice is the first one wins, silently.
 */

const html = renderToStaticMarkup(createElement(ChartDefs));
const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);

describe("ChartDefs", () => {
  for (const id of [
    "dld-line",
    "dld-dots",
    "dld-glow",
    "dld-lift",
    "dld-sphere-agent-1",
    "dld-sphere-agent-2",
    "dld-sphere-agent-3",
    "dld-sphere-agent-4",
    "dld-sphere-agent-5",
    "dld-sphere-agent-6",
    "dld-sphere-neutral",
  ]) {
    it(`declares #${id} exactly once`, () => {
      expect(ids.filter((x) => x === id)).toHaveLength(1);
    });
  }
});

/**
 * THE PORTED FORMS' RULES READ ON A PRODUCT PAGE, AND NONE PRINTS UNDER 12PX.
 *
 * A rule left under `.dld-root` alone reaches only the lab: on Sales Flow the
 * lens's ring would paint an opaque disc over every sphere and the shade
 * would black out the strip. Every rule for the lens, the parallel plot, the
 * dial and its centre is under `:is(.dld-root, [data-charts="d"])` or none.
 */
const CSS = readFileSync(
  resolve(import.meta.dirname, "../../../packages/ui/src/design-lab-d.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");
const PORTED = /\.dld-(lens|parallel|radial|centre)/;

describe("the ported forms' CSS", () => {
  const rules = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => PORTED.test(m[1] ?? ""));

  it("finds the rules it checks", () => {
    expect(rules.length).toBeGreaterThan(20);
  });

  it("leaves no ported rule scoped to the lab alone", () => {
    for (const [, selector] of rules) {
      expect(selector ?? "", (selector ?? "").trim()).not.toMatch(
        /(^|,)\s*\.dld-root \.dld-(lens|parallel|radial|centre)/,
      );
    }
  });

  it("sets no ported type under 12px", () => {
    for (const [, selector, body] of rules) {
      for (const size of (body ?? "").matchAll(/font-size:\s*([\d.]+)px/g)) {
        expect(Number(size[1]), (selector ?? "").trim()).toBeGreaterThanOrEqual(12);
      }
    }
  });
});
