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

  async function ask(page: Page, question: string) {
    await page.getByPlaceholder(/^Ask Observer about/).fill(question);
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    // A reasoning model on a cold lambda is not quick. The ceiling is the
    // request timeout the server itself enforces, doubled, plus the render.
    await expect(page.locator(".obs-answer-role").first()).toBeVisible({ timeout: 90_000 });
  }

  test("a model wrote the prose, not the tools", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await ask(page, "Explain why Compare mode fell, and cite the evidence.");

    const role = page.locator(".obs-answer-role").first();
    await expect(role).toContainText(/Observer.s reading/);
    await expect(role).not.toContainText(/written by the tools/);
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

    const sheet = page.getByRole("dialog", { name: "Observer" });
    const body = (await sheet.innerText()).toLowerCase();

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

    const sheet = page.getByRole("dialog", { name: "Observer" });
    const body = (await sheet.innerText()).toLowerCase();

    for (const word of ["because", "caused by", "drives the", "leads to", "results in"]) {
      expect(body.includes(word), `causal wording in a model's answer: "${word}"`).toBe(false);
    }
  });
});
