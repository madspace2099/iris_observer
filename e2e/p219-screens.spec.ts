import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./sign-in";

/**
 * P2-19 ON THE SCREENS (ZARAS1, 2026-10-02).
 *
 * K4 folds a method paragraph on Project, K5 moves the radars to a Coaching
 * tab on Sales Agents, K6 puts a view switch over the Features register. Each
 * is asserted on the rendered page, in what a reader sees: a folded paragraph
 * is not in the page's text until it is opened. The labels are English by the
 * scope decision of 2026-10-02 — the screens are English, and none of this
 * reaches the printed report.
 */

const ROOT = "/alpha/northgate";

async function open(page: Page, path: string): Promise<string> {
  await signInAs(page, "Tomáš Varga");
  await page.goto(path, { waitUntil: "networkidle" });
  return page.locator("main").innerText();
}

test.beforeEach(({ isMobile }, testInfo) => {
  test.skip(isMobile || testInfo.project.name !== "desktop", "a reading of the page, not of its width");
});

/* K4: the method paragraphs, and the claims beside them. */
const METHOD = [
  "A segment is placed only with 20 or more decided meetings",
  "Four different acts, kept apart",
  "Share of the time these meetings spent on any named place.",
  "Share of all time spent on named places, by what kind of place it is.",
  "Ordered by total time.",
  "Each band is what survived the previous step.",
];
const CLAIMS = [
  /\d+ of \d+ sold\. A straight line from/,
  /units take \d+% of looking time on \d+% of the unsold stock\./,
];

test("K4 · Project folds its method behind How to read this, closed, and keeps every claim in view", async ({
  page,
}) => {
  const closed = await open(page, `${ROOT}/project`);
  for (const text of METHOD) expect(closed, `"${text}" waits behind its fold`).not.toContain(text);
  for (const claim of CLAIMS) expect(closed).toMatch(claim);

  const folds = page.locator("main details.iris-method");
  expect(await folds.count()).toBe(METHOD.length);
  for (const fold of await folds.all()) {
    await expect(fold.locator("summary")).toHaveText("How to read this");
    await fold.locator("summary").click();
  }
  const opened = await page.locator("main").innerText();
  for (const text of METHOD) expect(opened, `"${text}" is there once opened`).toContain(text);
});
