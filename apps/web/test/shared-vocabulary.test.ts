import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DATA_SOURCE_MARKERS } from "@observer/readmodels";

/**
 * ONE SET OF WORDS, SEVERAL SHAPES — AND NEVER THE OTHER WAY ROUND.
 *
 * This repository deliberately renders the same fact in more than one visual
 * idiom: the shell draws in `iris-`, a page draws in `ox-`, and MADSPACE
 * administration draws in `obs-`. That is not duplication, and `vocabulary.ts`
 * in `components/meetings` states the rule it follows — "Nothing here invents a
 * label… What is chosen here is only the SHAPE".
 *
 * The demonstration-data marker broke that rule. `SyntheticBadge` in
 * `showroom/parts.tsx` and `Synthetic` in `components/product/Absence.tsx` are
 * two treatments of one statement, and each carried its own copy of both
 * sentences. Nothing had diverged yet; the point is that nothing would have
 * noticed if it had, and the claim at stake is whether a reader is looking at
 * real meetings or at a demonstration.
 *
 * The second guard is about a different kind of lost word. `.ox-menu-value`
 * ellipsises at every width the product ships, so "Northgate Residences" read
 * "Northgate Resi…" on a 1920px header with a `title` nowhere in sight.
 * `layout-integrity.spec.ts` catches it against a real browser and states the
 * rule — an ellipsis with a title is a shortened label, an ellipsis without one
 * is a clip — but that suite needs a production build and a server, so it does
 * not run on the way past. This one does.
 */

const SRC = resolve(import.meta.dirname, "../src");

/** Source with its comments removed, so a docblock cannot satisfy a guard. */
function executable(path: string): string {
  return readFileSync(resolve(SRC, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/** Every component that draws the demonstration-data marker. */
const MARKER_FILES = ["showroom/parts.tsx", "components/product/Absence.tsx"];

describe("the demonstration-data marker says one thing", () => {
  it("keeps a short form and a full claim for each of the two states", () => {
    for (const state of ["synthetic", "delivered"] as const) {
      const marker = DATA_SOURCE_MARKERS[state];
      expect(marker.short.length, state).toBeGreaterThan(0);
      // The full claim is a sentence, not a second badge label: it is what a
      // screen reader is given and what hovering recovers.
      expect(marker.full.length, state).toBeGreaterThan(marker.short.length);
    }
    // And the two states are told apart, which is the entire point of having
    // two: "Demo data" on a project whose showroom is live is the same lie as
    // "Live meetings" on one that has never sent anything.
    expect(DATA_SOURCE_MARKERS.synthetic.short).not.toBe(DATA_SOURCE_MARKERS.delivered.short);
    expect(DATA_SOURCE_MARKERS.synthetic.full).not.toBe(DATA_SOURCE_MARKERS.delivered.full);
  });

  it("is written out in no component, in either visual idiom", () => {
    const sentences = [
      DATA_SOURCE_MARKERS.synthetic.short,
      DATA_SOURCE_MARKERS.synthetic.full,
      DATA_SOURCE_MARKERS.delivered.short,
      DATA_SOURCE_MARKERS.delivered.full,
    ];
    const offenders: string[] = [];
    for (const file of MARKER_FILES) {
      const source = executable(file);
      for (const sentence of sentences) {
        if (source.includes(sentence)) offenders.push(`${file}: "${sentence.slice(0, 40)}…"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("reads the shared vocabulary in every component that draws it", () => {
    for (const file of MARKER_FILES) {
      expect(executable(file), file).toContain("DATA_SOURCE_MARKERS");
    }
  });
});

describe("a truncated control still tells the reader what it says", () => {
  it("gives the context switcher's value a title beside its ellipsis", () => {
    /*
     * The pair is the rule. `.ox-menu-value` is what the stylesheet ellipsises
     * and `title` is what makes that a shortening rather than a loss, so a
     * change that removes either one should fail here.
     */
    const source = executable("components/ContextSwitcher.tsx");
    const value = /className="ox-menu-value"([^>]*)>/.exec(source);
    expect(value, "the switcher no longer renders .ox-menu-value").not.toBeNull();
    expect(value?.[1] ?? "", "the truncating value carries no title").toContain("title=");
  });
});
