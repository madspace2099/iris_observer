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
