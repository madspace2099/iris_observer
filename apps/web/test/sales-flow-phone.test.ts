import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { axisTicks } from "@/components/flow/IrisLedTimeline";
import { KpiCard } from "@/showroom/charts2";

/**
 * SALES FLOW ON A PHONE (the owner, 2026-10-22: "Check mobile responsiveness!").
 *
 * The page's phone rules are CSS (`components/flow/sales-flow.css`); what is
 * held here is the markup they key on and the one rule that is arithmetic.
 */

const sheet = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../src/components/flow/sales-flow.css"),
  "utf8",
);
/* The sheet without its reasoning, so a guard never matches the comment explaining a rule. */
const rules = sheet.replace(/\/\*[\s\S]*?\*\//g, "");

describe("a summary figure that is a sentence", () => {
  const value = (v: string) =>
    renderToStaticMarkup(
      createElement(KpiCard, { label: "x", value: v, qualifier: null, delta: null, tone: "flat" }),
    );

  it("is marked, so a phone sets it at the body size across the card", () => {
    expect(value("7 of 7 sales measured")).toContain('data-statement="true"');
  });

  it("leaves a figure a figure, units and all", () => {
    for (const figure of ["82", "58%", "13m 51s", "12 days", "No sale"]) {
      expect(value(figure)).not.toContain("data-statement");
    }
  });
});

describe("the IRIS-led axis on a phone's track", () => {
  /* Shark Residence's ticks, as the read model places them on its stretched scale. */
  const ticks = [
    { label: "Change", position: 1 },
    { label: "72 h", position: 0.74 },
    { label: "1 week", position: 0.61 },
    { label: "1 month", position: 0.356 },
    { label: "3 months", position: 0.152 },
    { label: "6 months", position: 0.0231 },
  ];

  it("keeps no two labels that touch on a 200px track", () => {
    const shown = axisTicks(ticks).filter((t) => !t.crowded);
    const span = (t: (typeof shown)[number], i: number) => {
      const w = t.label.length * 7;
      const x = t.position * 200;
      return i === 0 ? [x - w, x] : t.edge ? [x, x + w] : [x - w / 2, x + w / 2];
    };
    const boxes = shown.map(span);
    for (let i = 1; i < boxes.length; i += 1) {
      expect(
        boxes[i]![1]! + 6,
        `${shown[i]!.label} against ${shown[i - 1]!.label}`,
      ).toBeLessThanOrEqual(boxes[i - 1]![0]!);
    }
    // "3 months1 month" and "72 hChange" were the defects at 360.
    expect(shown.map((t) => t.label)).toEqual(["Change", "1 week", "3 months"]);
  });

  it("never steps the change itself aside, and starts the far label at its tick", () => {
    const all = axisTicks(ticks);
    expect(all[0]?.crowded).toBe(false);
    expect(all.at(-1)?.edge).toBe(true);
  });
});

describe("the page's phone sheet", () => {
  it("is scoped to Sales Flow and to a phone's width, so no other page and no desktop moves", () => {
    /* Every rule's prelude: the text before each "{", after the last "}" or ";". */
    const preludes = sheet
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("{")
      .slice(0, -1)
      .map((s) => (s.split(/[;}]/).pop() ?? "").trim());
    expect(preludes.length).toBeGreaterThan(10);
    for (const prelude of preludes) {
      if (prelude.startsWith("@")) expect(prelude).toMatch(/width </);
      else
        for (const selector of prelude.split(","))
          expect(selector.trim(), "every rule under the page's own class").toMatch(
            /^\.iris-salesflow /,
          );
    }
  });

  /*
   * Review round 1: a browser does not scroll a focused link that already
   * shows 32px, so a count Tab reached could sit under the fade, ring and all.
   */
  it("wraps a scrolling row while it holds keyboard focus", () => {
    for (const row of [".iris-orow:not([data-lead]) .iris-orow-open", ".dld-lens-keys ul"]) {
      const at = rules.indexOf(`.iris-salesflow ${row}:has(:focus-visible) {`);
      expect(at, row).toBeGreaterThan(-1);
      expect(rules.slice(at, rules.indexOf("}", at)), row).toMatch(
        /flex-wrap: wrap;[\s\S]*mask-image: none;/,
      );
    }
  });

  it("folds the summary's window under one line on a phone and draws it nowhere else", () => {
    /* The wide screen's default stands before every phone rule, so the phone's `display: block` wins there. */
    const hidden = rules.indexOf(".iris-salesflow .iris-window-pick {\n  display: none;");
    expect(hidden).toBeGreaterThan(-1);
    expect(hidden).toBeLessThan(rules.indexOf("@media"));
    expect(rules).toContain(".iris-salesflow .iris-window > :not(.iris-window-pick) {");
  });

  it("drops the team key only where the team row carries the same words and counts", () => {
    expect(sheet).toContain(
      ".iris-orows:has(.iris-orow[data-lead] .iris-orow-open) .iris-orows-key",
    );
  });
});
