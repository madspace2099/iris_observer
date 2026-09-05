import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { withCurrentSection } from "../src/components/iris/Shell";
import type { SwitchOption } from "../src/components/ContextSwitcher";

/**
 * THE PROJECT SWITCHER KEEPS THE READER ON THE SAME SECTION.
 *
 * Every option a server layout hands to `ContextSwitcher` is baked to
 * `/${tenant}/${project}/ask` — it has no way to know which page is actually
 * rendering it. `withCurrentSection` is where the real section is substituted
 * back in before the options ever reach the switcher's own `<select>`.
 */
const ASK_OPTION: SwitchOption = { value: "northgate", label: "Northgate", href: "/alpha/northgate/ask" };
const ISTER_OPTION: SwitchOption = { value: "ister-tower", label: "ISTER TOWER", href: "/alpha/ister-tower/ask" };

describe("withCurrentSection", () => {
  it("leaves every option untouched on the home segment itself", () => {
    expect(withCurrentSection([ASK_OPTION, ISTER_OPTION], "ask")).toEqual([ASK_OPTION, ISTER_OPTION]);
  });

  it("leaves every option untouched for an empty segment", () => {
    expect(withCurrentSection([ASK_OPTION, ISTER_OPTION], "")).toEqual([ASK_OPTION, ISTER_OPTION]);
  });

  it("swaps the baked-in /ask suffix for the section actually being read", () => {
    expect(withCurrentSection([ASK_OPTION, ISTER_OPTION], "flow")).toEqual([
      { ...ASK_OPTION, href: "/alpha/northgate/flow" },
      { ...ISTER_OPTION, href: "/alpha/ister-tower/flow" },
    ]);
  });

  it("keeps only the section, dropping a drill-down id the target project may not share", () => {
    // A reader on /alpha/northgate/units/A-402 switching to ISTER TOWER lands
    // on ISTER TOWER's /units, never on a unit code that belongs to Northgate.
    const withUnit: SwitchOption = { ...ASK_OPTION, href: "/alpha/northgate/ask" };
    expect(withCurrentSection([withUnit], "units")).toEqual([
      { ...withUnit, href: "/alpha/northgate/units" },
    ]);
  });

  it("leaves an option alone if it never ended in the home segment to begin with", () => {
    const odd: SwitchOption = { value: "x", label: "X", href: "/alpha/x/something-else" };
    expect(withCurrentSection([odd], "flow")).toEqual([odd]);
  });
});

/**
 * ASK IRIS'S COMPARE SCOPE AND THE NAVIGATION PROJECT ARE RELATED BUT NOT
 * THE SAME STATE.
 *
 * `withCurrentSection` takes a plain segment string and an options array —
 * nothing from Ask IRIS's own scope (`?scope=compare&with=...`) can reach it,
 * because `Shell` is a layout and a layout is never handed `searchParams` at
 * all (its own `ShellScope` prop is the current TENANT/PROJECT, an unrelated
 * and older use of the same word). This pins the actual guarantee — `Shell`'s
 * own props never include `searchParams` — as a source fact, so a reader who
 * compared two projects in Ask never finds the navigation itself quietly
 * pointed at one of them after switching to Sales Flow.
 */
describe("the navigation project is independent of Ask IRIS's own scope", () => {
  it("is never handed searchParams — a layout, not a page, decides the switcher's options", () => {
    const shell = readFileSync(
      join(import.meta.dirname, "../src/components/iris/Shell.tsx"),
      "utf8",
    );
    expect(shell).toMatch(/A layout does not receive `searchParams`/);
    const props = shell.slice(shell.indexOf("export function Shell("));
    expect(props).not.toMatch(/searchParams/);
  });
});
