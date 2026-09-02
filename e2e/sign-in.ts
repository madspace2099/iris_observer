import type { Page } from "@playwright/test";

/**
 * SIGNING IN, ONCE, FOR EVERY BROWSER SPEC.
 *
 * The way in is `ACCOUNT → PROJECTS → OBSERVER`: a reader types an address and
 * a credential at `/sign-in`, lands on `/projects`, and opens one. Every spec
 * in this directory used to do something else — click `Continue as <name>` on a
 * profile picker, which was never authentication and is no longer a product
 * screen at all. The picker survives only at `/lab/sign-in`, and nothing here
 * goes through it.
 *
 * The helper lives in one file rather than being copied into fourteen, because
 * fourteen copies is how a suite ends up half-migrated: the next change to the
 * front door has one place to land.
 *
 * `signInAs` takes the display names the specs already use so their intent
 * still reads — "sign in as the sales agent", not "sign in as
 * monika.kovacova@meridian-sales.example".
 */

/** The demonstration password, printed on the sign-in screen under a notice. */
export const PASSWORD = "observer-demo";

/** Display name to account address. The directory is `src/lib/accounts.ts`. */
export const ACCOUNTS: Readonly<Record<string, string>> = Object.freeze({
  "Petra Novák": "petra.novak@alpha-estates.example",
  "Tomáš Varga": "tomas.varga@meridian-sales.example",
  "Monika Kováčová": "monika.kovacova@meridian-sales.example",
  "Akhilesh Undev": "akhilesh.undev@meridian-sales.example",
  "MADSPACE Operations": "operations@madspace.example",
});

export function addressOf(name: string): string {
  const email = ACCOUNTS[name];
  if (email === undefined) throw new Error(`No demonstration account for "${name}"`);
  return email;
}

/**
 * Signs in through the visible form, and stops on the projects.
 *
 * Nothing is installed by hand: the address and the credential are typed and
 * the button is pressed, so a spec that passes has proved the front door works
 * as well as whatever it went on to check.
 */
export async function signIn(page: Page, name: string): Promise<void> {
  /*
   * Start signed out, every time.
   *
   * A signed-in reader who visits /sign-in is sent to their projects, which is
   * correct product behaviour and leaves a spec that signs in twice — to
   * compare what two accounts see — waiting for a form that is not there. This
   * clears the session rather than installing one: the credential is still
   * typed and the button is still pressed.
   */
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Work email address").fill(addressOf(name));
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with password" }).click();
  await page.waitForURL(/\/projects/);
}

/**
 * Signs in and opens a project, which is where the older helper landed.
 *
 * Without a project the specs below have nothing to look at, and the account
 * layer deliberately does not choose one — so the choice is made here, in the
 * open, rather than by a redirect nobody can see.
 *
 * `project` names the card to open. Omitted, it opens the first, which is the
 * project each account's grants list first: Northgate for all four.
 */
export async function signInAs(page: Page, name: string, project?: string): Promise<void> {
  await signIn(page, name);

  const action =
    project === undefined
      ? page.getByRole("link", { name: /Open Observer/ }).first()
      : page.getByRole("link", { name: new RegExp(`Open Observer for ${project}`) });

  await action.click();
  await page.waitForURL(/\/showroom/);
}
