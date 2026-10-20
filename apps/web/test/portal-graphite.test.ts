import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * THE SIGN-IN AND THE ROOT 404 ARE GRAPHITE (ADR-0042).
 *
 * The owner, 2026-10-19: "Everything in the system must have a dark
 * background, not white." `portal.css` drew `/sign-in` and `app/not-found.tsx`
 * on the reference build's light values; its `.mp` block now carries the
 * graphite ADR-0037 gave `/madspace`. Measured from the sheet's own values on
 * every run, the same way `observer-product-design.test.ts` measures the
 * product, with comments stripped so the reasoning cannot satisfy a scan.
 */

const SHEET = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "src", "portal", "portal.css"),
  "utf8",
);
const CODE = SHEET.replace(/\/\*[\s\S]*?\*\//g, "");

type Rgb = readonly [number, number, number];

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function contrast(a: Rgb, b: Rgb): number {
  const lum = ([r, g, b2]: Rgb) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b2);
  const [high, low] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

function hex(value: string): Rgb {
  const clean = value.trim().replace("#", "");
  return [0, 2, 4].map((at) => Number.parseInt(clean.slice(at, at + 2), 16)) as unknown as Rgb;
}

/** The `.mp {` token block, the first rule in the sheet. */
const BLOCK = CODE.slice(CODE.indexOf(".mp {"), CODE.indexOf("}", CODE.indexOf(".mp {")));

function token(name: string): string {
  const found = new RegExp(`${name}:\\s*([^;]+);`).exec(BLOCK);
  expect(found?.[1], `${name} is not declared on .mp`).toBeDefined();
  return (found?.[1] ?? "").trim();
}

describe("the portal surfaces on screen", () => {
  it("stand on the graphite ground, with a dark scheme", () => {
    expect(token("--surface-page")).toBe("#07090c");
    expect(token("--surface-card")).toBe("#0d1117");
    expect(BLOCK).toContain("color-scheme: dark");
    expect(BLOCK).toContain("background: var(--surface-page)");
  });

  it("keep every text token at 4.5:1 or better on the page and the card", () => {
    const grounds = { page: hex(token("--surface-page")), card: hex(token("--surface-card")) };
    const failing: string[] = [];
    for (const name of [
      "--ink",
      "--ink-3",
      "--ink-4",
      "--ink-5",
      "--ink-900",
      "--status-critical",
      "--status-approved",
    ]) {
      for (const [where, ground] of Object.entries(grounds)) {
        const ratio = contrast(hex(token(name)), ground);
        /* Written so a value `hex()` cannot read (NaN) fails rather than passes. */
        if (!(ratio >= 4.5)) failing.push(`${name} on the ${where} measures ${ratio.toFixed(2)}:1`);
      }
    }
    expect(failing, failing.join("\n")).toEqual([]);
    /* The link is the brand accent, 7.29:1 on the page, declared at :root. */
    expect(token("--link")).toBe("var(--iris-accent)");
  });

  it("writes the skip link in the page colour on the light ink", () => {
    const skip = CODE.slice(
      CODE.indexOf(".mp-skip {"),
      CODE.indexOf("}", CODE.indexOf(".mp-skip {")),
    );
    expect(skip).toContain("background: var(--ink)");
    expect(skip).toContain("color: var(--surface-page)");
  });

  it("fills the primary button with the brand accent, as the product does", () => {
    const at = CODE.indexOf(".mp-btn {");
    const button = CODE.slice(at, CODE.indexOf("}", at));
    expect(button).toContain("background: var(--iris-accent)");
    expect(button).toContain("color: #04121c");
    expect(contrast(hex("#04121c"), hex("#00a3ff"))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the global error page", () => {
  /*
   * Without `app/global-error.tsx` an error no nearer boundary catches reaches
   * Next's built-in page, white on a light-mode system. It renders its own
   * document, so it must bring the ground with it.
   */
  const PAGE = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "src", "app", "global-error.tsx"),
    "utf8",
  );

  it("draws its own document on the portal's graphite", () => {
    expect(PAGE).toContain("<html");
    expect(PAGE).toContain('className="mp"');
    expect(PAGE).toContain('import "@observer/ui/components.css"');
    expect(PAGE).toContain('import "@/portal/portal.css"');
  });
});
