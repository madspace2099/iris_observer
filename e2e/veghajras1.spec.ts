import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./sign-in";

/**
 * P2-21: THE WORK-ONLY ITEMS, ON THE PAGE A READER OPENS (VEGHAJRAS1, 2026-10-04).
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

test("R10-1 · Features keeps reach, opens and stay apart, states clicks as unavailable, and prints the screenshot total", async ({
  page,
}) => {
  const text = await open(page, "Tomáš Varga", "/alpha/northgate/features");
  const main = page.locator("main");

  expect(text).toContain("Opened in counts the presentations that reached a feature at all.");
  expect(text).toContain("Opens counts entries into it, returns included");
  expect(text).toContain("Median stay is the middle stop, not the average one.");

  const clicks = main.locator(".ox-unavailable", { hasText: "Clicks inside a feature" });
  await expect(clicks, "the click count is stated as unavailable, once").toHaveCount(1);
  await expect(clicks).toContainText("holds no click count");
  await expect(clicks, "and kept apart from opens").toContainText("Opens counts entries into a feature, not clicks");
  await expect(
    main
      .getByRole("table", { name: /features? of the IRIS presentation/ })
      .getByRole("columnheader", { name: /click/i }),
    "no column claims to count clicks",
  ).toHaveCount(0);
  await expect(main.locator(".ox-tally-item dt", { hasText: /click/i })).toHaveCount(0);

  const cell = main.locator(".ox-tally-item", { hasText: "Screenshots taken in the presentations recorded" });
  await expect(cell, "the screenshot total has a place").toHaveCount(1);
  const n = Number((await cell.locator(".ox-figure").innerText()).replace(/\D/g, ""));
  expect(Number.isInteger(n) && n > 0, `screenshots ${n}`).toBe(true);
});

/** The pairs table on /features, as the reader sees it: pair text, link, "N of M". */
async function pairRows(page: Page) {
  const main = page.locator("main");
  const total = Number(
    (
      await main
        .locator(".ox-tally-item")
        .filter({ has: page.locator("dt", { hasText: /^Presentations recorded$/ }) })
        .locator(".ox-figure")
        .innerText()
    ).replace(/\D/g, ""),
  );
  const pairs = main.getByRole("table", { name: /Features reached in the same presentation/ });
  await expect(pairs).toHaveCount(1);
  const rows: { text: string; href: string; together: number; of: number }[] = [];
  for (const row of await pairs.locator("tbody tr").all()) {
    const m = /^(\d+) of (\d+)$/.exec((await row.locator('td[data-label="Presentations with both"]').innerText()).trim());
    const link = row.locator("td.ox-table-code a");
    await expect(link, "each pair opens its presentations").toHaveCount(1);
    rows.push({
      text: (await link.innerText()).trim(),
      href: (await link.getAttribute("href")) ?? "",
      together: Number(m?.[1]),
      of: Number(m?.[2]),
    });
  }
  return { total, pairs, rows };
}

test("R10-5 · a pair claims no order and no effect, states its floor and denominator, and opens the presentations it was counted from", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await open(page, "Tomáš Varga", "/alpha/northgate/features");
  const main = page.locator("main");
  const { total, pairs, rows } = await pairRows(page);

  await expect(pairs.locator("caption")).toContainText("seen together in at least five presentations");
  await expect(main).toContainText(
    "it carries no order between the two features and no claim about what either one did to the buyer",
  );
  await expect(
    page
      .locator("main .ox-plate")
      .filter({ has: page.getByRole("table", { name: /Features reached in the same presentation/ }) })
      .locator('span.ox-tier[data-tier="statistical_association"]'),
    "the pair is a pattern, not an effect",
  ).toHaveCount(1);

  expect(rows.length, "the period lists pairs").toBeGreaterThan(0);
  for (const row of rows) {
    expect(row.of, `${row.text}: the denominator is the period's presentations`).toBe(total);
    expect(row.together, `${row.text}: the floor`).toBeGreaterThanOrEqual(5);
  }

  for (const row of rows) {
    await page.goto(row.href, { waitUntil: "networkidle" });
    await expect(page.locator(".ox-filters-count"), row.text).toHaveText(`${row.together} of ${total} meetings`);
    await expect(
      main.getByRole("table", { name: /^Showroom presentations on/ }).locator("tbody tr"),
      row.text,
    ).toHaveCount(row.together);
    const select = page.getByLabel("Features reached", { exact: true });
    await expect(select).toHaveValue(new URL(row.href, page.url()).searchParams.get("features") ?? "");
    await expect(select.locator("option:checked")).toHaveText(`${row.text} (${row.together})`);
  }

  const first = rows[0]!;
  await page.goto(first.href, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: /open this meeting/ }).first().click();
  await page.waitForURL(/\/meetings\/mtg_/);
  const back = page.getByRole("link", { name: "Back to the narrowed register" });
  await expect(back, "the replay says it returns to the pair's presentations").toBeVisible();
  await back.click();
  await page.waitForURL(/\/meetings\?/);
  await expect(page.locator(".ox-filters-count")).toHaveText(`${first.together} of ${total} meetings`);
});

test("R10-5 · the pairing finding's evidence opens the presentations it rests on", async ({ page }) => {
  await open(page, "Tomáš Varga", "/alpha/northgate/features");
  const { total } = await pairRows(page);
  const finding = page.locator("main article.ox-finding", { hasText: /appear together in \d+ meetings/ });
  await expect(finding).toHaveCount(1);
  const k = Number(/appear together in (\d+) meetings/.exec(await finding.innerText())?.[1]);
  await finding.locator("a.ox-evidence").click();
  await page.waitForURL(/\/meetings\?/);
  await expect(page.locator(".ox-filters-count")).toHaveText(`${k} of ${total} meetings`);
});

test("R10-5 · a developer opens a pair's presentations as a list", async ({ page }) => {
  await open(page, "Petra Novák", "/alpha/northgate/features");
  const { total, rows } = await pairRows(page);
  const first = rows[0]!;
  await page.locator("main td.ox-table-code a").first().click();
  await page.waitForURL(/\/meetings\?/);
  await expect(page.locator(".ox-filters-count")).toHaveText(`${first.together} of ${total} meetings`);
  await expect(page.locator("main .ox-table-code a"), "a developer's register rows are text").toHaveCount(0);
});

test("R10-5 · a pair narrowing written twice still opens the register", async ({ page }) => {
  await signInAs(page, "Tomáš Varga");
  const r = await page.goto("/alpha/northgate/meetings?features=compare&features=shortlist");
  expect(r?.status()).toBeLessThan(400);
  await expect(page.locator(".ox-filters-count")).toHaveText(/^\d+ of \d+ meetings$/);
});

/** Every listed meeting names the recorded place it stands on, and every row is a meeting. */
async function standsOnRecordedPlace(page: Page): Promise<number> {
  const rows = page.locator('.iris-matrix[data-columns="audience"] .iris-matrix-row');
  await expect(rows.first()).toBeVisible();
  const n = await rows.count();
  const why = await page
    .locator('.iris-matrix[data-columns="audience"] .iris-audience-why > .iris-bar-label')
    .evaluateAll((els) => els.map((e) => e.getAttribute("title") ?? ""));
  expect(why).toHaveLength(n);
  for (const w of why) expect(w, "a row stands on units alone").toMatch(/ · .+ \d+s$/);
  await expect(page.locator(".iris-audience-basis", { hasText: "IRIS observed · Recorded today" })).toHaveCount(n);
  await expect(page.locator('.iris-matrix[data-columns="audience"] a.iris-matrix-row[href*="/meetings/"]')).toHaveCount(n);
  return n;
}

test("R06-5 · Build audience lists only meetings that stand on a recorded place, every row a meeting", async ({
  page,
}) => {
  await open(page, "Tomáš Varga", "/alpha/northgate/project?segment=rooms-2");
  const pill = page.locator("main a.iris-action", { hasText: "Build an audience from this" });
  await expect(pill).toHaveCount(1);
  await pill.click();
  await page.waitForURL(/\/audience\?/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^\d+ of \d+ meetings match\.$/);
  expect(await standsOnRecordedPlace(page)).toBeGreaterThan(0);
  await expect(page.locator("main")).toContainText("and spent at least 25 seconds on places of any kind.");

  await page.getByRole("tab", { name: "Merely opened it" }).click();
  await page.waitForURL(/all=1/);
  await standsOnRecordedPlace(page);

  await page.goto("/alpha/northgate/project?segment=rooms-2", { waitUntil: "networkidle" });
  const finding = page.locator("main article.iris-finding", { hasText: "places take" });
  await expect(finding).toHaveCount(1);
  await finding.getByRole("link", { name: "Build an audience", exact: true }).click();
  await page.waitForURL(/\/audience\?category=/);
  await standsOnRecordedPlace(page);

  /* Transport leads here, and none of its places is recorded: the finding offers no audience. */
  await page.goto("/alpha/northgate/project?period=last_28_days", { waitUntil: "networkidle" });
  const transport = page.locator("main article.iris-finding", { hasText: "Transport places take" });
  await expect(transport).toHaveCount(1);
  await expect(transport.getByRole("link", { name: "Build an audience" })).toHaveCount(0);
});

test("R13-3 · activity, recorded outcomes, verified outcomes and follow-up completion stand apart, each figure with its real denominator", async ({
  page,
}) => {
  await open(page, "Tomáš Varga", "/alpha/northgate/agents/agt_monika");
  const plate = page
    .locator("main .ox-plate-inner")
    .filter({ has: page.getByRole("heading", { level: 2, name: "Activity in this period" }) });
  await expect(plate).toHaveCount(1);
  const read = await plate.evaluate((el) => ({
    tokens: [...el.querySelectorAll(":scope > *")]
      .map((c) =>
        c.matches("dl.ox-tally")
          ? "T"
          : c.matches("p.ox-subhead")
            ? (c.textContent ?? "").trim()
            : c.matches("div.ox-unavailable")
              ? ((c.textContent ?? "").split(" — ")[0] ?? "").trim()
              : null,
      )
      .filter((t) => t !== null),
    verified: (el.querySelector(":scope > div.ox-unavailable:last-child")?.textContent ?? "").trim(),
    tallies: [...el.querySelectorAll(":scope > dl.ox-tally")].map((dl) =>
      [...dl.querySelectorAll(".ox-tally-item")].map((it) => ({
        dt: (it.querySelector("dt")?.textContent ?? "").trim(),
        figure: it.querySelector(".ox-figure")?.textContent?.trim() ?? null,
        of: (it.querySelector(".ox-of")?.textContent ?? "").trim(),
        missing: it.querySelector('.ox-value[data-missing="true"]')?.textContent?.trim() ?? null,
      })),
    ),
    text: el.textContent ?? "",
  }));

  /* Four regions, apart, the verified one as an availability state with no figure. */
  expect(read.tokens).toEqual(["T", "Follow-up", "T", "Follow-ups completed", "Outcomes they recorded", "T", "Verified outcomes"]);
  expect(read.verified).toMatch(/^Verified outcomes — \D+$/);

  const [activity, followUp, recorded] = read.tallies;
  expect(activity).toHaveLength(4);
  for (const item of activity ?? []) expect(item.of, item.dt).not.toBe("");
  const p = activity?.[0]?.figure ?? "";
  expect(activity?.[0]?.of).toMatch(/^of [\d\s.,  ]+ on this project$/);

  expect(recorded).toHaveLength(2);
  const counted = [followUp?.[0], recorded?.[0], recorded?.[1]];
  let measured = 0;
  for (const item of counted) {
    if (item?.figure === "0") expect(item.of, item.dt).toMatch(/^No meeting of theirs in this period/);
    else {
      measured += 1;
      expect(item?.of, item?.dt).toBe(`of ${p} meetings`);
    }
  }
  expect(measured, "the page measures nothing").toBeGreaterThan(0);

  expect(followUp?.[1]?.dt).toBe("Follow-ups completed");
  expect(followUp?.[1]?.missing).toBe("Unavailable");
  expect(followUp?.[1]?.figure).toBeNull();

  expect(read.text, "an unknown follow-up is not lateness").not.toMatch(/\b(late|overdue)\b/i);
});
