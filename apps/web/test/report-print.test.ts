import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * THE PRINTED REPORT'S PAGE RULES (ADR-0049), READ FROM THE SHEET.
 *
 * The owner's PDF was fourteen pages with half pages left white. Two rules
 * caused most of it and a test holds each: the phone layout reached paper (an
 * A4 page less its margins is narrower than 48rem), and `break-inside: avoid`
 * on every section pushed whole sections onto fresh pages. And the document
 * the fix built — an A4 page box named `report` with a running footer and a
 * bare first page for the cover — is held here, so a later edit cannot drop
 * the footer or the page numbers without saying so.
 */

const UI = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "packages", "ui", "src");
const CODE = readFileSync(join(UI, "observer-product.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** Every block that opens with `head`, braces balanced, as `[prelude, body]`. */
function blocks(code: string, head: RegExp): readonly (readonly [string, string])[] {
  const found: (readonly [string, string])[] = [];
  for (const match of code.matchAll(head)) {
    const open = code.indexOf("{", match.index);
    let depth = 0;
    let i = open;
    for (; i < code.length; i += 1) {
      if (code[i] === "{") depth += 1;
      else if (code[i] === "}" && --depth === 0) break;
    }
    found.push([code.slice(match.index, open).trim(), code.slice(open + 1, i)]);
  }
  return found;
}

const PRINT = blocks(CODE, /@media print\s*\{/g)
  .map(([, body]) => body)
  .join("\n");

/** The rules inside the print blocks, as selector lists and declarations. */
const PRINT_RULES = [...PRINT.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  selectors: (m[1] ?? "")
    .split(",")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0),
  body: m[2] ?? "",
}));

describe("the report's page box", () => {
  const page = blocks(CODE, /@page report\s*\{/g);
  const first = blocks(CODE, /@page report:first\s*\{/g);

  it("is an A4 sheet with margins, numbered in its footer", () => {
    expect(page, "@page report is declared once").toHaveLength(1);
    const body = page[0]?.[1] ?? "";
    expect(body).toMatch(/size:\s*A4/);
    expect(body).toMatch(/margin:\s*16mm 14mm 18mm/);
    const [left] = blocks(body, /@bottom-left\s*\{/g);
    const [right] = blocks(body, /@bottom-right\s*\{/g);
    expect(left?.[1], "the footer names the product").toMatch(/content:\s*"IRIS Observer"/);
    expect(right?.[1], "the footer numbers the pages").toMatch(
      /content:\s*counter\(page\)\s*" \/ "\s*counter\(pages\)/,
    );
  });

  it("leaves the cover's page bare and edge to edge", () => {
    expect(first).toHaveLength(1);
    const body = first[0]?.[1] ?? "";
    expect(body).toMatch(/margin:\s*0;/);
    for (const box of ["@bottom-left", "@bottom-right"]) {
      const [rule] = blocks(body, new RegExp(`${box}\\s*\\{`, "g"));
      expect(rule?.[1], box).toMatch(/content:\s*none/);
    }
  });

  it("reaches the report alone, through a named page", () => {
    const report = PRINT_RULES.find((rule) => rule.selectors.includes(".ox-report"));
    expect(report?.body).toMatch(/page:\s*report/);
    /* No other page box: printing any other screen keeps the browser's own. */
    expect([...CODE.matchAll(/@page\b(?!\s+report)/g)]).toEqual([]);
  });
});

describe("the printed report flows", () => {
  it("keeps no section, plane or whole page region together", () => {
    const SECTION =
      /(^|\s)(section|\.ox-plane|\.ox-report-section|\.ox-report-notes|\.ox-report-toc|\.ox-report|\.ox-body|\.ox-page)$/;
    const avoiding = PRINT_RULES.filter((rule) => /(page-)?break-inside:\s*avoid/.test(rule.body));
    expect(avoiding.length, "the scan found the small blocks it allows").toBeGreaterThan(0);
    const sections = avoiding.flatMap((rule) => rule.selectors).filter((s) => SECTION.test(s));
    expect(sections, "a section-level rule keeps a whole region on one page").toEqual([]);
  });

  it("repeats a table's head on every page and keeps a heading with what follows", () => {
    const thead = PRINT_RULES.find((rule) => rule.selectors.includes(".ox-report .ox-table thead"));
    expect(PRINT).toMatch(/\.ox-report \.ox-table thead\s*\{\s*display:\s*table-header-group/);
    expect(thead).toBeDefined();
    const heading = PRINT_RULES.find((rule) =>
      rule.selectors.includes(".ox-report .ox-section-head"),
    );
    expect(heading?.body).toMatch(/break-after:\s*avoid/);
  });

  it("starts the cover on the graphite ground and ends it with its page", () => {
    const cover = PRINT_RULES.find((rule) => rule.selectors.includes(".ox-report .ox-cover"));
    expect(cover?.body).toMatch(/break-after:\s*page/);
    expect(cover?.body).toMatch(/(?:^|[^-])print-color-adjust:\s*exact/);
    expect(cover?.body).toMatch(/width:\s*210mm/);
  });

  it("lays paper out as a desk, not as a phone", () => {
    /*
     * A4 less its margins is about 43rem, under the 48rem step: unguarded, the
     * phone layout's one-cell-per-line records were the printed tables.
     */
    const narrow = [...CODE.matchAll(/@media([^{]*\(width <= (?:48|30)rem\)[^{]*)\{/g)].map((m) =>
      (m[1] ?? "").trim(),
    );
    expect(narrow.length).toBeGreaterThan(0);
    expect(narrow.filter((query) => !query.startsWith("screen and"))).toEqual([]);
  });
});
