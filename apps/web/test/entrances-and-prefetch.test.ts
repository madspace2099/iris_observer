import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { arrived } from "@/showroom/DrawIn";

/**
 * ADR-0062: the charts draw in as they scroll into view, and the in-content
 * links that fan out send no viewport prefetch.
 */
const SRC = join(__dirname, "../src");
const read = (path: string) => readFileSync(join(SRC, path), "utf8");

/** The source from `open` (the index of a `{`) to its matching `}`, braces respected. */
function closing(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return i;
  }
  return -1;
}

describe("the entrances (draw-in.css)", () => {
  const css = read("showroom/draw-in.css").replace(/\/\*[\s\S]*?\*\//g, "");

  it("keeps every waiting and playing frame where script runs and motion is wanted, on a screen", () => {
    const prelude =
      /@media screen and \(scripting: enabled\) and \(prefers-reduced-motion: no-preference\)\s*\{/g;
    const spans = [...css.matchAll(prelude)].map((m) => {
      const open = (m.index ?? 0) + m[0].length - 1;
      return [open, closing(css, open)] as const;
    });
    const frames = [...css.matchAll(/data-draw="(wait|run)"/g)].map((m) => m.index ?? 0);
    expect(frames.length).toBeGreaterThanOrEqual(4);
    for (const at of frames) {
      expect(spans.some(([from, to]) => at > from && at < to)).toBe(true);
    }
  });

  it("hides only marks while `fill` waits, never a block's words", () => {
    const marks =
      css.match(/data-draw="wait"\]\[data-kind="fill"\]\s*:is\(([\s\S]*?)\)\s*\{/)?.[1] ?? "";
    const list = marks.split(",").map((m) => m.trim());
    expect(list.length).toBeGreaterThan(5);
    for (const mark of list) expect(mark).not.toMatch(/^(p|b|small|span|h\d|dt|dd)\b/);
  });

  it("ends every new entry inside DrawIn's PLAY_MS, so `done` never cuts one short", () => {
    const play = Number(read("showroom/DrawIn.tsx").match(/const PLAY_MS = (\d+);/)?.[1]);
    for (const name of ["dld-fill", "dld-floor"]) {
      const m = css.match(
        new RegExp(`${name} (\\d+)ms[\\s\\S]*?min\\(var\\(--i, 0\\), (\\d+)\\) \\* (\\d+)ms`),
      );
      expect(m, name).not.toBeNull();
      const [, duration, cap, step] = m ?? [];
      expect(Number(duration) + Number(cap) * Number(step)).toBeLessThan(play);
    }
  });

  it("starts a drawing at a fifth of itself, or at a fifth of the view when it is taller", () => {
    const view = { height: 800 } as DOMRectReadOnly;
    const entry = (ratio: number, visible: number, isIntersecting = true) => ({
      isIntersecting,
      intersectionRatio: ratio,
      intersectionRect: { height: visible } as DOMRectReadOnly,
      rootBounds: view,
    });
    // A 400px drawing: a fifth of it is 80px, as before.
    expect(arrived(entry(0.1, 40), 800)).toBe(false);
    expect(arrived(entry(0.1999, 80), 800)).toBe(true);
    // A 2000px timeline: 10% of it is 200px, a quarter of the view — it has arrived.
    expect(arrived(entry(0.05, 100), 800)).toBe(false);
    expect(arrived(entry(0.1, 200), 800)).toBe(true);
    // A drawing six views tall never shows a fifth of itself; it still arrives.
    expect(arrived(entry(0.05, 240), 800)).toBe(true);
    expect(arrived(entry(0.5, 400, false), 800)).toBe(false);
  });

  it("names both new kinds in DrawIn's own type", () => {
    expect(read("showroom/DrawIn.tsx")).toMatch(/export type DrawKind =[^;]*"fill"[^;]*"floors"/);
  });
});

/** Each `<Link …>` opening tag in a source file, braces respected. */
function linkTags(source: string): string[] {
  const tags: string[] = [];
  let at = source.indexOf("<Link");
  while (at !== -1) {
    let depth = 0;
    let i = at;
    for (; i < source.length; i++) {
      const c = source[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    tags.push(source.slice(at, i + 1));
    at = source.indexOf("<Link", i);
  }
  return tags;
}

describe("no viewport prefetch on links that fan out", () => {
  /* Files in which every link is a row, a cell, a chip, a finding or a chart's. */
  const FILES = [
    "components/product/StackPlan.tsx",
    "components/product/Finding.tsx",
    "components/product/Attention.tsx",
    "components/product/Provenance.tsx",
    "components/units/UnitPatterns.tsx",
    "components/units/DemandAttention.tsx",
    "components/attention/StateList.tsx",
    "components/attention/ChecksRegister.tsx",
    "components/features/Pairings.tsx",
    "components/project/RoomCompare.tsx",
    "app/(app)/[tenantSlug]/[projectSlug]/audience/page.tsx",
  ];

  it.each(FILES)("%s", (file) => {
    const tags = linkTags(read(file));
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) expect(tag).toContain("prefetch={false}");
  });

  it("the meetings register's rows and the units in them", () => {
    const tags = linkTags(read("components/meetings/MeetingRegister.tsx"));
    expect(tags.filter((t) => t.includes("prefetch={false}"))).toHaveLength(2);
  });
});
