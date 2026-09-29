import type { APIResponse, Page } from "@playwright/test";

/**
 * THE TWO SECRETS A MACHINE MAY LACK, READ FROM THE SERVER, NEVER GUESSED.
 *
 * Thirteen tests in this suite need something the suite's own server may not
 * have. Eight ask `/api/ask` and expect an answer or a shaped refusal; the
 * gate refuses every question with 503 before it reads the body when the
 * server has no `OBSERVER_SUBJECT_PEPPER` (or no usage-ceiling store), and
 * the reader's sentence for that is the same in both cases. Five fill the
 * settings forms; without an encrypted credential store
 * (`OBSERVER_CREDENTIAL_KEY` and Supabase) the page disables them and says so
 * in the providers panel's title.
 *
 * Until the first whole run of the projects, all thirteen had been red on
 * every machine without those secrets — quietly, because nobody had run them.
 * A red that no machine can turn green is not a guard; neither is a skip
 * nobody can read. So each test asks the server what it has, and when the
 * answer is "not this", skips with a sentence that says what is missing and
 * what was therefore not measured. Never an unconditional skip: on a machine
 * with the secrets, every one of them runs as written.
 *
 * The state is read from the running server — the response it gave, the page
 * it rendered — not from `process.env`, which is the test runner's
 * environment and not the server's.
 */

/** The gate's own sentence for refusing before admission (`SHARED_REFUSAL_TEXT.ceiling_unavailable`). */
const REFUSES_EVERYTHING = "Observer cannot take questions for a moment.";

/**
 * Whether a `/api/ask` response is the gate refusing every question, and if
 * so why the run cannot measure anything with it. `null` when the response is
 * an ordinary answer or refusal that the caller should go on to assert.
 */
export async function gateRefusal(response: APIResponse): Promise<string | null> {
  if (response.status() !== 503) return null;
  const json = (await response.json().catch(() => ({}))) as { error?: string };
  const error = json.error ?? "";
  if (!error.startsWith(REFUSES_EVERYTHING)) return null;
  return (
    "the Ask gate refuses every question on this server (503 before the body is read: " +
    `"${error}") — it has no OBSERVER_SUBJECT_PEPPER, or no usage-ceiling store`
  );
}

/**
 * Whether the settings page can save a credential at all, read from the page
 * as an account sees it. `null` when the forms are enabled; otherwise the
 * page's own words for why they are not.
 */
export async function credentialStoreMissing(page: Page): Promise<string | null> {
  await page.goto("/settings/ai");
  const state = await page.evaluate(() => ({
    disabled: document.querySelector<HTMLInputElement>("input#key-openai")?.disabled ?? null,
    title: document.getElementById("providers")?.textContent?.trim() ?? "",
  }));
  if (state.disabled !== true) return null;
  return (
    `the settings page says "${state.title}": this server has no encrypted credential store ` +
    "(OBSERVER_CREDENTIAL_KEY and Supabase), so the key and budget forms are disabled"
  );
}
