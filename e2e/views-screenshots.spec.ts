import { test } from "@playwright/test";
import { signIn } from "./sign-in";

/**
 * Review artefacts for the opening screen and the three views.
 *
 * Not assertions — these produce the images a human looks at. The chart
 * vocabulary has its own set in `chart-screenshots.spec.ts`.
 */

const OUT = "C:/Users/42191/AppData/Local/Temp/claude/C--Users-42191-Documents-IRIS-OBSERVER/fca1dc8c-8691-435c-b958-dd07be3e192c/scratchpad/v3";

const SHOTS = [
  ["01-home", "/alpha/northgate/showroom"],
  ["02-flow", "/alpha/northgate/flow"],
  ["03-project", "/alpha/northgate/project?segment=rooms-2"],
  ["04-agents", "/alpha/northgate/agents"],
  ["05-agent-focused", "/alpha/northgate/agents?agent=agt_monika"],
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
