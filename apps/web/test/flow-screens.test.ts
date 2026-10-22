import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FlowRail } from "@/components/flow/FlowRail";

/**
 * SALES FLOW, ONE SCREEN AT A TIME (the owner, 2026-10-22, ADR-0059).
 *
 * Source assertions on the page's JSX, comments stripped, as `flow-claims`
 * does it, and on its screens' stylesheet.
 */
const FLOW = readFileSync(
  resolve(import.meta.dirname, "../src/app/(app)/[tenantSlug]/[projectSlug]/flow/page.tsx"),
  "utf8",
)
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");
const SHEET = readFileSync(
  resolve(import.meta.dirname, "../src/components/flow/flow-screens.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

/** The page from one screen's opening to the next one's. */
function screen(id: string): string {
  const start = FLOW.indexOf(`id="${id}"`);
  expect(start, id).toBeGreaterThan(-1);
  const next = FLOW.indexOf('className="flow-screen', start);
  return FLOW.slice(start, next < 0 ? undefined : next);
}

describe("Sales Flow's screens", () => {
  it("gives every screen the rail lists an element, and every screen a place on the rail", () => {
    const listed = [...FLOW.matchAll(/\{ id: "(flow-[a-z-]+)", label: "/g)].map((m) => m[1]);
    const drawn = [...FLOW.matchAll(/id="(flow-[a-z-]+)"/g)].map((m) => m[1]);
    expect(listed.length).toBeGreaterThan(12);
    expect(new Set(drawn)).toEqual(new Set(listed));
    /* Each element that carries a screen's id is a screen. */
    for (const id of drawn) expect(FLOW).toMatch(new RegExp(`flow-screen[^"]*"\\s+id="${id}"`));
  });

  it("opens on the verdict alone", () => {
    const verdict = screen("flow-verdict");
    expect(verdict).toContain("<SpokenVerdict");
    expect(verdict).not.toMatch(/<(KpiCard|InfoTip|Link)\b/);
  });

  it("draws the meetings with every outcome, and the longest presentations with who gave them", () => {
    const meetings = screen("flow-meetings");
    expect(meetings).toContain("Meetings, and how many progressed");
    expect(meetings).toContain("Every outcome");
    const presentations = screen("flow-presentations");
    expect(presentations).toContain("Longest presentations this period");
    expect(presentations).toContain("Presentations given");
  });

  it("keeps the reader on the summary screen when a window is picked", () => {
    const chips = FLOW.slice(FLOW.indexOf("const windowChips"), FLOW.indexOf("const kpiCard"));
    expect(chips).toMatch(/<Link[\s\S]*className="iris-chip"[\s\S]*scroll=\{false\}/);
  });

  it("keeps a heatmap's denominator in view and its method behind the i", () => {
    const week = screen("flow-week");
    expect(week).toMatch(/caption=\{`Meetings by weekday and hour, across \$\{/);
    expect(week).toMatch(/<InfoTip id="week"[\s\S]*An empty square is drawn empty/);
  });
});

describe("the screens' stylesheet", () => {
  it("scopes every rule to Sales Flow, or to the document only while it holds the page", () => {
    const preludes = SHEET.split("{")
      .slice(0, -1)
      .map((s) => (s.split(/[;}]/).pop() ?? "").trim())
      .filter((p) => !p.startsWith("@"));
    expect(preludes.length).toBeGreaterThan(10);
    for (const prelude of preludes)
      for (const selector of prelude.split(/,(?![^(]*\))/))
        expect(selector.trim()).toMatch(/^(\.iris-salesflow( |$| ~)|html:has\(\.iris-salesflow\))/);
  });

  it("snaps by proximity unless the screens fit, and never scrolls smoothly", () => {
    const base = SHEET.slice(0, SHEET.indexOf("@media"));
    expect(base).toMatch(/scroll-snap-type: y proximity;/);
    const mandatory = SHEET.indexOf("scroll-snap-type: y mandatory;");
    expect(SHEET.lastIndexOf("@media", mandatory)).toBe(
      SHEET.indexOf("@media (width >= 64rem) and (height >= 40rem)"),
    );
    expect(SHEET).not.toContain("scroll-behavior: smooth");
  });
});

describe("the rail", () => {
  it("links every screen by its name and marks the first as current before script runs", () => {
    const html = renderToStaticMarkup(
      createElement(FlowRail, {
        screens: [
          { id: "flow-verdict", label: "The verdict" },
          { id: "flow-summary", label: "The summary figures" },
        ],
      }),
    );
    expect(html).toContain(
      '<nav class="flow-rail" aria-label="Sales Flow screens" style="--flow-dots:2">',
    );
    expect(html).toContain('href="#flow-verdict" aria-label="The verdict"');
    expect(html).toMatch(/href="#flow-verdict"[^>]*aria-current="location"/);
    expect(html).not.toMatch(/href="#flow-summary"[^>]*aria-current/);
  });
});
