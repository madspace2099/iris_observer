import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * An inert control on Ask IRIS says why, where a reader can see it.
 *
 * The model picker draws the connections an account holds and answers with
 * none of them, because this surface composes from the project's own figures.
 * That is a good decision and the menu says so. What it did not say was why the
 * individual options were grey: the sentence lived in a `title`, and a `title`
 * is a mouse affordance. A reader on a phone never triggers it. A reader on a
 * keyboard never reaches it. A screen reader takes the option's visible text as
 * its accessible name and drops the attribute. So the one sentence that
 * explained the grey was the one nobody received, which is the definition of a
 * silent restriction rather than a stated one.
 *
 * This is a source assertion rather than a rendered one on purpose. The failure
 * it guards against is a future edit hanging an explanation back on a tooltip,
 * and that is visible in the source without a DOM, a browser or a fixture.
 */

const SCREEN = resolve(import.meta.dirname, "../src/components/ask-iris/AskScreen.tsx");
const source = readFileSync(SCREEN, "utf8");

/** Every JSX element carrying `ask-model-option`, whole tag, attributes and all. */
function modelOptionTags(text: string): readonly string[] {
  const tags: string[] = [];
  const marker = 'className="ask-model-option"';
  let at = text.indexOf(marker);
  while (at !== -1) {
    const open = text.lastIndexOf("<", at);
    const close = text.indexOf(">", at);
    if (open !== -1 && close !== -1) tags.push(text.slice(open, close + 1));
    at = text.indexOf(marker, at + marker.length);
  }
  return tags;
}

describe("the Ask model picker states its restriction rather than implying it", () => {
  it("draws at least one option, so the assertions below have something to hold", () => {
    expect(modelOptionTags(source).length).toBeGreaterThan(0);
  });

  it("hangs no explanation on a title attribute", () => {
    const withTitle = modelOptionTags(source).filter((tag) => tag.includes("title="));
    expect(withTitle).toEqual([]);
  });

  it("says in visible text why a connected model answers nothing here", () => {
    /*
     * The words are not asserted, only that the branch which renders held
     * connections also renders the menu's own visible note beside them. Pinning
     * the sentence would make every rewording a test failure; pinning the
     * presence is what keeps the explanation from disappearing.
     */
    const branch = source.slice(
      source.indexOf("models.length === 0"),
      source.indexOf("</ClosableDetails>"),
    );
    const heldConnections = branch.slice(branch.indexOf(") : ("));

    expect(heldConnections).toContain("ask-menu-note");
  });
});
