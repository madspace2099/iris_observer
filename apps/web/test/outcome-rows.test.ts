import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { StackedColumn } from "@observer/readmodels";
import { OUTCOME_KEYS, OutcomeKey, OutcomeRing } from "@/showroom/charts";
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
    expect(rowOf("Zsófia Bárány").match(/class="iris-orow-part iris-outcome-mark"/g)).toHaveLength(
      3,
    );
  });

  it("run the parts in ladder order, the unrecorded last", () => {
    const order = [
      ...rowOf("Team").matchAll(/class="iris-orow-part iris-outcome-mark" data-outcome="(\w+)"/g),
    ].map((m) => m[1]);
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
    const rule = /\.iris-outcome-mark\[data-outcome="skipped"\] \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toContain("repeating-linear-gradient");
    expect(rule).toContain("transparent");
  });

  it("colour every part from the one outcome palette the ring reads", () => {
    const css = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../../packages/ui/src/charts.css"),
      "utf8",
    );
    const rows = css.slice(css.indexOf(".iris-orows {"), css.indexOf(".iris-orows-key {"));
    // No palette of the rows' own: a second key on one page is the defect the owner saw.
    expect(rows).not.toMatch(/#[0-9a-f]{6}/i);
    for (const token of ["purchase", "reservation", "interested", "follow-up", "not-interested"]) {
      expect(rows).toContain(`var(--outcome-${token})`);
    }

    // The ring's key takes its swatches from the same rules, and its unrecorded slice is striped.
    const slices = [
      { outcome: "purchase", label: "Purchase", count: 2, share: 0.5 },
      { outcome: "skipped", label: "Outcome not recorded", count: 2, share: 0.5 },
    ] as const;
    const key = renderToStaticMarkup(createElement(OutcomeKey, { slices }));
    expect(key).toContain('<i class="iris-outcome-mark" data-outcome="skipped"></i>');
    expect(key).not.toContain("style=");
    const ring = renderToStaticMarkup(createElement(OutcomeRing, { slices, total: 4 }));
    expect(ring).toMatch(/stroke="var\(--outcome-unrecorded\)"[^>]*stroke-dasharray="2 2"/);
    expect(ring).not.toMatch(/stroke="var\(--outcome-purchase\)"[^>]*stroke-dasharray/);
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

  it("link nothing without a register to open", () => {
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("iris-orow-open");
  });

  it("state the key's counts as given, never a sum of the rows", () => {
    const key = html.slice(0, html.indexOf('class="iris-orows-list"'));
    expect(key).toContain("<b>901</b>");
    expect(key).toContain("<b>907</b>");
    // Nothing for a key the caller gave no count: absent, not nought.
    expect(key).toContain("Not interested</li>");
  });
});

/*
 * A PART OPENS ITS MEETINGS (ADR-0053). The owner, 2026-10-22: Lena Fischer has
 * 7 meetings at "Purchase"; he wants to click them and see them. With `open`,
 * every part links to the register narrowed to its outcome and its presenter,
 * in the reader's period; the bar is the pointer's and the count line under it
 * the keyboard's, so nothing focusable sits inside an image.
 */
describe("Sales Flow's outcome rows, with a register to open", () => {
  const linked = renderToStaticMarkup(
    createElement(OutcomeRows, {
      label: "How each agent's meetings end",
      lead: TEAM,
      rows: [{ ...LENA, agentId: "agt_lena" }],
      keys: OUTCOME_KEYS,
      keyCounts: {},
      open: { register: "/shark/shark-residence/meetings", period: "last_28_days" },
    }),
  );
  const at = (label: string) => {
    const list = linked.slice(linked.indexOf('class="iris-orows-list"'));
    const from = list.indexOf(`<li class="iris-orow"`, list.indexOf(`aria-label="${label}:`) - 200);
    return list.slice(from, list.indexOf("</li>", from));
  };
  const counts = (label: string) => {
    const row = at(label);
    return row.slice(row.indexOf('class="iris-orow-open"'));
  };

  it("open a presenter's part on the register narrowed to them and to its outcome, in the period", () => {
    expect(counts("Lena Fischer")).toContain(
      'href="/shark/shark-residence/meetings?agent=agt_lena&amp;outcome=purchase&amp;period=last_28_days"',
    );
  });

  it("open the team's part on its outcome alone", () => {
    expect(counts("Team")).toContain(
      'href="/shark/shark-residence/meetings?outcome=purchase&amp;period=last_28_days"',
    );
    expect(counts("Team")).not.toContain("agent=");
  });

  it("name each count's link with its presenter, its count and its outcome", () => {
    expect(counts("Lena Fischer")).toContain(
      'aria-label="Lena Fischer: 8 meetings ended Purchase — open them"',
    );
    expect(counts("Lena Fischer")).toContain(
      'aria-label="Lena Fischer: 2 meetings with no outcome recorded — open them"',
    );
    expect(counts("Lena Fischer")).toContain("outcome=skipped");
  });

  it("name each count's outcome in words on screen, not by its swatch alone", () => {
    // A phone has no hover title, and the key can stand six rows above.
    expect(counts("Lena Fischer")).toContain('aria-hidden="true"></i>Purchase<b>8</b></a>');
    expect(counts("Lena Fischer")).toContain(
      'aria-hidden="true"></i>Outcome not recorded<b>2</b></a>',
    );
  });

  it("give the keyboard one link per drawn part, and the bar's parts none", () => {
    const row = at("Lena Fischer");
    // Purchase, interested, not interested, unrecorded: four parts, four counts.
    expect(counts("Lena Fischer").match(/<a /g)).toHaveLength(4);
    const bar = row.slice(
      row.indexOf('class="iris-orow-bar"'),
      row.indexOf('class="iris-orow-open"'),
    );
    expect(bar).toContain('aria-hidden="true"');
    expect(bar).not.toContain('role="img"');
    expect(bar.match(/<a /g)).toHaveLength(4);
    expect(bar.match(/tabindex="-1"/g)).toHaveLength(4);
  });
});
