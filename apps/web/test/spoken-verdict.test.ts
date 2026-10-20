import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SpokenVerdict } from "@/components/iris/SpokenVerdict";

/**
 * THE VERDICT IS SAID ONCE, BY IRIS, FROM THE SERVER (ADR-0048).
 *
 * The sentence types itself in, but the server writes all of it: the heading's
 * name is the sentence once, its text is the sentence once, reduced motion and
 * print switch every animation off, and the label prints the count it is given.
 */
const SENTENCE =
  "Meetings are holding up and progressing well: 66 meetings this month against 65 last month, first 24 days, and 54% of recorded meetings progressed, against 53% before.";

const render = (meetings: number) =>
  renderToStaticMarkup(
    createElement(SpokenVerdict, { sentence: SENTENCE, meetings, locale: "en-GB" }),
  );

const escaped = (text: string) => text.replaceAll("&", "&amp;").replaceAll('"', "&quot;");

describe("SpokenVerdict", () => {
  it("names the heading with the whole sentence, once", () => {
    const html = render(712);
    expect(html.split(`aria-label="${escaped(SENTENCE)}"`)).toHaveLength(2);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
  });

  it("writes every character on the server, hidden from the accessibility tree, and the sentence once", () => {
    const html = render(712);
    const h1 = /<h1[^>]*>(.*?)<\/h1>/s.exec(html)?.[1] ?? "";
    expect(h1.startsWith('<span aria-hidden="true">')).toBe(true);
    const text = h1.replace(/<[^>]+>/g, "").replaceAll("&amp;", "&");
    expect(text).toBe(SENTENCE);
    expect(h1.match(/class="iris-spoken-ch"/g)).toHaveLength(Array.from(SENTENCE).length);
  });

  it("types the sentence inside two and a half seconds", () => {
    const html = render(712);
    const total = Number(/--sv-total:(\d+)ms/.exec(html)?.[1]);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(2500);
  });

  it("prints the count it is given, never a model's name", () => {
    expect(render(712)).toContain("· read from 712 meetings");
    expect(render(1520)).toContain("· read from 1,520 meetings");
    expect(render(1)).toContain("· read from 1 meeting<");
    expect(render(712)).not.toMatch(/\bAI\b|GPT|model/i);
  });

  it("keeps the mark out of the accessibility tree", () => {
    expect(render(712)).toMatch(/<svg class="iris-spoken-mark"[^>]*aria-hidden="true"/);
  });
});

describe("the spoken verdict's motion", () => {
  /* Comments out first, so a guard cannot match the prose explaining the rule. */
  const SHEET = readFileSync(
    join(import.meta.dirname, "../../../packages/ui/src/iris.css"),
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\//g, "");
  const block = /@media \(prefers-reduced-motion: reduce\), print \{([^@]*?)\n\}/.exec(SHEET)?.[1];

  it("stops under reduced motion and in print", () => {
    expect(block).toBeDefined();
    expect(block).toContain("animation: none;");
    for (const selector of [
      ".iris-spoken-ch,",
      ".iris-spoken-ch::after,",
      ".iris-spoken-ch:last-child::after,",
      ".iris-spoken-scan,",
      ".iris-spoken-ping,",
      ".iris-spoken-voice,",
      ".iris-spoken-mark .iris-spoken-level,",
      ".iris-spoken-idle,",
      ".iris-spoken-breath {",
    ]) {
      expect(block).toContain(selector);
    }
  });

  it("animates every animated rule it names, and nothing it does not stop", () => {
    const animated = [...SHEET.matchAll(/\n(\.iris-spoken[^{]*)\{[^}]*\banimation:/g)].map((m) =>
      (m[1] ?? "").trim(),
    );
    expect(animated.length).toBeGreaterThan(0);
    for (const selector of animated) expect(block).toContain(selector);
  });
});
