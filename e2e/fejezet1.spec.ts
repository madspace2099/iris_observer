import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./sign-in";

/**
 * P2-21: THE R04 ITEMS, ON THE PAGE A READER OPENS (FEJEZET1, 2026-10-03).
 *
 * Each test names its item by route and position and asserts only what the
 * requirement claims, on the rendered screen, in the words the screen prints.
 */

async function open(page: Page, who: string, path: string): Promise<string> {
  await signInAs(page, who);
  await page.goto(path, { waitUntil: "networkidle" });
  return page.locator("main").innerText();
}

test.beforeEach(({ isMobile }, testInfo) => {
  test.skip(isMobile || testInfo.project.name !== "desktop", "a reading of the page, not of its width");
});

/** A raised card on /attention, found by its title. */
function card(page: Page, title: string) {
  return page.locator("main li.ox-alert").filter({ has: page.locator("h3", { hasText: title }) });
}

test("R04-4 · a card names five of its subjects and counts the rest, and opens exactly the list it counts", async ({
  page,
}) => {
  await open(page, "Tomáš Varga", "/alpha/northgate/attention");
  const outcomes = card(page, "Meetings ending without a recorded outcome");
  await expect(outcomes).toHaveCount(1);
  const detail = await outcomes.locator(".ox-alert-detail").innerText();
  const [, counted, total] = /^(\d+) of (\d+) presentations/.exec(detail) ?? [];
  const n = Number(counted);
  expect(n, `${detail}: more subjects than a card names`).toBeGreaterThan(5);

  const items = (await outcomes.locator("ul.ox-chipset > li").allInnerTexts()).map((t) => t.trim());
  expect(items.filter((t) => !/^and \d+ more$/.test(t)), "five subjects named").toHaveLength(5);
  expect(items.filter((t) => t === `and ${n - 5} more`), "the rest counted").toHaveLength(1);
  await expect(outcomes.locator("ul.ox-chipset > li").last().locator("a"), "the count is not a door").toHaveCount(0);

  await outcomes.getByRole("link", { name: "See the meetings" }).click();
  await page.waitForURL(/\/meetings(\?|$)/);
  await expect(page.locator(".ox-filters-count")).toHaveText(`${n} of ${total} meetings`);
});

test("R04-4 · a unit check opens the register narrowed to the units it names", async ({ page }) => {
  const KINDS = {
    "Opened repeatedly, never shortlisted": "viewed_never_shortlisted",
    "Attention falling on units that used to draw it": "demand_dropping",
  } as const;
  let found = 0;
  for (const [title, kind] of Object.entries(KINDS)) {
    await open(page, "Petra Novák", "/alpha/riverside/attention");
    const raised = card(page, title);
    if ((await raised.count()) === 0) continue;
    found += 1;
    const n = Number(/(\d+)/.exec(await raised.locator(".ox-alert-detail").innerText())?.[1]);
    const items = (await raised.locator("ul.ox-chipset > li").allInnerTexts()).map((t) => t.trim());
    const codes = items.filter((t) => !/^and \d+ more$/.test(t)).map((t) => t.split(" · ")[0]);
    const rest = Number(/^and (\d+) more$/.exec(items.find((t) => /^and \d+ more$/.test(t)) ?? "")?.[1] ?? 0);
    expect(codes.length + rest, `${title}: the card's subjects are the count it states`).toBe(n);

    const action = raised.getByRole("link", { name: "Open unit attention" });
    await expect(action, title).toBeVisible();
    await action.click();
    await page.waitForURL(/\/units(\?|$)/);
    const search = new URL(page.url()).searchParams;
    expect([search.get("check"), search.get("shown")], title).toEqual([kind, "all"]);
    await expect(page.locator(".ox-filters-count"), title).toHaveText(new RegExp(`^${n} of \\d+ units$`));
    await expect(page.getByLabel("Attention check", { exact: true }), title).toHaveValue(kind);
    if (rest === 0) {
      const rows = await page.locator("main .ox-table-code a").allInnerTexts();
      expect(new Set(rows.map((r) => r.trim())), `${title}: the rows are the units the card names`).toEqual(
        new Set(codes),
      );
    }
  }
  expect(found, "no unit check was raised on Riverside, so nothing was measured").toBeGreaterThan(0);
});

test("R04-4 · with no CRM, the card opens every presentation it says cannot be verified", async ({ page }) => {
  await open(page, "Petra Novák", "/alpha/riverside/attention");
  const noCrm = card(page, "No outcome can be verified on this project");
  await expect(noCrm).toHaveCount(1);
  const n = /the (\d+) presentations in this period/.exec(await noCrm.locator(".ox-alert-detail").innerText())?.[1];
  expect(n, "the card counts the presentations").toBeTruthy();
  const action = noCrm.getByRole("link", { name: "See the meetings" });
  await expect(action, "the card opens the list it is about").toBeVisible();
  await action.click();
  await page.waitForURL(/\/meetings(\?|$)/);
  await expect(page.locator(".ox-filters-count")).toHaveText(`${n} of ${n} meetings`);
});

const METHOD = [
  "Severity first, then how much each one is about.",
  "A state below its minimum sample is stated without a rank.",
];

/*
 * The method and each card's rank stood in view until the owner asked for less
 * text (2026-10-22, ADR-0058): both are now the `i` beside the title they
 * explain, and the register is a list rather than a table. R04-7 itself is
 * unchanged: every check names its next step.
 */
test("R04-7 · every check names its next step, the method stands behind its i, and ingestion is Not evaluated", async ({
  page,
}) => {
  for (const [who, path] of [
    ["Tomáš Varga", "/alpha/northgate/attention"],
    ["Petra Novák", "/alpha/riverside/attention"],
  ] as const) {
    const closed = await open(page, who, path);
    for (const sentence of METHOD) expect(closed, `${path}: behind the i until asked for`).not.toContain(sentence);
    expect(closed, `${path}: the answer stays in view`).toMatch(/\d+ of \d+ checks raised something on /);

    const firstCard = page.locator("main li.ox-alert").first();
    await firstCard.locator("button.iris-info").click();
    await expect(firstCard.locator(".iris-info-panel"), `${path}: the rank, when asked for`).toBeVisible();
    await expect(firstCard.locator(".iris-info-panel"), path).toContainText("Rank 1 of");
    await page.keyboard.press("Escape");

    const register = page.getByRole("list", { name: "Every check, and what it found" });
    const raisedList = page.getByRole("list", { name: "States raised in this period" });
    const rows = register.locator(":scope > li");
    expect(await rows.count(), path).toBeGreaterThan(0);
    for (const row of await rows.all()) {
      const answer = (await row.locator('[data-part="answer"]').innerText()).trim();
      const found = (await row.locator('[data-part="found"]').innerText()).trim();
      const step = row.locator('[data-part="step"]');
      if (answer === "Clear") {
        await expect(step, `${path}: ${found}`).toHaveText("None needed");
        await expect(step.locator("a")).toHaveCount(0);
      } else if (answer === "Not evaluated") {
        await expect(step, `${path}: ${found}`).toHaveText("None on this screen");
        await expect(step.locator("a")).toHaveCount(0);
      } else {
        expect(answer, path).toBe("Raised");
        /* A raised row names its card rather than repeating its sentence (ADR-0058). */
        expect(found, path).toMatch(/^Above: /);
        const state = raisedList.locator("li.ox-alert").filter({
          has: page.locator(".ox-alert-title", { hasText: found.replace(/^Above: /, "") }),
        });
        await expect(state, `${path}: one raised card per raised row`).toHaveCount(1);
        const own = state.locator(":scope > a.ox-btn");
        if ((await own.count()) === 1) {
          await expect(step.locator("a"), `${path}: ${found}`).toHaveText(await own.innerText());
          expect(await step.locator("a").getAttribute("href")).toBe(await own.getAttribute("href"));
        } else {
          await expect(step, `${path}: ${found}`).toHaveText("None on this screen");
          await expect(step.locator("a")).toHaveCount(0);
        }
      }
    }
    const ingestion = rows.filter({ hasText: "Ingestion delay" });
    await expect(ingestion.locator('[data-part="answer"]'), path).toHaveText("Not evaluated");
    expect(await ingestion.innerText(), `${path}: no queue figure`).not.toMatch(/\d/);

    await page.getByRole("button", { name: "About what was raised" }).click();
    const opened = await page.locator("#info-raised").innerText();
    for (const sentence of METHOD) expect(opened, `${path}: there when asked for`).toContain(sentence);
  }
  /* The branch with a route is on the render: Northgate's unrecorded outcomes. */
  await open(page, "Tomáš Varga", "/alpha/northgate/attention");
  const outcome = page
    .getByRole("list", { name: "Every check, and what it found" })
    .locator(":scope > li")
    .filter({ hasText: "Outcome not recorded" })
    .locator('[data-part="step"] a');
  await expect(outcome).toHaveText("See the meetings");
  expect(await outcome.getAttribute("href")).toContain("/alpha/northgate/meetings?outcome=skipped");
});
