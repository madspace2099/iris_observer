import { expect, test, type Page } from "@playwright/test";

/**
 * The checks that keep M2.1's corrections from regressing.
 *
 * Typography, the session boundary, and the ten-second shape of the first
 * screen. Each of these was wrong once; each is now a test.
 */

async function signInAs(page: Page, name: string) {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: new RegExp(`Continue as ${name}`) }).click();
  // The front door is the Showroom overview since ADR-0023.
  await page.waitForURL(/\/showroom/);
}

test.describe("typography", () => {
  test("actually renders in Manrope, not the system fallback", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.evaluate(() => document.fonts.ready);

    // Approving visual fidelity while the page renders in Segoe UI would be
    // approving a different design from the one that ships.
    const loaded = await page.evaluate(() =>
      [...document.fonts].some((f) => f.family.includes("Manrope") && f.status === "loaded"),
    );
    expect(loaded, "no Manrope face reported as loaded").toBe(true);

    const applied = await page.evaluate(
      () => getComputedStyle(document.body).fontFamily.split(",")[0]?.replace(/["']/g, "") ?? "",
    );
    expect(applied).toContain("Manrope");
  });

  test("serves the font from this origin, never a third party", async ({ page }) => {
    const external: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (/fonts\.(googleapis|gstatic)\.com|use\.typekit|fonts\.bunny/.test(url)) {
        external.push(url);
      }
    });
    await signInAs(page, "Petra Novák");
    await page.evaluate(() => document.fonts.ready);
    expect(external).toEqual([]);
  });

  test("does not let the font swap reflow the metric grid", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    const before = await page.locator(".iris-home-figures > div").first().boundingBox();
    await page.evaluate(() => document.fonts.ready);
    const after = await page.locator(".iris-home-figures > div").first().boundingBox();
    // Metric cards carry a min-height precisely so a font arriving mid-render
    // cannot move the figures under the reader's eye.
    expect(after?.height).toBe(before?.height);
  });
});

test.describe("session boundary", () => {
  test("a forged cookie grants nothing", async ({ page, context }) => {
    // The earlier implementation stored the role in the cookie. Setting it to
    // "madspace" was a privilege escalation; now it is just an unknown id.
    await context.addCookies([
      { name: "observer_session", value: "madspace", url: "http://localhost:3210" },
    ]);
    await page.goto("/alpha/northgate/showroom");
    await page.waitForURL(/\/sign-in/);
    // The sign-in surface is the profile picker now; its heading says what the
    // choice is for rather than naming the mechanism.
    await expect(page.getByRole("heading", { name: /Each profile sees a different Observer/ })).toBeVisible();
  });

  /*
   * Sign-out clears the cookie, and the token expires on its own.
   *
   * It is no longer revocable server-side: the session is a signed, stateless
   * token because an in-memory table cannot survive a serverless platform,
   * where every request may land on a different instance. ADR-0022 records the
   * trade and the pre-production gate that removes it.
   */
  test("signing out clears the session cookie", async ({ page, context }) => {
    await signInAs(page, "Petra Novák");
    const cookie = (await context.cookies()).find((c) => c.name === "observer_session");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");

    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL(/\/sign-in/);

    // The cookie is gone from the browser, so the next request is unsigned.
    expect((await context.cookies()).find((c) => c.name === "observer_session")?.value ?? "").toBe(
      "",
    );
    await page.goto("/alpha/northgate/showroom");
    await page.waitForURL(/\/sign-in/);
  });

  test("a tampered token grants nothing", async ({ page, context }) => {
    /*
     * The property that survived going stateless.
     *
     * The token carries the viewer key in the clear, so it is readable — but it
     * is signed, and swapping "developer" for "madspace" breaks the signature.
     * Nobody can promote themselves by editing a cookie, which is the mistake
     * this adapter exists to prevent.
     */
    await signInAs(page, "Petra Novák");
    const cookie = (await context.cookies()).find((c) => c.name === "observer_session");
    expect(cookie?.value).toBeTruthy();

    const tampered = (cookie?.value ?? "").replace(/^[^.]+/, "madspace");
    expect(tampered).not.toBe(cookie?.value);

    await context.clearCookies();
    await context.addCookies([
      { name: "observer_session", value: tampered, url: "http://localhost:3210" },
    ]);
    await page.goto("/madspace");
    await page.waitForURL(/\/sign-in/);
  });

  test("says it is a demonstration without explaining its own implementation", async ({ page }) => {
    await page.goto("/sign-in");

    /*
     * The status must be clear; the mechanism is not the reader's problem.
     *
     * "This is a scenario selector, not production authentication" told a
     * developer in a consultation that they were looking at scaffolding. The
     * demonstration status is still stated — it has to be — in product
     * language.
     */
    await expect(page.getByText(/demonstration running on synthetic data/i)).toBeVisible();
    await expect(page.getByText(/not production authentication/i)).toHaveCount(0);
  });
});

test.describe("the ten-second test", () => {
  test("answers all four questions above the fold", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "the fold test is a desktop claim");
    await signInAs(page, "Petra Novák");
    await page.evaluate(() => document.fonts.ready);

    const fold = page.viewportSize()?.height ?? 0;
    const within = async (selector: string) => {
      const box = await page.locator(selector).first().boundingBox();
      return box !== null && box.y < fold;
    };

    /*
     * Observer opens the product, so Observer has to be above the fold.
     *
     * The presence, the sentence and the prompt are the ten-second answer now,
     * and the prompt being a primary control rather than a footer field is the
     * whole point of the direction — so its position is asserted, not assumed.
     */
    expect(await within(".obs-orb"), "Observer below the fold").toBe(true);
    expect(await within(".obs-lede"), "the briefing sentence below the fold").toBe(true);
    expect(await within(".obs-prompt"), "the prompt below the fold").toBe(true);
    expect(await within(".obs-suggestions"), "the suggestions below the fold").toBe(true);
  });

  test("keeps the first screen to at most six figures", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    // The registry holds eighty-two metrics. Rendering the registry would be the
    // exact failure Stano described in the legacy dashboard, and the one the unit
    // list was rebuilt to avoid.
    const figures = await page.locator(".iris-home-figures > div").count();
    expect(figures).toBeGreaterThan(0);
    expect(figures).toBeLessThanOrEqual(6);
  });

  test("every figure on the first screen can say what it measures", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    // A headline number with no stated definition is what the legacy dashboard
    // did when it graded a single click "High".
    const info = page.locator(".iris-home-figures .iris-measure-info");
    await expect(info.first()).toBeVisible();
    await info.first().click();
    /*
     * Scoped to the figures, not to "the first note on the page".
     *
     * A deployment with no model key renders a second `role="note"` — the
     * voice notice — above these, and the unscoped locator picked that up. The
     * assertion is about the panel this button opened, so it says so.
     */
    const panel = page.locator(".iris-home-figures .iris-measure-panel").first();
    await expect(panel).toContainText("What it measures");
    await expect(panel).toContainText("What it does not say");
  });

  test("leads with the showroom, not with the CRM", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    // ADR-0023 at the surface: the opening sentence is about the presentations,
    // and outcome appears as a rate rather than as the subject.
    await expect(page.locator(".obs-lede")).toContainText(/showroom/i);
    await expect(page.getByText(/of recorded meetings progressing/i)).toBeVisible();
  });

  test("makes the prompt a primary control, not a footer field", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "A phone has no side-by-side composition.");
    await signInAs(page, "Petra Novák");

    const prompt = await page.locator(".obs-prompt").boundingBox();
    const viewport = page.viewportSize();
    expect(prompt).not.toBeNull();
    expect(viewport).not.toBeNull();

    // Wide enough to read as the way in rather than as a search box tucked into
    // a corner, and in the upper half of the opening composition.
    expect(prompt!.width).toBeGreaterThan((viewport!.width ?? 0) * 0.25);
    expect(prompt!.y).toBeLessThan((viewport!.height ?? 0) * 0.6);
  });

  test("says insufficient data rather than showing a green light", async ({ page }) => {
    await signInAs(page, "Tomáš Varga");
    await page.goto("/beta/kingsford/overview");
    await expect(page.getByText("Not enough data", { exact: true })).toBeVisible();
  });
});

/**
 * The chart vocabulary.
 *
 * Nine shapes were added at once, and four defects survived typechecking, the
 * build and the unit suite: a CSS class that collided with the page layout, a
 * funnel whose bands did not nest, a flow diagram that stacked every node in
 * one column, and two counts for one agent on one page. None of those is
 * catchable by an assertion that an element exists, so these check what the
 * shapes mean rather than that they rendered.
 */
test.describe("the chart vocabulary", () => {
  test("the summary window is the reader's, and it changes the figures", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/flow?window=year");
    const year = await page.locator(".iris-kpi-value").first().textContent();

    await page.goto("/alpha/northgate/flow?window=today");
    const today = await page.locator(".iris-kpi-value").first().textContent();

    // A control that does not move the number it labels is decoration.
    expect(year).not.toBe(today);
    await expect(page.locator(".iris-kpi")).toHaveCount(4);
  });

  test("a window too small to read says so instead of asserting a trend", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/flow?window=today");
    await expect(page.getByText(/too few to read a rate from/)).toBeVisible();
    // "1 meetings" is the kind of small wrongness that makes a product feel
    // unfinished, and it shipped once.
    await expect(page.getByText(/\b1 meetings\b/)).toHaveCount(0);
  });

  test("the funnel's bands nest, so its arithmetic is real", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/flow");
    const counts = await page.locator(".iris-funnel-bar b").allTextContents();
    expect(counts.length).toBeGreaterThan(2);

    const numbers = counts.map((c) => Number(c));
    for (let i = 1; i < numbers.length; i += 1) {
      // A funnel means survival. A band wider than the one above it turns the
      // drop figure beside it into a number that describes nothing.
      expect(numbers[i]).toBeLessThanOrEqual(numbers[i - 1] as number);
    }
  });

  test("the journey flow lays its stages out across the page, not on top of each other", async ({
    page,
  }) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/project");
    const nodes = page.locator(".iris-flow-node");
    await expect(nodes).toHaveCount(4);

    const xs: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const box = await nodes.nth(i).boundingBox();
      xs.push(box?.x ?? 0);
    }
    for (let i = 1; i < xs.length; i += 1) {
      expect(xs[i]).toBeGreaterThan(xs[i - 1] as number);
    }
  });

  test("one agent has one meeting count on one page", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/agents");

    // The ring and the radar read different slices once, and disagreed by one.
    const ring = await page.locator(".iris-ring-card").first().locator(".iris-ring-figure").textContent();
    const fromRing = Number((ring ?? "").replace(/\D/g, ""));
    expect(fromRing).toBeGreaterThan(0);

    const radarLabel = await page.locator(".iris-radars .iris-ring-key li").first().textContent();
    expect(radarLabel).toContain(String(fromRing));
  });

  test("no surface scrolls sideways on a phone", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "A phone is the only place this can fail.");
    await signInAs(page, "Petra Novák");

    for (const path of ["/alpha/northgate/flow", "/alpha/northgate/project", "/alpha/northgate/agents"]) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      // A chart that pushes the page wider than the screen makes every other
      // surface on it scroll sideways too.
      expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
    }
  });
});

test.describe("one label, one window", () => {
  /*
   * The Sales Flow page carries a rolling summary window above calendar
   * buckets. Both used the same words: "This month: 41" in the summary and
   * "This month: 32" in the chart, three inches apart, both correct and
   * neither reconcilable by the reader.
   *
   * The rolling windows now say how long they are. This asserts that no
   * duration word appears twice on the page meaning two different spans.
   */
  test("the summary window never borrows a calendar bucket's name", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/flow");

    const windowLabels = await page.locator(".iris-window .iris-chip").allInnerTexts();
    const bucketLabels = await page.locator(".iris-step-label").allInnerTexts();

    const normalise = (s: string) => s.trim().toLowerCase();
    const windows = new Set(windowLabels.map(normalise).filter((s) => s.length > 0));
    const buckets = new Set(bucketLabels.map(normalise).filter((s) => s.length > 0));

    // "Today" is the one word that means the same thing in both, and does.
    const shared = [...windows].filter((w) => buckets.has(w) && w !== "today");
    expect(shared, `both a rolling window and a calendar bucket are called: ${shared.join(", ")}`).toEqual([]);
  });
});
