import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every figure on Project Overview says what it is a share of.
 *
 * ## Why the list is written out
 *
 * A segment carries five fields whose names all end in `Share` and which are
 * not the same kind of measure. `stockShare` divides units by units.
 * `attentionShare` divides seconds by seconds. `favouriteShare`,
 * `compareShare` and `shareShare` divide counts of unit-touches by counts of
 * unit-touches. And `index` divides the second of those by the first — a share
 * of looking time over a share of supply — which is a useful construct and an
 * easy one to read as something else.
 *
 * Three kinds behind one suffix is exactly the pair the round was asked to keep
 * apart, and the screen keeps them apart by saying, on each figure, what its
 * denominator is. That is the repository's own first page rule: no metric
 * without a denominator. This file is the enumeration of the places it has to
 * hold, because a rule stated in one place has now three times applied only to
 * that place.
 */

const web = resolve(import.meta.dirname, "..");
const read = (path: string): string => readFileSync(resolve(web, path), "utf8");

const SEGMENT_DETAIL = read("src/components/project/SegmentDetail.tsx");
const CHARTS = read("src/showroom/charts.tsx");

/**
 * The figures a reader meets, and the words that carry their denominator.
 *
 * Kept as data rather than as six assertions so that the next figure added to
 * the panel is a line here rather than a thing nobody remembered to check.
 *
 * `Ratio` already requires `of` in its type, so five of these six cannot lose
 * their denominator without a compile error, and for those this list is an
 * enumeration rather than a guard. The sixth is a `Count`, whose `of` is
 * optional because a genuine zero is allowed to answer with a `note` instead —
 * and a `Count` that loses `of` while keeping `note` compiles, passes a search
 * for the denominator's words, and renders a bare number for every value except
 * zero. That case is the reason the assertion below looks for the `of` prop and
 * not merely for the words.
 */
const SEGMENT_FIGURES = [
  { label: "Share of available stock", kind: "stock", denominator: "available units" },
  { label: "Share of looking time", kind: "time", denominator: "of all time on any unit" },
  { label: "Share of shortlisting", kind: "reach", denominator: "of every unit shortlisted" },
  { label: "Share of comparisons", kind: "reach", denominator: "of every unit put side by side" },
  { label: "Share of what was sent on", kind: "reach", denominator: "of every unit shared" },
  { label: "Meetings that opened one", kind: "reach", denominator: "presentations" },
] as const;

/** The figure's own markup: from its label to the next one. */
function figureBlock(label: string): string {
  const at = SEGMENT_DETAIL.indexOf(label);
  const next = SEGMENT_DETAIL.indexOf('label="', at + label.length);
  return SEGMENT_DETAIL.slice(at, next === -1 ? undefined : next);
}

describe("a share on Project Overview names what it is a share of", () => {
  it("has the panel it makes claims about", () => {
    expect(SEGMENT_DETAIL).toContain("TallyItem");
  });

  it.each(SEGMENT_FIGURES)("$label ($kind)", ({ label, denominator }) => {
    expect(SEGMENT_DETAIL, `no figure is labelled "${label}"`).toContain(label);

    const block = figureBlock(label);

    /*
     * `of` on the figure, not the denominator's words somewhere near it. A
     * `note` carries the same words for the zero case and is not a substitute:
     * it is what the figure says INSTEAD of `of` when the value is nought.
     */
    expect(block, `"${label}" draws a figure with no \`of\` on it`).toMatch(/\bof=/);
    expect(block, `"${label}" does not state its denominator beside itself`).toContain(denominator);
  });

  it("the attention index says what it is a multiple of, everywhere it is drawn", () => {
    /*
     * `index` is a share of looking time divided by a share of stock. Drawn as
     * a bare "1.41× attention" it reads as a comparison with other segments
     * rather than with the segment's own supply, which is a different claim.
     * The segment panel spells it out and the parity scale says it per row;
     * the quadrant matrix was the third place and the only one that did not.
     */
    const bare = CHARTS.match(/\{r\.index\.toFixed\(2\)\}× attention(?! for its share of)/g) ?? [];

    expect(
      bare,
      bare.length === 0
        ? ""
        : `${bare.length} place(s) draw the attention index without saying what it is a multiple of.`,
    ).toEqual([]);
  });
});
