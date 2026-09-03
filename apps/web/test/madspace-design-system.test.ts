import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE ADOPTED DESIGN SYSTEM, ENFORCED WHERE IT CAN BE.
 *
 * `docs/20-madspace-admin-design-system.md` is the specification. Most of it is
 * a matter of judgement and belongs to review; a few of its rules are literal
 * enough to be checked, and those are the ones that quietly rot. A type floor
 * and a language rule are exactly the sort of thing that holds for a month and
 * then loses one case at a time.
 *
 * What is NOT here is as deliberate as what is. There is no assertion that a
 * screen "looks right", no snapshot of a rendered page and no colour-contrast
 * arithmetic against a synthetic background. The first two would pass while the
 * surface drifted, and the third would measure a number this file made up
 * rather than the one a browser computes. Those belong to the screenshot review
 * the milestone already runs.
 */

const web = resolve(import.meta.dirname, "..");
const ui = resolve(web, "../../packages/ui/src");

function every(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? every(path) : [path];
  });
}

/**
 * A file's code, with its prose removed.
 *
 * Every scan below looks for a forbidden character or identifier by reading the
 * file as text, and a comment describing the rule is not a breach of it. The
 * repository has been caught by this twice already, in `credentials.test.ts`
 * and in `worker-bound.test.ts`, and both solved it the same way.
 */
function executable(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Every file under the MADSPACE surface, which is what this system governs.
 *
 * `src/lib/madspace` is here WHOLE, and the first version of this file took
 * only `format.ts` from it. That was wrong in the way a scan is usually wrong:
 * three em dashes survived the language pass, in `diagnostics.ts`,
 * `source-actions.ts` and `create-actions.ts`, and every one of them was a
 * refusal sentence rendered straight onto a screen. A guard that covers the
 * files you remembered is a guard that reports what you already knew.
 */
const SURFACE = [
  ...every(join(web, "src/app/madspace")),
  ...every(join(web, "src/components/madspace")),
  ...every(join(web, "src/lib/madspace")),
  join(web, "src/lib/sources/control-plane.ts"),
].filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));

const rel = (f: string): string => f.slice(web.length).split("\\").join("/");

describe("the language rule", () => {
  /*
   * "No em dash and no bare dash." The system's own words, and the rule with
   * the most reach: the operations copy leaned on the em dash for almost every
   * subordinate clause, which is one of the reasons the screens read as dense.
   *
   * Checked against STRING AND JSX TEXT only. A dash in a comment is prose
   * about the code, a dash in an import path or a CSS class is a name, and a
   * minus sign is arithmetic. None of those reaches a reader.
   */
  const DASHES = /[\u2014\u2013]|(?<=\s)-(?=\s)/;

  /**
   * The text a reader could actually see.
   *
   * Double-quoted strings and JSX text between tags. Single quotes are absent
   * from this codebase by Prettier configuration, and template literals are
   * included because several sentences are assembled from them.
   */
  function visible(source: string): string[] {
    const code = executable(source);
    const out: string[] = [];
    for (const m of code.matchAll(/"([^"\\\n]|\\.){8,}"/g)) out.push(m[0]);
    for (const m of code.matchAll(/`([^`\\]|\\.){8,}`/g)) out.push(m[0]);
    /* JSX text: what sits between a > and a < with no tag in between. */
    for (const m of code.matchAll(/>\s*([^<>{}\n][^<>{}]{7,})\s*</g)) out.push(m[1] ?? "");
    return out;
  }

  it("puts no em dash and no bare dash in front of a reader", () => {
    const offenders: string[] = [];
    for (const file of SURFACE) {
      for (const text of visible(readFileSync(file, "utf8"))) {
        if (DASHES.test(text)) offenders.push(`${rel(file)}: ${text.trim().slice(0, 110)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("scans for the character rather than for one spelling of it", () => {
    /*
     * The guard above is only worth having if it would actually fire, and a
     * regex is easy to write in a way that never does. These are the three
     * shapes the rule forbids and one it does not: a hyphenated word is not a
     * bare dash and must keep passing, or the rule would rename half the
     * product.
     */
    expect(DASHES.test("a sentence \u2014 like this")).toBe(true);
    expect(DASHES.test("a range \u2013 like this")).toBe(true);
    expect(DASHES.test("a clause - like this")).toBe(true);
    expect(DASHES.test("well-formed identifier")).toBe(false);
    expect(DASHES.test("Not reported")).toBe(false);
  });
});

describe("the disclosure", () => {
  const notes = SURFACE.filter((f) => executable(readFileSync(f, "utf8")).includes("<InfoNote"));

  it("is used, because the surface it was built for is the one being reviewed", () => {
    /*
     * A floor rather than a target. The screens carried a great deal of
     * explanation in front of their answers, which is what prompted this work,
     * and a surface that ended up with one disclosure would mean the pass had
     * not happened.
     */
    expect(notes.length).toBeGreaterThanOrEqual(4);
  });

  it("always says what it explains", () => {
    /*
     * `label` becomes "About <label>" as the button's accessible name. Without
     * it a screen reader announces "button" beside a title and the control is
     * unusable; with a bad one it announces "About more information", which is
     * the same failure wearing a word.
     */
    const bad: string[] = [];
    for (const file of notes) {
      const code = executable(readFileSync(file, "utf8"));
      for (const m of code.matchAll(/<InfoNote\b([^>]*)>/g)) {
        const attrs = m[1] ?? "";
        if (!/\blabel\s*=/.test(attrs)) bad.push(`${rel(file)}: <InfoNote${attrs.slice(0, 60)}>`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("is a button carrying the state of its panel", () => {
    /*
     * The accessibility contract names `aria-expanded` and `aria-controls` for
     * disclosures. Asserted on the component rather than on every use, because
     * there is one component and this is where it is decided.
     */
    const source = readFileSync(join(web, "src/components/madspace/InfoNote.tsx"), "utf8");
    expect(source).toContain("aria-expanded");
    expect(source).toContain("aria-controls");
    expect(source).toContain('type="button"');
    /* Escape closes it and focus goes back to the control that opened it. */
    expect(source).toContain('"Escape"');
  });
});

describe("never colour alone", () => {
  it("draws a state through one function and nowhere else", () => {
    /*
     * "The mark shape is produced by one function, so a state cannot appear
     * with the wrong shape in one place and the right one in another." A second
     * hand-drawn mark somewhere in the surface is precisely the drift that
     * sentence forbids, and it is invisible in review because each screen looks
     * right on its own.
     */
    const drawn = SURFACE.filter((f) => f.endsWith(".tsx"))
      .filter((f) => !f.endsWith("StatusMark.tsx") && !f.endsWith("InfoNote.tsx"))
      .filter((f) => /<(svg|circle|polygon)\b/.test(executable(readFileSync(f, "utf8"))))
      .map(rel);

    expect(drawn).toEqual([]);
  });

  it("pairs every tone with exactly one shape", () => {
    const source = readFileSync(join(web, "src/components/madspace/StatusMark.tsx"), "utf8");
    for (const tone of ["good", "await", "operator", "wrong", "settled", "none"]) {
      expect(source, tone).toMatch(new RegExp(`${tone}:\\s*"`));
    }
    /* Six states, six shapes, and the shapes are distinct. */
    const shapes = [
      ...source.matchAll(/^\s{2}(?:good|await|operator|wrong|settled|none):\s*"(\w+)"/gm),
    ].map((m) => m[1]);
    expect(shapes).toHaveLength(6);
    expect(new Set(shapes).size).toBe(6);
  });

  it("gives the chip no way to drop its word", () => {
    /*
     * `children: string` and no optional. A coloured pill with no word is the
     * failure the whole rule exists to prevent, so the component must not be
     * able to render one even when a caller would like it to.
     */
    const source = readFileSync(join(web, "src/components/madspace/StatusMark.tsx"), "utf8");
    expect(source).toContain("readonly children: string");
    expect(source).not.toContain("children?:");
  });
});

describe("the stylesheet honours the system", () => {
  const css = readFileSync(join(ui, "madspace.css"), "utf8");
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");

  it("declares the portal tokens on a class, not at the root", () => {
    /*
     * The whole theme turns on this. Declared at `:root` it would repaint the
     * Observer product, which is dark and staying dark; declared on the class
     * the layout carries, it stops at the surface boundary.
     */
    expect(rules).toContain(".mad-portal {");
    for (const token of [
      "--ink:",
      "--ink-2:",
      "--ink-3:",
      "--ink-4:",
      "--mark-disabled:",
      "--surface-page:",
      "--surface-card:",
      "--surface-tint:",
      "--surface-inset:",
      "--border-hairline:",
      "--border-panel:",
      "--border-line:",
      "--border-field:",
      "--border-dashed:",
      "--border-hover:",
    ]) {
      expect(rules, token).toContain(token);
    }
  });

  it("carries the values the specification states", () => {
    /*
     * Spot-checked rather than exhaustive, and on the five that carry meaning:
     * the warm paper everything sits on, the ink everything is written in, and
     * the lightest colour any text may use. A wrong value in any of these is a
     * different product.
     */
    expect(rules).toMatch(/--surface-page:\s*#f6f5f3/i);
    expect(rules).toMatch(/--surface-card:\s*#ffffff/i);
    expect(rules).toMatch(/--ink:\s*#111111/i);
    expect(rules).toMatch(/--ink-4:\s*#6b6b6b/i);
    expect(rules).toMatch(/--mark-disabled:\s*#b0aeaa/i);
  });

  it("puts no shadow on a card or a panel", () => {
    /*
     * "Two shadows only: popover and modal. Cards and panels carry no shadow at
     * all." Structure comes from hairlines, and a shadow means the thing is
     * floating above the page.
     */
    const portal = rules.slice(rules.indexOf(".mad-portal {"));
    const shadowed = [...portal.matchAll(/box-shadow:\s*([^;]+);/g)]
      .map((m) => (m[1] ?? "").trim())
      .filter((v) => v !== "none")
      .filter((v) => !/--shadow-(popover|modal)/.test(v));

    expect(shadowed).toEqual([]);
  });

  it("holds the 12px type floor", () => {
    /*
     * "12px absolute minimum, 14px for body. No exceptions for dense tables or
     * captions." The floor is the rule most likely to be broken by somebody
     * trying to fit one more column in, and the reason given for it is not
     * aesthetic: it is set for readers over forty and for anyone wearing
     * glasses.
     */
    const tooSmall = [...rules.matchAll(/font-size:\s*([\d.]+)(rem|px)/g)]
      .map((m) => ({ raw: m[0], px: m[2] === "rem" ? Number(m[1]) * 16 : Number(m[1]) }))
      .filter((v) => v.px < 12)
      .map((v) => v.raw);

    expect(tooSmall).toEqual([]);
  });

  it("keeps a focus ring on everything, and never removes one", () => {
    expect(rules).toMatch(/\.mad-portal :focus-visible\s*{[^}]*outline:\s*2px/);
    /* `outline: none` anywhere in this sheet would take the ring away again. */
    expect(rules).not.toMatch(/outline:\s*none/);
  });
});
