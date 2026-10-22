import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Radar } from "@/showroom/charts2";

/**
 * The radar's caption is the card's, under the card.
 *
 * `Radar` drew a key under every drawing — a swatch and a label per series —
 * because a key is what tells two overlaid shapes apart. The roster hands it
 * one profile per cell, so each cell got a key for one shape: a swatch beside
 * the one name, standing where the cell's own caption should. On the
 * photograph it read as a caption floating under the row. A key tells shapes
 * apart; one shape has nothing to tell apart, and its label is the card's
 * caption.
 *
 * Rendered with react-dom/server for the component; a source assertion,
 * comments stripped, for the page that is an async server component. One
 * measured assertion per test, so a mutation is read by which one fails.
 */

const AXES = ["Coverage", "Depth", "Units"] as const;
const profile = (id: string) => ({
  id,
  label: `${id} · 3 meetings`,
  values: [0.5, 0.5, 0.5],
  tone: "#00A3FF",
});
const html = (series: ReturnType<typeof profile>[]) =>
  renderToStaticMarkup(createElement(Radar, { axes: AXES, series, size: 190 }));

describe("the radar's key", () => {
  it("is not drawn for one shape", () => {
    expect(
      html([profile("a")]),
      "a key for one shape stood where the card's caption belongs",
    ).not.toContain("iris-ring-key");
  });

  it("is drawn for two, which it tells apart", () => {
    /* Guards the guard: a key never drawn would pass the test above. */
    expect(html([profile("a"), profile("b")])).toContain("iris-ring-key");
  });
});

const DETAIL = readFileSync(
  resolve(
    import.meta.dirname,
    "..",
    "src/app/(app)/[tenantSlug]/[projectSlug]/agents/[agentId]/page.tsx",
  ),
  "utf8",
)
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");

describe("the agent page's radar", () => {
  it("draws their one shape, which the frame's title names", () => {
    expect(DETAIL).toMatch(/title=\{`How \$\{view\.name\} presents`\}/);
    expect(DETAIL, "the agent page overlays more than its own agent").toMatch(
      /<Radar axes=\{charts\.radar\.axes\} series=\{\[shape\]\}/,
    );
  });
});

/*
 * Coaching no longer draws a radar (ADR-0057): its one chart is a row per part
 * of the showroom with a dot per agent, and its key is the page's own
 * (`coaching-chart.test.ts`). The radar stands on the agent's page, one shape.
 */
