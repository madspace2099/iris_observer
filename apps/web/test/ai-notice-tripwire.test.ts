import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * NO SURFACE REACHES A LANGUAGE MODEL WITHOUT SAYING SO FIRST.
 *
 * Gate 1 (`docs/11-preproduction-gates.md`, "The EU AI Act") blocks one moment
 * in particular: connecting a language model to a surface a customer can reach.
 * From that moment a reader has to be told they are dealing with an AI system,
 * "at the latest at the time of the first interaction", and MADSPACE decided on
 * 2026-09-17 where: at the Ask prompt box, in view before the first question is
 * sent.
 *
 * Today nothing needs it. The model path is complete, gated and tested, and it
 * is mounted on no page; the prompt box answers from read models and says on
 * screen that no language model wrote the answer. That is exactly the state in
 * which such a rule gets forgotten, because the day it starts to matter is the
 * day somebody adds one import.
 *
 * So this is a tripwire rather than a proof. It cannot judge whether a notice is
 * clear, distinguishable or accessible; a person does that, with a screenshot.
 * It can make sure the person wiring the model meets the rule before a reader
 * meets the model: any reachable file that calls the ask or voice routes, or
 * mounts the Observer panel, must itself carry an element marked
 * `data-ai-notice`, and that marker is what a reviewer greps for.
 */

const src = resolve(import.meta.dirname, "../src");

/** Where the model path may live without a reader being able to reach it. */
const UNREACHABLE = [
  /* The route handlers themselves, and the server library behind them. */
  join("app", "api"),
  "lib",
  /* The unmounted panel. Mounting it is the event this file exists to notice. */
  join("showroom", "observer"),
];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/** A call to the model's routes, or an import of the panel that makes one. */
const REACHES_THE_MODEL =
  /["'`]\/api\/ask(\/stream)?["'`]|["'`]\/api\/observer\/voice\/|from\s+["'][^"']*showroom\/observer/;

const NOTICE = "data-ai-notice";

/**
 * The code, without what is written about it.
 *
 * The prompt box's own page says in a comment that `/api/ask/stream` exists and
 * is deliberately not wired there, which is the opposite of reaching it. A line
 * comment is only taken as one after whitespace, so the `//` of a URL inside a
 * string survives.
 */
function codeOf(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

describe("the Article 50 notice cannot be forgotten at wiring time", () => {
  const reachable = sourceFiles(src).filter((path) => {
    const inside = relative(src, path);
    return !UNREACHABLE.some((prefix) => inside === prefix || inside.startsWith(prefix + sep));
  });

  it("looks at the application's own surfaces, and at enough of them to mean something", () => {
    expect(reachable.length).toBeGreaterThan(100);
    expect(reachable.some((path) => path.includes(join("components", "ask-iris")))).toBe(true);
  });

  it("finds every reachable file that touches the model carrying the notice marker", () => {
    const unannounced = reachable
      .filter((path) => REACHES_THE_MODEL.test(codeOf(path)))
      .filter((path) => !codeOf(path).includes(NOTICE))
      .map((path) => relative(src, path).split(sep).join("/"));

    expect(
      unannounced,
      "these files reach a language model and carry no `data-ai-notice` element. " +
        "Before a reader can reach a model they must be told, in view before the first question: " +
        "see docs/11-preproduction-gates.md, Gate 1, The EU AI Act",
    ).toEqual([]);
  });

  it("would notice the panel being mounted, and a route being called", () => {
    /* The pattern is the whole tripwire, so it is tested against the three shapes it has to catch. */
    expect(REACHES_THE_MODEL.test('await fetch("/api/ask/stream", { method: "POST" })')).toBe(true);
    expect(REACHES_THE_MODEL.test("void fetch('/api/observer/voice/session')")).toBe(true);
    expect(
      REACHES_THE_MODEL.test(
        'import { ObserverConsole } from "@/showroom/observer/ObserverConsole";',
      ),
    ).toBe(true);
    /* And against what it must not trip on: the prompt box's own page, which posts to itself. */
    expect(REACHES_THE_MODEL.test('<form method="get" action={`${root}/ask`}>')).toBe(false);
  });

  it("reads the code and not what is written about it", () => {
    const page = join(src, "app", "(app)", "[tenantSlug]", "[projectSlug]", "ask", "page.tsx");
    expect(readFileSync(page, "utf8"), "the comment that names the route is still there").toContain(
      "/api/ask/stream",
    );
    expect(codeOf(page)).not.toContain("/api/ask/stream");
  });
});
