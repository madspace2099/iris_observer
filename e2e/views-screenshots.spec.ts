import { test } from "@playwright/test";
import { signIn } from "./sign-in";

/**
 * Review artefacts for the opening screen and the three views.
 *
 * Not assertions — these produce the images a human looks at. The chart
 * vocabulary has its own set in `chart-screenshots.spec.ts`.
 */

/*
 * Inside the repository. `_review/` rather than `test-results/`, which
 * Playwright clears before every run; and rather than the absolute Windows
 * temp path this defaulted to, which swept the images on one machine and, on
 * any other, is a relative path that makes a folder called `C:`.
 *
 * The environment override is new. This was the one screenshot spec with no
 * way to redirect it at all, so on any machine but one it wrote its images
 * into a folder called `C:` and reported a pass.
 */
const OUT = process.env["OBSERVER_VIEWS_SHOTS"] ?? "_review/views";

const SHOTS = [
  ["01-home", "/alpha/northgate/showroom"],
  ["02-flow", "/alpha/northgate/flow"],
  ["03-project", "/alpha/northgate/project?segment=rooms-2"],
  ["04-agents", "/alpha/northgate/agents"],
  ["05-agent-detail", "/alpha/northgate/agents/agt_monika"],
  ["06-audience", "/alpha/northgate/audience?rooms=2&category=family"],
  /*
   * SETTINGS · AI — the one Observer surface no screenshot spec photographed.
   *
   * It belongs in this file rather than in `settings-ai.spec.ts`, which takes
   * no pictures at all, or `madspace-screenshots.spec.ts`, whose describes
   * skip unless `OBSERVER_BASE_URL` is set: the requirement is an image from
   * the ordinary `--project=desktop` run with no extra environment. This file
   * has no gate, already signs in as MADSPACE Operations — the account
   * `settings-ai.spec.ts` itself uses for this screen — and is a plain list of
   * routes.
   *
   * WHAT IS IN THE PICTURE, AND WHAT IS NOT. With no `OBSERVER_CREDENTIAL_KEY`
   * and no Supabase, the page reads its credential store, fails, and renders
   * its `unavailable` state: the panels are drawn and their controls are
   * disabled. That is the state a reader meets on a machine with no secrets,
   * so it is worth having a picture of — but it is one state of two, and the
   * connected one is not photographed here. Producing that would need a
   * credential key and a reachable Supabase project, which this round does not
   * have and must not invent.
   */
  ["07-settings-ai", "/settings/ai"],
] as const;

for (const [name, route] of SHOTS) {
  test(name, async ({ page }, info) => {
    await signIn(page, "MADSPACE Operations");
    await page.goto(route);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${name}-${info.project.name}.png` });
    await page.screenshot({ path: `${OUT}/${name}-${info.project.name}-full.png`, fullPage: true });
  });
}
