import { test, type Page } from "@playwright/test";
import { signInAs } from "./sign-in";

/**
 * Review artefacts.
 *
 * Not assertions — these produce the images a human looks at. They are kept
 * out of version control on purpose: a screenshot committed without a visual
 * baseline policy is a binary nobody updates and everybody ignores. `_review/`
 * is where the repository puts that kind of thing, and `.gitignore` says so.
 *
 * Set OBSERVER_SHOTS to change the destination.
 *
 * ## Where the default has been, twice
 *
 * It once pointed at `C--Users-42191-Documents-webiris` — WEB IRIS, a separate
 * product on its own remote (`madspace2099/web_iris_saas`), not this one. A
 * review run with `OBSERVER_SHOTS` unset wrote Observer's screenshots into
 * another project's session scratchpad.
 *
 * Correcting that moved it to *this* session's scratchpad, which was the
 * convention every screenshot spec here followed and which had the same defect
 * one level in: an absolute path into one machine's temp directory. The
 * convention itself was the problem, and it is `_review/` now.
 */
/*
 * Inside the repository. `_review/` rather than `test-results/`, which
 * Playwright clears before every run; and rather than the absolute Windows
 * temp path this defaulted to, which swept the images on one machine and, on
 * any other, is a relative path that makes a folder called `C:`.
 */
const OUT = process.env["OBSERVER_SHOTS"] ?? "_review/review";


async function shoot(page: Page, name: string, project: string) {
  // The fold shot is the ten-second test made visible; the full shot is the
  // page as a reader would scroll it.
  await page.screenshot({ path: `${OUT}/${name}-${project}-fold.png` });
  await page.screenshot({ path: `${OUT}/${name}-${project}-full.png`, fullPage: true });
}

test.describe("review artefacts", () => {
  test("executive overview", async ({ page }, testInfo) => {
    await signInAs(page, "Petra Novák");
    await shoot(page, "01-executive-overview", testInfo.project.name);
  });

  test("sales agent overview", async ({ page }, testInfo) => {
    await signInAs(page, "Monika Kováčová");
    await shoot(page, "02-agent-overview", testInfo.project.name);
  });

  test("pre-meeting brief", async ({ page }, testInfo) => {
    await signInAs(page, "Monika Kováčová");
    await page.goto("/alpha/northgate/meetings/mtg_viktoria0827");
    await page.evaluate(() => document.fonts.ready);
    await shoot(page, "03-viktoria-brief", testInfo.project.name);
  });

  test("disconnected CRM", async ({ page }, testInfo) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/riverside/overview");
    await page.evaluate(() => document.fonts.ready);
    await shoot(page, "04-crm-disconnected", testInfo.project.name);
  });

  test("insufficient data", async ({ page }, testInfo) => {
    await signInAs(page, "Tomáš Varga");
    await page.goto("/beta/kingsford/overview");
    await page.evaluate(() => document.fonts.ready);
    await shoot(page, "05-insufficient-data", testInfo.project.name);
  });

  test("sign in", async ({ page }, testInfo) => {
    await page.goto("/sign-in");
    await page.evaluate(() => document.fonts.ready);
    await shoot(page, "06-sign-in", testInfo.project.name);
  });

  test("madspace administration", async ({ page }, testInfo) => {
    await signInAs(page, "MADSPACE Operations");
    await page.goto("/madspace");
    await page.evaluate(() => document.fonts.ready);
    await shoot(page, "07-madspace-admin", testInfo.project.name);
  });
});
