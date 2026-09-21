import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signInAs } from "./sign-in";

/**
 * The Showroom Intelligence surfaces, asserted.
 *
 * Accessibility on every one of them, and the product rules that would
 * otherwise depend on whoever writes the next screen remembering them:
 * the CRM does not lead, unknown is not zero, and every figure can say what it
 * measures.
 *
 * ## Rewritten against the current UI, 2026-09-10
 *
 * This file pre-dated three shipped, documented, already-tested-elsewhere
 * product decisions and had drifted from what it checks: Storytelling now
 * permanently redirects to Features (`nav-reachability.spec.ts` covers the
 * redirect itself); sign-in now lands on Ask IRIS, not the Briefing, so a
 * test that wants the Briefing has to say so; and the `iris-`-prefixed
 * component family this file targeted (`UnitMatrix`'s `.iris-matrix-row`,
 * the embedded Ask composer's inline dialog) was superseded by the `ox-`
 * design system (`StackPlan`, `MeetingRegister`, the full-page Ask IRIS) —
 * an in-page unit selector became a link to the unit's own page. Each
 * fix below is checked live against the running dev server, not guessed
 * from the old selector's name.
 */

const ROUTES = [
  ["showroom overview", "/alpha/northgate/showroom"],
  ["sales flow", "/alpha/northgate/flow"],
  ["project", "/alpha/northgate/project?segment=rooms-2"],
  ["sales agents", "/alpha/northgate/agents"],
  ["sales agents, detail", "/alpha/northgate/agents/agt_monika"],
  ["audience", "/alpha/northgate/audience?rooms=2&category=family"],
  ["presentation, agents", "/alpha/northgate/presentation?mode=agents&left=agt_monika&right=agt_akhilesh"],
  ["presentation, cohorts", "/alpha/northgate/presentation?mode=cohorts"],
  ["presentation, periods", "/alpha/northgate/presentation?mode=periods"],
  ["unit attention", "/alpha/northgate/units"],
  ["unit attention, selected", "/alpha/northgate/units?unit=A-402"],
  // Was "/alpha/northgate/storytelling" -- that route now permanently
  // redirects to Features, and axe-ing a redirect target twice under two
  // names tests nothing the "features" entry above does not already cover
  // on its own address. Kept as its own row anyway: the review package's
  // route list and this one are meant to name the same surfaces.
  ["features", "/alpha/northgate/features"],
  ["meetings", "/alpha/northgate/meetings"],
  /*
   * "meeting replay" is NOT a row here, and its own test below says why: that
   * route declares three roles, the developer is not one of them, and a sweep
   * that signed in as Petra would axe the screen she is redirected to instead.
   * An accessibility pass against the wrong page is worse than none, because
   * it reports a clean result.
   */
] as const;

for (const [name, route] of ROUTES) {
  test(`${name} has no detectable accessibility violations`, async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto(route);
    await page.evaluate(() => document.fonts.ready);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}

test("meeting replay has no detectable accessibility violations", async ({ page }) => {
  // The one surface in this sweep with its own role list. Same pass, admitted
  // account: Monika runs meetings on this project, so she is offered the page
  // the sweep is meant to be measuring.
  await signInAs(page, "Monika Kováčová");
  await page.goto("/alpha/northgate/meetings/mtg_ng0100");
  await page.evaluate(() => document.fonts.ready);
  // A redirect would make every assertion below pass against the wrong screen.
  await expect(page).toHaveURL(/\/meetings\/mtg_ng0100/);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test.describe("the three views", () => {
  test("the briefing offers three doors and nothing to analyse", async ({ page }) => {
    /*
     * Sign-in lands on Ask IRIS now, not the Briefing -- the Briefing is
     * still the real page this test means, it just is not where signing in
     * puts you any more, so it is named explicitly.
     */
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/showroom");
    const views = page.getByRole("navigation", { name: "Views" });
    await expect(views).toBeVisible();
    /*
     * Three destinations, not three links: each one's heading is itself a
     * link to the same place its own "Open …" button goes to, so a plain
     * link count over the whole region is six, not three, and always was
     * once the heading became clickable too. The property under test --
     * "there are three, and no more" -- is what the door's own dedicated
     * control still measures.
     */
    const doors = views.getByRole("link", { name: /^Open /ug });
    await expect(doors).toHaveCount(3);
    // The verdict sentence -- `.iris-signal` under the old design system,
    // `.ox-answer` under the current one (ADR-0034's paper ground).
    await expect(page.locator(".ox-answer")).toBeVisible();
  });

  test("each door leads somewhere that answers its own question", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    for (const [label, heading] of [
      ["Sales Flow", /progressing|meeting/i],
      ["Project", /stock|attention|meeting/i],
      ["Sales Agents", /present/i],
    ] as const) {
      await page.goto("/alpha/northgate/showroom");
      await page.getByRole("link", { name: new RegExp(label) }).first().click();
      await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
    }
  });

  test("the IRIS rating is MADSPACE only", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/agents");
    await expect(page.getByText(/Rates IRIS/)).toHaveCount(0);
  });

  test("the audience builder returns meetings, not people", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/audience?rooms=2&category=family");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/meetings match/);
    await expect(page.getByText(/meetings, not people/i)).toBeVisible();
    const body = await page.locator("main").innerText();
    // No email address and no phone number may reach this surface.
    expect(/[a-z0-9._%-]+@[a-z0-9.-]+.[a-z]{2,}/i.test(body)).toBe(false);
  });
});

test.describe("the product rules, at the surface", () => {
  test("a replay states its gaps rather than leaving blanks", async ({ page }) => {
    // Monika rather than Petra: a replay declares three roles and refuses the
    // developer, so the test would assert against Ask IRIS instead.
    await signInAs(page, "Monika Kováčová");
    await page.goto("/alpha/northgate/meetings/mtg_ng0002");
    // The legacy import has no per-step timing. It has to say so.
    // Wording moved from "source" to "record" since this was last checked;
    // the property -- the gap is stated, not left blank -- is unchanged.
    await expect(page.getByText(/What this record cannot say/i)).toBeVisible();
  });

  test("a comparison never claims a cause", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/presentation?mode=cohorts");
    await expect(page.getByText(/associations, not/i)).toBeVisible();
    const body = (await page.locator("main").innerText()).toLowerCase();
    for (const word of ["because", "caused", "drives the", "leads to", "results in"]) {
      expect(body.includes(word), `causal wording on screen: "${word}"`).toBe(false);
    }
  });

  test("opening a unit reaches evidence specific to that unit, not the list again", async ({
    page,
  }) => {
    /*
     * `UnitMatrix`'s in-page `aside` (click a row, the detail panel beside
     * it updates, the URL grows a `?unit=` query) is gone with `UnitMatrix`
     * itself: `StackPlan`'s `Cell` is a plain link to the unit's own page
     * (`apps/web/src/components/product/StackPlan.tsx`), confirmed live --
     * `/units?unit=A-402` renders no different from `/units` with no
     * selection at all. The property this test protects -- clicking a unit
     * shows evidence about THAT unit, not a re-render of the list -- now
     * means "the click navigates, and the destination names the unit and
     * carries evidence for it," not "an aside panel's text changes."
     */
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/units");
    const firstUnit = page.locator('a[href*="/units/"]').first();
    const code = (await firstUnit.getAttribute("href"))?.split("/").pop();
    await firstUnit.click();
    await page.waitForURL(/\/units\/[A-Z0-9-]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(code ?? "");
    // Evidence for this specific unit reached the page, not merely its name.
    expect(await page.locator("[class*='evidence']").count()).toBeGreaterThan(0);
  });

  test("Ask Observer answers from evidence, on any surface", async ({ page }) => {
    /*
     * Rewritten for the current Ask IRIS surface, 2026-09-10.
     *
     * Ask used to open as an in-page dialog over whichever screen the reader
     * was on ("on any surface" in this test's own name). It is a full page
     * now (`/alpha/northgate/ask`), reached by submitting from anywhere —
     * every embedded composer navigates there rather than opening an overlay
     * — so "on any surface" is proven by starting from a DIFFERENT surface
     * (the Briefing) and following its own composer there, rather than by
     * checking a dialog that no longer exists.
     *
     * The question changed too: the old one ("Which IRIS sections are being
     * skipped most frequently?") is not one of the composer's answerable
     * intents today and returns a refusal — confirmed live, not assumed —
     * which is a correct answer but not the one this test means to exercise.
     * This asks one of the composer's own suggested questions instead.
     *
     * No live model key is configured in this environment (deliberately,
     * per playwright.config.ts), so the deterministic composer answers, and
     * fast — the five-to-150-second allowance this test used to need was for
     * a real Responses API turn, which cannot happen here. Kept generous
     * anyway: this is still a real page render under whatever load the
     * machine is under, not a fixed-latency mock.
     */
    test.setTimeout(60_000);
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/showroom");
    const ask = page.getByPlaceholder("Ask IRIS…");
    await ask.fill("Why did demand fall this quarter?");
    await ask.press("Enter");
    await page.waitForURL(/\/ask\?q=/);

    /*
     * Composed-by-the-read-models and interpreted stay labelled and stay
     * apart. Which part a tool computed and which part a model may have
     * written is the product's central claim (ADR-0024), and a claim only
     * made in the documentation is not being made.
     */
    const composedBanner = page.getByText(/^Composed by Observer.s read models/);
    await expect(composedBanner).toBeVisible({ timeout: 45_000 });

    /*
     * Every evidence reference carries its own sample size.
     *
     * `.ask-evidence`/`.ask-evidence-link` replaced `.iris-evidence`; the
     * wording moved from "n=N" to "N observations". The property is the
     * same: a citation that cannot say how many observations it rests on is
     * not a citation.
     */
    await expect(page.locator(".ask-evidence-link").first()).toContainText(/[0-9]+ observations?/);
  });
});
