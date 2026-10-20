import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { StackedColumn } from "@observer/readmodels";
import { OUTCOME_KEYS } from "@/showroom/charts";
import { OutcomeRows } from "@/showroom/charts2";

/**
 * SALES FLOW'S OUTCOME ROWS PRINT THE READ MODEL AND COUNT NOTHING (ADR-0041).
 *
 * They replaced the stacked columns the owner could not read (2026-10-20).
 * Each row prints the figure its read model wrote, draws only the parts that
 * hold a meeting, draws the unrecorded part as a hatch rather than a colour
 * that reads as an outcome, and keeps the order it was given.
 */

/* Figures no arithmetic on the parts below could produce, so a computed one cannot pass. */
const row = (label: string, parts: Record<string, number>, display: string): StackedColumn => ({
  label,
  total: Object.values(parts).reduce((a, b) => a + b, 0),
  parts,
  figure: { meetingsDisplay: `${label} meetings in words`, display, belowMinimum: false },
});

const TEAM = row(
  "Team",
  { purchase: 9, reservation: 0, interested: 4, not_interested: 2, skipped: 3 },
  "team figure from the read model",
);
const ZSOFIA = row(
  "Zsófia Bárány",
  { purchase: 1, reservation: 0, interested: 1, skipped: 1 },
  "Zsófia's figure from the read model",
);
const LENA = {
  ...row("Lena Fischer", { purchase: 8, interested: 3, not_interested: 2, skipped: 2 }, "x"),
  figure: {
    meetingsDisplay: "15 meetings",
    display: "No rate yet: 5 short of the 20 recorded meetings needed",
    belowMinimum: true,
  },
};

const html = renderToStaticMarkup(
  createElement(OutcomeRows, {
    label: "How each agent's meetings end",
    lead: TEAM,
    rows: [ZSOFIA, LENA],
    keys: OUTCOME_KEYS,
    keyCounts: { purchase: 901, reservation: 902, interested: 903, skipped: 907 },
  }),
);

/* The rows' list only, so the key's swatches are not counted as parts. */
const rows = html.slice(html.indexOf('class="iris-orows-list"'));
const rowOf = (label: string) => {
  const from = rows.indexOf(`<li class="iris-orow"`, rows.indexOf(`aria-label="${label}:`) - 200);
  return rows.slice(from, rows.indexOf("</li>", from));
};

describe("Sales Flow's outcome rows", () => {
  it("print each row's figure as the read model wrote it", () => {
    expect(html).toContain("team figure from the read model");
    expect(html).toContain("Zsófia&#x27;s figure from the read model");
    expect(html).toContain("No rate yet: 5 short of the 20 recorded meetings needed");
    expect(html).not.toMatch(/\d+(\.\d+)?%/);
  });

  it("name each row by its group, its meetings and its figure", () => {
    expect(rows).toContain(
      'aria-label="Team: Team meetings in words, team figure from the read model"',
    );
    expect(rows).toContain(
      'aria-label="Lena Fischer: 15 meetings, No rate yet: 5 short of the 20 recorded meetings needed"',
    );
  });

  it("keep the team first and the presenters in the order given", () => {
    const at = (label: string) => rows.indexOf(`aria-label="${label}:`);
    expect(at("Team")).toBeGreaterThan(-1);
    expect(at("Team")).toBeLessThan(at("Zsófia Bárány"));
    expect(at("Zsófia Bárány")).toBeLessThan(at("Lena Fischer"));
    expect(rowOf("Team")).toContain('data-lead="true"');
    expect(rowOf("Zsófia Bárány")).not.toContain("data-lead");
  });

  it("draw no part for an outcome with no meeting", () => {
    expect(rowOf("Team")).not.toContain('data-outcome="reservation"');
    expect(rowOf("Zsófia Bárány")).not.toContain('data-outcome="reservation"');
    expect(rowOf("Zsófia Bárány")).not.toContain('data-outcome="not_interested"');
    expect(rowOf("Zsófia Bárány").match(/class="iris-orow-part"/g)).toHaveLength(3);
  });

  it("run the parts in ladder order, the unrecorded last", () => {
    const order = [...rowOf("Team").matchAll(/class="iris-orow-part" data-outcome="(\w+)"/g)].map(
      (m) => m[1],
    );
    expect(order).toEqual(["purchase", "interested", "not_interested", "skipped"]);
  });

  it("describe each part with its row, its outcome and its count of the whole", () => {
    expect(rowOf("Lena Fischer")).toContain('title="Lena Fischer · Purchase: 8 of 15"');
  });

  it("mark the unrecorded part as a hatch, never a solid outcome colour", () => {
    const css = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../../packages/ui/src/charts.css"),
      "utf8",
    );
    const rule = /\.iris-orows \[data-outcome="skipped"\] \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toContain("repeating-linear-gradient");
    expect(rule).toContain("transparent");
  });

  it("name each bar that draws a part as one image, and give an empty bar none", () => {
    expect(rowOf("Team")).toContain(
      'role="img" aria-label="Purchase: 9 of 18, Interested: 4 of 18, Not interested: 2 of 18, Outcome not recorded: 3 of 18"',
    );
    // A period with no meeting: an image with an empty name fails axe's role-img-alt.
    const empty = renderToStaticMarkup(
      createElement(OutcomeRows, {
        label: "How each agent's meetings end",
        lead: row("Team", { purchase: 0, skipped: 0 }, "No outcome recorded, so no rate"),
        rows: [],
        keys: OUTCOME_KEYS,
        keyCounts: {},
      }),
    );
    expect(empty).not.toContain('role="img"');
    expect(empty).not.toContain('aria-label=""');
    expect(empty).toContain('<span class="iris-orow-bar" aria-hidden="true"></span>');
  });

  it("state the key's counts as given, never a sum of the rows", () => {
    const key = html.slice(0, html.indexOf('class="iris-orows-list"'));
    expect(key).toContain("<b>901</b>");
    expect(key).toContain("<b>907</b>");
    // Nothing for a key the caller gave no count: absent, not nought.
    expect(key).toContain("Not interested</li>");
  });
});
