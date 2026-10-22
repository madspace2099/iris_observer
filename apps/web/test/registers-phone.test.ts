import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEFAULT_LANGUAGE } from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "@observer/synthetic";
import { Count } from "@/components/features/Reading";
import { MeetingRegister, parseMeetingFilters } from "@/components/meetings";
import { PHONE_PAGE } from "@/components/meetings/MeetingRegister";
import { DataTable } from "@/components/product";

/**
 * THE REGISTERS, PRESENTATION AND THE REPORT ON A PHONE (the owner,
 * 2026-10-22: "Check mobile responsiveness!").
 *
 * The phone rules are CSS; what is held here is the markup they key on, and
 * that every record a phone folds away is still one press from the reader.
 */

const web = resolve(import.meta.dirname, "..");
const sheet = (path: string) => readFileSync(resolve(web, path), "utf8");

describe("a register's order on a phone", () => {
  const table = (sorted: boolean) =>
    renderToStaticMarkup(
      createElement(DataTable, {
        caption: "Units",
        period: "quarter_to_date",
        codeColumn: "code",
        columns: [
          {
            key: "code",
            label: "Unit",
            sort: sorted ? { href: "/u?sort=code&dir=asc", direction: "none" } : null,
          },
          {
            key: "views",
            label: "Views",
            numeric: true,
            sort: sorted ? { href: "/u?sort=views&dir=asc", direction: "descending" } : null,
          },
        ],
        rows: [{ key: "a", cells: { code: "S-101", views: 3 } }],
      }),
    );

  it("stands above the records with every order the head offers, the one in force named", () => {
    const html = table(true);
    expect(html).toContain('class="ox-table-order"');
    expect(html).toContain("Order by: Views");
    expect(html).toContain('href="/u?sort=code&amp;dir=asc"');
    expect(html.match(/href="\/u\?sort=views&amp;dir=asc"/g)).toHaveLength(2);
  });

  it("is not drawn for a register with no order to choose", () => {
    expect(table(false)).not.toContain("ox-table-order");
  });
});

describe("the meeting register on a phone", async () => {
  const repo = new SyntheticObserverRepository();
  const view = await repo.getMeetings(
    {
      viewer: VIEWERS.developerShark,
      tenantSlug: "shark",
      projectSlug: "shark-residence",
      period: "quarter_to_date",
      language: DEFAULT_LANGUAGE,
    },
    parseMeetingFilters({}),
  );
  const register = (rows: typeof view.rows, all: boolean) =>
    renderToStaticMarkup(
      createElement(MeetingRegister, {
        rows,
        period: "quarter_to_date",
        filters: view.filters,
        caption: "Meetings",
        canOpen: false,
        emptyState: "None",
        all,
        moreHref: "/shark/shark-residence/meetings?more=1",
      }),
    );

  it("sends every row, and offers the ones a phone folds away in one press", () => {
    expect(view.rows.length).toBeGreaterThan(PHONE_PAGE);
    const html = register(view.rows, false);
    expect(html.match(/<tr>/g)?.length).toBe(view.rows.length + 1);
    expect(html).toContain(`Show the remaining ${view.rows.length - PHONE_PAGE} meetings`);
    expect(html).toContain('href="/shark/shark-residence/meetings?more=1"');
  });

  it("offers nothing once every row was asked for, or when twenty is all there is", () => {
    expect(register(view.rows, true)).not.toContain("Show the remaining");
    expect(register(view.rows.slice(0, PHONE_PAGE), false)).not.toContain("Show the remaining");
  });

  it("folds from the twenty-first record, the number the component offers", () => {
    expect(sheet("src/components/meetings/meetings.css")).toContain(
      `tbody tr:nth-child(n + ${PHONE_PAGE + 1})`,
    );
  });
});

describe("a figure and its denominator in a stacked record", () => {
  it("are one element, so a phone keeps them together", () => {
    expect(renderToStaticMarkup(createElement(Count, { n: 60, of: 150 }))).toBe(
      '<span>60<span class="ox-of"> of 150</span></span>',
    );
    expect(renderToStaticMarkup(createElement(Count, { n: 9 }))).toBe("9");
  });
});

describe("Presentation's comparison head", () => {
  it("drops its gap cell wherever the rows drop their gap bar", () => {
    const page = sheet("src/app/(app)/[tenantSlug]/[projectSlug]/presentation/page.tsx");
    expect(page).toContain('className="iris-code iris-diff-gaphead"');
    const css = sheet("src/app/(app)/[tenantSlug]/[projectSlug]/presentation/presentation.css");
    expect(css).toMatch(
      /@media \(max-width: 75rem\) \{\s*\.iris-presentation \.iris-diff-row > \.iris-diff-gaphead \{\s*display: none;/,
    );
  });
});

describe("the page-level phone sheets", () => {
  const SHEETS = {
    "src/app/(app)/[tenantSlug]/[projectSlug]/audience/audience.css": ".iris-audiencepage ",
    "src/app/(app)/[tenantSlug]/[projectSlug]/presentation/presentation.css": ".iris-presentation ",
    "src/app/(app)/[tenantSlug]/[projectSlug]/units/[unitCode]/unit.css": ".ox-unit-meetings",
    "src/components/units/units.css": ".ox-units-page ",
    "src/components/meetings/meetings.css": ".ox-meetings",
  } as const;

  it.each(Object.entries(SHEETS))("%s reaches only its own page", (path, scope) => {
    /* Every rule's prelude: the text before each "{", after the last "}" or ";". */
    const preludes = sheet(path)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("{")
      .slice(0, -1)
      .map((s) => (s.split(/[;}]/).pop() ?? "").trim());
    expect(preludes.length).toBeGreaterThan(0);
    for (const prelude of preludes) {
      if (prelude.startsWith("@")) continue;
      /* Commas inside `:is(...)` separate arguments, not selectors. */
      for (const selector of prelude.split(/,(?![^(]*\))/))
        expect(selector.trim().startsWith(scope), selector).toBe(true);
    }
  });
});
