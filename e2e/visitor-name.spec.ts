import { expect, test } from "@playwright/test";
import { signInAs } from "./sign-in";

/**
 * THE BUYER'S NAME IS IN THE PERMITTED VIEWER'S RENDERED REGISTER.
 *
 * `docs/22` §6, the first promise: the name comes from the read model's join
 * per render. Measured where a reader meets it — the agency manager opens an
 * agent's screen and the register's visitor column carries a name beside
 * the label on at least one row, and on every row that carries a name the
 * label still stands beside it ("third meeting" is information whether or
 * not the person is named). One assertion. The developer's side of the same
 * gate is `register-gate.spec.ts`; the withdrawn consent and the records
 * that never carry a name are held in the synthetic package's own tests,
 * where the contact is chosen rather than found.
 */
test("the buyer's name stands beside the label for the sales team", async ({ page }) => {
  await signInAs(page, "Tomáš Varga");
  await page.goto("/alpha/ister-tower/agents/agt_luciahorvath");
  const register = page.locator("table", {
    has: page.locator("caption", { hasText: "most recent meetings" }),
  });
  const rows = await register.locator("tbody tr").evaluateAll((trs) =>
    trs.map((tr) => {
      const cell = tr.querySelector("td:last-child");
      return {
        name: cell?.querySelector(".ox-visitor-name")?.textContent?.trim() ?? null,
        label: cell?.querySelector(".ox-n")?.textContent?.trim() ?? "",
      };
    }),
  );
  const named = rows.filter((r) => r.name !== null);
  expect({
    rows: rows.length > 0,
    named: named.length > 0,
    nameless: named.filter((r) => r.name === "").length,
    labelless: named.filter((r) => r.label === "").length,
  }).toEqual({ rows: true, named: true, nameless: 0, labelless: 0 });
});
