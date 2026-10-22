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

/*
 * K4: the method, and the claims beside it. Since ADR-0056 the Project page
 * keeps each block's method behind the `i` beside its title (a native
 * popover, out of the page's text until opened) rather than a "How to read
 * this" fold, and the claims stay in view.
 */
const METHOD = [
  "Interest is the share of a window's meetings that opened at least one flat of the type",
  "It pairs attention with sales and says nothing about which caused which.",
  "An opening is one flat opened in one meeting.",
  "Each bar is a kind of place",
  "Ordered by total time, in minutes.",
];
const CLAIMS = [
  /* Northgate configures no sell-out date, and its four dated sales are below the pace's floor (ADR-0055). */
  /No sell-out date set/,
  /units take \d+% of looking time on \d+% of the unsold stock\./,
];

test("K4 · Project keeps its method behind an i, closed, and every claim in view", async ({
  page,
}) => {
  const closed = await open(page, `${ROOT}/project`);
  for (const text of METHOD) expect(closed, `"${text}" waits behind its i`).not.toContain(text);
  for (const claim of CLAIMS) expect(closed).toMatch(claim);
  await expect(page.locator("main details.iris-method")).toHaveCount(0);

  const opened: string[] = [];
  for (const button of await page.locator("main button.iris-info").all()) {
    const panel = page.locator(`[id="${(await button.getAttribute("popovertarget")) ?? ""}"]`);
    await button.click();
    await expect(panel).toBeVisible();
    opened.push(await panel.innerText());
    await page.keyboard.press("Escape");
  }
  for (const text of METHOD) {
    expect(opened.join("\n"), `"${text}" is there once its i is opened`).toContain(text);
  }
});

/* K5: the radars and their scale live on the Coaching tab, and the period goes with the reader. */
test("K5 · Sales Agents keeps the radars on a Coaching tab, with their scale, and the period travels", async ({
  page,
}) => {
  const main = await open(page, `${ROOT}/agents?period=last_quarter`);
  await expect(page.locator("main .ag-coach")).toHaveCount(0);
  expect(main).not.toContain("How do the presenters differ?");
  expect(main).toMatch(/presentations given/i);

  const tabs = page.getByRole("tablist", { name: "Sales Agents" });
  await expect(tabs.getByRole("tab", { name: "Sales Agents" })).toHaveAttribute("aria-selected", "true");
  await tabs.getByRole("tab", { name: "Coaching" }).click();
  await page.waitForURL(/view=coaching/);
  expect(new URL(page.url()).searchParams.get("period"), "the period survives the switch").toBe(
    "last_quarter",
  );

  /*
   * One question, one chart since the owner's word of 2026-10-22 (ADR-0057):
   * its key names whoever is drawn, and the answer stands under the title.
   * With one agent at the floor there is no chart, and they are named under
   * the answer, face and count, as the agents under the floor are.
   */
  await expect(
    page.locator("main .ag-coach").locator(".ag-coach-key li, .ag-coach-people li").first(),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "How do the presenters differ?" })).toBeVisible();
  const coaching = await page.locator("main").innerText();
  expect(coaching).toMatch(/They differ most in |so no two agents are compared|so nobody is compared/);
  /* The plan's second clause for R12-7: a different way is not a better one (FEJEZET1), behind the i. */
  await expect(page.locator("#info-coaching")).toContainText(
    "A different way of presenting, not a better one.",
  );
  expect(coaching, "nothing else moved to the tab").not.toMatch(/presentations given/i);

  await page.getByRole("tab", { name: "Sales Agents" }).click();
  await page.waitForURL((url) => url.searchParams.get("view") === null);
  expect(new URL(page.url()).searchParams.get("period")).toBe("last_quarter");
});

/* K6: a four-way view over the Features register and the pairings, All being today's screen. */
const GROUPS: Readonly<Record<string, readonly string[]>> = {
  core: ["Home", "Residences", "Amenities", "Surroundings"],
  environment: ["Time & weather"],
  comparison: ["Compare"],
};

async function readFeatures(page: Page) {
  const main = page.locator("main");
  const register = main.getByRole("table", { name: /features? of the IRIS presentation/ });
  const pairs = main.getByRole("table", { name: /Features reached in the same presentation/ });
  const names = await register
    .locator("tbody tr")
    .evaluateAll((rows) => rows.map((r) => (r.querySelector("th, td")?.textContent ?? "").trim()));
  const pairings = (await pairs.count()) === 0
    ? []
    : await pairs
        .locator("tbody tr")
        .evaluateAll((rows) => rows.map((r) => (r.querySelector("th, td")?.textContent ?? "").trim()));
  const weather = await main.getByRole("heading", { name: "Time and weather" }).count();
  return { names, pairings, weather };
}

test("K6 · Features narrows the register and the pairings by view, and All is today's screen", async ({
  page,
}) => {
  await open(page, `${ROOT}/features`);
  const today = await readFeatures(page);
  expect(today.names.length).toBeGreaterThan(5);
  expect(today.weather).toBe(1);

  const views = page.getByRole("navigation", { name: "Features", exact: true });
  await expect(views.getByRole("link", { name: "All", exact: true })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await page.goto(`${ROOT}/features?view=all`, { waitUntil: "networkidle" });
  expect(await readFeatures(page), "All draws exactly what the screen drew before").toEqual(today);

  for (const [view, labels] of Object.entries(GROUPS)) {
    await page.goto(`${ROOT}/features`, { waitUntil: "networkidle" });
    const name = view === "core" ? "Core" : view === "environment" ? "Environment" : "Comparison";
    await views.getByRole("link", { name, exact: true }).click();
    await page.waitForURL(new RegExp(`view=${view}`));
    const seen = await readFeatures(page);
    expect(seen.names.length, `${name}: the register is not empty`).toBeGreaterThan(0);
    for (const feature of seen.names) expect(labels, `${name} holds ${feature}`).toContain(feature);
    expect(seen.names.length, `${name} is narrower than All`).toBeLessThan(today.names.length);
    for (const pair of seen.pairings) {
      expect(
        labels.some((label) => pair.includes(label)),
        `${name}: the pair "${pair}" includes one of its features`,
      ).toBe(true);
    }
    expect(seen.weather, `${name}: Time and weather`).toBe(view === "environment" ? 1 : 0);
  }
});
