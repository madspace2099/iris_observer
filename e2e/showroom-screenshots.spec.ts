import { test, type Page } from "@playwright/test";
import { signInAs } from "./sign-in";

/**
 * Review artefacts for the Showroom Intelligence surfaces.
 *
 * Not assertions — these produce the images a human looks at. Written outside
 * the repository: a screenshot committed without a visual baseline policy is a
 * binary nobody updates and everybody ignores.
 *
 * ## Rewritten against the current UI, 2026-09-10
 *
 * Every click target here used to be `.iris-matrix-row`, `UnitMatrix`'s row
 * class; the register on `/units` and `/meetings` is `StackPlan`/
 * `MeetingRegister` now, and neither draws that class, confirmed live
 * against the running dev server rather than guessed. "Storytelling" is
 * "Features" under a redirect (`nav-reachability.spec.ts` covers the
 * redirect itself). The embedded Ask composer used to answer in place; it
 * now navigates to the full Ask IRIS page, so the "ask observer" capture
 * follows that navigation instead of waiting for an inline answer that no
 * longer renders there. One capture ("11-measurement-explained") is
 * dropped rather than faked: the info-disclosure button it opened
 * (`What Typical look measures`) belonged to an older `/units` composition
 * that `StackPlan` does not have an equivalent control for.
 */
/*
 * Inside the repository. `_review/` rather than `test-results/`, which
 * Playwright clears before every run; and rather than the absolute Windows
 * temp path this defaulted to, which swept the images on one machine and, on
 * any other, is a relative path that makes a folder called `C:`.
 */
const OUT = process.env["OBSERVER_SHOWROOM_SHOTS"] ?? "_review/showroom";


async function shoot(page: Page, name: string, project: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}-${project}.png` });
  await page.screenshot({ path: `${OUT}/${name}-${project}-full.png`, fullPage: true });
}

test.describe("showroom intelligence", () => {
  test("showroom overview", async ({ page }, info) => {
    await signInAs(page, "Petra Novák");
    await shoot(page, "01-showroom", info.project.name);
  });

  test("presentation intelligence, two agents", async ({ page }, info) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/presentation?mode=agents&left=agt_monika&right=agt_akhilesh");
    await shoot(page, "02-presentation-agents", info.project.name);
  });

  test("presentation intelligence, cohorts", async ({ page }, info) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/presentation?mode=cohorts");
    await shoot(page, "03-presentation-cohorts", info.project.name);
  });

  test("unit attention", async ({ page }, info) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/units");
    await shoot(page, "04-units", info.project.name);
    // `StackPlan`'s `Cell` is a link to the unit's own page, not an in-page
    // selection — "unit selected" is now "the unit's own detail page".
    await page.locator('a[href*="/units/"]').first().click();
    await page.waitForURL(/\/units\/[A-Z0-9-]+$/);
    await shoot(page, "05-unit-selected", info.project.name);
  });

  test("storytelling", async ({ page }, info) => {
    await signInAs(page, "Petra Novák");
    // Storytelling permanently redirects to Features; go straight there
    // rather than shooting mid-redirect.
    await page.goto("/alpha/northgate/features");
    await shoot(page, "06-storytelling", info.project.name);
  });

  test("meeting replay", async ({ page }, info) => {
    await signInAs(page, "Monika Kováčová");
    await page.goto("/alpha/northgate/meetings");
    await shoot(page, "07-meetings", info.project.name);
    // The register's own "when" link, not a matrix row — `MeetingRegister`
    // draws a real `<table>`.
    await page.locator("table tbody tr").first().getByRole("link").first().click();
    await page.waitForURL(/\/meetings\/mtg_/);
    await shoot(page, "08-replay", info.project.name);
    /*
     * "09-replay-step" is dropped rather than kept as a duplicate of
     * "08-replay": `.iris-replay-step` was clickable (the old timeline
     * expanded a step on click); its replacement, `.ox-time-step`, is a
     * plain `<li>` with nothing to click, confirmed live — the timeline is
     * fully drawn already, not progressively disclosed.
     */
  });

  test("ask observer", async ({ page }, info) => {
    await signInAs(page, "Petra Novák");
    // Sign-in lands on Ask IRIS itself now; submitting from there still
    // navigates to the same address ("?q=…") every embedded composer does,
    // so shooting the resolved page is the equivalent capture. `#ask-prompt`
    // rather than the placeholder: the docked composer (`AskDock`, present
    // on every project page) carries an identical placeholder and label, so
    // a placeholder-only locator is ambiguous the moment both are mounted.
    const ask = page.locator("#ask-prompt");
    await ask.fill("Compare Monika and Akhilesh's presentation flows.");
    await ask.press("Enter");
    await page.waitForURL(/\/ask\?q=/);
    await page.getByText(/^Composed by Observer.s read models/).waitFor({ timeout: 45_000 });
    await shoot(page, "10-ask", info.project.name);
  });
});
