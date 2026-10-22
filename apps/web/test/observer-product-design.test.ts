import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * THE OBSERVER PRODUCT SURFACE, ASSERTED RATHER THAN REMEMBERED.
 *
 * `packages/ui/src/observer-product.css` is the Hybrid Executive content system
 * (ADR-0034): one set of token names declared twice, `.ox-graphite` and
 * `.ox-paper`. ADR-0034 applied paper to measured regions on screen; ADR-0042
 * (the owner, 2026-10-19: "Everything in the system must have a dark
 * background, not white") keeps the paper values for print only, so every
 * paper check below describes the printed page, and one test guards that the
 * screen never reaches them.
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

/** The sheet as a screen reads it: every `@media print` block cut out, braces balanced. */
function screenOnly(code: string): string {
  let out = "";
  let at = 0;
  for (;;) {
    const start = code.indexOf("@media print", at);
    if (start === -1) return out + code.slice(at);
    out += code.slice(at, start);
    let depth = 0;
    let i = code.indexOf("{", start);
    for (; i < code.length; i += 1) {
      if (code[i] === "{") depth += 1;
      else if (code[i] === "}" && --depth === 0) break;
    }
    at = i + 1;
  }
}

const SCREEN = screenOnly(CODE);

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

/** A token as a reader sees it: an `rgb(r g b / a%)` lift composited on what is beneath. */
function paint(value: string, back: Rgb): Rgb {
  const alpha = /rgb\(([^/]+)\/\s*([\d.]+)%\)/.exec(value);
  return alpha === null
    ? hex(value)
    : over(
        (alpha[1] ?? "").trim().split(/\s+/).map(Number) as unknown as Rgb,
        Number(alpha[2] ?? "100") / 100,
        back,
      );
}

/*
 * The two grounds a reader actually reads against.
 *
 * `--iris-ground` is the shell's page colour, read from `iris-shell.css`, and
 * the graphite panel is the sheet's own `--ox-panel` lift standing on it. Both
 * come from the sheets, so a light value written into either fails here. On
 * paper the panel is opaque white and the plate beneath it is the warm page
 * colour; the plate is the tighter of the two, so it is what the floor is
 * measured against.
 */
const SHELL = executable(readFileSync(join(UI, "iris-shell.css"), "utf8"));
const IRIS_GROUND = hex(/--iris-ground:\s*([^;]+);/.exec(SHELL)?.[1] ?? "");
const graphitePanel = (): Rgb => paint(token(GRAPHITE, "--ox-panel"), IRIS_GROUND);
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
    const panel = graphitePanel();

    for (const name of ["--ox-ink", "--ox-ink-2", "--ox-ink-3", "--ox-ink-4"]) {
      /*
       * `--ox-ink-2` on graphite is declared as an alpha of the primary ink
       * rather than as its own hex, because the shell's own text ramp is
       * expressed that way and a second literal would drift from it.
       */
      measured[`screen ${name}`] = contrast(paint(token(GRAPHITE, name), panel), panel);
      measured[`print ${name}`] = contrast(hex(token(PAPER, name)), PAPER_PLATE);
    }

    for (const name of ["--ox-good", "--ox-watch", "--ox-human", "--ox-poor"]) {
      measured[`screen ${name}`] = contrast(hex(token(GRAPHITE, name)), panel);
      measured[`print ${name}`] = contrast(hex(token(PAPER, name)), PAPER_PANEL);
    }

    /* `!(>=)` so a value the parser cannot read (NaN) fails rather than passes. */
    const failing = Object.entries(measured)
      .filter(([, ratio]) => !(ratio >= 4.5))
      .map(([what, ratio]) => `${what} measures ${ratio.toFixed(2)}:1`);

    expect(failing, failing.join("\n")).toEqual([]);
  });

  it("never offers the brand accent as text or focus on the printed page", () => {
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

  it("resets color-scheme on the printed page", () => {
    /*
     * `.ox-root` sets `color-scheme: dark` for the frame. Without this line the
     * user agent paints every native control inside a printed plate as though
     * the plate were dark. On screen the plate is graphite and the frame's
     * `dark` is the right answer, which the next test holds.
     */
    expect(block(PAPER)).toContain("color-scheme: light");
  });

  it("keeps every on-screen surface dark: paper exists only in print (ADR-0042)", () => {
    /*
     * The owner, 2026-10-19: "Everything in the system must have a dark
     * background, not white." The paper values survive for the printer alone.
     * Measured on the sheet a screen reads, with every `@media print` cut out.
     */
    expect(CODE, "the print cut must have something to cut").toContain("@media print");
    expect(SCREEN).not.toContain("@media print");

    /* The paper block is inside print, and so is every light scheme. */
    expect(SCREEN, "a paper token reached the screen").not.toMatch(/--ox-ink:\s*#14161a/);
    expect(SCREEN, "a light scheme reached the screen").not.toMatch(/color-scheme:\s*light/);

    /*
     * On screen the grounds are declared once, by graphite. A second
     * declaration of a ground token is a second ground.
     */
    for (const name of ["--ox-page", "--ox-panel", "--ox-panel-2"]) {
      const declared = [...SCREEN.matchAll(new RegExp(`${name}:\\s*([^;]+);`, "g"))].map((m) =>
        (m[1] ?? "").trim(),
      );
      expect(declared, `${name} on screen`).toEqual([token(GRAPHITE, name)]);
    }

    /*
     * The only screen rule naming `.ox-paper` is the chart bridge, which it
     * shares with `.ox-graphite` and which declares nothing but names pointing
     * at the `--ox-` tokens around it.
     */
    const rules = [...SCREEN.matchAll(/([^{}]*\.ox-paper[^{}]*)\{/g)].map((m) =>
      (m[1] ?? "").replace(/\s+/g, " ").trim(),
    );
    expect(rules).toEqual([".ox-graphite, .ox-paper"]);

    /*
     * A plate is painted with `--ox-page`, which on graphite is `transparent`:
     * the shell's own near-black shows through. Every graphite fill a plate's
     * children paint, composited on that near-black as read from the sheets,
     * is still dark; a light value in either sheet fails here.
     */
    expect(block(".ox-plate")).toContain("background: var(--ox-page)");
    expect(token(GRAPHITE, "--ox-page")).toBe("transparent");
    expect(luminance(IRIS_GROUND), "the shell ground").toBeLessThan(0.02);
    for (const name of ["--ox-panel", "--ox-panel-2", "--ox-inset-fill"]) {
      expect(luminance(paint(token(GRAPHITE, name), IRIS_GROUND)), name).toBeLessThan(0.02);
    }
  });

  it("prints the whole report on paper, the shell around it included", () => {
    /*
     * A printed report keeps the context band (the period it covers) and its
     * planes, which name `--ox-ink` and the rest. Before ADR-0042 the print
     * block set `#111` on two containers and every child that names a token
     * printed graphite ink on white. The paper tokens are declared on the
     * shell holding a report, so everything under it reads paper ink.
     */
    const print = CODE.slice(CODE.indexOf("@media print"));
    expect(print).toMatch(/\.ox-root:has\(\.ox-report\),\s*\.ox-paper\s*\{\s*--ox-ink:\s*#14161a/);
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
    /*
     * The source is no chip here since ADR-0052's second round: every screen
     * prints the showroom's one source line, whose sheet keeps the one source
     * a reader must not miss — a model's wording — in its own colour.
     */
    expect(readFileSync(join(UI, "showroom.css"), "utf8")).toContain(
      '.iris-src[data-src="AI_INTERPRETATION"]',
    );

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

/*
 * A NATIVE SELECT OPENS ON AN OPAQUE GROUND (the owner, 2026-10-20).
 *
 * Chrome on Windows paints a select's open list from the select's own
 * background. A translucent one — `--ox-panel` is a 5% lift — is painted over
 * white, and the light ink of the options vanished into it: the export dialog's
 * format list read as blank rows. So every class a `<select>` wears in the
 * application must end its cascade on an opaque background, resolved through
 * the tokens it names. The classes are read from the components, not listed
 * here, so a new select with a new class is checked the day it appears.
 */
describe("every select style declares an opaque background", () => {
  const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? files(join(dir, entry.name))
        : entry.name.endsWith(".tsx")
          ? [join(dir, entry.name)]
          : [],
    );
  const classes = new Set(
    files(SRC).flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/<select\b[^>]*?className="([^"]+)"/g)].flatMap((m) =>
        (m[1] ?? "").split(/\s+/),
      ),
    ),
  );
  const ALL = readdirSync(UI)
    .filter((name) => name.endsWith(".css"))
    .sort()
    .map((name) => screenOnly(executable(readFileSync(join(UI, name), "utf8"))))
    .join("\n");

  /* Every value a custom property is declared with, anywhere a screen reads it. */
  const declared = (name: string): string[] =>
    [...ALL.matchAll(new RegExp(`${name}:\\s*([^;]+);`, "g"))].map((m) => (m[1] ?? "").trim());

  const opaque = (value: string, depth = 0): boolean => {
    const reference = /^var\((--[\w-]+)\)$/.exec(value);
    if (reference !== null) {
      const values = declared(reference[1] ?? "");
      return depth < 8 && values.length > 0 && values.every((each) => opaque(each, depth + 1));
    }
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) return true;
    return /^rgb\(\s*[\d.]+\s+[\d.]+\s+[\d.]+\s*\)$/.test(value);
  };

  it("finds the selects it is about to check", () => {
    expect([...classes]).toEqual(
      expect.arrayContaining(["mad-filter-select", "mad-input", "ox-select"]),
    );
  });

  it.each([...classes].sort())(".%s ends its cascade on an opaque background", (name) => {
    const backgrounds = [...ALL.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((rule) =>
        (rule[1] ?? "")
          .split(",")
          .map((selector) => selector.trim())
          .includes(`.${name}`),
      )
      .flatMap((rule) =>
        [...(rule[2] ?? "").matchAll(/background(?:-color)?:\s*([^;]+);/g)].map((m) =>
          (m[1] ?? "").trim(),
        ),
      );
    expect(backgrounds.length, `.${name} declares no background`).toBeGreaterThan(0);
    const last = backgrounds[backgrounds.length - 1] ?? "";
    expect(opaque(last), `.${name} ends on ${last}`).toBe(true);
  });

  it("gives the options the same opaque ground as their select", () => {
    expect(CODE).toMatch(
      /\.ox-select,\s*\.ox-select option,\s*\.ox-select optgroup\s*\{[^}]*background-color:\s*var\(--ox-field-solid\)/,
    );
    expect(opaque(token(GRAPHITE, "--ox-field-solid"))).toBe(true);
  });
});

/*
 * THE PDF KEEPS THE DATA DRAWN AS BACKGROUNDS (ADR-0045).
 *
 * Chrome's "Save as PDF" starts with background graphics off, and the ladder's
 * bars and the status chips' marks are backgrounds. The report's print rules
 * ask for those exactly, and only on paper.
 */
describe("the printed report keeps its bars and status marks", () => {
  it("asks for them to be printed exactly, in the print rules only", () => {
    expect(CODE).toMatch(
      /\.ox-report \.ox-stage-bar,\s*\.ox-report \.ox-stage-fill,\s*\.ox-report \.ox-chip-mark\s*\{[^}]*\bprint-color-adjust:\s*exact/,
    );
    expect(screenOnly(CODE)).not.toContain("print-color-adjust");
  });
});
