import { chromium, type FullConfig } from "@playwright/test";
import { PASSWORD, addressOf } from "./sign-in";
import { credentialStoreMissing, gateRefusal } from "./secrets";

/**
 * THE REUSED SERVER IS ASKED WHAT IT CARRIES, AND THE RUN IS REFUSED IF IT IS
 * THE WRONG ONE.
 *
 * `OBSERVER_REUSE=1` tells the config to use a server that is already
 * listening instead of building and starting its own. The server the config
 * starts carries a harness environment — `OBSERVER_SUBJECT_PEPPER`,
 * `OBSERVER_SYNTHETIC_HARNESS`, `OBSERVER_DEMO_ACCOUNTS`, the credential test
 * store, the ask limits — and a server started by hand carries none of it.
 * Against such a server the Ask gate refuses every question with 503, the
 * settings forms are disabled, and thirteen tests go red for reasons that
 * have nothing to do with the product.
 *
 * Until 2026-09-23, three whole runs of this suite — wide, mobile and desktop
 * — measured exactly that server, and three reports called the result a
 * credential class. A rule that says "start the server the config's way"
 * relies on somebody remembering it; this file does not. When a server is to
 * be reused, it is asked, through the browser and as a demonstration account
 * — the same two readers the tests use, `gateRefusal` and
 * `credentialStoreMissing`, never `process.env`, which is the runner's
 * environment and not the server's — and the run is refused with the missing
 * thing named. Without `OBSERVER_REUSE` this does nothing: the config's own
 * servers carry the environment by construction.
 *
 * The servers are the projects' `baseURL`s, because `FullConfig.webServer`
 * is not the config's array once the runner has turned it into plugins.
 * Playwright starts (or reuses) every server before this runs.
 */
export default async function reuseGuard(config: FullConfig): Promise<void> {
  if (process.env["OBSERVER_REUSE"] !== "1") return;

  const origins = [
    ...new Set(
      config.projects
        .map((project) => project.use.baseURL)
        .filter((url): url is string => typeof url === "string"),
    ),
  ];

  const browser = await chromium.launch();
  try {
    for (const origin of origins) {
      const listening = await fetch(`${origin}/sign-in`).then(
        (r) => r.ok,
        () => false,
      );
      /* Not listening: nothing was reused there, and Playwright started its own. */
      if (!listening) continue;
      console.log(`[reuse-guard] asking the reused server at ${origin} what it carries`);

      const page = await browser.newPage();
      await page.goto(`${origin}/sign-in`);
      await page.getByLabel("Work email address").fill(addressOf("Petra Novák"));
      await page.getByLabel("Password").fill(PASSWORD);
      await page.getByRole("button", { name: "Sign in with password" }).click();
      const signedIn = await page
        .waitForURL((u) => !/\/sign-in/.test(u.pathname), { timeout: 15_000 })
        .then(
          () => true,
          () => false,
        );
      if (!signedIn) {
        throw new Error(
          refusal(
            origin,
            "the demonstration directory is not on: OBSERVER_DEMO_ACCOUNTS is not set, so no account can sign in",
          ),
        );
      }

      const ask = await page.request.post(`${origin}/api/ask`, {
        data: {
          tenantSlug: "alpha",
          projectSlug: "northgate",
          question: "What changed this month?",
          period: "quarter_to_date",
        },
      });
      const refused = await gateRefusal(ask);
      if (refused !== null) throw new Error(refusal(origin, refused));

      const missing = await credentialStoreMissing(page);
      if (missing !== null) throw new Error(refusal(origin, missing));

      console.log(`[reuse-guard] ${origin} carries the harness environment`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

function refusal(origin: string, what: string): string {
  return (
    `[reuse-guard] refusing to run against the reused server at ${origin}: ${what}. ` +
    "Start the server the config's way (unset OBSERVER_REUSE), or start it with the same harness " +
    "environment playwright.config.ts gives its own. Three whole runs measured a server like this " +
    "one before this guard existed; their failures were the server, not the product."
  );
}
