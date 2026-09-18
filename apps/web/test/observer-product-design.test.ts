import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * THE OBSERVER PRODUCT SURFACE, ASSERTED RATHER THAN REMEMBERED.
 *
 * `packages/ui/src/observer-product.css` is the Hybrid Executive content system
 * (ADR-0034): one set of token names declared twice and applied by region,
 * `.ox-graphite` for what we conclude and `.ox-paper` for what we measured.
 * Nothing about that survives a year of edits unless the rules are executable,
 * which is the same argument `madspace-design-system.test.ts` makes for the
 * operations surface.
 *
 * ## Why the contrast numbers are computed here rather than trusted
 *
 * ADR-0034 prints a table of measured ratios. A table in a document is a claim
 * about a moment; a reviewer darkening `--ox-page` by two points would not
 * think to update it, and the quietest ink on the paper plate has only 0.30 of
 * headroom over 4.5:1. So the ratios are recomputed from the stylesheet's own
 * declared values on every run.
 *
 * The composite step matters and is easy to skip. `--ox-panel` on graphite is
 * `rgb(140 165 205 / 5%)` — a translucent lift with NO contrast of its own
 * until it is standing on the shell ground. Measuring ink against the raw token
 * would report a ratio no reader ever sees.
 *
 * ## Why the source is stripped of comments first
 *
 * Three times this repository has shipped a guard that matched the comment
 * explaining the rule rather than the code breaking it. Every scan below runs
 * on `executable()` output, and there is a self-test proving the stripper is
 * actually applied.
 */

const UI = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "packages", "ui", "src");
const SHEET = readFileSync(join(UI, "observer-product.css"), "utf8");

/**
 * The stylesheet with its reasoning removed.
 *
 * Duplicated per file rather than shared, which is this repository's stated
 * convention: a guard that imports its own stripper is a guard whose failure
 * mode is one directory away from the rule it protects.
 */
function executable(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

const CODE = executable(SHEET);

/* --- colour, measured the way a reader sees it ---------------------------- */

type Rgb = readonly [number, number, number];

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const one = luminance(a);
  const two = luminance(b);
  const high = Math.max(one, two);
  const low = Math.min(one, two);
  return (high + 0.05) / (low + 0.05);
}

/** A translucent colour standing on an opaque one, which is the only way it exists. */
function over(front: Rgb, alpha: number, back: Rgb): Rgb {
  return [
    Math.round(front[0] * alpha + back[0] * (1 - alpha)),
    Math.round(front[1] * alpha + back[1] * (1 - alpha)),
    Math.round(front[2] * alpha + back[2] * (1 - alpha)),
  ];
}

function hex(value: string): Rgb {
  const clean = value.trim().replace("#", "");
  const full =
    clean.length === 3
      ? `${clean[0] ?? ""}${clean[0] ?? ""}${clean[1] ?? ""}${clean[1] ?? ""}${clean[2] ?? ""}${clean[2] ?? ""}`
      : clean;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

/** The body of one rule, by its selector, from the executable source. */
function block(selector: string): string {
  const at = CODE.indexOf(`${selector} {`);
  expect(at, `${selector} is not declared in observer-product.css`).toBeGreaterThan(-1);
  const end = CODE.indexOf("}", at);
  return CODE.slice(at, end);
}

function token(selector: string, name: string): string {
  const found = new RegExp(`${name}:\\s*([^;]+);`).exec(block(selector));
  expect(found?.[1], `${name} is not declared on ${selector}`).toBeDefined();
  return (found?.[1] ?? "").trim();
}

const GRAPHITE = ".ox-graphite";
const PAPER = ".ox-paper";

/*
 * The two grounds a reader actually reads against.
 *
 * `--iris-ground` (#02050d) is the shell's page colour from `iris-shell.css`,
 * and the graphite panel is a 5% lift standing on it. On paper the panel is
 * opaque white and the plate beneath it is the warm page colour; the plate is
 * the tighter of the two, so it is what the floor is measured against.
 */
const GRAPHITE_PANEL = over([140, 165, 205], 0.05, hex("#02050d"));
const PAPER_PANEL = hex("#ffffff");
const PAPER_PLATE = hex("#f5f4f1");

describe("the Hybrid Executive token system", () => {
  it("strips its own reasoning before scanning, and this proves it", () => {
    /*
     * The self-test the repository asks every guard to carry. The header
     * docblock names `rgb(140 165 205 / 5%)` in prose; if `executable()` were
     * not applied, a scan for that string would find the comment.
     */
    expect(SHEET).toContain("rgb(140 165 205 / 5%)");
    expect(CODE.indexOf("a translucent lift")).toBe(-1);
  });

  it("declares exactly the same token names on both grounds", () => {
    const names = (selector: string): readonly string[] =>
      [...block(selector).matchAll(/(--ox-[a-z0-9-]+):/g)]
        .map((m) => m[1] ?? "")
        .sort((a, b) => a.localeCompare(b, "en-GB"));

    /*
     * The central claim of ADR-0034 is that one component renders correctly on
     * both grounds because every rule is written against NAMES. A name declared
     * on one ground and missing from the other is a component that renders with
     * an undefined custom property on exactly one half of the product — which
     * is the failure `charts.css` already shipped once.
     *
     * `--ox-focus` and `color-scheme` differ deliberately and are not tokens in
     * this family; the paper ground alone also fixes the user-agent scheme.
     */
    expect(names(PAPER), "the two grounds have drifted apart").toEqual(names(GRAPHITE));
  });

  it("keeps every ink above 4.5:1 on the ground it is used on", () => {
    const measured: Record<string, number> = {};

    for (const name of ["--ox-ink", "--ox-ink-2", "--ox-ink-3", "--ox-ink-4"]) {
      /*
       * `--ox-ink-2` on graphite is declared as an alpha of the primary ink
       * rather than as its own hex, because the shell's own text ramp is
       * expressed that way and a second literal would drift from it.
       */
      const raw = token(GRAPHITE, name);
      const alpha = /rgb\(([^/]+)\/\s*([\d.]+)%\)/.exec(raw);
      const colour: Rgb =
        alpha === null
          ? hex(raw)
          : over(
              (alpha[1] ?? "").trim().split(/\s+/).map(Number) as unknown as Rgb,
              Number(alpha[2] ?? "100") / 100,
              GRAPHITE_PANEL,
            );
      measured[`graphite ${name}`] = contrast(colour, GRAPHITE_PANEL);
      measured[`paper ${name}`] = contrast(hex(token(PAPER, name)), PAPER_PLATE);
    }

    for (const name of ["--ox-good", "--ox-watch", "--ox-human", "--ox-poor"]) {
      measured[`graphite ${name}`] = contrast(hex(token(GRAPHITE, name)), GRAPHITE_PANEL);
      measured[`paper ${name}`] = contrast(hex(token(PAPER, name)), PAPER_PANEL);
    }

    const failing = Object.entries(measured)
      .filter(([, ratio]) => ratio < 4.5)
      .map(([what, ratio]) => `${what} measures ${ratio.toFixed(2)}:1`);

    expect(failing, failing.join("\n")).toEqual([]);
  });

  it("never offers the brand accent as text or focus on the paper ground", () => {
    /*
     * `#00a3ff` measures 2.73:1 on white. It is the one brand value that cannot
     * survive the seam, and the dim step of the same hue is what carries focus
     * and links on paper. ADR-0033 refused to move the brand for a mockup; this
     * refuses to move it for a background.
     */
    expect(contrast(hex("#00a3ff"), PAPER_PANEL)).toBeLessThan(4.5);
    expect(token(PAPER, "--ox-focus")).toBe("var(--iris-accent-dim)");
    expect(token(GRAPHITE, "--ox-focus")).toBe("var(--iris-accent)");
    expect(contrast(hex("#0b6fae"), PAPER_PANEL)).toBeGreaterThanOrEqual(4.5);
  });

  it("resets color-scheme on the paper ground", () => {
    /*
     * `.ox-root` sets `color-scheme: dark` for the frame. Without this line the
     * user agent paints every native control, scrollbar and date picker inside
     * a paper plate as though the plate were dark. The design lab never hit it
     * because no plate there had ever contained an input; the product's first
     * paper plate contains a filter bar.
     */
    expect(block(PAPER)).toContain("color-scheme: light");
  });

  it("holds the 12px type floor", () => {
    const rems = [...CODE.matchAll(/font-size:\s*([\d.]+)rem/g)].map((m) => Number(m[1]));
    const tooSmall = rems.filter((value) => value < 0.75);
    expect(tooSmall, `font sizes below 12px: ${tooSmall.join(", ")}`).toEqual([]);
  });

  it("spends exactly one elevation, and only through its token", () => {
    /*
     * "Nothing is a card. Content sits on planes separated by hairlines"
     * (CLAUDE.md non-negotiable #10). The hairlines themselves ARE box-shadows —
     * a 1px offset with no blur, clipped by the container — so the rule cannot
     * be "no box-shadow". It is: no BLURRED shadow except the one.
     */
    const blurred = [...CODE.matchAll(/box-shadow:\s*([^;]+);/g)]
      .map((m) => (m[1] ?? "").trim())
      /*
       * Three lengths where the third is non-zero. The offset may be a bare `0`
       * rather than `0px` — the one real shadow in the sheet is written
       * `0 24px 64px`, and an earlier version of this regex required `0px` and
       * therefore found nothing at all, which is the shape of guard that passes
       * forever while protecting nothing.
       */
      .filter((value) => /(?:^|\s)(?:0|[\d.]+px)\s+[\d.]+px\s+[1-9][\d.]*px/.test(value));

    /*
     * It used to be one LITERAL, on the dialog. A menu floats for the same
     * reason a dialog does, and the moment a second surface needed the same
     * lift the rule had to say which it is: one elevation, declared once,
     * reached only by its name. A literal blurred shadow anywhere is now the
     * failure — including a second copy of this very value.
     */
    expect(blurred, `blurred shadows written as literals: ${blurred.join(" | ")}`).toEqual([]);
    expect(token(GRAPHITE, "--ox-lift")).toBe("0 24px 64px rgb(0 0 0 / 55%)");
    expect([...CODE.matchAll(/box-shadow:\s*var\(--ox-lift\)/g)].length).toBeGreaterThan(0);
  });

  it("never removes a focus indicator", () => {
    expect(CODE).not.toMatch(/outline:\s*none/);
    expect(CODE).not.toMatch(/outline:\s*0[^.]/);
    expect(CODE).toContain("outline: 2px solid var(--ox-focus)");
  });

  it("refuses to colour a proportion", () => {
    /*
     * A proportion is a quantity, not a verdict. A green bar tells a reader the
     * number is good before they have read it, and the verdict is carried by
     * the chip beside it in a word.
     */
    expect(block(".ox-track-fill")).toContain("background: var(--ox-ink-3)");
  });

  it("changes four things at once when a value is missing", () => {
    /*
     * Size, weight, colour, and a bar mark in front. Three of the four is the
     * failure the treatment exists to prevent: at three, a reader scanning a
     * column reads the absence as a small number.
     */
    const missing = block('.ox-value[data-missing="true"]');
    expect(missing, "the missing value must drop to body size").toContain(
      "font-size: var(--ox-body)",
    );
    expect(missing, "the missing value must drop to regular weight").toContain("font-weight: 400");
    expect(missing, "the missing value must drop to the quietest ink").toContain(
      "color: var(--ox-ink-4)",
    );
    expect(CODE, "the missing value must carry a mark").toContain(
      '.ox-value[data-missing="true"]::before',
    );
  });

  it("never renders a state as a colour alone", () => {
    /*
     * Roughly one man in twelve cannot separate the green from the amber, and
     * greyscale print loses both. Every tone therefore has a SHAPE as well: a
     * circle, a ring, a diamond, a triangle, a square, a bar.
     */
    for (const tone of ["good", "watch", "human", "poor", "settled", "none"]) {
      expect(CODE, `the ${tone} chip has no mark rule`).toContain(
        `.ox-chip[data-tone="${tone}"] .ox-chip-mark`,
      );
    }
    /* And a direction is a glyph as well as a hue. */
    expect(block('.ox-delta[data-direction="up"]::before')).toContain("▲");
    expect(block('.ox-delta[data-direction="down"]::before')).toContain("▼");
  });

  it("keeps the two provenance axes apart", () => {
    /*
     * `docs/04-journey.md` and packages/contracts/src/provenance.ts separate two
     * things a single badge would collapse: the TIER is how strong a claim is,
     * the SOURCE is what kind of fact it rests on. A UE event proving a legal
     * purchase is exactly the confusion the separation exists to prevent.
     */
    expect(CODE).toContain('.ox-tier[data-tier="observed_sequence"]');
    expect(CODE).toContain('.ox-tier[data-tier="attributed_conversion"]');
    expect(CODE).toContain('.ox-tier[data-tier="statistical_association"]');
    expect(CODE).toContain('.ox-src[data-source="ai_interpretation"]');

    /*
     * Observer produces no causal claim — StatementSchema refuses one and
     * validateMetric rejects it — so there must be no fourth tier to style. A
     * chip for it would be offering a state the system cannot produce.
     */
    expect(CODE, "there must be no chip for a claim the product refuses to make").not.toContain(
      "causal_claim",
    );
  });

  it("keeps to the 8 / 12 / 20 / 28 rhythm", () => {
    const rhythm = new Set(["0.5rem", "0.75rem", "1.25rem", "1.75rem", "3.5rem", "2.5rem"]);
    const declared = [
      ...block(".ox-root").matchAll(
        /--ox-(?:tight|inner|section|major|break|gutter|inset|pad):\s*([^;]+?)(?:;|\s*\/)/g,
      ),
    ]
      .map((m) => (m[1] ?? "").trim())
      .filter((value) => !rhythm.has(value));

    expect(declared, `off-rhythm spacing tokens: ${declared.join(", ")}`).toEqual([]);

    /*
     * And the scan has to be able to fail. A regex that matches nothing passes
     * this test forever, so assert it found the tokens it was looking for.
     */
    const found = [
      ...block(".ox-root").matchAll(/--ox-(tight|inner|section|major|break|gutter):/g),
    ];
    expect(found.length, "the rhythm scan matched nothing").toBe(6);
  });

  it("locks the brand", () => {
    /*
     * Manrope and #00a3ff are brand-locked by ADR-0020, and ADR-0033 refused the
     * approved artefact's own #2f97ff on the ground that the brand is not ours
     * to move. Nothing in this sheet may name a second accent or a second face.
     */
    expect(CODE).toContain("font-family: var(--font-sans)");

    /*
     * Collected and compared rather than matched with a negative lookahead. The
     * obvious `/font-family:\s*(?!var\()/` is a false negative every time: `\s*`
     * backtracks to zero characters, the lookahead then stands on a space
     * instead of on `var(`, and it reports a violation on the one correct
     * declaration in the file.
     */
    const faces = [...CODE.matchAll(/font-family:\s*([^;]+);/g)].map((m) => (m[1] ?? "").trim());
    expect(faces.length, "the typeface scan matched nothing").toBeGreaterThan(0);
    expect(
      [...new Set(faces)].filter((face) => face !== "var(--font-sans)" && face !== "inherit"),
      "a second typeface reached the product sheet",
    ).toEqual([]);

    expect(CODE).not.toContain("#2f97ff");
    expect(CODE).not.toMatch(/Inter|Anthropic Sans|fonts\.googleapis/);
  });
});
