import { expect, test, type Page } from "@playwright/test";

/**
 * Is the model actually answering on this deployment?
 *
 * Every other suite runs with the model switched off, deliberately: a green
 * test that depends on a vendor is a test that fails for reasons nobody
 * controls. This one is the opposite, and is skipped unless it is pointed at a
 * deployment that claims to have a key.
 *
 * It asserts one thing the product already renders. `Answer.tsx` writes
 * "Observer's reading · written by the tools" when the prose is the
 * deterministic composer's, and drops the suffix when a model wrote it. So the
 * absence of five words is the evidence that the model is live — read from the
 * screen, not from a status field the test could have been handed.
 */

const LIVE = process.env["OBSERVER_EXPECT_LIVE_MODEL"] === "1";

test.describe("the model is answering", () => {
  test.skip(() => !LIVE, "Set OBSERVER_EXPECT_LIVE_MODEL=1 against a deployment with a key.");
  test.skip(
    () => test.info().project.name !== "wide",
    "One viewport. This is about the answer, not the layout.",
  );

  async function signInAs(page: Page, name: string) {
    await page.goto("/sign-in");
    await page.getByRole("button", { name: new RegExp(`Continue as ${name}`) }).click();
    await page.waitForURL(/\/showroom/);
    await page.evaluate(() => document.fonts.ready);
  }

  /*
   * The label that says who wrote the prose — not merely the first one.
   *
   * `.obs-answer-role` marks several labels in the sheet: "Measured", "What to
   * do", and this one. `.first()` picked "Measured", so an assertion looking
   * for "written by the tools" passed against a string that could never have
   * contained it. Located by its own text instead.
   */
  function readingLabel(page: Page) {
    return page.locator(".obs-answer-role", { hasText: /Observer.s reading/ }).first();
  }

  /*
   * A region, not a dialog — and which one depends on where you asked.
   *
   * Two tests here located the answer with `getByRole("dialog", { name:
   * "Observer" })`, copied from the suites that ask on a detail surface, where
   * Observer does open over the page. These tests never leave the briefing,
   * and there Observer *is* the interface rather than a panel on it (ADR-0025)
   * — the accessibility tree says `region "Observer"`, and no dialog exists to
   * find. Both tests waited out their whole budget for an element the product
   * had correctly not rendered, which read as a hang and was a wrong locator.
   */
  function answerRegion(page: Page) {
    return page.getByRole("region", { name: "Observer" });
  }

  async function ask(page: Page, question: string) {
    /*
     * The ninety seconds below were unreachable without this.
     *
     * Playwright's default test budget is thirty seconds, and no assertion can
     * outlive the test containing it — so the wait on the next line could never
     * have spent more than thirty of its ninety, whatever it was waiting for.
     * The two lighter questions in this file answered inside thirty and hid the
     * contradiction. A causal "why" runs deeper and does not.
     */
    test.setTimeout(150_000);
    await page.getByPlaceholder(/^Ask Observer about/).fill(question);
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    // A reasoning model on a cold lambda is not quick. The ceiling is the
    // request timeout the server itself enforces, doubled, plus the render.
    await expect(readingLabel(page)).toBeVisible({ timeout: 90_000 });
  }

  test("a model wrote the prose, not the tools", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await ask(page, "Explain why Compare mode fell, and cite the evidence.");

    await expect(readingLabel(page)).not.toContainText(/written by the tools/);
  });

  test("the answer still carries measured evidence under it", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await ask(page, "Which IRIS sections are skipped most often, and by how much?");

    // The model may word the answer; it may not author a figure or a citation.
    await expect(page.getByText("Measured", { exact: true })).toBeVisible();
    await page.getByText(/Evidence and limits/i).click();
    await expect(page.locator(".iris-evidence").first()).toContainText(/n=[0-9]+/);
  });

  test("a causal question is answered as a causal question", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await ask(page, "Why did presentation depth change this period?");

    const body = (await answerRegion(page).innerText()).toLowerCase();

    /*
     * Either move is acceptable and one of them must be made: decline the
     * causal step, or name what would narrow it. Answering a "why" with three
     * descriptive figures and nothing else is the defect this asserts against.
     */
    expect(
      /cannot (establish|show|prove|say)|does not establish|association|not a cause|correlat|would narrow|next comparison|to test this/.test(
        body,
      ),
      "a causal question was answered without addressing causality",
    ).toBe(true);
  });

  test("the prose never claims a cause outright", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await ask(page, "Why did presentation depth change this period?");

    const body = (await answerRegion(page).innerText()).toLowerCase();

    for (const word of ["because", "caused by", "drives the", "leads to", "results in"]) {
      expect(body.includes(word), `causal wording in a model's answer: "${word}"`).toBe(false);
    }
  });
});
