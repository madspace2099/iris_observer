import { expect, test } from "@playwright/test";

import { signIn } from "./sign-in";

/**
 * PROJECT SWITCHING FROM INSIDE OBSERVER — the founder's decision recorded in
 * `docs/PROJECT-STATE.md` (night of 2026-09-08): an account authorised for
 * more than one project, including within one tenant, must be able to move
 * between them without a mandatory detour through `/projects`.
 *
 * Ask IRIS is where every sign-in lands and the one screen whose own
 * delivered composition has no context band at all — so the switch a reader
 * actually needs lives in `Shell`'s `.irs-header-end`, beside `Sign out`,
 * built from the same authorised project list the pre-existing Sales Flow /
 * Project / Sales Agents switcher already reads (`repository.listProjects`).
 * It is not the "which project this question is about" radio group inside
 * the Ask composer — that changes what IRIS answers about, not where the
 * reader is, and this suite checks the two stay apart.
 */

test.describe("project switching", () => {
  /*
   * A shared Turbopack dev server under three parallel projects (wide,
   * desktop, mobile) pays a real first-compile cost on a route none of them
   * has hit yet in this server's lifetime, and that cost compounds when the
   * workers land on the same server at once. `observer-product.spec.ts`'s
   * "holds together" test names the same mechanism at greater length.
   */
  test.describe.configure({ timeout: 60_000 });

  test("a multi-project account can move between its own projects from Ask IRIS", async ({
    page,
  }) => {
    await signIn(page, "Petra Novák");
    await page.waitForURL(/\/alpha\/(northgate|riverside|ister-tower)\/ask/);

    const switcher = page.getByRole("combobox", { name: "Switch project" });
    await expect(switcher).toBeVisible();
    await expect(switcher.locator("option")).toHaveCount(3);

    await switcher.selectOption({ label: "Riverside Walk" });
    await page.waitForURL(/\/alpha\/riverside\/ask/);
    await expect(page.getByText("Ask IRIS about Riverside Walk").first()).toBeVisible();

    /* The switch travels: reachable again from the project it just landed on. */
    await expect(page.getByRole("combobox", { name: "Switch project" })).toHaveValue("riverside");
  });

  test("switching preserves the current section rather than resetting to Ask IRIS", async ({
    page,
  }) => {
    await signIn(page, "Petra Novák");
    await page.waitForURL(/\/alpha\/[a-z-]+\/ask/);
    await page.goto("/alpha/northgate/flow");

    const switcher = page.getByRole("combobox", { name: "Project" }).first();
    await switcher.selectOption({ label: "ISTER TOWER" });
    await page.waitForURL(/\/alpha\/ister-tower\/flow/);
  });

  test("a single-project account sees no switcher at all", async ({ page }) => {
    await signIn(page, "Martin Kováč");
    await page.waitForURL(/\/alpha\/ister-tower\/ask/);
    await expect(page.getByRole("combobox", { name: "Switch project" })).toHaveCount(0);
  });

  test("the wordmark returns to the current project's Ask IRIS from any section", async ({
    page,
  }) => {
    await signIn(page, "Martin Kováč");
    await page.goto("/alpha/ister-tower/agents");

    await page.getByRole("link", { name: "IRIS by MADSPACE — this project's Ask IRIS" }).click();
    await page.waitForURL(/\/alpha\/ister-tower\/ask/);
  });

  test("the Ask comparison-scope control is untouched by the new switcher", async ({ page }) => {
    await signIn(page, "Petra Novák");
    await page.waitForURL(/\/alpha\/[a-z-]+\/ask/);

    /* Three projects held: "current", "all" and "compare" are all offered. */
    await expect(page.getByRole("radio", { name: "current" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "all" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "compare" })).toBeVisible();
  });
});
