import { expect, test, type Page } from "@playwright/test";

import { signIn, signInAs } from "./sign-in";

/**
 * Below 1199px, Projects/Settings/Sign out (and the primary nav) move behind
 * a single menu trigger instead of sitting directly in the header — see
 * `Shell.tsx`'s "THE MOBILE MENU" docblock. A test written against the wide
 * header's direct visibility needs this first on a narrow viewport; it is a
 * no-op wherever the wide header is what's rendered.
 */
async function openMobileMenuIfPresent(page: Page): Promise<void> {
  const trigger = page.locator(".irs-mobile-menu-trigger");
  if ((await trigger.count()) > 0 && (await trigger.isVisible())) {
    await trigger.click();
  }
}

/**
 * REACHABILITY, PROVED FROM THE RENDERED MARKUP — NOT ASSERTED FROM AN
 * ALLOW-LIST.
 *
 * `surfaces.test.ts` used to certify three destinations as "named on the Ask
 * IRIS screen" by matching route keys against navigation-key constants; none
 * of the three had an actual `<a>` behind them, and the check would have
 * passed with every link deleted. This file reads the real DOM instead: it
 * signs in, follows the actual anchor, and waits for the actual URL.
 *
 * Every test here corresponds to one finding from the frontend audit's
 * navigation section (E) and one fix from the 12-hour completion block's
 * Phase 1. A test failing here means the specific defect it names has come
 * back, not that some allow-list needs another entry.
 */

const NORTHGATE = "/alpha/northgate";

test.describe("Ask IRIS names three destinations it used to only claim to", () => {
  test("links to Today's briefing, and it opens /showroom", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto(`${NORTHGATE}/ask`);
    const link = page.getByRole("link", { name: /today.s briefing/i });
    await expect(link, "no real link to Today's briefing on Ask IRIS").toBeVisible();
    await link.click();
    await page.waitForURL(/\/showroom$/);
  });

  test("links to What needs attention, and it opens /attention", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto(`${NORTHGATE}/ask`);
    const link = page.getByRole("link", { name: /what needs attention/i });
    await expect(link, "no real link to What needs attention on Ask IRIS").toBeVisible();
    await link.click();
    await page.waitForURL(/\/attention$/);
  });

  test("links to the full history, and it opens the real /ask/history route", async ({ page }) => {
    /*
     * Deliberately NOT "Earlier questions" — the clock button beside the
     * composer already carries that accessible name and toggles an inline
     * preview panel in place, rather than navigating. Asserting on the same
     * name here would make this test pass by finding either control, which
     * defeats the point: this checks the ROUTE-navigating one specifically.
     */
    await signInAs(page, "Petra Novák");
    await page.goto(`${NORTHGATE}/ask`);
    const link = page.getByRole("link", { name: /see the full history/i });
    await expect(link, "no real link to the /ask/history route on Ask IRIS").toBeVisible();
    const href = await link.getAttribute("href");
    expect(href, "the full-history link must point at the /ask/history route").toContain(
      "/ask/history",
    );
    await link.click();
    await page.waitForURL(/\/ask\/history$/);
  });

  test("the same three links exist from the empty-openings state", async ({ page }) => {
    /*
     * `AskQuickLinks` renders in BOTH branches of `AskOpeningList` — the
     * populated one and the "nothing to ask about yet" one. Riverside has
     * suggestions today, so this exercises the shape rather than the fixture;
     * what matters is the component renders the row unconditionally.
     */
    await signInAs(page, "Petra Novák", "Riverside Walk");
    await page.goto("/alpha/riverside/ask");
    await expect(page.getByRole("link", { name: /today.s briefing/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /what needs attention/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /see the full history/i })).toBeVisible();
  });
});

test.describe("the shell no longer hides itself on Ask IRIS's own sub-routes", () => {
  /*
   * The bug this repairs: `variant` was computed from the first path SEGMENT,
   * and `/ask`, `/ask/history` and `/ask/[threadId]` all share "ask" as their
   * first segment. All three got the reduced Ask header, which drops Projects,
   * Settings, Administration and the context band — correct for `/ask` itself,
   * wrong for the other two, which are ordinary `ox-` screens that state a
   * period and need the controls to change it.
   */
  test("/ask/history keeps Projects, Settings and Sign out", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto(`${NORTHGATE}/ask/history`);
    await openMobileMenuIfPresent(page);
    await expect(page.getByRole("link", { name: "Projects" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  test("/ask/[threadId] keeps Projects, Settings and Sign out", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto(`${NORTHGATE}/ask`);
    await page.getByRole("link", { name: /see the full history/i }).click();
    await page.waitForURL(/\/ask\/history$/);
    const thread = page.locator(".ox-thread-title a").first();
    await expect(thread, "no thread in Northgate's history to open").toBeVisible();
    await thread.click();
    await page.waitForURL(/\/ask\/[^/]+$/);
    await openMobileMenuIfPresent(page);
    await expect(page.getByRole("link", { name: "Projects" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
  });

  test("/ask itself still wears the reduced header (this must NOT regress)", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto(`${NORTHGATE}/ask`);
    /*
     * The Ask variant renders no mobile-menu trigger at all — see
     * `Shell.tsx`: `accountAsk`/no context band, and the reduced header
     * already fits one row at every width. `openMobileMenuIfPresent` is a
     * no-op here, which is itself part of what this test protects.
     */
    await openMobileMenuIfPresent(page);
    await expect(page.getByRole("link", { name: "Projects" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });
});

test.describe("the retired SECONDARY_NAV row", () => {
  test("Sales Flow and Sales Agents draw no cross-section detail tabs", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    for (const path of [`${NORTHGATE}/flow`, `${NORTHGATE}/agents`]) {
      await page.goto(path);
      await expect(
        page.getByRole("link", { name: "Presentation DNA" }),
        `${path} still draws the retired SECONDARY_NAV row`,
      ).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Unit Attention" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Storytelling" })).toHaveCount(0);
    }
  });

  test("Presentation DNA is reachable from Project, its owning context", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto(`${NORTHGATE}/project`);
    const link = page.getByRole("link", { name: /presentation dna/i });
    await expect(link, "no link from Project to /presentation").toBeVisible();
    await link.click();
    await page.waitForURL(/\/presentation$/);
  });

  test("no dead link claims to be Unit Attention while opening /units", async ({ page }) => {
    /*
     * The literal defect this closes: a tab labelled "Unit Attention" whose
     * href resolved to `/units` — the SAME destination as the "Units" tab
     * beside it, under a name that promised the attention register.
     */
    await signInAs(page, "Petra Novák");
    for (const path of [`${NORTHGATE}/flow`, `${NORTHGATE}/project`, `${NORTHGATE}/agents`]) {
      await page.goto(path);
      await expect(page.getByRole("link", { name: "Unit Attention" })).toHaveCount(0);
    }
  });
});

test.describe("Meeting Detail links to the agent who presented", () => {
  test("the agent's name is a real link to their detail screen", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto(`${NORTHGATE}/meetings`);
    const row = page.locator(".ox-table tbody tr").first().getByRole("link").first();
    await expect(row, "no meeting row on Northgate to open").toBeAttached();
    await row.click();
    await page.waitForURL(/\/meetings\/[^/]+$/);

    const lede = page.locator(".ox-lede");
    await expect(lede).toContainText("Presented by");
    const agentLink = lede.getByRole("link");
    /*
     * `agentHref` is `null` only when a session's `agentId` fails to resolve
     * against the roster, which does not happen on Northgate's fixtures — so
     * this is a hard assertion rather than a conditional one.
     */
    await expect(agentLink, "the presenter's name is not a link").toBeVisible();
    const href = await agentLink.getAttribute("href");
    expect(href).toMatch(/\/agents\/[^/]+$/);
    await agentLink.click();
    await page.waitForURL(/\/agents\/[^/]+$/);
  });
});

test.describe("Administration is reachable without opening a project first", () => {
  test("an admin sees it on /projects; nobody else does", async ({ page }) => {
    await signIn(page, "MADSPACE Operations");
    await expect(page.getByRole("link", { name: "Administration" })).toBeVisible();

    await signIn(page, "Petra Novák");
    await expect(page.getByRole("link", { name: "Administration" })).toHaveCount(0);
  });

  test("it is not a customer primary-nav item", async ({ page }) => {
    await signInAs(page, "MADSPACE Operations", "Northgate Residences");
    await expect(page.getByRole("navigation", { name: "Sections" })).not.toContainText(
      "Administration",
    );
  });
});
