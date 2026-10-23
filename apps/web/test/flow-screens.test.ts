import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FlowRail, wheelTarget } from "@/components/flow/FlowRail";
import { KpiCard } from "@/showroom/charts2";

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
/* The shared chart sheet, where a KPI card's own rules stand. */
const CHARTS = readFileSync(
  resolve(import.meta.dirname, "../../../packages/ui/src/charts.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");
const CHANGES = readFileSync(
  resolve(import.meta.dirname, "../src/components/flow/change-kpis.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");
/* Sales Flow's rail is the shared `ScreenRail` (ADR-0061), with its own sheet. */
const RAIL = readFileSync(
  resolve(import.meta.dirname, "../src/components/screens/ScreenRail.tsx"),
  "utf8",
);
const RAIL_SHEET = readFileSync(
  resolve(import.meta.dirname, "../src/components/screens/screens.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

/** One rule's body, by its exact selector. */
function rule(selector: string, sheet = SHEET): string {
  const at = sheet.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return sheet.slice(at, sheet.indexOf("}", at));
}

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
    /* The ring counts the period, not the windows beside it, and says so (the owner, 2026-10-23). */
    expect(meetings).toContain("Every outcome · {view.context.period.label}");
    expect(meetings).toMatch(/<OutcomeRing[^>]*period=\{view\.context\.period\.label\}/);
    expect(meetings).not.toMatch(/median/i);
    const presentations = screen("flow-presentations");
    expect(presentations).toContain("Longest presentations this period");
    expect(presentations).toContain("Presentations given");
  });

  /*
   * Review round 1: the rail's observer kept watching the elements a period
   * pick replaced, and marked one screen for every other. It is keyed on what
   * the screens are keyed on, so it is replaced with them.
   */
  it("re-keys the rail on everything a screen is keyed on", () => {
    expect(FLOW).toContain("<FlowRail key={`rail-${query.period}-${kpiWindow}`}");
    const keys = [...FLOW.matchAll(/className="flow-screen[^"]*"[^>]*?key=\{`([^`]*)`\}/g)].map(
      (m) => m[1] ?? "",
    );
    expect(keys.length).toBeGreaterThan(5);
    for (const key of keys)
      for (const [, name] of key.matchAll(/\$\{([^}]*)\}/g))
        expect(["query.period", "kpiWindow"], key).toContain(name);
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

  /*
   * Mandatory, where the screens fit, held the demo at its first screen at
   * 1440 × 900: the wheel and Page Down both snapped back (2026-10-23).
   */
  it("snaps by proximity at every size, never mandatory, and never scrolls smoothly", () => {
    const base = SHEET.slice(0, SHEET.indexOf("@media"));
    expect(base).toMatch(/scroll-snap-type: y proximity;/);
    expect(SHEET).not.toContain("scroll-snap-type: y mandatory");
    expect(SHEET).not.toContain("scroll-behavior: smooth");
  });

  /* Review round 1: Chrome animates a snap, so under reduced motion the page glided by itself. */
  it("does not snap under reduced motion, whatever the size", () => {
    const off = SHEET.indexOf("scroll-snap-type: none;");
    expect(SHEET.lastIndexOf("@media", off)).toBe(
      SHEET.indexOf("@media (prefers-reduced-motion: reduce)"),
    );
    expect(off, "after every rule that turns snapping on").toBeGreaterThan(
      SHEET.lastIndexOf("scroll-snap-type: y"),
    );
  });

  /*
   * Review round 1: a drawing with a viewBox scales its type with it, so a
   * height cap on the weekly line and a height-shrunk clock face set their 12px
   * labels at 10.8 and 10.5. Neither is sized under its drawn size by the screen.
   */
  it("never shrinks a drawing under its drawn size to fit a short screen", () => {
    expect(SHEET).not.toMatch(/\.iris-trend\s*\{[^}]*max-height/);
    const dials = [...SHEET.matchAll(/#flow-day \.dld-radial \{([^}]*)\}/g)].map((m) => m[1]);
    expect(dials).toHaveLength(2);
    for (const dial of dials) expect(dial).toContain("max(430px,");
  });

  it("widens a ranked list's names only where a sale is named", () => {
    expect(rule("  .iris-salesflow :is(#flow-stalled, #flow-assisted) .iris-ranked li")).toContain(
      "minmax(0, 16rem)",
    );
    expect(SHEET).not.toMatch(/\.iris-salesflow \.flow-screen \.iris-ranked li \{\s*grid-template/);
  });

  /* Review round 1: the agents' screen showed every count three times; it shows each once, linked. */
  it("shows each agent's counts once on the agents' screen", () => {
    expect(rule(".iris-salesflow #flow-agents .iris-orow-plot .iris-orow-part b")).toContain(
      "display: none;",
    );
    expect(
      rule(
        ".iris-salesflow #flow-agents .iris-orows:has([data-lead] .iris-orow-open) .iris-orows-key",
      ),
    ).toContain("display: none;");
  });

  /*
   * The owner, 2026-10-23: the presenters' names and faces were too small to
   * read on the recording. The face is twice the chip it was, beside the name
   * and its count, and every column of names holds a long name whole.
   */
  it("draws the presenters' faces and names large enough to read on a recording", () => {
    const both = ".iris-salesflow :is(#flow-agents, #flow-not-interested)";
    expect(rule(`${both} .ag-portrait`)).toContain("--ag-size: 2.75rem;");
    expect(rule(`${both} :is(.iris-orow-name, .ag-named-text)`)).toContain("font-size: 1.375rem;");
    const columns = [
      ...SHEET.matchAll(
        /#flow-(?:agents|not-interested) \.iris-orows-list \{[^}]*grid-template-columns: fit-content\(([\d.]+)rem\)/g,
      ),
    ].map((m) => Number(m[1]));
    expect(columns).toHaveLength(3);
    for (const width of columns) expect(width).toBeGreaterThanOrEqual(15.5);
    // The agents' wider names come out of the figure's column, not the bars' (review, 2026-10-23).
    const figures = [
      ...SHEET.matchAll(
        /#flow-agents \.iris-orows-list \{[^}]*grid-template-columns: fit-content\([\d.]+rem\) minmax\([^)]*\) fit-content\(([\d.]+)rem\)/g,
      ),
    ].map((m) => Number(m[1]));
    expect(figures).toHaveLength(2);
    for (const width of figures) expect(width).toBeLessThanOrEqual(13);
    expect(screen("flow-agents")).not.toContain('"chip"');
  });

  /*
   * The owner, 2026-10-23: the presentations screen's presenters at the agents'
   * size, on both halves, and the ten longest on screen ("there is room").
   */
  it("draws the presentations screen's faces and names at the agents' size, a plain disc", () => {
    const here = ".iris-salesflow #flow-presentations";
    const face = rule(`${here} .ag-portrait`);
    expect(face).toContain("--ag-size: 2.75rem;");
    expect(face).not.toMatch(/border|outline|box-shadow/);
    expect(rule(`${here} .iris-ranked-name`)).toContain("font-size: 1.375rem;");
    expect(rule(`${here} .iris-ranked-name em`)).toContain("font-size: 0.875rem;");
    /* Both halves' name columns hold the face beside its line, wider than the 12rem and 17.75rem before. */
    expect(rule(`  ${here} > div:first-child .iris-ranked li`)).toContain("minmax(0, 20rem)");
    expect(rule(`  ${here} .iris-band-side .iris-ranked li`)).toContain("minmax(0, 15.5rem)");
  });

  it("shows the ten longest presentations and every presenter, and gives the height back", () => {
    const presentations = screen("flow-presentations");
    expect([...presentations.matchAll(/collapseAfter=\{(\d+)\}/g)].map((m) => m[1])).toEqual([
      "10",
    ]);
    /* Presentations given is never collapsed: every row carries its own denominator. */
    const given = presentations.slice(presentations.indexOf("<PresenterBars"));
    expect(given.slice(0, given.indexOf("/>"))).not.toContain("collapseAfter");
    /* The rows take the height, not the type: 2px at most at the fixed sizes, none in a short window. */
    const fixed = SHEET.indexOf(
      "@media (width >= 64rem) and (height >= 40rem) {\n  .iris-salesflow #flow-presentations",
    );
    expect(fixed).toBeGreaterThan(-1);
    expect(SHEET.slice(fixed, SHEET.indexOf("}", fixed))).toContain("padding-block: 0.125rem;");
    const short = SHEET.indexOf("@media (width >= 64rem) and (40rem <= height < 54rem) {");
    expect(short).toBeGreaterThan(-1);
    expect(SHEET.slice(short, SHEET.indexOf("\n}", short))).toMatch(
      /#flow-presentations \.iris-ranked li \{\s*padding-block: 0;/,
    );
    /* Opened, the twenty run past the screen: nothing spreads, so the presenters beside them stay together. */
    const opened = rule(
      ".iris-salesflow #flow-presentations:has(.iris-ranked-more[open]) .dld-draw-body > ol",
    );
    expect(opened).toContain("flex-grow: 0;");
    expect(opened).toContain("grid-auto-rows: auto;");
  });

  /*
   * Review, 2026-10-23: forced to the viewport where the wheel does not step,
   * a phone's screens ended in 160–280px of black.
   */
  it("lets a screen be as tall as what it holds wherever the wheel does not step", () => {
    const at = SHEET.indexOf("@media (width < 64rem), (height < 40rem) {");
    expect(at).toBeGreaterThan(-1);
    expect(SHEET.slice(at, SHEET.indexOf("}", at))).toMatch(
      /\.iris-salesflow \.flow-screen \{\s*min-height: 0;/,
    );
    expect(RAIL).toContain('matchMedia("(width >= 64rem) and (height >= 40rem)")');
  });

  /* Review, 2026-10-23: a short drawing left a band of black under it at 1440 × 900. */
  it("spreads a ranked list's rows down its screen and stands the rest in the middle", () => {
    expect(SHEET).toMatch(
      /:is\(#flow-stalled, #flow-presentations, #flow-assisted\) \.dld-draw-body > ol \{\s*flex: 1 0 auto;\s*grid-auto-rows: 1fr;/,
    );
    expect(
      rule(".iris-salesflow :is(#flow-changes > .iris-ckpis, #flow-not-interested > .iris-cohort)"),
    ).toContain("margin-block: auto;");
  });

  /* Review round 1: the ladder's draw-in wrappers stopped its rungs taking the screen. */
  it("carries the screen's height through the ladder's wrappers to its rungs", () => {
    expect(SHEET).toMatch(
      /#flow-ladder > \.dld-draw,\s*\.iris-salesflow #flow-ladder \.dld-draw-body,\s*\.iris-salesflow #flow-ladder \.ox-funnel \{\s*display: flex;\s*flex-direction: column;\s*flex: 1 0 auto;/,
    );
  });
});

/*
 * The owner's recording review, 2026-10-23: the summary cards' names could not
 * be read on screen, nor could the 96px sparklines beside their words.
 */
describe("the summary's cards, read on a recording", () => {
  const card = renderToStaticMarkup(
    createElement(KpiCard, {
      label: "Presentations",
      value: "82",
      qualifier: "last 30 days · 72 before",
      delta: "+14%",
      tone: "good",
      points: [3, 5, 4, 8],
    }),
  );

  it("sets a card's name at twice the 12px it had, its glyph and i with it", () => {
    expect(rule("  .iris-salesflow #flow-summary .iris-kpi-label")).toContain("font-size: 1.5rem;");
    expect(rule(".iris-kpi-label", CHARTS)).toContain("font-size: 1.25rem;");
    const measured = rule(".iris-kpi-label .iris-measure-label", CHARTS);
    expect(measured).toContain("font-size: inherit;");
    expect(measured, "a name too long for its card wraps").toContain("white-space: normal;");
    /* The `i`'s button would set its own 13px type; it takes the name's, which sizes its dot. */
    expect(rule(".iris-kpi-label .iris-measure-info", CHARTS)).toContain("font-size: inherit;");
    expect(rule(".iris-kpi-label .iris-measure-dot", CHARTS)).toMatch(/width: 1\.6em;/);
  });

  it("sets What changed's names larger too, the lead three's largest", () => {
    expect(rule(".iris-ckpi-name", CHANGES)).toContain("font-size: 1.25rem;");
    expect(rule(".iris-ckpi[data-lead] .iris-ckpi-name", CHANGES)).toContain("font-size: 1.5rem;");
  });

  it("draws the sparkline under the words, across the card", () => {
    expect(card.indexOf("<svg"), "after the change and its words").toBeGreaterThan(
      card.indexOf("last 30 days"),
    );
    expect(rule(".iris-kpi-foot", CHARTS)).toContain("display: grid;");
    expect(rule(".iris-kpi-foot .iris-spark", CHARTS)).toMatch(
      /width: 100%;\s*max-width: [\d.]+rem;\s*height: auto;/,
    );
    /* No screen of the page gives it back a fixed width beside the words. */
    expect(SHEET).not.toMatch(/#flow-summary[^{]*\.iris-spark/);
  });

  it("scales it evenly to between 48 and 64px tall across a desktop card", () => {
    const [w, h] = (/viewBox="0 0 (\d+) (\d+)"/.exec(card) ?? []).slice(1).map(Number);
    /* A card holds about 226px at 1280 and 276px at 1920 (four across). */
    expect((226 * h!) / w!).toBeGreaterThanOrEqual(48);
    expect((276 * h!) / w!).toBeLessThanOrEqual(64);
  });

  /*
   * Review, 2026-10-23: "Typical length" stands alone in the 2fr column, twice
   * a card's width, and at a card's drawing stood 124px tall at 1440.
   */
  it("draws a wide card's line twice as long, so it stands as tall as its neighbours'", () => {
    const wide = renderToStaticMarkup(
      createElement(KpiCard, {
        label: "Typical length",
        value: "13m 51s",
        qualifier: null,
        delta: null,
        tone: "flat",
        points: [3, 5, 4, 8],
        wide: true,
      }),
    );
    expect(wide).toContain('data-wide="true"');
    expect(card).not.toContain("data-wide");
    const [w, h] = (/viewBox="0 0 (\d+) (\d+)"/.exec(wide) ?? []).slice(1).map(Number);
    /* Two cards and the hairline between them: about 453px at 1280, 553px at 1920. */
    expect((453 * h!) / w!).toBeGreaterThanOrEqual(48);
    expect((553 * h!) / w!).toBeLessThanOrEqual(64);
    /* The figure outside any group is wide where it lands in the first, 2fr, column. */
    expect(FLOW).toContain("kpiCard(item.id, index % 3 === 0)");
  });

  it("holds every line under 64px where a one-column layout stretches its card", () => {
    const capPx = (selector: string) =>
      Number(/max-width: ([\d.]+)rem;/.exec(rule(selector, CHARTS))?.[1]) * 16;
    expect((capPx(".iris-kpi-foot .iris-spark") * 52) / 240).toBeLessThanOrEqual(64);
    expect((capPx(".iris-kpi-foot[data-wide] .iris-spark") * 52) / 480).toBeLessThanOrEqual(64);
    /* Neither cap reaches a desktop card: 276px a card, 553px a wide one at 1920. */
    expect(capPx(".iris-kpi-foot .iris-spark")).toBeGreaterThanOrEqual(276);
    expect(capPx(".iris-kpi-foot[data-wide] .iris-spark")).toBeGreaterThanOrEqual(553);
  });
});

describe("the rail", () => {
  /* Review round 1: on a landscape phone its fifteen dots ran under the header and off the screen. */
  it("is drawn only where its dots fit under the chrome, and is as tall as they are", () => {
    expect(SHEET).toContain("@media (width >= 40rem) and (height >= 33rem) {");
    expect(RAIL_SHEET).toContain("@media (width >= 40rem) and (height >= 33rem) {");
    const at = RAIL_SHEET.indexOf("  .screen-rail {");
    expect(at).toBeGreaterThan(-1);
    const rail = RAIL_SHEET.slice(at, RAIL_SHEET.indexOf("}", at));
    expect(rail).toContain("align-self: start;");
    expect(rail).toContain("var(--screen-dots, 15) * 26px");
    expect(rail).not.toContain("height:");
    /* Sales Flow's screens' height is the rail's. */
    expect(SHEET).toMatch(/--screen-top: var\(--flow-top\);\s*--screen-h: var\(--flow-h\);/);
  });

  /*
   * Review round 1: a native fragment link pushed a history entry the App
   * Router ignores, so Back after a dot and a window pick showed the wrong
   * figures. A dot goes to its screen and replaces the address instead.
   */
  it("goes to a screen without a history entry the router does not know", () => {
    expect(RAIL).toContain("event.preventDefault();");
    expect(RAIL).toContain('history.replaceState(history.state, "", `#${id}`);');
    expect(RAIL).not.toContain("pushState");
  });

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
      '<nav class="screen-rail" aria-label="Sales Flow screens" style="--screen-dots:2">',
    );
    expect(html).toContain('href="#flow-verdict" aria-label="The verdict"');
    expect(html).toMatch(/href="#flow-verdict"[^>]*aria-current="location"/);
    expect(html).not.toMatch(/href="#flow-summary"[^>]*aria-current/);
  });
});

/*
 * One turn of the wheel, one screen (the owner, 2026-10-22). Three screens of
 * 771 at 0, 800 and 1600 under a 771 view; then a tall middle screen.
 */
describe("Sales Flow's wheel", () => {
  const tops = [0, 800, 1600];
  const fit = [771, 771, 771];

  it("goes to the next or the previous screen, and lets the page scroll past the ends", () => {
    expect(wheelTarget(0, 771, tops, fit, 1)).toBe(1);
    expect(wheelTarget(800, 771, tops, fit, -1)).toBe(0);
    expect(wheelTarget(800, 771, tops, fit, 1)).toBe(2);
    expect(wheelTarget(0, 771, tops, fit, -1)).toBeNull();
    expect(wheelTarget(1600, 771, tops, fit, 1)).toBeNull();
  });

  it("reads a screen taller than the view through before it moves on", () => {
    const tall = [0, 800, 2000];
    const heights = [771, 1200, 771];
    expect(wheelTarget(800, 771, tall, heights, 1)).toBeNull();
    expect(wheelTarget(1229, 771, tall, heights, 1)).toBe(2);
    expect(wheelTarget(1000, 771, tall, heights, -1)).toBeNull();
    expect(wheelTarget(800, 771, tall, heights, -1)).toBe(0);
  });

  it("takes a reader above the first screen to it, and no further up", () => {
    expect(wheelTarget(0, 771, [120, 900], fit, 1)).toBe(0);
    expect(wheelTarget(0, 771, [120, 900], fit, -1)).toBeNull();
  });
});
