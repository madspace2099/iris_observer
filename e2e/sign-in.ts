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
  "Martin Kováč": "martin.kovac@meridian-sales.example",
  "MADSPACE Operations": "operations@madspace.example",
});

export function addressOf(name: string): string {
  const email = ACCOUNTS[name];
  if (email === undefined) throw new Error(`No demonstration account for "${name}"`);
  return email;
}

/** Matches either landing segment a project ever opens on — see `signInAs` below. */
const PROJECT_OPENED = /\/(ask|showroom)(\?|$|\/)/;

/**
 * Signs in through the visible form, and stops wherever the front door
 * actually lands: `/projects` for an account with several and nothing
 * remembered, or straight into a project for one with only one held, or with
 * a last-visited project still on record (`resolveLandingPath`,
 * `apps/web/src/lib/landing.ts`). Both are correct product behaviour now —
 * this used to assert only the first, back when every account landed on
 * `/projects` unconditionally.
 *
 * Nothing is installed by hand: the address and the credential are typed and
 * the button is pressed, so a spec that passes has proved the front door works
 * as well as whatever it went on to check.
 */
export async function signIn(page: Page, name: string): Promise<void> {
  /*
   * Start signed out, every time.
   *
   * A signed-in reader who visits /sign-in is sent to their landing path,
   * which is correct product behaviour and leaves a spec that signs in twice
   * — to compare what two accounts see — waiting for a form that is not
   * there. This clears the session rather than installing one: the
   * credential is still typed and the button is still pressed.
   *
   * The last-project cookie is cleared alongside it. Without this, an
   * account that shares a browser context with an earlier test in the same
   * spec could be re-landed on THAT test's project rather than resolving
   * fresh, which is not what "start signed out, every time" promises.
   */
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Work email address").fill(addressOf(name));
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with password" }).click();
  await page.waitForURL((url) => /\/projects/.test(url.pathname) || PROJECT_OPENED.test(url.pathname));
}

/**
 * Signs in and opens a project, which is where the older helper landed.
 *
 * `project` names the card to open. Omitted, it opens the first, which is the
 * project each account's grants list first: Northgate for the four accounts
 * that hold it, and ISTER TOWER for Martin Kováč, who holds only that one —
 * and for Martin specifically, `signIn` above has typically already landed
 * there directly, since he holds nothing else to choose between.
 */
export async function signInAs(page: Page, name: string, project?: string): Promise<void> {
  await signIn(page, name);

  /*
   * `signIn` may already have opened a project — the single-project path
   * through `resolveLandingPath` lands there directly, with no `/projects`
   * page and no card to click. Every fixture account that can land this way
   * holds exactly one project, so there is nothing left to choose between
   * regardless of what `project` names; the cookie `signIn` clears rules out
   * the remembered-project path ever doing the same for a multi-project
   * account mid-suite.
   */
  if (PROJECT_OPENED.test(new URL(page.url()).pathname)) return;

  const action =
    project === undefined
      ? page.getByRole("link", { name: /Open Observer/ }).first()
      : page.getByRole("link", { name: new RegExp(`Open Observer for ${project}`) });

  await action.click();

  /*
   * THE LANDING SEGMENT MOVED, AND THE HELPER MOVED WITH IT.
   *
   * Every project card used to open `/showroom`, the Briefing. ADR-0033 made
   * Ask IRIS the landing surface, so a card now opens `/{tenant}/{project}/ask`
   * and `HOME_SEGMENT` in `apps/web/src/lib/routes.ts` is the single place that
   * is decided.
   *
   * Both are accepted here rather than only the new one. Ten specification
   * files call this helper and several of them then navigate to Briefing by
   * name; a pattern that admits only `ask` would make this function wait for a
   * URL its own callers are about to leave. What the wait is actually for is
   * "the project is open" — either segment proves that.
   */
  await page.waitForURL(PROJECT_OPENED);
}
