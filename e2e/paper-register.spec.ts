import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./sign-in";

/**
 * THE PRINTED REGISTER KEEPS THE SCREEN'S GATE AND THE JOIN'S RULES.
 *
 * `/report?agent=` draws the agent's register — the same component, behind
 * the same `AGENT_REGISTER_ROLES` — on a page whose one control is the
 * browser's print dialog. A screen can be re-rendered; a PDF that left the
 * building cannot be recalled. And the gate on paper is a second code path:
 * the manifest's `unavailable` branch and the page's `content` map, not the
 * agent screen's ternary that `register-gate.spec.ts` measures. Two guards in
 * this programme have already broken on exactly such a second path. So the
 * paper gets its own, measured in the rendered document:
 *
 *   (a) for one of the three permitted roles the register is on the page and
 *       a row carries the buyer's name beside its label;
 *   (b) for the fourth role, the developer, there is no register table on the
 *       page, and the manifest's section is blank with its reason named;
 *   (c) the names on paper follow the join's rules: Lucia Horváth's eight
 *       rows hold an erased contact and two whose consent is withdrawn, and
 *       those rows print the label alone. The expected rows are the
 *       fixture's own facts (`packages/synthetic/src/contacts.ts`,
 *       `showroom/sessions.ts`), stated here so the assertion names them.
 */

const PAPER = "/alpha/ister-tower/report?agent=agt_luciahorvath";
const SECTION = "#agent-meetings";

async function paper(page: Page) {
  return page.locator(SECTION).evaluate((section) => {
    const table = section.querySelector("table");
    const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    return {
      tables: section.querySelectorAll("table").length,
      chip: text(section.querySelector(".ox-section-head .ox-chip")),
      reason: [...section.querySelectorAll(":scope > .ox-section-note")].map(text).join(" "),
      rows: table
        ? [...table.querySelectorAll("tbody tr")].map((tr) => {
            const cells = tr.querySelectorAll("td, th");
            const visitor = cells[cells.length - 1] ?? null;
            return {
              meeting: text(cells[0] ?? null),
              name: visitor?.querySelector(".ox-visitor-name")?.textContent?.trim() ?? null,
              label: text(visitor?.querySelector(".ox-n") ?? null),
            };
          })
        : [],
    };
  });
}

test("(a) the printed register names the buyer for the sales team", async ({ page }) => {
  await signInAs(page, "Tomáš Varga");
  await page.goto(PAPER);
  const seen = await paper(page);
  const named = seen.rows.filter((r) => r.name !== null);
  expect({
    tables: seen.tables,
    named: named.length > 0,
    labelless: named.filter((r) => r.label === "").length,
  }).toEqual({ tables: 1, named: true, labelless: 0 });
});

test("(b) the developer's printed page has no register and says why", async ({ page }) => {
  await signInAs(page, "Petra Novák");
  await page.goto(PAPER);
  const seen = await paper(page);
  expect({
    tables: seen.tables,
    chip: seen.chip,
    keptForTheSalesTeam: seen.reason.includes("Kept for the sales team"),
  }).toEqual({ tables: 0, chip: "Blank", keptForTheSalesTeam: true });
});

test("(c) a withdrawn consent and an erased contact print no name on paper", async ({ page }) => {
  await signInAs(page, "Tomáš Varga");
  await page.goto(PAPER);
  const seen = await paper(page);
  expect(seen.rows).toEqual([
    /* con_1022, erased: the label stands, the name does not. */
    { meeting: "23 Aug · 14:17", name: null, label: "Returning · 2nd meeting" },
    /* con_1017, consent withdrawn. */
    { meeting: "20 Aug · 09:00", name: null, label: "First meeting" },
    { meeting: "15 Aug · 12:46", name: null, label: "Not linked to a contact" },
    /* con_1003, consent withdrawn. */
    { meeting: "11 Aug · 13:02", name: null, label: "Returning · 2nd meeting" },
    { meeting: "8 Aug · 11:50", name: "Ilona Balog", label: "Returning · 2nd meeting" },
    { meeting: "4 Aug · 12:12", name: null, label: "Not linked to a contact" },
    { meeting: "30 Jul · 13:34", name: "Klára Dobos", label: "First meeting" },
    { meeting: "29 Jul · 13:14", name: "Jakub Tóth", label: "First meeting" },
  ]);
});
