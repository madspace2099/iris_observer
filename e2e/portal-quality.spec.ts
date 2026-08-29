import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The two new surfaces, held to the same standard as the ones behind them.
 *
 * Accessibility, responsiveness and the composition figures the reference
 * specifies. It runs under all three viewport projects, so the responsive
 * assertions are made at the widths a reader actually uses rather than at
 * widths chosen here.
 */

const PASSWORD = "observer-demo";
const PETRA = "petra.novak@alpha-estates.example";

async function signIn(page: Page): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Work email address").fill(PETRA);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with password" }).click();
  await page.waitForLoadState("networkidle");
}

async function expectNoHorizontalOverflow(page: Page, where: string): Promise<void> {
  const box = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(box.scroll, `${where} must not scroll sideways`).toBeLessThanOrEqual(box.client + 1);
}

test.describe("sign in", () => {
  test("has no detectable accessibility violations", async ({ page }) => {
    await page.goto("/sign-in");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("is a form in a main landmark, with real labels and one heading", async ({ page }) => {
    await page.goto("/sign-in");

    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("main form")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in");

    /* Labels that stay, connected by for/id — not placeholders pretending. */
    const fields = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLInputElement>("main input:not([type='hidden'])")].map(
        (input) => ({
          id: input.id,
          type: input.type,
          autocomplete: input.getAttribute("autocomplete"),
          labelled:
            input.labels !== null && input.labels.length > 0
              ? (input.labels[0]?.textContent ?? "").trim().slice(0, 30)
              : null,
        }),
      ),
    );

    expect(fields).toHaveLength(2);
    expect(fields[0]?.type).toBe("email");
    expect(fields[0]?.autocomplete).toBe("username");
    expect(fields[0]?.labelled).toContain("Work email address");
    expect(fields[1]?.type).toBe("password");
    expect(fields[1]?.autocomplete).toBe("current-password");
    expect(fields[1]?.labelled).toContain("Password");
  });

  test("points aria-describedby at something that exists, or at nothing", async ({ page }) => {
    /*
     * A dead `aria-describedby` is worse than none: a screen reader announces
     * an error that is not there. The attribute is only set while the message
     * is on the page.
     */
    for (const url of ["/sign-in", "/sign-in?error=invalid"]) {
      await page.goto(url);
      const dangling = await page.evaluate(() =>
        [...document.querySelectorAll("[aria-describedby]")]
          .map((el) => el.getAttribute("aria-describedby") ?? "")
          .flatMap((value) => value.split(/\s+/))
          .filter((id) => id.length > 0 && document.getElementById(id) === null),
      );
      expect(dangling, url).toEqual([]);
    }
  });

  test("announces a failure through an alert", async ({ page }) => {
    await page.goto("/sign-in?error=invalid");
    const alert = page.locator(".mp-alert");
    await expect(alert).toBeVisible();
    await expect(alert).toHaveAttribute("role", "alert");
  });

  test("shows every control and no sideways scroll", async ({ page }) => {
    await page.goto("/sign-in");
    await expectNoHorizontalOverflow(page, "sign-in");

    /* The form is the thing a reader came for, at every width. */
    await expect(page.getByLabel("Work email address")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in with password" })).toBeVisible();
  });

  test("keeps the reference composition on a desktop", async ({ page }, testInfo) => {
    const width = page.viewportSize()?.width ?? 0;
    test.skip(width < 1000, "the two-column composition is a desktop composition");
    void testInfo;

    await page.goto("/sign-in");

    const layout = await page.evaluate(() => {
      const login = document.querySelector(".mp-login");
      const form = document.querySelector(".mp-form");
      const panel = document.querySelector(".mp-login-panel");
      return {
        columns: login === null ? "" : getComputedStyle(login).gridTemplateColumns,
        formWidth: form === null ? 0 : form.getBoundingClientRect().width,
        panelPadding: panel === null ? "" : getComputedStyle(panel).paddingLeft,
      };
    });

    /*
     * Two equal columns, a 360px form and a 48px inset — the reference figures.
     * The track list is read out of whatever the browser reports, because it
     * may render the declared minmax() as two pixel values or as the function.
     */
    const tracks = (layout.columns.match(/[0-9.]+px/g) ?? []).map(Number.parseFloat);
    expect(tracks, layout.columns).toHaveLength(2);
    expect(Math.abs((tracks[0] ?? 0) - (tracks[1] ?? 0))).toBeLessThan(2);
    expect(layout.formWidth).toBeLessThanOrEqual(360);
    expect(layout.panelPadding).toBe("48px");
  });
});

test.describe("projects", () => {
  test("has no detectable accessibility violations", async ({ page }) => {
    await signIn(page);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("is one main landmark with one heading, and a list of projects", async ({ page }) => {
    await signIn(page);
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Projects");
    /* A list of things is a list. */
    await expect(page.locator("main ul li.mp-card").first()).toBeVisible();
  });

  test("gives every card a keyboard-reachable action", async ({ page }) => {
    await signIn(page);
    const actions = page.getByRole("link", { name: /Open Observer/ });
    const cards = page.locator(".mp-card");
    expect(await actions.count()).toBe(await cards.count());

    /*
     * Focused by keyboard, not by script. A programmatic focus() does not put
     * an element into :focus-visible in Chromium, so a ring asserted that way
     * would be asserted on a state a reader never reaches.
     */
    await page.keyboard.press("Tab");
    for (let i = 0; i < 12; i += 1) {
      const onAction = await page.evaluate(
        () => document.activeElement?.classList.contains("mp-open") ?? false,
      );
      if (onAction) break;
      await page.keyboard.press("Tab");
    }

    const ring = await page.evaluate(() => {
      const el = document.activeElement;
      if (el === null) return null;
      const cs = getComputedStyle(el);
      return { outline: cs.outlineStyle, width: cs.outlineWidth };
    });
    expect(ring?.outline).not.toBe("none");
    expect(Number.parseFloat(ring?.width ?? "0")).toBeGreaterThanOrEqual(2);
  });

  test("does not scroll sideways at any width", async ({ page }) => {
    await signIn(page);
    await expectNoHorizontalOverflow(page, "projects");
  });

  test("caps the content and steps the grid down with the viewport", async ({ page }) => {
    await signIn(page);
    const layout = await page.evaluate(() => {
      const main = document.querySelector(".mp-main");
      const grid = document.querySelector(".mp-grid");
      return {
        maxWidth: main === null ? "" : getComputedStyle(main).maxWidth,
        padding: main === null ? "" : getComputedStyle(main).paddingLeft,
        columns: grid === null ? 0 : getComputedStyle(grid).gridTemplateColumns.split(" ").length,
        viewport: window.innerWidth,
      };
    });

    expect(layout.maxWidth).toBe("1440px");

    /* The documented gutters: 40 desktop, 24 below 768, 16 below 480. */
    const expected =
      layout.viewport <= 479 ? "16px" : layout.viewport <= 767 ? "24px" : "40px";
    expect(layout.padding).toBe(expected);

    /* And the reference's grid steps: three, two, one. */
    const columns = layout.viewport <= 767 ? 1 : layout.viewport <= 1023 ? 2 : 3;
    expect(layout.columns).toBe(columns);
  });
});
