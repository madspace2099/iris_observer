import { expect, test } from "@playwright/test";
import { signInAs } from "./sign-in";
import { LANGUAGES, PAGES, VIEWER, withLanguage } from "../scripts/p217/pages";

/**
 * NO LIVE REGION ON A PAGE THE P2-17 SHEETS ARE MEASURED ON (P221-MERES, 2026-10-03).
 *
 * The shell's state announcer is a visually hidden `role="status"` region, but
 * it is rendered, so its words would land in `innerText` — and the P2-17 dump
 * reads exactly `body.innerText()`. A line more on one language's page than on
 * English's makes `compare.ts` mark the whole page not measurable, and the
 * announcer fills its region only once the page has settled, so the extra line
 * would come and go with timing: a sporadic regression in the measurement.
 *
 * Today the announcer renders nothing on a path ending in `/report`, and every
 * measured page is one. A regex and a docblock hold that; this holds it. The
 * list is `pages.ts` itself, so a page added to the measurement is guarded the
 * moment it is measured, and the check is the attribute, not the component.
 */

test.beforeEach(({ isMobile }, testInfo) => {
  test.skip(isMobile || testInfo.project.name !== "desktop", "a property of the page, not of its width");
});

for (const key of PAGES) {
  for (const language of LANGUAGES) {
    test(`${key} · ${language}: no announcer region on a measured page`, async ({ page }) => {
      const [who, path] = key.split(" ") as [keyof typeof VIEWER, string];
      await signInAs(page, VIEWER[who]);
      await page.goto(withLanguage(path, language), { waitUntil: "networkidle" });
      /* Past the announcer's own settling (three quiet 100 ms beats), so a late region would be here. */
      await page.waitForTimeout(1_500);
      expect(await page.locator("[data-announcer]").count(), `${key} ${language}`).toBe(0);
    });
  }
}
