import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./sign-in";

/**
 * Review artefacts for the MADSPACE operations surface.
 *
 * Not assertions — these produce the images a human looks at, and
 * `docs/12-visual-autopsy.md` is the record of what happens when nobody does.
 * Written outside the repository, like every other screenshot spec here: a
 * screenshot committed without a visual baseline policy is a binary nobody
 * updates and everybody ignores.
 *
 * ## This one needs a development server
 *
 * The default configuration builds and runs `next start`, which sets
 * `NODE_ENV=production` — and the local control plane refuses to open in
 * production, deliberately. These screens would render their own "control plane
 * unavailable" state, which is a correct screenshot of the wrong thing. So:
 *
 *   OBSERVER_BASE_URL=http://localhost:3310 pnpm exec playwright test madspace-screenshots
 *
 * with `pnpm --filter @observer/web dev --port 3310` running and
 * `OBSERVER_LOCAL_CONTROL_PLANE=1` in `apps/web/.env.local`.
 *
 * ## The lifecycle captures walk real state
 *
 * 05 through 10 are not five renderings of one page. Each is taken after a real
 * transition performed through the real endpoints — a code exchanged, a
 * heartbeat posted, a `diagnostic.test` accepted, a suspension applied — so the
 * set is a record of the system actually moving rather than of a component
 * accepting five different props.
 *
 * ## Which is why it needs a fresh estate
 *
 * The walk ENDS activated, connected and verified, so a second run begins
 * there — and `05-source-not-activated` was a photograph of a fully activated
 * source under a filename saying otherwise. Exactly the failure this file's
 * first paragraph warns about, produced by the file itself.
 *
 * So the precondition is asserted rather than assumed, and the assertion names
 * its own fix. Reset before a capture run:
 *
 *   rm -rf .observer-local     # the database AND its ledger; they share a life
 *
 * then restart the dev server and press "Build the estate" on the projects
 * list, or simply let the walk's first navigation do it.
 */
const OUT =
  process.env["OBSERVER_MADSPACE_SHOTS"] ??
  "C:/Users/42191/AppData/Local/Temp/claude/C--Users-42191-Documents-IRIS-OBSERVER/8eba7212-1d04-4994-b6ca-c0d2830338c5/scratchpad/madspace";

/**
 * Next's development overlay, hidden for the capture only.
 *
 * `next dev` floats a dark badge over the bottom-left of every page. It sat on
 * top of a status column in an earlier run and read as a defect in the design,
 * which is exactly what a reviewer should not have to mentally subtract.
 * Hidden here rather than disabled in `next.config.ts`, because the indicator is
 * useful while developing and a configuration change to make screenshots
 * prettier would take it away from everybody.
 */
const HIDE_DEV_OVERLAY = `
  nextjs-portal,
  [data-nextjs-dev-tools-button],
  #__next-build-watcher { display: none !important; }
`;

/*
 * The viewport is part of the filename, because it has to be. An earlier
 * version wrote the same names from every project, so running the mobile suite
 * after the desktop one silently replaced the desktop captures with 390px
 * ones — a review set that looks complete and is entirely the wrong size.
 */
async function shoot(page: Page, name: string, viewport: string): Promise<void> {
  await page.addStyleTag({ content: HIDE_DEV_OVERLAY });
  await page.evaluate(() => document.fonts.ready);

  /*
   * BACK TO THE TOP FIRST, and this is not cosmetic.
   *
   * The lifecycle captures are taken after pressing a driver button, and the
   * driver is at the foot of a long page — so the viewport shot was a picture
   * of the buttons that had just been pressed rather than of the states they
   * changed. Every lifecycle image in the previous set showed the same footer.
   *
   * It corrupts the full-page shot too. The MADSPACE chrome is fixed, so a
   * full-page capture paints it once at whatever offset the page is scrolled
   * to: the header landed halfway down the image, in the middle of the
   * Operations section, and left a header-shaped void at the top. That reads as
   * a layout bug in a design review, and it is a screenshot artefact.
   */
  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.waitForTimeout(400);

  await page.screenshot({ path: `${OUT}/${name}-${viewport}.png` });
  await page.screenshot({ path: `${OUT}/${name}-${viewport}-full.png`, fullPage: true });
}

/**
 * The estate the control plane seeds itself with, found by following links.
 *
 * The identifiers are minted by Postgres and differ on every machine, so a
 * fixed UUID here would pass on one laptop and fail on the next.
 */
/**
 * Land on the projects list with an estate on it, building one if there is not.
 *
 * A capture run begins with `rm -rf .observer-local` — that reset is what makes
 * the lifecycle record truthful — and the projects list is empty immediately
 * afterwards, because the control plane lists projects through the sources they
 * own. So every screen in this file would otherwise photograph an empty account
 * on the one run whose captures matter most.
 *
 * Built through the button an operator presses, not through a fixture: it
 * creates a real project and a real source through the admin services, and the
 * source it leaves behind has never been activated.
 */
async function ensureEstate(page: Page): Promise<void> {
  await page.goto("/madspace/projects");

  const open = page.getByRole("link", { name: /open project/i });
  if ((await open.count()) > 0) return;

  await page.getByRole("button", { name: /build the estate/i }).click();
  await expect(open.first()).toBeVisible({ timeout: 30_000 });
}

async function openProject(page: Page): Promise<void> {
  await ensureEstate(page);
  await page.getByRole("link", { name: /open project/i }).first().click();
  await page.waitForURL(/\/madspace\/projects\/[0-9a-f-]{36}/);
}

async function openSource(page: Page): Promise<void> {
  await openProject(page);
  await page.locator('a[href*="/madspace/sources/"]').first().click();
  await page.waitForURL(/\/madspace\/sources\//);
}

/**
 * Press one lifecycle-driver button and wait for the page to come back.
 *
 * Scoped to the driver, because the real operator actions live on the same page
 * and `Suspend` matches both. That collision is the system working: the driver
 * exists to walk states, and `SourceActions` is what an operator actually
 * presses — they are different buttons and the test must say which it means.
 */
async function drive(page: Page, label: string | RegExp): Promise<void> {
  const driver = page.getByRole("region", { name: /lifecycle driver/i });
  await driver.getByRole("button", { name: label }).click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(900);
}

test.describe("madspace operations", () => {
  // Needs `next dev`: the local control plane refuses to open under NODE_ENV=production (see the file docblock).
  test.skip(() => process.env["OBSERVER_BASE_URL"] === undefined, "Needs a development server: set OBSERVER_BASE_URL.");
  test("projects", async ({ page }, info) => {
    await signInAs(page, "MADSPACE Operations");
    await ensureEstate(page);
    await shoot(page, "01-madspace-projects", info.project.name);
  });

  test("new project", async ({ page }, info) => {
    await signInAs(page, "MADSPACE Operations");
    await page.goto("/madspace/projects/new");
    await shoot(page, "02-new-project", info.project.name);
  });

  test("project detail", async ({ page }, info) => {
    await signInAs(page, "MADSPACE Operations");
    await openProject(page);
    await shoot(page, "03-project-detail", info.project.name);
  });

  test("new source", async ({ page }, info) => {
    await signInAs(page, "MADSPACE Operations");
    await openProject(page);
    const url = page.url();
    await page.goto(`${url}/sources/new`);
    await shoot(page, "04-new-source", info.project.name);
  });

  /*
   * The hero at every width, and deliberately NOT part of the lifecycle record.
   *
   * Source Detail is the screen this milestone is judged on, so it needs
   * reviewing at 1920, 1440 and 412 — but the lifecycle captures below can only
   * be truthful on an estate that has never been walked, and that is a
   * once-per-reset condition rather than a once-per-viewport one. Separating
   * them lets this run at every width while claiming nothing about the state it
   * happens to find.
   */
  test("source detail", async ({ page }, info) => {
    await signInAs(page, "MADSPACE Operations");
    await openSource(page);
    await shoot(page, "12-source-detail", info.project.name);
  });

  test("diagnostics", async ({ page }, info) => {
    await signInAs(page, "MADSPACE Operations");
    /* Its counts and its filters describe an estate, so there has to be one. */
    await ensureEstate(page);
    await page.goto("/madspace/diagnostics");
    await shoot(page, "11-diagnostics", info.project.name);
  });
});

/**
 * The lifecycle, in order, in ONE test.
 *
 * Serial rather than five independent tests because the states are a sequence:
 * a source cannot be Connected before it is Activated, and Playwright would
 * otherwise run them in parallel against one shared database and photograph
 * whichever state happened to win.
 */
test.describe("madspace source lifecycle", () => {
  // Needs `next dev`: the local control plane refuses to open under NODE_ENV=production (see the file docblock).
  test.skip(() => process.env["OBSERVER_BASE_URL"] === undefined, "Needs a development server: set OBSERVER_BASE_URL.");
  test("walks every state and captures each", async ({ page }, info) => {
    /*
     * ONE viewport, because this is a record of the system moving rather than a
     * responsive check — `12-source-detail` covers the widths. Running it in
     * all three projects would also walk the same estate three times against
     * one database, and only the first of those would begin unactivated.
     */
    test.skip(info.project.name !== "desktop", "the lifecycle record is captured once");
    test.setTimeout(180_000);
    await signInAs(page, "MADSPACE Operations");
    await openSource(page);

    /*
     * The name of the next file is a claim about the state, so the state is
     * checked before the claim is written to disk. A failure here is not a
     * broken application: it means the estate has already been walked, and the
     * message says what to do about it.
     */
    await expect(
      page.getByText("Not activated", { exact: true }),
      "05 must be captured on a source that has never been activated — the walk leaves it " +
        "activated, connected and verified, so a second run would file a picture of the end " +
        "state under the name of the beginning. Reset with: rm -rf .observer-local, restart " +
        "the dev server, then run this again.",
    ).toBeVisible();

    await shoot(page, "05-source-not-activated", info.project.name);

    await drive(page, /^Activate/);
    await shoot(page, "07-source-activated-offline", info.project.name);

    await drive(page, /^Send heartbeat/);
    await shoot(page, "08-source-connected", info.project.name);

    await drive(page, /^Send diagnostic/);
    await shoot(page, "09-source-ingestion-verified", info.project.name);

    await drive(page, /^Suspend/);
    await shoot(page, "10-source-suspended", info.project.name);

    /* Left resumed, so a reviewer opening the app finds a working estate. */
    await drive(page, /^Resume/);
  });
});
