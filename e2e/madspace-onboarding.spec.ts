import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { signInAs } from "./sign-in";

/**
 * AKHILESH'S CLIENT & ENGINE ONBOARDING, END TO END (ADR-0044).
 *
 * Runs on the lab project, whose `next dev` server opens the local control
 * plane (`LAB_SPECS` in playwright.config.ts). Steps 1.1 to 1.3 are filled the
 * way an operator fills them, the press writes a real developer, project,
 * source and code, and the code is presented to the real activation endpoint
 * as a plugin would present it. The wizard's poll then has to say Activated.
 *
 * The lab server takes the activation peppers from `apps/web/.env.local`. On a
 * machine without them the wizard refuses before writing anything, and this
 * test skips with that refusal as its reason rather than failing on a
 * configuration it does not own.
 *
 * Every run onboards a client of its own (`e2e-<run>`), so it never collides
 * with an earlier run's rows in `.observer-local/`.
 */
const CODE = /^obs\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{40,}$/;

test("onboards a client and hands over a code the activation endpoint accepts", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await signInAs(page, "MADSPACE Operations");
  await page.goto("/madspace/projects/new");
  await expect(
    page.getByRole("heading", { level: 1, name: "Client & Engine Onboarding" }),
  ).toBeVisible();

  const run = Date.now().toString(36);

  /* 1.1 */
  await page.getByLabel(/^Client ID/).fill(`E2E-${run}`);
  await expect(page.getByLabel(/^Client ID/), "a client ID is an address").toHaveValue(
    `e2e-${run}`,
  );
  await page.getByRole("button", { name: /^Next: Project/ }).click();

  /* 1.2: the domain follows the name, and the browser's locale and zone are visible. */
  await page.getByLabel(/^Project name/).fill(`Onboarding ${run}`);
  await expect(page.getByLabel(/^Domain/)).toHaveValue(`onboarding-${run}`);
  await page.getByLabel(/^Currency/).selectOption("EUR");
  await expect(page.getByLabel("Locale")).not.toHaveValue("");
  await expect(page.getByLabel("Time zone")).not.toHaveValue("");
  await page.getByRole("button", { name: /^Next: Source/ }).click();

  /* 1.3: his quick pill, and an environment chosen on purpose. */
  await page.getByRole("button", { name: "Kiosk 1" }).click();
  await expect(page.getByLabel(/^Source name/)).toHaveValue("Kiosk 1");
  await page.getByRole("radio", { name: "Demo" }).check();
  await page.getByRole("button", { name: "Generate activation code" }).click();

  /* 1.4, or the refusal that explains why not. */
  const code = page.locator(".mad-wizard .mad-activation-code");
  const refusal = page.locator(".mad-wizard .mad-form-problem");
  await expect(code.or(refusal)).toBeVisible({ timeout: 30_000 });
  if (await refusal.isVisible()) {
    const said = await refusal.innerText();
    test.skip(/PEPPER/.test(said), `The lab server cannot issue codes: ${said}`);
    throw new Error(`The wizard refused: ${said}`);
  }

  const plaintext = (await code.innerText()).trim();
  expect(plaintext).toMatch(CODE);
  await expect(page.locator(".mad-wizard-countdown")).toHaveText(/^(15:00|14:[0-5]\d) remaining$/);
  await expect(page.getByText("Active, waiting for the engine")).toBeVisible();
  await expect(page.locator(".mad-wizard dl")).toContainText(`/e2e-${run}/onboarding-${run}`);

  /* The plugin's side of the exchange, against the endpoint the hint names. */
  const answer = await request.post("/functions/v1/observer-activate", {
    data: {
      activation_code: plaintext,
      reported_environment: "demo",
      installation_nonce: randomUUID(),
      build: {
        app_version: "observer-e2e",
        plugin_version: "observer-e2e",
        build_id: "madspace-onboarding-spec",
        engine_version: "not-unreal",
      },
      os: "playwright",
    },
  });
  expect(answer.ok(), await answer.text()).toBe(true);
  expect((await answer.json()) as { status: string }).toMatchObject({ status: "activated" });

  /* Within two of the wizard's four-second polls. */
  await expect(page.getByText("Activated", { exact: true })).toBeVisible({ timeout: 15_000 });

  /* Onboarding another client drops the plaintext from the page. */
  await page.getByRole("button", { name: "+ Onboard another client" }).click();
  await expect(page.getByLabel(/^Client ID/)).toHaveValue("");
  await expect(page.getByText(plaintext)).toHaveCount(0);
});
