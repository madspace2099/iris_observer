import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE PROJECT PAGE, ONE SCREEN AT A TIME (the owner, 2026-10-23, ADR-0063).
 *
 * Source assertions on the page's JSX, comments stripped, as
 * `agents-screens` and `flow-screens` do it, and on the page's screen sheet.
 */
const source = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "..", path), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
const PAGE = source("src/app/(app)/[tenantSlug]/[projectSlug]/project/page.tsx");
const SHEET = source("src/components/project/project-screens.css");

/** A screen's markup: from its opening tag to the next screen's, or to the rail. */
function screen(id: string): string {
  const at = PAGE.indexOf(`id="${id}"`);
  const next = PAGE.indexOf('className="screen"', at);
  return PAGE.slice(at, next === -1 ? PAGE.indexOf("<ScreenRail", at) : next);
}

describe("the Project page's screens", () => {
  it("draws every screen the rail lists, in the page's order, and lists every screen it draws", () => {
    const listed = [...PAGE.matchAll(/\{ id: "(project-[a-z]+)", label: /g)].map((m) => m[1]);
    const drawn = [...PAGE.matchAll(/className="screen"\s+id="(project-[a-z]+)"/g)].map(
      (m) => m[1],
    );
    expect(listed).toEqual([
      "project-verdict",
      "project-plan",
      "project-types",
      "project-readings",
      "project-compare",
      "project-search",
      "project-path",
      "project-findings",
    ]);
    expect(drawn).toEqual(listed);
  });

  it("parts the screens by their edges, not by rules", () => {
    expect(PAGE).not.toContain("iris-rule");
  });

  it("opens on the verdict and the page's ways on, nothing else", () => {
    const verdict = screen("project-verdict");
    expect(verdict).toContain("<SpokenVerdict");
    expect(verdict).toContain("<ExportReport");
    expect(verdict.match(/<Link\b/g)).toHaveLength(2);
    expect(verdict).not.toMatch(/<(InfoTip|DrawIn|SalesPlanBlock)\b/);
  });

  it("lists the room types' screens only with a catalogue, and closes the plan's with why not", () => {
    expect(PAGE).toMatch(
      /\.\.\.\(types\s*\?\s*\[\s*\{ id: "project-types"[\s\S]*?\{ id: "project-compare"[^}]*\},?\s*\]\s*:\s*\[\]\)/,
    );
    expect(PAGE).toMatch(/\{types \? \(\s*<>\s*<div className="screen" id="project-types">/);
    expect(screen("project-plan")).toMatch(
      /\{types \? null : \([\s\S]*?no unit catalogue has reached this project/,
    );
  });

  it("puts each chart on its own screen, and the searches with the places", () => {
    expect(screen("project-plan")).toContain("<SalesPlanBlock");
    expect(screen("project-types")).toContain("<RoomTypes");
    expect(screen("project-readings")).toContain("<RoomReadings");
    expect(screen("project-compare")).toContain("<RoomCompare");
    const search = screen("project-search");
    for (const title of [
      "What buyers searched for",
      "What the neighbourhood is doing",
      "The places buyers stopped on",
    ])
      expect(search).toContain(title);
    expect(screen("project-path")).toContain("<PresentationPath");
    expect(screen("project-findings")).toMatch(/<Finding\b[\s\S]*<Gaps/);
  });

  it("keeps the search's denominators and its shortfall in sight, outside an i", () => {
    for (const text of [
      "{applicationsHead}",
      "{matchesHead}",
      "of these searches matched no available unit at all.",
      "Share of the time spent on named places.",
    ]) {
      const at = PAGE.indexOf(text);
      expect(at, text).toBeGreaterThan(-1);
      const open = PAGE.lastIndexOf("<InfoTip", at);
      const close = PAGE.lastIndexOf("</InfoTip>", at);
      expect(open < close || open === -1, `${text} stands behind an i`).toBe(true);
    }
  });

  it("re-keys the rail on the period, names it, and draws it after the screens", () => {
    expect(PAGE).toMatch(
      /<\/section>\s*<ScreenRail key=\{`rail-\$\{query\.period\}`\} screens=\{screens\} label="Project screens" \/>/,
    );
    expect(PAGE).toMatch(/className="iris-one pr-page iris-screens"/);
  });

  it("keeps Next's prefetch only on the two action pills (ADR-0062)", () => {
    const links = [...PAGE.matchAll(/<Link\b[^>]*>/g)].map((m) => m[0]);
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toContain('className="iris-action"');
  });
});

describe("the page's screen sheet", () => {
  it("scopes every rule to the page", () => {
    const preludes = SHEET.split("{")
      .slice(0, -1)
      .map((s) => (s.split(/[;}]/).pop() ?? "").trim())
      .filter((p) => !p.startsWith("@"));
    expect(preludes.length).toBeGreaterThan(20);
    for (const prelude of preludes)
      for (const selector of prelude.split(/,(?![^(]*\))/))
        expect(selector.trim()).toMatch(/^\.pr-page\s/);
  });

  it("never draws the interest line under the size it is drawn at", () => {
    const lines = source("src/components/project/RoomTypes.tsx");
    expect(lines).toContain("height: Math.max(HEIGHT, Math.round(el.clientHeight))");
    expect(lines).toMatch(/viewBox=\{`0 0 \$\{String\(width\)\} \$\{String\(height\)\}`\}/);
    expect(source("src/components/project/rooms.css")).toMatch(
      /\.pr-lines \{\s*min-width: 0;\s*height: 196px;\s*\}/,
    );
    for (const m of SHEET.matchAll(/\.pr-lines \{\s*height: ([^;]+);/g))
      expect(m[1], "the line's box").toMatch(/^(max|clamp)\(196px,/);
  });
});
