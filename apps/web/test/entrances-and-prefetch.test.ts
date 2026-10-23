import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { OutcomeSlice, RoomTypesView } from "@observer/readmodels";
import { describe, expect, it } from "vitest";

import { RoomTypes } from "@/components/project/RoomTypes";
import { OutcomeMix } from "@/components/report/ReportCharts";
import { FILL_MARKS, arrived, cascade } from "@/showroom/DrawIn";

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

/* --- a rendered drawing, read as the browser would match it --------------------------- */

interface Tag {
  readonly tag: string;
  readonly classes: readonly string[];
  readonly attrs: Readonly<Record<string, string>>;
}

/** Every painted run of text in the markup, with the elements it sits in (a `<title>` is not painted). */
function paintedText(html: string): { readonly text: string; readonly within: Tag[] }[] {
  const open: Tag[] = [];
  const found: { text: string; within: Tag[] }[] = [];
  for (const m of html.matchAll(/<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>|([^<]+)/g)) {
    const [, end, name, rest = "", self, text] = m;
    if (text !== undefined) {
      if (text.trim() !== "" && !open.some((t) => t.tag === "title")) {
        found.push({ text: text.trim(), within: [...open] });
      }
    } else if (end === "/") open.pop();
    else if (self !== "/" && name !== undefined) {
      const attrs = Object.fromEntries(
        [...rest.matchAll(/([\w:-]+)="([^"]*)"/g)].map((a) => [a[1] ?? "", a[2] ?? ""]),
      );
      open.push({ tag: name.toLowerCase(), classes: (attrs.class ?? "").split(/\s+/), attrs });
    }
  }
  return found;
}

/** Whether a selector of classes, tags and `[attr="v"]`, by descendant and `>`, names the last of `chain`. */
function matches(chain: readonly Tag[], selector: string): boolean {
  const parts = selector
    .replace(/\s*>\s*/g, " > ")
    .trim()
    .split(/\s+/);
  const one = (tag: Tag | undefined, part: string): boolean => {
    if (tag === undefined) return false;
    if (part.startsWith(".")) return tag.classes.includes(part.slice(1));
    const attr = /^\[([\w-]+)=["']?([^"'\]]*)["']?\]$/.exec(part);
    return attr === null ? tag.tag === part : tag.attrs[attr[1] ?? ""] === attr[2];
  };
  const at = (p: number, c: number): boolean => {
    if (!one(chain[c], parts[p] ?? "")) return false;
    if (p === 0) return true;
    if (parts[p - 1] === ">") return at(p - 2, c - 1);
    for (let k = c - 1; k >= 0; k--) if (at(p - 1, k)) return true;
    return false;
  };
  return at(parts.length - 1, chain.length - 1);
}

/** The words a waiting `fill` would hide: painted text inside an element a mark names. */
function hiddenWhileWaiting(html: string): string[] {
  const marks = FILL_MARKS.split(",").map((s) => s.trim());
  return paintedText(html)
    .filter(({ within }) =>
      within.some((_, i) => marks.some((mark) => matches(within.slice(0, i + 1), mark))),
    )
    .map(({ text }) => text);
}

const SLICES = [
  { outcome: "interested", label: "Interested", count: 11, share: 0.34 },
  { outcome: "not_interested", label: "Not interested", count: 8, share: 0.25 },
  { outcome: "presentation_only", label: "Presentation only", count: 13, share: 0.41 },
] as const satisfies readonly OutcomeSlice[];

const share = (id: string, value: number) => ({
  id,
  opened: 10,
  share: value,
  shareDisplay: `${String(value * 100)}%`,
  change: null,
});
const type = (id: string, label: string) => ({
  id,
  label,
  rooms: 2,
  flats: 10,
  flatsDisplay: "10 flats",
  stockShare: 0.5,
  stockShareDisplay: "50%",
  sold: 4,
  reserved: 1,
  soldShare: 0.4,
  soldDisplay: "4 sold",
  soldShareDisplay: "40%",
  reservedDisplay: "1 reserved",
});
/* Only what this block draws; the readings and the comparison are other blocks'. */
const ROOMS = {
  types: [type("rooms-2", "Two rooms"), type("rooms-3", "Three rooms")],
  windows: [
    {
      id: "30d",
      label: "Last 30 days",
      name: "30 days",
      meetings: 20,
      meetingsDisplay: "20 meetings in the last 30 days",
      shares: [share("rooms-2", 0.5), share("rooms-3", 0.25)],
      changeAgainst: "Against the 30 days before",
      reading: "Two rooms are opened most.",
      trend: {
        parts: [
          { label: "1 Oct", meetings: 10 },
          { label: "15 Oct", meetings: 10 },
        ],
        series: [
          { id: "rooms-2", values: [0.4, 0.6], points: ["40%", "60%"] },
          { id: "rooms-3", values: [0.2, 0.3], points: ["20%", "30%"] },
        ],
        caption: "Each point is one 15-day part",
        empty: null,
      },
    },
  ],
  defaultWindow: "30d",
  definition: "What the block counts.",
  soldUnavailable: null,
} as unknown as RoomTypesView;

describe("the entrances (draw-in.css)", () => {
  const css = read("showroom/draw-in.css").replace(/\/\*[\s\S]*?\*\//g, "");

  it("keeps every waiting and playing frame where script runs and motion is wanted, on a screen", () => {
    const prelude =
      /@media screen and \(scripting: enabled\) and \(prefers-reduced-motion: no-preference\)\s*\{/g;
    const spans = [...css.matchAll(prelude)].map((m) => {
      const open = (m.index ?? 0) + m[0].length - 1;
      return [open, closing(css, open)] as const;
    });
    const frames = [...css.matchAll(/data-(draw|fill)="(wait|run)"/g)].map((m) => m.index ?? 0);
    expect(frames.length).toBeGreaterThanOrEqual(5);
    for (const at of frames) {
      expect(spans.some(([from, to]) => at > from && at < to)).toBe(true);
    }
  });

  it("waits on the very marks `DrawIn` observes", () => {
    const named =
      css.match(/data-draw="wait"\]\[data-kind="fill"\]\s*:is\(([\s\S]*?)\)\s*,/)?.[1] ?? "";
    const list = (s: string) => s.split(",").map((m) => m.replace(/\s+/g, " ").trim());
    expect(list(named)).toEqual(list(FILL_MARKS));
  });

  it("leaves every word of a drawing standing while its marks wait, its SVG's included", () => {
    const mix = renderToStaticMarkup(
      createElement(OutcomeMix, { slices: SLICES, id: "t", label: "How the meetings ended" }),
    );
    const rooms = renderToStaticMarkup(createElement(RoomTypes, { view: ROOMS }));
    // The drawings print words inside their SVGs: a part's count, the axis …
    expect(mix).toMatch(/<text[^>]*class="ox-mix-count"[^>]*>11</);
    expect(rooms).toMatch(/<text[^>]*class="pr-tick"[^>]*>50%</);
    // … and none of those, nor any other word, sits inside a mark.
    expect(hiddenWhileWaiting(mix)).toEqual([]);
    expect(hiddenWhileWaiting(rooms)).toEqual([]);
    // The reading does find a word inside a mark.
    expect(
      hiddenWhileWaiting(
        `<svg class="ox-mix"><g><rect class="ox-mix-part"><b>11</b></rect></g></svg>`,
      ),
    ).toEqual(["11"]);
  });

  it("lets a mark's clip go as its play ends, and ends every mark inside 1500ms", () => {
    expect(css).toMatch(
      /\[data-fill="run"\]\s*\{\s*animation: dld-fill 900ms var\(--d-ease\) backwards;/,
    );
    expect(900 + Math.max(...cascade([0, 10_000]))).toBeLessThan(1500);
  });

  it("starts marks that arrive together top to bottom, and one that arrives alone at once", () => {
    expect(cascade([300])).toEqual([0]);
    expect(cascade([140, 70, 210, 70])).toEqual([70, 0, 140, 0]);
    expect(cascade([0, 2000])).toEqual([0, 560]);
  });

  it("ends the floors inside DrawIn's PLAY_MS, so `done` never cuts one short", () => {
    const play = Number(read("showroom/DrawIn.tsx").match(/const PLAY_MS = (\d+);/)?.[1]);
    const m = css.match(/dld-floor (\d+)ms[\s\S]*?min\(var\(--i, 0\), (\d+)\) \* (\d+)ms/);
    expect(m).not.toBeNull();
    const [, duration, cap, step] = m ?? [];
    expect(Number(duration) + Number(cap) * Number(step)).toBeLessThan(play);
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
