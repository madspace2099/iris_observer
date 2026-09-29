import { expect, test } from "@playwright/test";
import { signInAs } from "./sign-in";

/**
 * AN AGENT'S REGISTER IS DRAWN FOR THE SALES TEAM AND NOT FOR THE DEVELOPER.
 *
 * `docs/22` §5, decision (B): the register beside an agent's figures — their
 * meetings one by one, the meeting drill-down's own material — keeps the
 * drill-down's three roles. The agency manager opens the agent's page and
 * gets the table; the developer opens the same page, keeps every figure on
 * it, and gets no table in the document at all — not a hidden one — and a
 * sentence in its place. One assertion, two viewers, measured in the
 * rendered document rather than read from the source.
 */
test("the register is drawn for the sales team and not for the developer", async ({ page }) => {
  const agent = "/alpha/ister-tower/agents/agt_luciahorvath";
  const register = () => page.locator("caption", { hasText: "most recent meetings" });
  const sentence = () => page.getByText("Kept for the sales team");

  await signInAs(page, "Tomáš Varga");
  await page.goto(agent);
  const manager = { register: await register().count(), sentence: await sentence().count() };

  await signInAs(page, "Petra Novák");
  await page.goto(agent);
  const developer = { register: await register().count(), sentence: await sentence().count() };

  expect({ manager, developer }).toEqual({
    manager: { register: 1, sentence: 0 },
    developer: { register: 0, sentence: 1 },
  });
});
