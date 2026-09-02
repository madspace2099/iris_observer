import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./sign-in";

/**
 * The visual review set for Observer.
 *
 * Not assertions — these produce the images a human looks at before this
 * direction is approved. Every state the orb can be in appears in at least one
 * of them, because a state machine that is only ever seen in one state has not
 * been reviewed.
 */
const OUT =
  process.env["OBSERVER_REVIEW_SHOTS"] ??
  "C:/Users/42191/AppData/Local/Temp/claude/C--Users-42191-Documents-IRIS-OBSERVER/fca1dc8c-8691-435c-b958-dd07be3e192c/scratchpad/observer";


/** Long enough for the cross-fade to land, short enough to keep the run quick. */
async function settle(page: Page, ms = 1400) {
  await page.waitForTimeout(ms);
}

async function shoot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

test.describe("Observer review set", () => {
  test("briefing at 1920×1080", async ({ page }, info) => {
    test.skip(info.project.name !== "wide", "This shot is the wide viewport.");
    await signInAs(page, "Petra Novák");
    await settle(page);
    await shoot(page, "01-briefing-1920");
    await page.screenshot({ path: `${OUT}/01-briefing-1920-full.png`, fullPage: true });
  });

  test("briefing at 1440×900", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "This shot is the laptop viewport.");
    await signInAs(page, "Petra Novák");
    await settle(page);
    await shoot(page, "02-briefing-1440");
  });

  test("compact mobile", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "This shot is the phone.");
    await signInAs(page, "Petra Novák");
    await settle(page);
    await shoot(page, "03-briefing-mobile");
    await page.screenshot({ path: `${OUT}/03-briefing-mobile-full.png`, fullPage: true });

    await page.goto("/alpha/northgate/flow");
    await settle(page, 900);
    await shoot(page, "04-rail-mobile");
  });

  test("the orb states", async ({ page }, info) => {
    test.skip(info.project.name !== "wide", "One viewport is enough for the states.");
    await signInAs(page, "Petra Novák");
    const orb = page.locator(".obs-console-orb");

    await settle(page);
    await orb.screenshot({ path: `${OUT}/05-orb-attention.png` });

    // Thinking is caught mid-request rather than simulated: the point of the
    // state is that it means a request is genuinely in flight.
    await page.getByPlaceholder(/^Ask Observer about/).fill("What changed this month?");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await page.waitForTimeout(240);
    await orb.screenshot({ path: `${OUT}/06-orb-thinking.png` });
    await expect(page.locator(".obs-answer")).toBeVisible({ timeout: 15000 });

    await settle(page);
    await orb.screenshot({ path: `${OUT}/07-orb-insight.png` });
    await shoot(page, "08-conversation");
  });

  test("Observer on an agent comparison", async ({ page }, info) => {
    test.skip(info.project.name !== "wide", "One viewport is enough.");
    // Fifteen seconds was calibrated against a deterministic answer. A
    // two-agent comparison is the heaviest question in this file — several
    // tool calls before a word is written — and against a live model it ran
    // past that while the page still read `Observer is answering.`
    test.setTimeout(150_000);
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/agents?agent=agt_monika");
    await settle(page, 900);
    await page
      .getByPlaceholder("Ask Observer…")
      .fill("Compare Monika and Akhilesh's presentation flows.");
    await page.getByPlaceholder("Ask Observer…").press("Enter");
    await expect(page.getByRole("dialog", { name: "Observer" })).toBeVisible({ timeout: 90_000 });
    await settle(page);
    await shoot(page, "09-observer-agents");
  });

  test("Observer holding a selected apartment", async ({ page }, info) => {
    test.skip(info.project.name !== "wide", "One viewport is enough.");
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/units");
    await page.locator(".iris-matrix-row").first().click();
    await settle(page, 900);
    await shoot(page, "10-observer-unit");
  });

  test("reduced motion", async ({ page }, info) => {
    test.skip(info.project.name !== "wide", "One viewport is enough.");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await signInAs(page, "Petra Novák");
    await settle(page);
    await shoot(page, "11-reduced-motion");
  });

  /**
   * The transition capture.
   *
   * A strip of frames through idle → receiving input → thinking → answering →
   * insight, saved as separate images so the sequence can be flipped through
   * without a video codec in the toolchain.
   */
  test("transition capture", async ({ page }, info) => {
    test.skip(info.project.name !== "wide", "One viewport is enough.");
    await signInAs(page, "Petra Novák");
    const orb = page.locator(".obs-console-orb");
    await settle(page);

    await orb.screenshot({ path: `${OUT}/12-motion-1-resting.png` });

    const field = page.getByPlaceholder(/^Ask Observer about/);
    await field.fill("Compare the sales agents");
    await orb.screenshot({ path: `${OUT}/12-motion-2-receiving.png` });

    await page.getByRole("button", { name: "Ask", exact: true }).click();
    for (const [i, wait] of [160, 260, 400].entries()) {
      await page.waitForTimeout(wait);
      await orb.screenshot({ path: `${OUT}/12-motion-${3 + i}-thinking.png` });
    }

    await expect(page.locator(".obs-answer")).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(200);
    await orb.screenshot({ path: `${OUT}/12-motion-6-arriving.png` });
    await settle(page);
    await orb.screenshot({ path: `${OUT}/12-motion-7-insight.png` });
  });
});
