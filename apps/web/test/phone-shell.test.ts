import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const route = vi.hoisted(() => ({ path: "/shark/shark-residence/ask" }));
vi.mock("next/navigation", () => ({
  usePathname: () => route.path,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push() {}, replace() {}, refresh() {}, prefetch() {} }),
}));

const { Shell } = await import("../src/components/iris/Shell");

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
const PRODUCT = sheet("observer-product.css");
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

  it("draws the export dialog on a solid ground, not the 5% panel tint", () => {
    const ground = rule(PRODUCT, ".ox-dialog-panel");
    expect(ground).toMatch(/background:\s*#0b111b/);
    expect(ground).not.toMatch(/var\(--ox-panel\)/);
  });

  it("points at the period control, not at a bar a phone does not have", () => {
    const copy = source("components/report/ExportReport.tsx");
    expect(copy).not.toMatch(/bar at the top/);
    expect(copy).toMatch(/period control \(on a phone, in the menu\)/);
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

/** The shell's chrome as the server renders it, at `path`. */
function shellAt(path: string, projectCount = 2): string {
  route.path = path;
  const projects = [
    { value: "shark-residence", label: "Shark Residence", href: "/shark/shark-residence/ask" },
    { value: "shark-harbour", label: "Shark Harbour", href: "/shark/shark-harbour/ask" },
  ].slice(0, projectCount);
  return renderToStaticMarkup(
    h(Shell, {
      scope: { tenantSlug: "shark", projectSlug: "shark-residence" },
      viewer: { displayName: "Clara Weiss", roleLabel: "Company admin" },
      projects,
      developerName: "Shark Developments",
      projectTotal: projectCount,
      account: h("a", { href: "/projects" }, "Projects"),
      accountAsk: h("button", { className: "irs-signout", type: "submit" }, "Sign out"),
      children: null,
    }),
  );
}

/** The phone sheet's markup alone: from the bar to the end of the document's chrome. */
function phoneSheet(html: string): string {
  const at = html.indexOf('class="irs-mobile-bar"');
  return at === -1 ? "" : html.slice(at, html.indexOf('id="main"'));
}

describe("a header with its account row on a phone (/projects, /settings)", () => {
  const NARROW = within(SHELL, "@media (width <= 30rem)");

  it("grows to hold its two rows instead of cramming them into 58px", () => {
    const header = rule(NARROW, ".irs-header");
    expect(header).toMatch(/height:\s*auto/);
    expect(header).toMatch(/min-height:\s*var\(--iris-header-height-mobile\)/);
    expect(header).toMatch(/padding-block:\s*10px/);
  });

  it("lifts the laptop cap on the reader's role, sets it at 12px, and makes the controls thumb-sized", () => {
    expect(rule(NARROW, ".irs-shell .irs-header-end .irs-who")).toMatch(/max-width:\s*none/);
    expect(rule(NARROW, ".irs-header-end .irs-who-role")).toMatch(/font-size:\s*12px/);
    expect(rule(NARROW, ".irs-header-end .ox-btn")).toMatch(/min-height:\s*44px/);
  });
});

describe("Ask IRIS on a phone", () => {
  it("hides the export's header below 1199px on every variant, Ask IRIS's included", () => {
    const hide = rule(
      PHONE_SHELL,
      ".irs-shell .irs-nav--wide,\n  .irs-shell .irs-header-end--wide",
    );
    expect(hide).toMatch(/display:\s*none/);
    expect(PHONE_SHELL).not.toMatch(/:not\(\[data-variant="ask"\]\)\s*\.irs-nav--wide/);
  });

  it("renders the menu on Ask IRIS, holding only what its reduced header holds", () => {
    const ask = phoneSheet(shellAt("/shark/shark-residence/ask"));
    expect(ask).not.toBe("");
    expect(ask).toContain('aria-label="Sections"');
    expect(ask).toContain('class="irs-signout"');
    expect(ask).toContain('aria-label="Switch project"');
    /* What the export leaves out of its header, the sheet leaves out too. */
    expect(ask).not.toContain('href="/projects">Projects</a>');
    expect(ask).not.toContain('aria-label="Period"');
  });

  it("draws no project switch for an account with one project", () => {
    expect(phoneSheet(shellAt("/shark/shark-residence/ask", 1))).not.toContain("Switch project");
  });

  it("leaves every other surface's sheet as it was", () => {
    const flow = phoneSheet(shellAt("/shark/shark-residence/flow"));
    expect(flow).toContain('aria-label="Period"');
    expect(flow).toContain('href="/projects">Projects</a>');
    expect(flow).not.toContain("irs-signout");
  });
});

describe("content on a phone is inset once", () => {
  const PHONE = within(SHELL, "@media (width < 40rem)");

  it("gives the wide column the header's gutter, not the desktop's 24px", () => {
    expect(rule(PHONE, ".irs-main--wide")).toMatch(
      /width:\s*calc\(100vw - 2 \* var\(--iris-shell-pad\)\)/,
    );
  });

  it("lets a plane give up its side padding and its tint, leaving the card's edge as the frame", () => {
    const plane = rule(PHONE, ".irs-main .iris-plane");
    expect(plane).toMatch(/padding:\s*1\.25rem 0;/);
    expect(plane).toMatch(/background:\s*none/);
  });
});

describe("a ranked list on a narrow screen", () => {
  const NARROW = within(sheet("charts.css"), "@media (max-width: 60rem)");

  it("wraps the line under a name instead of ending it in an ellipsis a phone cannot hover", () => {
    const line = rule(NARROW, ".iris-ranked-name em");
    expect(line).toMatch(/white-space:\s*normal/);
    expect(line).toMatch(/font-size:\s*0\.75rem/);
  });

  it("sizes the value column to its value", () => {
    expect(rule(NARROW, ".iris-ranked li")).toMatch(
      /grid-template-columns:\s*1\.25rem minmax\(0, 1fr\) auto/,
    );
  });
});

describe("the Ask IRIS home on a phone", () => {
  const ASK = sheet("ask-iris.css");
  const DENSE = '.ask-openings[data-dense="true"] .ask-opening';

  it("holds the dense rows' fixed 50px to wider screens, so a three-line question grows its row", () => {
    expect(rule(within(ASK, "@media (width > 48rem)"), DENSE)).toMatch(/height:\s*50px/);
    expect(ASK.split(`${DENSE} {`)).toHaveLength(2);
    expect(rule(within(ASK, "@media (width <= 48rem)"), ".ask-opening")).toMatch(/height:\s*auto/);
  });

  it("makes the three named destinations thumb-sized", () => {
    expect(rule(within(ASK, "@media (width <= 48rem)"), ".ask-quicklink")).toMatch(
      /min-height:\s*44px/,
    );
  });
});

describe("the welcome on a touch screen", () => {
  const TOUCH = within(sheet("ask-iris.css"), "@media (hover: none)");

  it("names no Esc key a phone does not have, and its Skip is thumb-sized", () => {
    expect(rule(TOUCH, ".welcome-skip kbd")).toMatch(/display:\s*none/);
    expect(rule(TOUCH, ".welcome-skip")).toMatch(/min-height:\s*44px/);
  });
});
