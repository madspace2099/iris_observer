import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * THE SHELL ON A PHONE, ASSERTED (2026-10-22, stream SHELL).
 *
 * Máté asked for the demo to work on a phone, and three reviewers walked it at
 * 390 and 360. Every rule pinned here was a measured defect on the running
 * build: a panel whose prose printed over the figures beneath it, a period
 * list cut off below the sheet, a menu trigger that scrolled away. They are
 * structural, so they are asserted on the stylesheets' executable text — the
 * comments explaining each rule are stripped first, so a guard can never be
 * satisfied by its own reasoning.
 */

const UI = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "packages", "ui", "src");
const WEB = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

function executable(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

const sheet = (name: string) => executable(readFileSync(join(UI, name), "utf8"));
const source = (path: string) => readFileSync(join(WEB, path), "utf8");

/** Every block opened by exactly this at-rule prelude, concatenated. */
function within(code: string, prelude: string): string {
  let out = "";
  let at = code.indexOf(prelude);
  while (at !== -1) {
    let depth = 0;
    let i = code.indexOf("{", at);
    const start = i + 1;
    for (; i < code.length; i += 1) {
      if (code[i] === "{") depth += 1;
      else if (code[i] === "}" && --depth === 0) break;
    }
    out += code.slice(start, i) + "\n";
    at = code.indexOf(prelude, i);
  }
  return out;
}

/** The declarations of every rule whose selector list is exactly `selector`. */
function rule(code: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const found = [...code.matchAll(new RegExp(`(?:^|[}\\s])${escaped}\\s*\\{([^}]*)\\}`, "g"))];
  return found.map((m) => m[1]).join("\n");
}

const SHELL = sheet("iris-shell.css");
const SHOWROOM = sheet("showroom.css");
const PHONE_SHELL = within(SHELL, "@media (width <= 1199px)");

describe("the guards read what they claim to", () => {
  it("finds a rule inside a media block, and not outside it", () => {
    const css = "a { color: red } @media (width <= 10px) { b { color: blue } }";
    expect(rule(within(css, "@media (width <= 10px)"), "b")).toContain("blue");
    expect(rule(within(css, "@media (width <= 10px)"), "a")).toBe("");
  });
});

describe("an explanation panel is opaque", () => {
  it("draws the KPI measure panel on a solid ground, not the 8% plane tint", () => {
    const ground = rule(SHOWROOM, ".iris-measure-panel");
    expect(ground).toMatch(/background:\s*#0b111b/);
    expect(ground).not.toMatch(/background:\s*var\(--plane-2\)/);
  });

  it("sets its labels at the 12px floor", () => {
    expect(rule(SHOWROOM, ".iris-measure-panel em")).toMatch(/font-size:\s*0\.75rem/);
  });
});

describe("the phone menu", () => {
  it("keeps its bar, and the only way to the menu, pinned while the page scrolls", () => {
    expect(rule(PHONE_SHELL, ".irs-mobile-bar")).toMatch(/position:\s*fixed/);
  });

  it("opens a switcher's list in the sheet's own flow, so the sheet's scroller holds it", () => {
    const list = rule(PHONE_SHELL, ".irs-mobile-context .ox-menu-panel");
    expect(list).toMatch(/position:\s*static/);
    expect(list).toMatch(/max-height:\s*none/);
  });

  it("brings an opened list into view inside the sheet", () => {
    const switcher = source("components/ContextSwitcher.tsx");
    expect(switcher).toMatch(/closest\("\.irs-mobile-menu-scroll"\)/);
    expect(switcher).toMatch(/scrollIntoView\(\{ block: "nearest" \}\)/);
  });

  it("draws the close mark in the sheet's own close button", () => {
    expect(rule(PHONE_SHELL, ".irs-mobile-menu-close .irs-menu-mark-close")).toMatch(
      /display:\s*block/,
    );
  });
});
