import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The conversation register offers no door it cannot open.
 *
 * ## What this holds, and why a docblock was not enough
 *
 * Two files state this rule in prose. `ThreadList.tsx` says "Nothing on this
 * deployment WRITES it, so no pin control is drawn", and the history page says
 * "PIN, RENAME AND DELETE ARE NOT DRAWN, AND THE REFUSAL IS STATED ONCE". Both
 * are true today; both were checked by reading them, which is the one method
 * this repository has now been wrong with three times in a week.
 *
 * A docblock is reliable about intent and unreliable about state. These two
 * name their mechanism — no control drawn, refusal stated once — which makes
 * them cheap to check and worth checking, because the next edit that adds a
 * pin button to a row will not also edit the paragraph saying there isn't one.
 *
 * ## Why the refusal is counted rather than merely found
 *
 * `docs/12-visual-autopsy.md` §9 is the rule both files cite: "one clear
 * statement of what is missing and what it costs, once, in place of the region
 * it affects". Once. A test that only asserted the sentence exists would pass
 * on a screen that repeated it per row, which is the exact failure the autopsy
 * recorded — four panels in one viewport saying the same thing.
 */

const web = resolve(import.meta.dirname, "..");
const read = (path: string): string => readFileSync(resolve(web, path), "utf8");

/** Source with block and line comments removed, so prose about a control is not read as one. */
function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const THREAD_LIST = codeOf(read("src/components/ask/ThreadList.tsx"));
const HISTORY_PAGE = codeOf(read("src/app/(app)/[tenantSlug]/[projectSlug]/ask/history/page.tsx"));

describe("the conversation register draws no control it cannot honour", () => {
  it("has a list to make claims about", () => {
    expect(THREAD_LIST).toContain("thread.title");
  });

  it("draws no interactive element in a row", () => {
    /*
     * A `Link` is not a control in this sense: it goes somewhere that exists.
     * A button, a click handler or an element given a button role is a promise
     * that something will happen, and nothing on this deployment can keep it.
     */
    const affordances = ["<button", "onClick", 'role="button"', "<form"];
    const found = affordances.filter((token) => THREAD_LIST.includes(token));

    expect(found).toEqual([]);
  });

  it("imports no icon that only a write control would need", () => {
    /*
     * Cheaper than parsing JSX and it fails earlier: a pencil arriving in the
     * import list is a rename being built, whatever it is later wired to.
     */
    const writeIcons = ["Pencil", "Trash", "Share"];
    const found = writeIcons.filter((icon) => new RegExp(`\\b${icon}\\b`).test(THREAD_LIST));

    expect(found).toEqual([]);
  });

  it("states the refusal once for the region, not once per row", () => {
    const mentions = HISTORY_PAGE.match(/<Unavailable/g) ?? [];
    expect(mentions).toHaveLength(1);
  });

  it("names what is unavailable rather than leaving the reader to infer it", () => {
    /*
     * The words are not pinned — rewording should not be a failure — but the
     * component must be told what and why, because an `Unavailable` with
     * neither is a shrug with a border around it.
     */
    const block = HISTORY_PAGE.slice(HISTORY_PAGE.indexOf("<Unavailable"));
    expect(block).toMatch(/what=/);
    expect(block).toMatch(/why=/);
  });
});
