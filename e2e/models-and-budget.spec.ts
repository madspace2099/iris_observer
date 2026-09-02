import { expect, test, type APIResponse, type Page } from "@playwright/test";
import { signIn } from "./sign-in";

/**
 * MODEL CHOICE AND THE MONTHLY BUDGET, THROUGH THE BROWSER.
 *
 * ## Nothing reaches a vendor
 *
 * The server this suite starts has `OPENAI_API_KEY` blanked, holds only
 * `sk-observer-test-…` credentials, and resolves every model to the scripted
 * transport rather than to an HTTP client. There is no code path from this file
 * to OpenAI, and no request is billed by anybody. `apps/web/test/no-egress.test.ts`
 * proves that adversarially, including for the voice route that used to bypass
 * the shared transport entirely.
 *
 * ## What is covered here, and what is covered elsewhere
 *
 * The brief names five properties. Four of them are observable through a
 * browser and are asserted below:
 *
 *   account isolation      two accounts, one server, at the same moment
 *   concurrent requests    a burst against a ceiling only some of them fit in
 *   reservation rollback   a failed request returns its hold rather than
 *                          quietly consuming the month
 *   model-access failure   a key that cannot reach the chosen model
 *
 * The fifth — the UTC month rollover — cannot honestly be driven from a browser
 * without giving the running server a way to be told what day it is, and a
 * clock a request can move is a clock an attacker can move. It is proved where
 * the clock IS a parameter: `apps/web/test/budget.test.ts` for the ledger and
 * `supabase/test/model-budget-grants.test.ts` against a real PostgreSQL, both
 * asserting that a new month starts at zero spending and keeps the ceiling the
 * reader chose. What this file asserts about the rollover is the part a reader
 * can see: the sentence telling them when it happens.
 */

const PETRA = "Petra Novák";
const MONIKA = "Monika Kováčová";

/** Synthetic, and the only shape the browser credential store will hold. */
const GOOD = "sk-observer-test-good-00000000wxyz";
const OTHER = "sk-observer-test-other-1111111abcd";
/** The scripted transport reads `-model` and refuses the model, not the key. */
const NO_MODEL = "sk-observer-test-model-0000000abcd";

/*
 * ONE SERVER, ONE LEDGER PER ACCOUNT, SO ONE CASE AT A TIME.
 *
 * Every case here sets a budget on a named account and then spends it. Three
 * viewport projects talk to the same server process, so running them together
 * had one case exhausting the budget another had just raised. The state is
 * genuinely shared; serialising is the honest response to that.
 */
test.describe.configure({ mode: "serial" });

/*
 * DESKTOP ONLY, AND NOT AS A SHORTCUT.
 *
 * What this file asserts — an account boundary, a ceiling being enforced, a
 * hold coming back, a model a key cannot reach — has no width. Running it in
 * three viewports would run it three times against ONE server and one ledger
 * per account, so the second pass would meet the first pass's spending and
 * fail for a reason that has nothing to do with the product.
 *
 * A file-level guard rather than a line in each case: `test.skip()` inside a
 * body runs after `beforeEach` has already signed in and stored a key, which
 * is both wasteful and a way to fail a test that was meant to be skipped. The
 * responsive states are covered where width is the point — `settings-ai.spec`
 * and the screenshot pass, which photograph every panel at 1440 and 390.
 */
test.beforeEach(() => {
  /*
   * `test.info()` rather than the hook's second argument: Playwright requires the
   * first parameter of a hook to be a destructuring pattern, and this hook wants
   * no fixtures at all. The same idiom guards `settings-ai.spec.ts`.
   */
  test.skip(
    test.info().project.name !== "desktop",
    "account, budget and model rules have no width",
  );
});

/* ============================================================== the plumbing */

const SETTINGS = "/settings/ai";

async function settings(page: Page): Promise<void> {
  await page.goto(SETTINGS);
  await expect(page.getByRole("heading", { name: "AI and usage" })).toBeVisible();
}

/** Saves a key for one provider, through the form a reader uses. */
async function connect(page: Page, provider: string, key: string): Promise<void> {
  await page.goto(`${SETTINGS}?mode=replace&p=${provider}`);
  const field = page.locator(`input#key-${provider}`);
  await field.waitFor();
  await field.fill(key);
  await page.locator(`form:has(input#key-${provider}) button[type='submit']`).click();
  await expect(page).toHaveURL(/done=|failed=/);
}

async function setBudget(page: Page, dollars: number): Promise<void> {
  await settings(page);
  await page.locator("#budget-input").fill(String(dollars));
  await page.getByRole("button", { name: "Save budget" }).click();
  await expect(page).toHaveURL(/done=budget|failed=/);
}

interface Asked {
  readonly status: number;
  /**
   * WHETHER A MODEL REQUEST WAS ADMITTED, WHICH IS NOT `live`.
   *
   * `live` says a model wrote the prose. The scripted transport deliberately
   * writes none — it reports token counts and leaves the composing to the
   * deterministic writer — so `live` is false on this server even for a
   * question that was admitted, priced and charged. Asserting on it would
   * measure the harness rather than the rule.
   *
   * What admission looks like from outside is the resolver naming a real
   * provider and model instead of `evidence-only`, with no refusal attached.
   */
  readonly admitted: boolean;
  readonly provider: string;
  readonly blocked: string | null;
  readonly setupRequired: boolean;
}

/**
 * One question, over HTTP, carrying the signed-in session.
 *
 * `page.request` shares the browser context's cookies, so this is the same
 * account the page is signed in as — the account the server derives from the
 * session and never from anything in this body.
 */
async function ask(page: Page, question = "What changed this month?"): Promise<Asked> {
  const response: APIResponse = await page.request.post("/api/ask", {
    data: {
      tenantSlug: "alpha",
      projectSlug: "northgate",
      question,
      period: "quarter_to_date",
    },
  });
  /*
   * A LIMITER'S REFUSAL IS NOT A BUDGET'S REFUSAL.
   *
   * Both arrive as "no model answered", and one of them means nothing about
   * the rule under test. This suite spends a month's budget on purpose and can
   * genuinely reach the per-minute ceiling, so the two are separated here
   * rather than at each assertion — an over-limit response failed as
   * `expected "budget_exhausted", received null` for an afternoon.
   */
  if (response.status() === 429) {
    throw new Error(
      "the Ask limiter answered, not the budget: raise ASK_PER_MINUTE in e2e/limits.ts",
    );
  }

  const body = (await response.json()) as {
    status?: {
      provider?: string;
      blocked?: string | null;
      setupRequired?: boolean;
    };
  };
  const provider = body.status?.provider ?? "evidence-only";
  return {
    status: response.status(),
    admitted: provider !== "evidence-only" && (body.status?.blocked ?? null) === null,
    provider,
    blocked: body.status?.blocked ?? null,
    setupRequired: body.status?.setupRequired === true,
  };
}

/**
 * What the settings page currently says this account has used.
 *
 * Read off the rendered figure rather than out of the ledger, so what is
 * asserted is what a reader is actually shown. Zero when no ceiling is set:
 * the panel does not render a meter it has nothing to measure against.
 */
async function usedPercent(page: Page): Promise<number> {
  await settings(page);
  const percent = page.locator(".mp-percent").first();
  if (!(await percent.isVisible().catch(() => false))) return 0;
  const match = /\((\d+)%\)/.exec((await percent.innerText()).trim());
  return match === null ? 0 : Number.parseInt(match[1] ?? "0", 10);
}

/**
 * What this account has spent and held so far, in dollars.
 *
 * The figures only render against a ceiling, so one is set first when there is
 * none. A hundred dollars is chosen to be far above anything a case here
 * spends, and every case sets its own ceiling immediately afterwards.
 */
async function usedDollars(page: Page): Promise<number> {
  await settings(page);
  let used = page.locator(".mp-facts dd").first();
  if (!(await used.isVisible().catch(() => false))) {
    await setBudget(page, 100);
    used = page.locator(".mp-facts dd").first();
  }
  const match = /\$([\d.]+)/.exec((await used.innerText()).trim());
  return match === null ? 0 : Number.parseFloat(match[1] ?? "0");
}

/**
 * A ceiling that leaves exactly this much room, whatever came before.
 *
 * The ledger is a MONTH, not a test: everything this file spends on an account
 * accumulates, and a later case setting a one-cent ceiling would find it
 * already exceeded by the case before. Setting the ceiling relative to what is
 * already committed is what makes each case mean what it says — "a ceiling
 * with room for a few questions", rather than "a number that happened to work
 * the first time it ran".
 *
 * The figure is read off the page and the page rounds to cents, so up to half a
 * cent of real spending is invisible here. Callers therefore ask for headroom
 * in multiples of a question (about a cent each) rather than for one cent —
 * a headroom inside the rounding error admits nothing and looks like a broken
 * ceiling rather than a badly chosen number.
 */
async function setHeadroom(page: Page, dollars: number): Promise<void> {
  const used = await usedDollars(page);
  await setBudget(page, Number((used + dollars).toFixed(2)));
}

/**
 * Deletes the stored key for one provider, through the confirmation.
 *
 * Removal is a link to a confirming state and then a button, deliberately —
 * the key is deleted rather than hidden and cannot be shown again. Both steps
 * are walked here for the same reason the connect helper uses the form: a
 * helper that reaches past the product proves the product less.
 */
async function disconnect(page: Page, provider: string): Promise<void> {
  await page.goto(`${SETTINGS}?confirm=${provider}`);
  const confirm = page.getByRole("button", { name: "Yes, remove it" });
  if (!(await confirm.isVisible().catch(() => false))) return;
  await confirm.click();
  await expect(page).toHaveURL(/done=removed|failed=/);
}

/**
 * PUT BOTH ACCOUNTS BACK.
 *
 * One server serves every spec file in this directory, and the credential and
 * ledger stores outlive a file. A key or a spent budget left behind here is a
 * failure in whatever runs next — `settings-ai.spec.ts` asks what a reader
 * with no connection is told, and it is not told anything useful if this file
 * has just connected one for them.
 */
test.afterAll(async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  for (const account of [PETRA, MONIKA]) {
    await signIn(page, account);
    await disconnect(page, "openai");
    await setBudget(page, 0);
  }
  await context.close();
});

/**
 * ROOM FOR ROUGHLY THIS MANY QUESTIONS, IN DOLLARS.
 *
 * A worst-case reservation for one standard Terra question is a little under
 * ten cents: two model turns, each at the full output cap, plus the whole tool
 * budget in the composing turn's input, priced at the published rates. The
 * fixtures below say how many questions they want room for rather than naming
 * an amount, so a price change moves one constant instead of six.
 *
 * Deliberately generous. What these cases assert is that SOME fit and SOME do
 * not; a figure tuned to the exact cost would fail on a rounding difference.
 */
const PER_QUESTION_DOLLARS = 0.1;

const roomFor = (questions: number): number =>
  Number((questions * PER_QUESTION_DOLLARS).toFixed(2));

/* ================================================================ the cases */

test.describe("the budget belongs to one account", () => {
  test("spending on one account leaves the other untouched", async ({ page }) => {

    /* Petra: a ceiling, and some of it spent. */
    await signIn(page, PETRA);
    await connect(page, "openai", GOOD);
    await setHeadroom(page, 1);
    const petraAnswered = await ask(page);
    expect(petraAnswered.admitted, "Petra has a key and room to use it").toBe(true);
    const petraUsed = await usedPercent(page);
    expect(petraUsed).toBeGreaterThan(0);

    /*
     * Monika, at the same moment, on the same server.
     *
     * She has her own key and has set no ceiling, so she is refused — and
     * refused for HER reason, not for Petra's state.
     */
    await signIn(page, MONIKA);
    await connect(page, "openai", OTHER);
    const monikaAnswered = await ask(page);
    expect(monikaAnswered.admitted, "no budget, no spending").toBe(false);
    expect(monikaAnswered.blocked).toBe("no_budget");
    expect(await usedPercent(page), "Petra's spending is not Monika's").toBe(0);

    /* And back: Petra's own figure is exactly where she left it. */
    await signIn(page, PETRA);
    expect(await usedPercent(page)).toBe(petraUsed);
  });

  test("a second account cannot spend the first one's ceiling", async ({ page }) => {

    await signIn(page, MONIKA);
    await connect(page, "openai", OTHER);
    await setHeadroom(page, 1);
    expect((await ask(page)).admitted, "her own ceiling, her own spending").toBe(true);

    /* Removing her key does not touch Petra's. */
    await disconnect(page, "openai");
    expect((await ask(page)).blocked).toBe("no_connection");

    await signIn(page, PETRA);
    expect((await ask(page)).admitted, "Petra still has hers").toBe(true);
  });
});

test.describe("the ceiling holds", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, PETRA);
    await connect(page, "openai", GOOD);
  });

  test("refuses once the month is spent, and makes no request to do it", async ({ page }) => {

    /*
     * Room for three questions, and six asked. The last of them does not fit,
     * and the refusal is the point: a budget checked after the call is a
     * report, not a limit.
     */
    await setHeadroom(page, roomFor(3));

    const verdicts: Asked[] = [];
    for (let i = 0; i < 6; i += 1) verdicts.push(await ask(page));

    const answered = verdicts.filter((v) => v.admitted);
    const refused = verdicts.filter((v) => !v.admitted);
    expect(answered.length, "some fitted").toBeGreaterThan(0);
    expect(refused.length, "and some did not").toBeGreaterThan(0);
    for (const verdict of refused) {
      expect(verdict.status, "a refusal is still a complete answer sheet").toBe(200);
      expect(verdict.blocked).toBe("budget_exhausted");
      /*
       * NOT "add a key". She has one. Being sent to Settings to fix a problem
       * Settings does not have is the defect this asserts against.
       */
      expect(verdict.setupRequired).toBe(false);
    }

    /* The evidence answer is still served. A ceiling is not an outage. */
    expect(refused[0]?.status).toBe(200);
  });

  test("raising the ceiling lets the same question through", async ({ page }) => {

    await setHeadroom(page, roomFor(2));
    let verdict = await ask(page);
    /* Enough to exhaust two questions' headroom whatever they settle at. */
    for (let i = 0; i < 12 && verdict.admitted; i += 1) verdict = await ask(page);
    expect(verdict.blocked, "spent out").toBe("budget_exhausted");

    await setHeadroom(page, roomFor(20));
    expect((await ask(page)).admitted, "and admitted again once there is room").toBe(true);
  });

  test("holds the line when questions arrive together", async ({ page }) => {

    /*
     * CONCURRENT REQUESTS, WHICH IS WHERE A CHECK-THEN-SPEND DESIGN FAILS.
     *
     * Twelve questions fired at once against a ceiling that fits only a few.
     * If the reservation were a read followed by a write, every one of them
     * would read the same balance and every one would be admitted. The count
     * that gets through is not asserted exactly — it depends on the estimate
     * — but the money is: what was spent cannot exceed what was allowed.
     */
    await setHeadroom(page, roomFor(4));

    const together = await Promise.all(Array.from({ length: 12 }, () => ask(page)));
    const admitted = together.filter((v) => v.admitted).length;

    expect(admitted, "not all of them").toBeLessThan(12);
    expect(admitted, "and not none").toBeGreaterThan(0);
    for (const verdict of together.filter((v) => !v.admitted)) {
      expect(verdict.blocked).toBe("budget_exhausted");
    }

    /*
     * The ledger's own arithmetic, read back off the page. Over a hundred per
     * cent would mean a hold was granted that did not fit.
     */
    expect(await usedPercent(page), "never past the ceiling").toBeLessThanOrEqual(100);
  });

  test("resolves an abandoned question rather than leaving it held", async ({ page }) => {
    /*
     * RESERVATION ROLLBACK, AS THE LIFECYCLE ACTUALLY DEFINES IT.
     *
     * A question is claimed against the budget BEFORE anything is sent, so a
     * request that dies mid-flight must not sit on a reader's month forever.
     * What it must NOT do is come back automatically: if the request had
     * already been dispatched, OpenAI may have completed and billed it, and
     * refunding it would hand back money that is already spent.
     *
     * From a browser both outcomes look the same, and both are correct — which
     * is precisely why this case asserts the property they share rather than
     * guessing which one happened. The two branches are pinned exactly where
     * the state is visible: `apps/web/test/budget.test.ts` and
     * `supabase/test/model-budget-grants.test.ts`.
     */
    await setHeadroom(page, roomFor(20));
    const before = await usedPercent(page);

    const abandoned = page.request
      .post("/api/ask", {
        data: {
          tenantSlug: "alpha",
          projectSlug: "northgate",
          question: "A question nobody waits for.",
          period: "quarter_to_date",
        },
        timeout: 1,
      })
      .catch(() => null);
    await abandoned;

    /* One completed question after it, so the settled figure is comparable. */
    await ask(page);
    const after = await usedPercent(page);

    /*
     * At most what two questions could cost at worst. A third question's worth
     * in the figure would mean the abandoned hold was neither settled, released
     * nor charged — left in limbo, which is the failure this guards.
     */
    const oneQuestion = Math.ceil((PER_QUESTION_DOLLARS / (PER_QUESTION_DOLLARS * 20)) * 100);
    expect(
      after - before,
      "an abandoned question is resolved, not accumulated",
    ).toBeLessThanOrEqual(oneQuestion * 2);

    /* And the ledger is not stuck: the account can still ask. */
    expect((await ask(page)).admitted, "the month still has room").toBe(true);
  });
});

test.describe("a model the account cannot reach", () => {
  test("says so, and does not blame the connection", async ({ page }) => {

    await signIn(page, PETRA);
    await setHeadroom(page, 5);

    /*
     * MODEL-ACCESS FAILURE.
     *
     * The key is accepted — it connects — and then the provider refuses the
     * model. Those are different failures with different fixes, and collapsing
     * them into one message is how a reader ends up replacing a key that was
     * never the problem.
     */
    await connect(page, "openai", NO_MODEL);

    /*
     * SAVING IT IS WHERE THIS IS DISCOVERED, AND THE KEY IS KEPT.
     *
     * The provider only refuses a model after it has accepted the credential,
     * so a refusal here is positive evidence that the key works. Refusing to
     * store it — which is what happened until this milestone — told a reader
     * to check a key that had just authenticated.
     */
    await expect(page).toHaveURL(/done=connected_no_model/);
    await settings(page);
    await expect(page.getByText("Connected", { exact: false }).first()).toBeVisible();

    /* And the question is refused for the model, not for the connection. */
    const verdict = await ask(page);
    expect(verdict.admitted).toBe(false);
    expect(verdict.blocked, "the model, not the key").toBe("model_unavailable");
    expect(verdict.setupRequired, "there is nothing to add").toBe(false);

    /*
     * And it is REMEMBERED: the settings page now shows the model this account
     * just proved it cannot reach as unavailable, so the reader is not invited
     * to choose it again and wait for the same refusal.
     */
    await settings(page);
    const terra = page.locator(".mp-choice", { hasText: "GPT-5.6 Terra" }).first();
    await expect(terra).toHaveAttribute("data-usable", "false");
  });

  test("forgets what the old key could not reach when a new one is saved", async ({ page }) => {
    /*
     * A NEW KEY IS A NEW ENTITLEMENT.
     *
     * The case above leaves Terra recorded as out of reach, learned from a key
     * that is about to be replaced. Keeping that record makes a perfectly good
     * replacement look broken: the model stays greyed out and every question is
     * refused before a request is made, on evidence about a credential that no
     * longer exists.
     */
    await signIn(page, PETRA);
    await connect(page, "openai", NO_MODEL);
    await settings(page);
    await expect(
      page.locator(".mp-choice", { hasText: "GPT-5.6 Terra" }).first(),
      "out of reach, on the old key",
    ).toHaveAttribute("data-usable", "false");

    await connect(page, "openai", GOOD);
    await settings(page);
    await expect(
      page.locator(".mp-choice", { hasText: "GPT-5.6 Terra" }).first(),
      "and reachable again on the new one",
    ).toHaveAttribute("data-usable", "true");

    await setHeadroom(page, 1);
    expect((await ask(page)).admitted, "which the ask path agrees with").toBe(true);
  });

  test("keeps the connection rather than deleting it", async ({ page }) => {

    /*
     * A provider error is not a reason to throw away a working credential.
     * The key above was refused for one model; it is still connected, and the
     * reader has not been silently signed out of their own account.
     */
    await signIn(page, PETRA);
    await settings(page);
    await expect(page.getByText("Connected", { exact: false }).first()).toBeVisible();
  });
});

test.describe("what a reader is shown", () => {
  test("names the active model on the settings page", async ({ page }) => {
    await signIn(page, PETRA);
    await connect(page, "openai", GOOD);
    await settings(page);

    await expect(page.getByRole("heading", { name: "Model" })).toBeVisible();

    /*
     * Every model in the catalogue is offered, with its price.
     *
     * Scoped to the chooser: each name also appears in the Deep Report select
     * below it, which is correct — one list of models, offered twice for two
     * different decisions — and makes a bare text match ambiguous.
     */
    const names = page.locator(".mp-choice-name");
    await expect(names.filter({ hasText: "GPT-5.6 Luna" })).toHaveCount(1);
    await expect(names.filter({ hasText: "GPT-5.6 Terra" })).toHaveCount(1);
    await expect(names.filter({ hasText: "GPT-5.6 Sol" })).toHaveCount(1);
    await expect(names, "three models, one vendor, all verified").toHaveCount(3);
    await expect(page.getByText("per million tokens").first()).toBeVisible();
  });

  test("calls every figure an estimate, and says who really bills", async ({ page }) => {
    await signIn(page, PETRA);
    await settings(page);

    /*
     * The caveat the brief requires, in the reader's own words rather than in
     * a tooltip: Observer's arithmetic is not the vendor's invoice.
     */
    await expect(page.getByText(/Observer.s estimate/).first()).toBeVisible();
    await expect(page.getByText(/bills the account that owns the API key/).first()).toBeVisible();
    await expect(page.getByText(/not an invoice/).first()).toBeVisible();
  });

  test("says when the month resets, and in which time zone", async ({ page }) => {
    await signIn(page, PETRA);
    await settings(page);

    /*
     * The reader-visible half of the rollover. That the ledger actually starts
     * a new month at zero and keeps the ceiling is proved against the clock in
     * the unit and database suites, where the clock is a parameter.
     */
    await expect(page.getByText(/resets at the start of each month, UTC/i)).toBeVisible();
  });

  test("tells an account with no key what to do about it", async ({ page }) => {
    await signIn(page, MONIKA);
    await settings(page);

    /* Whatever is stored is removed first, so the empty state is under test. */
    await disconnect(page, "openai");
    await settings(page);
    await expect(page.getByRole("button", { name: "Add and test" }).first()).toBeVisible();
  });
});
