import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScreenRail, pageTarget } from "@/components/screens/ScreenRail";

/**
 * THE SALES AGENTS PAGES, ONE SCREEN AT A TIME (the owner, 2026-10-23, ADR-0061).
 *
 * Source assertions on the pages' JSX, comments stripped, as `flow-screens`
 * does it, and on the shared screens' stylesheet.
 */
const source = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "..", path), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
const ROSTER = source("src/app/(app)/[tenantSlug]/[projectSlug]/agents/page.tsx");
const DETAIL = source("src/app/(app)/[tenantSlug]/[projectSlug]/agents/[agentId]/page.tsx");
const SHEET = source("src/components/screens/screens.css");

/** The ids a page lists for its rail, and the ids it draws as screens. */
function screens(page: string, prefix: string) {
  const listed = [...page.matchAll(new RegExp(`\\{ id: "(${prefix}-[a-z]+)", label: `, "g"))].map(
    (m) => m[1],
  );
  const drawn = [
    ...page.matchAll(new RegExp(`className="screen [^"]*"\\s+id="(${prefix}-[a-z]+)"`, "g")),
  ].map((m) => m[1]);
  return { listed, drawn };
}

describe("the roster and Coaching", () => {
  it("draws every screen the rail lists, and lists every screen it draws", () => {
    const { listed, drawn } = screens(ROSTER, "agents");
    expect(new Set(listed)).toEqual(
      new Set(["agents-verdict", "agents-cards", "agents-workload", "agents-coaching"]),
    );
    expect(new Set(drawn)).toEqual(new Set(listed));
    for (const id of drawn) expect(ROSTER).toMatch(new RegExp(`"screen [^"]*"\\s+id="${id}"`));
  });

  it("gives every name in Coaching's key and ends the dot the rows draw for it (review round)", () => {
    const chart = source("src/showroom/CoachingChart.tsx");
    expect(chart).toMatch(/<b>\s*<Dot tone=\{p\.tone\} \/>\s*\{p\.name\}/);
    expect(chart).toMatch(
      /<Dot key=\{id\} tone=\{person\.tone\} \/>[\s\S]*?<b>\{end\.names\}<\/b>/,
    );
  });

  it("opens on the verdict and the two tabs, nothing else", () => {
    const at = ROSTER.indexOf('id="agents-verdict"');
    const verdict = ROSTER.slice(at, ROSTER.indexOf('className="screen', at));
    expect(verdict).toContain("<SpokenVerdict");
    expect(verdict).toContain('role="tablist"');
    expect(verdict.match(/<Link\b/g)).toHaveLength(2);
    expect(verdict).not.toMatch(/<(InfoTip|OutcomeRing|PresenterBars)\b/);
  });

  it("re-keys the rail on the period and the tab, and draws it after the screens", () => {
    expect(ROSTER).toMatch(
      /<\/section>\s*<ScreenRail\s+key=\{`rail-\$\{period\}-\$\{coaching \? "coaching" : "roster"\}`\}/,
    );
    expect(ROSTER).toContain('label="Sales Agents screens"');
  });

  it("prefetches no card, chart or name link on sight; only the tabs keep Next's default", () => {
    const links = [...ROSTER.matchAll(/<Link\b[^>]*>/g)].map((m) => m[0]);
    const prefetching = links.filter((l) => !l.includes("prefetch={false}"));
    expect(prefetching).toHaveLength(2);
    for (const link of prefetching) expect(link).toContain('role="tab"');
    const chart = source("src/showroom/CoachingChart.tsx");
    for (const link of chart.match(/<Link\b[^>]*>/g) ?? [])
      expect(link).toContain("prefetch={false}");
  });
});

describe("an agent's page", () => {
  it("draws every screen the rail lists, and lists every screen it draws", () => {
    const { listed, drawn } = screens(DETAIL, "agent");
    expect(listed.length).toBe(8);
    expect(new Set(drawn)).toEqual(new Set(listed));
    for (const id of drawn) expect(DETAIL).toMatch(new RegExp(`"screen [^"]*"\\s+id="${id}"`));
  });

  it("draws the register's screen only for a reader who may open it, and says why otherwise", () => {
    expect(DETAIL).toMatch(
      /\.\.\.\(register \? \[\{ id: "agent-meetings", label: "Their most recent meetings" \}\] : \[\]\)/,
    );
    expect(DETAIL).toMatch(/\{register \? null : \([\s\S]*?Kept for the sales team/);
    /* It names what it withholds (review round), and that every one is counted (2026-10-23). */
    expect(DETAIL).toMatch(
      /Kept for the sales team[\s\S]*?\{view\.name\}&rsquo;s meetings one by one are for the sales team only; all\{" "\}\s*\{view\.sampleSize\} are counted on this page\./,
    );
  });

  it("puts the agent's face beside every title that names them", () => {
    const titles = [
      ...DETAIL.matchAll(/title=\{`([^`]*\$\{view\.name\}[^`]*)`\}[^>]*?face=\{face\}/g),
    ];
    expect(titles.map((m) => m[1])).toEqual([
      "How ${view.name} presents",
      "${view.name}: running order and time in each section",
    ]);
  });

  it("keeps every refusal and shortfall in sight, outside an i", () => {
    for (const text of [
      'what="Follow-ups completed"',
      'what="Verified outcomes"',
      "No trend",
      "not printed beside their stops",
      "The project&rsquo;s own rate is not set beside them",
      "No share beside these counts",
      "Scoped to the projects this account holds",
      /* An absent reference is a state (InfoTip's rule; review round). */
      "No drill-down reference stands behind",
      "No stage carries a drill-down reference.",
    ]) {
      const at = DETAIL.indexOf(text);
      expect(at, text).toBeGreaterThan(-1);
      const open = DETAIL.lastIndexOf("<InfoTip", at);
      const close = DETAIL.lastIndexOf("</InfoTip>", at);
      expect(open < close || open === -1, `${text} stands behind an i`).toBe(true);
    }
  });

  it("prefetches none of the page's own links on sight", () => {
    for (const link of DETAIL.match(/<Link\b[^>]*>/g) ?? [])
      expect(link).toContain("prefetch={false}");
    const register = source("src/components/agents/MeetingRegister.tsx");
    for (const link of register.match(/<Link\b[^>]*>/g) ?? [])
      expect(link).toContain("prefetch={false}");
  });
});

describe("the shared screens' stylesheet", () => {
  it("snaps by proximity, never mandatory, not under reduced motion, and never smoothly", () => {
    expect(SHEET.slice(0, SHEET.indexOf("@media"))).toMatch(/scroll-snap-type: y proximity;/);
    expect(SHEET).not.toContain("mandatory");
    expect(SHEET).not.toContain("scroll-behavior: smooth");
    const off = SHEET.indexOf("scroll-snap-type: none;");
    expect(SHEET.lastIndexOf("@media", off)).toBe(
      SHEET.indexOf("@media (prefers-reduced-motion: reduce)"),
    );
  });

  it("scopes every rule to the rail, a page that opts in, or the document while it holds one", () => {
    const preludes = SHEET.split("{")
      .slice(0, -1)
      .map((s) => (s.split(/[;}]/).pop() ?? "").trim())
      .filter((p) => !p.startsWith("@"));
    expect(preludes.length).toBeGreaterThan(10);
    for (const prelude of preludes)
      for (const selector of prelude.split(/,(?![^(]*\))/))
        expect(selector.trim()).toMatch(
          /^(\.screen-rail\b|\.iris-screens( |$| ~| >)|html:has\(\.iris-screens\))/,
        );
  });

  it("leaves the wheel to an open modal or a popover under the pointer (review round)", () => {
    const rail = source("src/components/screens/ScreenRail.tsx");
    const wheel = rail.slice(rail.indexOf("const onWheel"));
    const guard = wheel.indexOf('document.body.style.overflow === "hidden"');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(wheel.indexOf("event.preventDefault()"));
    expect(wheel).toContain(`closest("[popover], [role='dialog'], dialog")`);
  });

  it("names the rail by its page and marks the first screen before script runs", () => {
    const html = renderToStaticMarkup(
      createElement(ScreenRail, {
        screens: [
          { id: "agents-verdict", label: "The verdict" },
          { id: "agents-cards", label: "The presenters" },
        ],
        label: "Sales Agents screens",
      }),
    );
    expect(html).toContain('<nav class="screen-rail" aria-label="Sales Agents screens"');
    expect(html).toMatch(/href="#agents-verdict"[^>]*aria-current="location"/);
    expect(html).not.toMatch(/href="#agents-cards"[^>]*aria-current/);
  });
});

/*
 * Under reduced motion the page does not snap, so Page Down, Page Up, Space and
 * the arrows landed mid-screen; with motion the snap pulled an arrow back to
 * where it started (review round 8). They step a screen at a time, at once
 * under reduced motion, and read a screen taller than the view a view at a time.
 */
describe("the keys", () => {
  const tops = [0, 800, 1600];
  const fit = [771, 771, 771];

  it("go to the next or the previous screen's top, and leave the ends to the page", () => {
    expect(pageTarget(0, 771, tops, fit, 1)).toBe(800);
    expect(pageTarget(410, 771, tops, fit, 1)).toBe(800);
    expect(pageTarget(800, 771, tops, fit, -1)).toBe(0);
    expect(pageTarget(1600, 771, tops, fit, 1)).toBeNull();
    expect(pageTarget(0, 771, tops, fit, -1)).toBeNull();
  });

  it("read a tall screen a view at a time, never past its edge", () => {
    const tall = [0, 800, 2600];
    const heights = [771, 1800, 771];
    expect(pageTarget(800, 771, tall, heights, 1)).toBe(1571);
    expect(pageTarget(1571, 771, tall, heights, 1)).toBe(1829);
    expect(pageTarget(1829, 771, tall, heights, 1)).toBe(2600);
    expect(pageTarget(1829, 771, tall, heights, -1)).toBe(1058);
    expect(pageTarget(1058, 771, tall, heights, -1)).toBe(800);
  });

  it("go back into a tall screen at its last view, not its top", () => {
    const tall = [0, 800, 2600];
    const heights = [771, 1800, 771];
    expect(pageTarget(2600, 771, tall, heights, -1)).toBe(1829);
    expect(pageTarget(1829, 771, tall, heights, -1)).toBe(1058);
    expect(pageTarget(800, 771, tall, heights, -1)).toBe(0);
  });

  it("are stepped by the shared rail, at once under reduced motion, and leave a control its keys", () => {
    const rail = source("src/components/screens/ScreenRail.tsx");
    const keys = rail.slice(rail.indexOf("const onKey"), rail.indexOf("const onWheel"));
    expect(keys).toContain(`"a[href], [tabindex='-1']"`);
    expect(keys).toContain(`"a[href], button, summary, [tabindex='-1']"`);
    expect(keys).toContain(".ox-menu[open], .irs-mobile-menu[open]");
    expect(keys).toContain("event.defaultPrevented");
    expect(rail).toContain('behavior: still.matches ? "instant" : "smooth"');
    expect(rail).toContain('window.addEventListener("keydown", onKey)');
  });
});
