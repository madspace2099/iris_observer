import AxeBuilder from "@axe-core/playwright";
import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { signIn } from "./sign-in";

/**
 * M10 ACCEPTANCE, AGAINST WHATEVER THE BASE URL IS.
 *
 * The connector layer was proven on a local control plane by hand-driven
 * scripts, one flow at a time. This is the same operator path, in one
 * runnable suite, so that the day the Preview holds its secrets and its
 * migrations, proving M10 there is one command rather than another session:
 *
 *   OBSERVER_M10_ACCEPTANCE=1 OBSERVER_ACCEPTANCE_TARGET=preview \
 *   OBSERVER_BASE_URL=https://<preview> pnpm exec playwright test m10-acceptance --project desktop
 *
 * ## It fails closed
 *
 * Nothing runs without the flag, and nothing runs without a target label:
 * `local-pglite`, `local-postgres` or `preview`. The label goes into the
 * evidence file verbatim and is the only thing that says what was proven —
 * a green run against a local PGlite is real evidence of the code and no
 * evidence of the hosted project, and the file must not let anyone confuse
 * the two. A deployment missing a prerequisite fails on the sentence the
 * product says (no subject pepper, no deals store), which is the right
 * failure: it names the operator's next action.
 *
 * ## What it proves, and through which door
 *
 * Sign-in through the visible form; the integrations screen; a pricelist
 * upload accepted, the same upload again a no-change; a sparse sheet drawn
 * with its gaps said in words; a deals sheet accepted, the same sheet again
 * idempotent, a changed sheet producing the expected opened, changed and
 * withdrawn counts; the ladder on Sales Flow stating the CRM's deals; the
 * disabled connector leaving a sentence, not rungs at zero; no email, phone,
 * name or subject key in the HTML, the console, a URL or an accessible name;
 * nothing shaped like a credential in what the browser is sent; axe clean;
 * no browser error.
 *
 * ## What it does not touch
 *
 * A live CRM. The manual path is the one every client has (ADR-0036), and
 * it is the one this suite drives; REALPAD, Lomnio and Monday pulls need a
 * client's credential and are recorded as "not exercised" in the evidence,
 * never as passed.
 */

const ENABLED = process.env["OBSERVER_M10_ACCEPTANCE"] === "1";
const TARGETS = ["local-pglite", "local-postgres", "preview"] as const;
type Target = (typeof TARGETS)[number];
const TARGET = process.env["OBSERVER_ACCEPTANCE_TARGET"] ?? "";
const PROJECT_NAME = process.env["OBSERVER_ACCEPTANCE_PROJECT"] ?? "ISTER TOWER";
/** The developer-facing root of the twin project: `/{tenant}/{project}`. */
const ROUTE = process.env["OBSERVER_ACCEPTANCE_ROUTE"] ?? "/alpha/ister-tower";
const EVIDENCE =
  process.env["OBSERVER_M10_EVIDENCE"] ?? resolve("test-results", "m10-acceptance-evidence.json");

const FIXTURES = resolve(import.meta.dirname, "fixtures", "m10");
const PRICELIST_V1 = resolve(FIXTURES, "pricelist-v1.csv");
const PRICELIST_V2 = resolve(FIXTURES, "pricelist-v2-sparse.csv");
const DEALS_V1 = resolve(FIXTURES, "deals-v1.csv");
const DEALS_V2 = resolve(FIXTURES, "deals-v2.csv");

/** The people in the deals fixtures, as strings that must never be rendered. */
const PERSONS = [
  "anna.fixture@example.com",
  "bela.fixture@example.com",
  "111 2222",
  "301112222",
  "+36 30 111 2222",
];
const SUBJECT_KEY = /\b[a-f0-9]{64}\b/;
/** Shapes, never values, the same rules `scripts/preview-probe.mjs` scans a deployment with. */
const SECRET_SHAPES: readonly [string, RegExp][] = [
  ["OpenAI key", /sk-[A-Za-z0-9_-]{20,}/],
  ["Supabase secret key", /sb_secret_[A-Za-z0-9_-]{10,}/],
  ["service-role JWT", /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ["database URL with a password", /postgres(ql)?:\/\/[^\s:]+:[^\s@]+@/],
];

const CSV = 'section[aria-labelledby="csv-heading"]';
const rows = (file: string) =>
  readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0).length - 1;

interface Step {
  readonly step: string;
  readonly outcome: "pass" | "fail";
  readonly said: string;
}

const evidence: {
  target: Target | "unset";
  baseUrl: string;
  startedAt: string;
  finishedAt: string | null;
  liveCrm: "not exercised";
  steps: Step[];
  consoleErrors: string[];
} = {
  target: (TARGETS as readonly string[]).includes(TARGET) ? (TARGET as Target) : "unset",
  baseUrl: process.env["OBSERVER_BASE_URL"] ?? "http://localhost:3210",
  startedAt: new Date().toISOString(),
  finishedAt: null,
  liveCrm: "not exercised",
  steps: [],
  consoleErrors: [],
};

function record(step: string, said: string, outcome: Step["outcome"] = "pass"): void {
  evidence.steps.push({ step, outcome, said });
}

function writeEvidence(): void {
  evidence.finishedAt = new Date().toISOString();
  mkdirSync(dirname(EVIDENCE), { recursive: true });
  writeFileSync(EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}

/** Every console error and page error, across every page this suite opens. */
const consoleErrors: string[] = [];
function watch(page: Page): void {
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
}

/** The words a save or an upload ends with, whatever the outcome. */
const SAVE_SAID = /Saved\.|could not|Nothing was saved|holds no/;
const UPLOAD_SAID = /Read \d+|could not|Choose|Name the|pepper|store/;

/**
 * What the form said after this submit, and not what it said after the last.
 *
 * The status region is persistent and polite (it is rendered empty so a
 * screen reader is already watching it), which means the previous upload's
 * sentence is still there when the next submit is clicked. Reading it
 * straight away returned the stale sentence and passed a wrong assertion.
 * So the submit is paired with the server action's own response and with the
 * submit button coming back from its pending state, and only then is the
 * region read.
 */
async function submitAndRead(
  page: Page,
  form: ReturnType<Page["locator"]>,
  pattern: RegExp,
): Promise<string> {
  const feedback = form.locator("[role=status], [role=alert]");
  await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined,
      { timeout: 120_000 },
    ),
    form.locator("button[type=submit]").click(),
  ]);
  /*
   * The button is disabled while the action is pending and re-enabled in the
   * same commit that carries the new sentence, so "enabled again after the
   * response" is the moment the region is current, even when the new
   * sentence happens to equal the old one (two no-change uploads in a row).
   */
  await expect(form.locator("button[type=submit]")).toBeEnabled({ timeout: 120_000 });
  const matched = feedback.filter({ hasText: pattern }).first();
  await expect(matched).toBeVisible({ timeout: 120_000 });
  return (await matched.innerText()).trim();
}

async function openSettings(page: Page): Promise<void> {
  const details = page.locator(`${CSV} details`).first();
  if (!(await details.evaluate((d) => (d as HTMLDetailsElement).open))) {
    await page.locator(`${CSV} details > summary`).click();
  }
}

async function saveSettings(page: Page): Promise<string> {
  const form = page.locator(`${CSV} details form`).first();
  return submitAndRead(page, form, SAVE_SAID);
}

/**
 * The pricelist form is the section's first form with a file input, the
 * deals form its second. Found by shape rather than by text: the settings
 * form's hints mention the deals sheet too, and a text filter matched it.
 */
async function upload(page: Page, which: "units" | "deals", file: string): Promise<string> {
  const index = which === "units" ? 0 : 1;
  const form = page
    .locator(`${CSV} form`)
    .filter({ has: page.locator("input[type=file]") })
    .nth(index);
  const input = form.locator("input[type=file]");
  await expect(input).toBeAttached({ timeout: 60_000 });
  await input.setInputFiles(file);
  return submitAndRead(page, form, UPLOAD_SAID);
}

async function metaRow(page: Page, label: string): Promise<string> {
  const item = page.locator(`${CSV} .mad-meta-item`).filter({ has: page.locator("dt", { hasText: label }) });
  return (await item.locator("dd").innerText()).trim();
}

async function chip(page: Page): Promise<string> {
  return (await page.locator(`${CSV} .obs-section-head .mad-chip`).innerText()).trim();
}

async function setEnabled(page: Page, enabled: boolean): Promise<string> {
  await openSettings(page);
  const box = page.locator(`${CSV} input[name=enabled]`);
  if (enabled) await box.check();
  else await box.uncheck();
  await saveSettings(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: PROJECT_NAME })).toBeVisible({
    timeout: 90_000,
  });
  return chip(page);
}

/** Everything a person could be shown: the HTML, every accessible name, the URL. */
async function rendered(page: Page): Promise<string> {
  const html = await page.content();
  const names = await page.evaluate(() =>
    [...document.querySelectorAll("[aria-label], [title], [alt]")]
      .map((el) => el.getAttribute("aria-label") ?? el.getAttribute("title") ?? el.getAttribute("alt") ?? "")
      .join("\n"),
  );
  return `${page.url()}\n${html}\n${names}`;
}

function expectNoPerson(text: string, where: string): void {
  for (const person of PERSONS) expect(text, `${where} shows ${person}`).not.toContain(person);
  expect(text, `${where} shows a subject key`).not.toMatch(SUBJECT_KEY);
}

function expectNoSecretShape(text: string, where: string): void {
  for (const [name, shape] of SECRET_SHAPES) expect(text, `${where} carries a ${name}`).not.toMatch(shape);
}

async function axeClean(page: Page, where: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.help}`),
    `${where}: ${results.violations.map((v) => v.id).join(", ")}`,
  ).toEqual([]);
}

test.describe.serial("M10 acceptance", () => {
  test.skip(() => !ENABLED, "Set OBSERVER_M10_ACCEPTANCE=1 to run the M10 acceptance path.");
  test.skip(() => test.info().project.name !== "desktop", "One viewport; the path, not the layout.");
  test.describe.configure({ timeout: 300_000 });

  let integrations = "";

  test.afterAll(() => {
    evidence.consoleErrors = consoleErrors;
    writeEvidence();
  });

  test("names its target, or refuses to run", () => {
    expect(
      (TARGETS as readonly string[]).includes(TARGET),
      `OBSERVER_ACCEPTANCE_TARGET must be one of ${TARGETS.join(", ")}; got "${TARGET}"`,
    ).toBe(true);
    record("target", `${TARGET} at ${evidence.baseUrl}`);
  });

  test("signs in through the real front door and reaches the integrations screen", async ({
    page,
  }) => {
    watch(page);
    await signIn(page, "MADSPACE Operations");
    await page.goto("/madspace/projects");
    const card = page.getByRole("link", { name: /Open project/ }).filter({ hasText: "" });
    /* The project by name: its heading sits in the same article as its link. */
    const article = page.locator("article, section, li").filter({ hasText: PROJECT_NAME }).first();
    await expect(article).toBeVisible({ timeout: 60_000 });
    await article.getByRole("link", { name: /Open project/ }).first().click();
    await page.getByRole("link", { name: "Integrations" }).click();
    await expect(page.getByRole("heading", { level: 1, name: PROJECT_NAME })).toBeVisible({
      timeout: 90_000,
    });
    integrations = new URL(page.url()).pathname;
    expect(integrations).toMatch(/\/madspace\/projects\/[^/]+\/integrations$/);
    for (const kind of ["realpad", "lomnio", "monday", "csv"]) {
      await expect(page.locator(`section[aria-labelledby="${kind}-heading"]`)).toBeVisible();
    }
    void card;
    record("sign-in and integrations", integrations);
  });

  test("names the spreadsheet's columns and words, and the deals sheet's", async ({ page }) => {
    watch(page);
    await signIn(page, "MADSPACE Operations");
    await page.goto(integrations);
    await openSettings(page);
    await page
      .locator(`${CSV} textarea[name=columns]`)
      .fill(
        "code=Kód\nfloor=Emelet\nrooms=Szobák\nstatus=Státusz\nbuilding=Épület\ninteriorSqm=Terület\norientation=Tájolás\npriceWithVat=Ár (bruttó)",
      );
    await page
      .locator(`${CSV} textarea[name=statusMap]`)
      .fill("szabad=available\nfoglalt=reserved\neladva=sold");
    await page.locator(`${CSV} textarea[name=orientationMap]`).fill("D=S\nK=E\nNy=W\nDNy=SW\nÉ=N");
    await page
      .locator(`${CSV} textarea[name=dealColumns]`)
      .fill(
        "externalId=Ügylet\nstage=Stádium\nunitCode=Kód\nemail=E-mail\nphone=Telefon\nstageEnteredAt=Mióta",
      );
    await page
      .locator(`${CSV} textarea[name=stageMap]`)
      .fill("érdeklődő=lead\ntalálkozó=meeting\najánlat=offer\nfoglalás=reservation");
    await page.locator(`${CSV} input[name=enabled]`).uncheck();
    const outcome = await saveSettings(page);
    expect(outcome).toBe("Saved.");
    record("spreadsheet settings", outcome);
  });

  test("accepts the pricelist, and the same pricelist again changes nothing", async ({ page }) => {
    watch(page);
    await signIn(page, "MADSPACE Operations");
    await page.goto(integrations);
    const first = await upload(page, "units", PRICELIST_V1);
    /* Fetched is the rows that became units: a row the sheet cannot read is listed, not counted. */
    const fetched = /^Read (\d+) units: /.exec(first)?.[1];
    expect(fetched, first).toBeDefined();
    expect(Number(fetched)).toBeLessThanOrEqual(rows(PRICELIST_V1));
    record("pricelist v1", first);
    const again = await upload(page, "units", PRICELIST_V1);
    expect(again).toContain(`Read ${fetched ?? ""} units: 0 added, 0 changed, 0 withdrawn.`);
    record("pricelist v1 again", again);
  });

  test("draws a sparse pricelist and says its gaps in words", async ({ page }) => {
    watch(page);
    await signIn(page, "MADSPACE Operations");
    await page.goto(integrations);
    const sparse = await upload(page, "units", PRICELIST_V2);
    expect(sparse).toMatch(/^Read 8 units: /);
    await page.reload({ waitUntil: "domcontentloaded" });
    const onProject = await metaRow(page, "On Project");
    expect(onProject).toMatch(/of 8 units drawn/);
    expect(onProject).toMatch(/Gaps: .*no room count/);
    record("sparse pricelist", `${sparse} · ${onProject}`);

    const state = await setEnabled(page, true);
    expect(state).toBe("Enabled");
    record("connector enabled", state);

    const developer = await page.context().browser()?.newContext();
    if (developer === undefined) throw new Error("no browser");
    const dev = await developer.newPage();
    watch(dev);
    await signIn(dev, "Petra Novák");
    await dev.goto(`${ROUTE}/project`, { waitUntil: "domcontentloaded" });
    await expect(dev.getByText("Rooms not stated").first()).toBeVisible({ timeout: 90_000 });
    const projectText = await dev.locator("body").innerText();
    expect(projectText).not.toMatch(/\bnull\b|\bNaN\b/);
    await axeClean(dev, "Project");
    await dev.goto(`${ROUTE}/units/P-1`, { waitUntil: "domcontentloaded" });
    await expect(dev.getByText("Not stated").first()).toBeVisible({ timeout: 90_000 });
    const unitText = await dev.locator("body").innerText();
    expect(unitText).not.toMatch(/\bnull\b|\bNaN\b/);
    record("sparse unit on Project and the unit page", "Rooms not stated · Not stated · no null, no NaN");
    await developer.close();
  });

  test("accepts the deals sheet once, idempotently, and counts a changed sheet exactly", async ({
    page,
  }) => {
    watch(page);
    await signIn(page, "MADSPACE Operations");
    await page.goto(integrations);
    const first = await upload(page, "deals", DEALS_V1);
    expect(first, "the deals path needs a subject pepper and a deals store on the server").toMatch(
      /^Read 4 deals: /,
    );
    expect(first).toContain("1 stage word(s) are not mapped yet: opció");
    record("deals v1", first);
    const again = await upload(page, "deals", DEALS_V1);
    expect(again).toContain("Read 4 deals: 0 opened, 0 changed stage, 0 withdrawn.");
    record("deals v1 again", again);
    const moved = await upload(page, "deals", DEALS_V2);
    expect(moved).toContain("Read 4 deals: 1 opened, 2 changed stage, 1 withdrawn.");
    record("deals v2", moved);
    await page.reload({ waitUntil: "domcontentloaded" });
    const deals = await metaRow(page, "Deals");
    expect(deals).toMatch(/Synced/);
    expect(deals).toMatch(/4 deals/);
    const changes = page.locator('section[aria-labelledby="changes-heading"], section[aria-labelledby="stages-heading"]').last();
    await expect(changes.locator("tbody tr").first()).toBeVisible();
    const shown = await rendered(page);
    expectNoPerson(shown, "Integrations");
    expectNoSecretShape(shown, "Integrations");
    await axeClean(page, "Integrations");
    record("integrations privacy and axe", "no person, no subject key, no credential shape, axe clean");
  });

  test("draws the ladder from the delivered deals, and a sentence once the connector is off", async ({
    page,
  }) => {
    watch(page);
    await signIn(page, "Petra Novák");
    await page.goto(`${ROUTE}/flow`, { waitUntil: "domcontentloaded" });
    const heading = page.getByRole("heading", { name: /deal ladder/i });
    await expect(heading).toBeVisible({ timeout: 90_000 });
    const ladder = page.locator("section, div").filter({ has: heading }).last();
    await expect(ladder.getByText(/Stated by the deals sheet: 4 deals/)).toBeVisible();
    const figures = await ladder.locator(".ox-stage").evaluateAll((stages) =>
      stages.map((s) => [
        s.querySelector(".ox-stage-label")?.textContent?.trim() ?? "",
        s.querySelector(".ox-figure")?.textContent?.trim() ?? "",
      ]),
    );
    expect(figures).toEqual([
      ["Lead", "4"],
      ["Meeting", "4"],
      ["Negotiation", "3"],
      ["Offer", "3"],
      ["Reservation", "1"],
      ["Purchase", "0"],
    ]);
    const shown = await rendered(page);
    expectNoPerson(shown, "Sales Flow");
    expectNoSecretShape(shown, "Sales Flow");
    await axeClean(page, "Sales Flow");
    record("ladder", figures.map(([l, f]) => `${l} ${f}`).join(", "));

    const operator = await page.context().browser()?.newContext();
    if (operator === undefined) throw new Error("no browser");
    const ops = await operator.newPage();
    watch(ops);
    await signIn(ops, "MADSPACE Operations");
    await ops.goto(integrations);
    const state = await setEnabled(ops, false);
    expect(state).toBe("Disabled");
    await operator.close();
    /* The deal source is remembered for thirty seconds; the sentence appears after that. */
    await page.waitForTimeout(31_000);
    await page.goto(`${ROUTE}/flow`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("The CRM is not connected.").first()).toBeVisible({
      timeout: 90_000,
    });
    expect(await page.locator(".ox-stage").count()).toBe(0);
    record("connector disabled", "The CRM is not connected. No rung drawn.");
  });

  test("met no browser error along the way", () => {
    /*
     * Playwright's own fill() marks inputs with `caret-color: transparent`
     * before React hydrates, and React reports the attribute it did not
     * render as a hydration mismatch. That is the harness's mark, not the
     * product's, and it is the only console error excused here.
     */
    const real = consoleErrors.filter((e) => !(e.includes("hydrat") && e.includes("caret-color")));
    expect(real, real.join("\n---\n")).toEqual([]);
    record("console", `${String(consoleErrors.length - real.length)} harness-caused hydration notes excused; no error`);
  });
});
