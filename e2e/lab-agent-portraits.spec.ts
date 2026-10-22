import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./sign-in";

/**
 * AN AGENT'S PORTRAIT, SET BY THE COMPANY AND CHANGED BY THE AGENT (ADR-0054).
 *
 * Runs on the lab project (`LAB_SPECS`), whose `next dev` server opens the local
 * control plane and so keeps portraits under `.observer-local/portraits`. Each
 * test removes what it added, so a rerun starts from initials again.
 *
 * The image is a one-pixel PNG, not a face: the demonstration's people are
 * fictional, and a picture of somebody who does not exist is the fabrication
 * the doctrine forbids.
 */

const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const ROOT = "/shark/shark-residence";

async function choose(page: Page, name: string, buffer: Buffer, mimeType = "image/png") {
  await page.locator(".ag-editor input[type=file]").setInputFiles({ name, mimeType, buffer });
}

test("the company admin adds, replaces and removes a presenter's portrait", async ({ page }) => {
  await signIn(page, "Daniel Hart");
  await page.goto(`${ROOT}/agents/agt_sharkiva01`);
  const control = page.getByRole("region", { name: "Portrait", exact: true });
  await expect(control.getByRole("button", { name: "Choose image" })).toBeVisible();

  await choose(page, "iva.png", PIXEL);
  await expect(control.getByRole("img", { name: /not saved yet/ })).toBeVisible();
  await control.getByRole("button", { name: "Save portrait" }).click();
  await expect(control.getByRole("status")).toContainText("Saved.");
  await expect(page.locator("h1 img.ag-portrait")).toBeVisible();

  // Served privately, as an image, under its own type.
  const src = await page.locator("h1 img.ag-portrait").getAttribute("src");
  const served = await page.request.get(src ?? "");
  expect(served.headers()["content-type"]).toBe("image/png");
  expect(served.headers()["cache-control"]).toBe("private, no-store");

  // Shown on Sales Flow beside her name.
  await page.goto(`${ROOT}/flow`);
  const given = page.locator(".d-card").filter({ hasText: "Presentations given" });
  await expect(given.locator("img.ag-portrait")).toHaveCount(1);

  // Removed after one confirmation.
  await page.goto(`${ROOT}/agents/agt_sharkiva01`);
  await control.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(control.getByRole("button", { name: "Remove portrait" })).toBeFocused();
  await control.getByRole("button", { name: "Remove portrait" }).click();
  await expect(control.getByRole("status")).toContainText("Removed.");
  await expect(page.locator("h1 .ag-portrait")).toHaveText("IH");
});

test("refuses what is not an image by its bytes, and what is too large before sending", async ({
  page,
}) => {
  await signIn(page, "Daniel Hart");
  await page.goto(`${ROOT}/agents/agt_sharkiva01`);
  const control = page.getByRole("region", { name: "Portrait", exact: true });

  await choose(page, "looks-like.png", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"));
  await control.getByRole("button", { name: "Save portrait" }).click();
  await expect(control.getByRole("status")).toContainText(
    "Only a PNG, JPEG or WebP image can be a portrait.",
  );

  await choose(page, "huge.png", Buffer.alloc(3 * 1024 * 1024));
  await expect(control.getByRole("status")).toContainText("a portrait can be at most 2 MB");
  await expect(page.locator("h1 img.ag-portrait")).toHaveCount(0);
});

test("the agent replaces and removes her own, and only her own", async ({ page }) => {
  await signIn(page, "Daniel Hart");
  await page.goto(`${ROOT}/agents/agt_sharklena01`);
  await choose(page, "lena.png", PIXEL);
  await page.getByRole("button", { name: "Save portrait" }).click();
  await expect(page.getByRole("status")).toContainText("Saved.");

  await signIn(page, "Lena Fischer");
  await page.goto(`${ROOT}/agents`);
  await page.getByRole("link", { name: "Your profile →" }).click();
  const own = page.getByRole("region", { name: "Your portrait", exact: true });
  await expect(own.getByRole("button", { name: "Replace" })).toBeVisible();
  await choose(page, "me.png", PIXEL);
  await own.getByRole("button", { name: "Save portrait" }).click();
  await expect(own.getByRole("status")).toContainText("Saved.");

  // A colleague's page offers her nothing to change.
  await page.goto(`${ROOT}/agents/agt_sharkmarek01`);
  await expect(page.locator(".ag-editor")).toHaveCount(0);

  await page.goto(`${ROOT}/agents/agt_sharklena01`);
  await own.getByRole("button", { name: "Remove", exact: true }).click();
  await own.getByRole("button", { name: "Remove portrait" }).click();
  await expect(own.getByRole("status")).toContainText("Removed.");
});
