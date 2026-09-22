import { describe, expect, it } from "vitest";
import { shareDisplay } from "../src/format";

/**
 * A share as the reader sees it.
 *
 * The project page rounded three shares itself — `Math.round(x * 100)%` —
 * without the project's locale and without the one guard a rounding needs:
 * a share that rounds away to nothing but is not nothing must not print as
 * "0%", which reads as absence. The read model formats them now, through this
 * one function. One measured assertion per test.
 */
describe("shareDisplay", () => {
  it("prints a share as a whole percent in the locale", () => {
    expect(shareDisplay(0.27, "en-GB")).toBe("27%");
  });

  it("prints a share that rounds away but is not nothing as under one percent", () => {
    expect(shareDisplay(0.004, "en-GB"), "0.4% of the time printed as no time at all").toBe("<1%");
  });

  it("prints nothing as nothing", () => {
    /* Guards the guard: a floor that lifted every zero would pass the test above. */
    expect(shareDisplay(0, "en-GB")).toBe("0%");
  });

  it("keeps the locale's own percent form under the guard", () => {
    expect(shareDisplay(0.004, "de-DE")).toBe(
      `<${new Intl.NumberFormat("de-DE", { style: "percent" }).format(0.01)}`,
    );
  });
});
