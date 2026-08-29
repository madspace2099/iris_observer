import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./sign-in";

/**
 * THE OPENAI CONNECTION, THROUGH THE BROWSER.
 *
 * ## No real credential, ever
 *
 * Every key below matches `sk-observer-test-…`, which is the only shape the
 * browser store will hold — a real one is refused before it is sealed. The
 * server this suite starts has `OPENAI_API_KEY` blanked and runs the scripted
 * probe, which makes no network call whatever it is handed. Nothing here can
 * reach OpenAI even by accident.
 *
 * ## What the scripted probe answers
 *
 * The verdict is read out of the fake key's own text, so every error state is
 * reachable offline:
 *
 *   -reject   the credential is refused        -limit   rate limited
 *   -quota    no credit                        -model   model not entitled
 *   -spend    a spending cap reached           -down    provider unreachable
 */

const GOOD = "sk-observer-test-good-00000000wxyz";
const OTHER = "sk-observer-test-other-1111111abcd";
const BAD = "sk-observer-test-reject-0000000000";
const TRANSIENT = "sk-observer-test-limit-00000000000";
/**
 * What a real credential looks like, ASSEMBLED AT RUNTIME.
 *
 * Written as parts rather than as a literal so no string in this repository
 * matches an OpenAI key pattern. `scripts/secret-audit.mjs` flagged the literal
 * form — correctly: a fixture shaped like a real secret is the thing a scanner
 * exists to find, and "it is only a test" is what everybody says about the one
 * that turns out to be real.
 *
 * Used only to prove that such a value is refused.
 */
const REAL_LOOKING = ["sk", "proj", "A".repeat(40)].join("-");

const PETRA = "Petra Novák";
const MONIKA = "Monika Kováčová";

/*
 * ONE SERVER, ONE CREDENTIAL PER ACCOUNT, SO ONE TEST AT A TIME.
 *
 * These cases connect, replace and remove a credential belonging to a named
 * account, and every viewport project talks to the SAME server process — so
 * running them in parallel had one test removing the key another had just
 * saved. The state under test is genuinely shared, and pretending otherwise
 * produced eighteen failures that looked like product faults and were not.
 *
 * Serial within the file, and one viewport for the state-mutating half: what
 * those cases assert is the account boundary, which has no width. The
 * responsive and accessibility checks below run on all three, where the width
 * is the point.
 */
test.describe.configure({ mode: "serial" });

const STATEFUL = "the account boundary is the same at every width; the state is not";

async function settings(page: Page): Promise<void> {
  await page.goto("/settings/ai");
  await page.waitForLoadState("networkidle");
}

async function disconnect(page: Page): Promise<void> {
  await page.goto("/settings/ai?confirm=remove");
  await page.waitForLoadState("networkidle");
  const button = page.getByRole("button", { name: "Yes, remove it" });
  if ((await button.count()) > 0) {
    await button.click();
    await page.getByRole("heading", { name: "Add your OpenAI API key" }).waitFor();
  }
}

/**
 * Submits a key and waits for the OUTCOME, not for the network to go quiet.
 *
 * The action redirects, which is a client navigation, and `networkidle` can
 * settle mid-transition — the same race that made three sign-in cases read a
 * URL that was about to be correct. Both terminal states have a marker: the
 * connected panel, or the alert saying why not.
 */
async function submitKey(page: Page, key: string): Promise<void> {
  await page.locator("input[name='apiKey']").fill(key);
  await page.getByRole("button", { name: "Add and test" }).click();
  await Promise.race([
    page.getByRole("heading", { name: "Connected" }).waitFor({ state: "visible" }),
    page.locator(".mp-alert").waitFor({ state: "visible" }),
  ]);
  await page.waitForLoadState("networkidle");
}

async function connect(page: Page, key: string): Promise<void> {
  await settings(page);
  await submitKey(page, key);
}

async function body(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText);
}

test.beforeEach(async ({ page }) => {
  await signIn(page, PETRA);
  await disconnect(page);
});

/* ============================================================ authentication */

test.describe("the account comes from the session, never from the request", () => {
  test.skip(() => test.info().project.name !== "wide", STATEFUL);

  test("an anonymous reader is sent to sign in", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/settings/ai");
    expect(new URL(page.url()).pathname).toBe("/sign-in");
  });

  test("a forged cookie reaches nothing", async ({ page, context }) => {
    await context.clearCookies();
    await context.addCookies([
      { name: "observer_session", value: "acct_petra", url: "http://localhost:3210" },
    ]);
    await page.goto("/settings/ai");
    expect(new URL(page.url()).pathname).toBe("/sign-in");
  });

  test("a tampered cookie reaches nothing", async ({ page, context }) => {
    /* A real session, one character changed. */
    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name === "observer_session");
    expect(session, "signed in first").toBeDefined();
    if (session === undefined) return;

    const parts = session.value.split(".");
    const flipped = [
      parts[0],
      parts[1],
      parts[2],
      (parts[3] ?? "").split("").reverse().join(""),
    ].join(".");

    await context.clearCookies();
    await context.addCookies([
      { name: "observer_session", value: flipped, url: "http://localhost:3210" },
    ]);
    await page.goto("/settings/ai");
    expect(new URL(page.url()).pathname).toBe("/sign-in");
  });

  test("an expired cookie reaches nothing", async ({ page, context }) => {
    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name === "observer_session");
    if (session === undefined) throw new Error("signed in first");

    const parts = session.value.split(".");
    const past = [parts[0], String(Date.now() - 60_000), parts[2], parts[3]].join(".");

    await context.clearCookies();
    await context.addCookies([
      { name: "observer_session", value: past, url: "http://localhost:3210" },
    ]);
    await page.goto("/settings/ai");
    expect(new URL(page.url()).pathname).toBe("/sign-in");
  });

  test("a subject swapped for another account fails the signature", async ({ page, context }) => {
    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name === "observer_session");
    if (session === undefined) throw new Error("signed in first");

    const swapped = session.value.replace(/^[^.]+/, "acct_madspace");
    expect(swapped).not.toBe(session.value);

    await context.clearCookies();
    await context.addCookies([
      { name: "observer_session", value: swapped, url: "http://localhost:3210" },
    ]);
    await page.goto("/settings/ai");
    expect(new URL(page.url()).pathname).toBe("/sign-in");
  });

  test("signing out locks it again", async ({ page }) => {
    await settings(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("AI and usage");

    await page.goto("/projects");
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL(/sign-in/);

    await page.goto("/settings/ai");
    expect(new URL(page.url()).pathname).toBe("/sign-in");
  });

  test("an account named in the request changes nothing", async ({ page }) => {
    /*
     * The account is never read from what the browser sends. Naming another one
     * in the query — the closest a caller can get to choosing a subject — does
     * not move the credential: the action asks the session, and the session
     * says Petra.
     *
     * A hidden form field was tried first and is a worse test than it looks:
     * Next encodes a server action's payload, so an appended input makes the
     * whole submission fail, and a test that passes because the request broke
     * proves nothing about who the action would have acted on.
     */
    await page.goto("/settings/ai?accountId=acct_madspace&account=acct_madspace");
    await page.waitForLoadState("networkidle");

    await submitKey(page, GOOD);

    /* Petra is connected; the account the request named is not. */
    expect(await body(page)).toContain("Connected");

    await signIn(page, "MADSPACE Operations");
    await settings(page);
    expect(await body(page)).not.toContain("Connected");
  });
});

/* =========================================================== discoverability */

test.describe("settings can be reached and left", () => {
  test("is offered from the light Projects surface", async ({ page }) => {
    await page.goto("/projects");
    const entry = page.getByRole("link", { name: "Settings" });
    await expect(entry).toHaveCount(1);
    await entry.click();
    await page.waitForURL(/settings\/ai/);
  });

  test("is offered from the dark Observer surface", async ({ page }) => {
    await page.goto("/alpha/northgate/showroom");
    const entry = page.getByRole("link", { name: "Settings" });
    await expect(entry).toHaveCount(1);
    await entry.click();
    await page.waitForURL(/settings\/ai/);
  });

  test("leads back to both without the browser Back button", async ({ page }) => {
    await settings(page);

    await page.getByRole("link", { name: "Projects" }).click();
    await page.waitForURL(/\/projects/);

    await settings(page);
    await page.getByRole("link", { name: "Observer" }).click();
    await page.waitForURL(/showroom/);
  });
});

/* ================================================================ the states */

test.describe("connecting, testing, replacing and removing", () => {
  test.skip(() => test.info().project.name !== "wide", STATEFUL);

  test("starts with no connection and a form", async ({ page }) => {
    await settings(page);
    expect(await body(page)).toContain("Add your OpenAI API key");
    await expect(page.locator("input[name='apiKey']")).toBeEnabled();
  });

  test("says what OpenAI charges, and does not promise Observer is free", async ({ page }) => {
    await settings(page);
    const text = await body(page);
    expect(text).toContain("This test may create a small OpenAI API charge");
    expect(text).toContain(
      "OpenAI API usage is billed separately by OpenAI to the project that owns this key",
    );
    expect(text).toContain("Your IRIS Observer subscription is separate");
    expect(text).not.toContain("Observer adds nothing of its own");
    expect(text).not.toContain("fraction of a penny");
  });

  test("connects, and shows only a masked identifier", async ({ page }) => {
    await connect(page, GOOD);
    const text = await body(page);
    expect(text).toContain("Connected");
    expect(text).toContain("wxyz");
    expect(text).not.toContain(GOOD);
    await expect(page.getByRole("button", { name: "Reveal" })).toHaveCount(0);
  });

  test("refuses a real-looking key outright", async ({ page }) => {
    await connect(page, REAL_LOOKING);
    expect(await body(page)).toContain("That key was not accepted");
    expect(await body(page)).not.toContain("Connected");
  });

  test("shows a rejected key as rejected, and stores nothing", async ({ page }) => {
    await connect(page, BAD);
    const text = await body(page);
    expect(text).toContain("That key was not accepted");
    expect(text).toContain("Add your OpenAI API key");
  });

  test("keeps a working key through a temporary failure", async ({ page }) => {
    /*
     * The case the brief names: a transient failure must not delete a good
     * credential or call it invalid. Connect a good key, then test with one
     * that rate limits — the connection survives and says so.
     */
    await connect(page, GOOD);
    await page.getByRole("link", { name: "Replace key" }).click();
    await page.getByRole("heading", { name: "Replace your OpenAI API key" }).waitFor();
    await submitKey(page, TRANSIENT);

    const text = await body(page);
    expect(text).toContain("rate limiting");
    expect(text).toContain("Your connection is kept");
    /* And the original is still there, unchanged. */
    expect(text).toContain("Connected");
    expect(text).toContain("wxyz");
  });

  test("asks before removing, and then removes", async ({ page }) => {
    await connect(page, GOOD);
    /* Each step is a navigation; wait for the panel it renders, not the network. */
    await page.getByRole("link", { name: "Remove connection" }).click();
    await page.getByRole("button", { name: "Yes, remove it" }).waitFor();
    expect(await body(page)).toContain("Remove this connection?");

    await page.getByRole("button", { name: "Yes, remove it" }).click();
    await page.getByRole("heading", { name: "Add your OpenAI API key" }).waitFor();
    expect(await body(page)).toContain("Add your OpenAI API key");
  });
});

/* ==================================================== one account, one credential */

test.describe("no account can reach another's connection", () => {
  test.skip(() => test.info().project.name !== "wide", STATEFUL);

  test("shows one account's connection to nobody else", async ({ page }) => {
    await connect(page, GOOD);
    expect(await body(page)).toContain("wxyz");

    await signIn(page, MONIKA);
    await settings(page);
    const text = await body(page);
    expect(text).toContain("Add your OpenAI API key");
    expect(text).not.toContain("wxyz");
  });

  test("does not let one account's Ask use another's key", async ({ page }) => {
    await connect(page, GOOD);

    const hers = await page.request.post("/api/ask", {
      data: {
        tenantSlug: "alpha",
        projectSlug: "northgate",
        question: "What changed this month?",
        period: "quarter_to_date",
      },
    });
    const connected = await hers.json();
    expect(connected.status.setupRequired, "Petra has a connection").toBe(false);

    await signIn(page, MONIKA);
    const his = await page.request.post("/api/ask", {
      data: {
        tenantSlug: "alpha",
        projectSlug: "northgate",
        question: "What changed this month?",
        period: "quarter_to_date",
      },
    });
    const other = await his.json();
    expect(other.status.setupRequired, "Monika has none, and does not borrow one").toBe(true);
    expect(JSON.stringify(other)).not.toContain("sk-");
  });

  test("removing one account's key leaves the other's alone", async ({ page }) => {
    await connect(page, GOOD);
    await signIn(page, MONIKA);
    await connect(page, OTHER);

    await signIn(page, PETRA);
    await disconnect(page);
    expect(await body(page)).toContain("Add your OpenAI API key");

    await signIn(page, MONIKA);
    await settings(page);
    expect(await body(page)).toContain("abcd");
  });
});

/* ========================================================== leakage surfaces */

test.describe("nothing a browser can reach carries a credential", () => {
  test.skip(() => test.info().project.name !== "wide", STATEFUL);

  test("the page's HTML holds no key, ciphertext, nonce or tag", async ({ page }) => {
    await connect(page, GOOD);
    const html = await page.content();
    /*
     * The key, its prefix, and the two field names that exist only in
     * credential storage.
     *
     * "nonce" on its own is not one of them: Next writes `"nonce":"$undefined"`
     * beside every stylesheet link in its own payload, so asserting the bare
     * word fails on the framework rather than on a leak. The sealed nonce's
     * VALUE never leaves the service, and `apps/web/test/credentials.test.ts`
     * asserts that against the actual stored bytes.
     */
    for (const forbidden of [
      GOOD,
      "sk-observer-test-good",
      "ciphertext",
      "auth_tag",
      "OBSERVER_CREDENTIAL_KEY",
    ]) {
      expect(html, forbidden).not.toContain(forbidden);
    }
  });

  test("browser storage stays empty", async ({ page }) => {
    await connect(page, GOOD);
    const stored = await page.evaluate(() => ({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }));
    expect(stored.local).toEqual({});
    expect(stored.session).toEqual({});
  });

  test("no cookie carries anything but the session token", async ({ page, context }) => {
    await connect(page, GOOD);
    for (const cookie of await context.cookies()) {
      expect(cookie.value, cookie.name).not.toContain("sk-");
      expect(cookie.name).not.toMatch(/openai|api.?key|credential/i);
    }
  });

  test("the URL never carries the key, even after a failure", async ({ page }) => {
    await connect(page, BAD);
    expect(page.url()).not.toContain("sk-");
    await connect(page, GOOD);
    expect(page.url()).not.toContain("sk-");
  });

  test("no client bundle contains the credential vocabulary", async ({ page }) => {
    const scripts: string[] = [];
    page.on("response", (response) => {
      const url = response.url();
      if (url.endsWith(".js") || url.includes("/_next/static/")) scripts.push(url);
    });

    await connect(page, GOOD);

    let checked = 0;
    for (const url of scripts.slice(0, 40)) {
      const response = await page.request.get(url);
      if (!response.ok()) continue;
      const bundle = await response.text();
      checked += 1;
      for (const forbidden of ["OBSERVER_CREDENTIAL_KEY", "resolveApiKey", "aes-256-gcm", GOOD]) {
        expect(bundle.includes(forbidden), `${forbidden} in ${url}`).toBe(false);
      }
    }
    expect(checked, "at least one script was inspected").toBeGreaterThan(0);
  });
});

/* =========================================================== Ask, either way */

test.describe("Ask Observer with and without a connection", () => {
  test("answers from evidence and offers the way to fix it", async ({ page }) => {
    const response = await page.request.post("/api/ask", {
      data: {
        tenantSlug: "alpha",
        projectSlug: "northgate",
        question: "What changed this month?",
        period: "quarter_to_date",
      },
    });
    expect(response.status()).toBe(200);

    const answered: { status: { setupRequired: boolean }; answer: unknown } =
      await response.json();
    expect(answered.status.setupRequired).toBe(true);
    expect(answered.answer, "the figures are still computed").not.toBeNull();
    expect(JSON.stringify(answered)).not.toContain("sk-");
  });

  test("still refuses a project the account does not hold", async ({ page }) => {
    await signIn(page, MONIKA);
    const refused = await page.request.post("/api/ask", {
      data: {
        tenantSlug: "beta",
        projectSlug: "kingsford",
        question: "What changed this month?",
        period: "quarter_to_date",
      },
    });
    expect(refused.status()).not.toBe(200);
    expect(await refused.text()).not.toContain("Kingsford Yard");
  });
});
