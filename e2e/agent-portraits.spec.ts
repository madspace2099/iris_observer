import { expect, test } from "@playwright/test";

import { signIn } from "./sign-in";

/**
 * AGENT PORTRAITS WHERE THE SERVER KEEPS NONE (ADR-0054).
 *
 * The browser suite's production server has no local control plane, which is
 * exactly a hosted deployment's position: every presenter wears initials, the
 * people who could change a portrait are told why they cannot here, and
 * nobody else sees a control at all. The upload itself is `lab-agent-portraits`.
 */

const LENA = "/shark/shark-residence/agents/agt_sharklena01";
const HOSTED =
  "Portraits are kept only on a local demonstration server for now. On this deployment every agent shows their initials.";

test("every presenter on Presentations given wears initials, not a picture", async ({ page }) => {
  await signIn(page, "Clara Weiss");
  await page.goto("/shark/shark-residence/flow");
  // Its half of the screen: the longest presentations beside it wear faces too.
  const card = page.locator(".iris-band-side").filter({ hasText: "Presentations given" });
  await expect(card.locator(".ag-portrait")).toHaveCount(5);
  await expect(card.locator("img.ag-portrait")).toHaveCount(0);
  // The name stands beside each mark, so the mark is not announced.
  await expect(card.locator(".ag-portrait").first()).toHaveAttribute("aria-hidden", "true");
});

test("the tenant's company admin is told portraits are kept only on a local server", async ({
  page,
}) => {
  await signIn(page, "Clara Weiss");
  await page.goto(LENA);
  // Behind one quiet control on the head (the owner's review, 2026-10-23).
  await page.getByText("Edit portrait", { exact: true }).click();
  const control = page.getByRole("region", { name: "Portrait", exact: true });
  await expect(control).toContainText(HOSTED);
  await expect(control.getByRole("button")).toHaveCount(0);
});

test("the agency's manager sees the initials and no control", async ({ page }) => {
  await signIn(page, "Daniel Hart");
  await page.goto(LENA);
  // Drawn from the attribute, so the heading's text is the name alone.
  await expect(page.locator("h1 .ag-portrait")).toHaveAttribute("data-initials", "LF");
  await expect(page.locator(".ag-editor")).toHaveCount(0);
  await expect(page.getByText("Edit portrait", { exact: true })).toHaveCount(0);
});

test("the agent finds her profile and is told why there is nothing to change", async ({
  page,
}) => {
  await signIn(page, "Lena Fischer");
  await page.goto("/shark/shark-residence/agents");
  await page.getByRole("link", { name: "Your profile →" }).click();
  await expect(page).toHaveURL(/\/agents\/agt_sharklena01/);
  await page.getByText("Edit portrait", { exact: true }).click();
  const own = page.getByRole("region", { name: "Your portrait", exact: true });
  await expect(own).toContainText(HOSTED);
});

test("an upload is refused in the same sentence by the server", async ({ page }) => {
  await signIn(page, "Clara Weiss");
  const origin = new URL(page.url()).origin;
  const response = await page.request.put(`/api/observer/portraits/shark/shark-residence/agt_sharklena01`, {
    headers: { origin, "content-type": "application/octet-stream" },
    data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  });
  expect(response.status()).toBe(503);
  expect(((await response.json()) as { message: string }).message).toBe(HOSTED);
});
