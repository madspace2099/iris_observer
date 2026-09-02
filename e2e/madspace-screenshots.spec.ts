import { test, type Page } from "@playwright/test";
import { signInAs } from "./sign-in";

/**
 * Review artefacts for the MADSPACE operations surface.
 *
 * Not assertions — these produce the images a human looks at. Written outside
 * the repository, like every other screenshot spec here: a screenshot committed
 * without a visual baseline policy is a binary nobody updates and everybody
 * ignores.
 *
 * ## This one needs a server the others do not
 *
 * The default Playwright configuration builds and runs `next start`, which sets
 * `NODE_ENV=production` — and the local control plane refuses to open in
 * production, deliberately. So these screens have nothing to render against
 * unless the suite is pointed at a development server:
 *
 *   OBSERVER_BASE_URL=http://localhost:3310 pnpm test:e2e madspace-screenshots
 *
 * with `pnpm --filter @observer/web dev --port 3310` already running and
 * `OBSERVER_LOCAL_CONTROL_PLANE=1` in `apps/web/.env.local`. Without that the
 * pages render their own "control plane unavailable" state, which is a correct
 * screenshot of the wrong thing.
 */
const OUT =
  process.env["OBSERVER_MADSPACE_SHOTS"] ??
  "C:/Users/42191/AppData/Local/Temp/claude/C--Users-42191-Documents-IRIS-OBSERVER/8eba7212-1d04-4994-b6ca-c0d2830338c5/scratchpad/madspace";

/**
 * Next's development overlay, hidden for the capture only.
 *
 * `next dev` floats a dark circular badge over the bottom-left of every page.
 * It sat on top of the Activation column in the first capture and read as a
 * defect in the design, which is exactly the kind of thing a reviewer should
 * not have to mentally subtract from a screenshot.
 *
 * Hidden HERE rather than turned off in `next.config.ts`: the indicator is
 * useful while developing, and a configuration change to make screenshots
 * prettier would take it away from everybody for the rest of the project.
 */
const HIDE_DEV_OVERLAY = `
  nextjs-portal,
  [data-nextjs-dev-tools-button],
  #__next-build-watcher { display: none !important; }
`;

/*
 * The viewport's name is part of the filename, because it has to be. The first
 * version wrote `01-projects.png` from every project, so running the mobile
 * suite after the desktop one silently replaced the desktop captures with
 * 390px ones — a review set that looks complete and is entirely the wrong size.
 * Every other screenshot spec here suffixes the project for the same reason.
 */
async function shoot(page: Page, name: string, viewport: string): Promise<void> {
  await page.addStyleTag({ content: HIDE_DEV_OVERLAY });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}-${viewport}.png` });
  await page.screenshot({ path: `${OUT}/${name}-${viewport}-full.png`, fullPage: true });
}

/**
 * The estate the local control plane seeds itself with.
 *
 * Discovered by following links rather than hard-coded: the identifiers are
 * minted by Postgres and differ on every machine, so a fixed UUID here would
 * make this spec pass on one laptop and fail on the next.
 */
async function openFirstProject(page: Page): Promise<void> {
  await page.goto("/madspace/projects");
  await page.getByRole("link", { name: "Open project" }).first().click();
  await page.waitForURL(/\/madspace\/projects\//);
}

async function openFirstSource(page: Page): Promise<void> {
  await openFirstProject(page);
  await page.locator('a[href*="/madspace/sources/"]').first().click();
  await page.waitForURL(/\/madspace\/sources\//);
}

test.describe("madspace operations", () => {
  test("projects", async ({ page }, info) => {
    await signInAs(page, "MADSPACE Operations");
    await page.goto("/madspace/projects");
    await shoot(page, "01-projects", info.project.name);
  });

  test("project detail", async ({ page }, info) => {
    await signInAs(page, "MADSPACE Operations");
    await openFirstProject(page);
    await shoot(page, "02-project-detail", info.project.name);
  });

  test("source detail", async ({ page }, info) => {
    await signInAs(page, "MADSPACE Operations");
    await openFirstSource(page);
    await shoot(page, "03-source-detail", info.project.name);
  });
});
