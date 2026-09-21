import { describe, expect, it } from "vitest";

import {
  askLink,
  findAmbiguousComparison,
  parseAskScope,
  scopeLabel,
  scopeUnavailableNotice,
  type AskScopeProject,
} from "../src/components/ask-iris/AskScreen";

/**
 * WHICH PROJECT(S) A QUESTION IS ASKED AGAINST.
 *
 * These are pure functions, tested directly rather than through a rendered
 * page, because the behaviour the mandate cares about — never silently
 * guessing, never naming a project this account was not given, resolving
 * natural language without the reader touching the selector first — lives
 * entirely in them. `AskScreen.tsx`'s JSX only draws whatever they return.
 */

const NORTHGATE: AskScopeProject = { slug: "northgate", name: "Northgate Residences" };
const RIVERSIDE: AskScopeProject = { slug: "riverside", name: "Riverside Walk" };
const OTHERS = [NORTHGATE, RIVERSIDE];

const ISTER_SLUG = "ister-tower";
const ISTER_LABEL = "ISTER TOWER";

describe("parseAskScope", () => {
  it("defaults to current for an absent or unrecognised scope value", () => {
    expect(parseAskScope(undefined, undefined)).toEqual({ kind: "current" });
    expect(parseAskScope("bogus", undefined)).toEqual({ kind: "current" });
  });

  it("parses all regardless of a with value alongside it", () => {
    expect(parseAskScope("all", "northgate")).toEqual({ kind: "all" });
  });

  it("parses compare with no with value as an empty selection, not current", () => {
    expect(parseAskScope("compare", undefined)).toEqual({ kind: "compare", slugs: [] });
  });

  it("parses a single repeated with value as a one-element array", () => {
    expect(parseAskScope("compare", "northgate")).toEqual({
      kind: "compare",
      slugs: ["northgate"],
    });
  });

  it("parses several repeated with values, in the order submitted", () => {
    expect(parseAskScope("compare", ["ister-tower", "northgate", "riverside"])).toEqual({
      kind: "compare",
      slugs: ["ister-tower", "northgate", "riverside"],
    });
  });
});

describe("scopeLabel", () => {
  it("names the current project by its own label", () => {
    expect(scopeLabel({ kind: "current" }, ISTER_SLUG, ISTER_LABEL, OTHERS)).toBe(ISTER_LABEL);
  });

  it("names All projects plainly", () => {
    expect(scopeLabel({ kind: "all" }, ISTER_SLUG, ISTER_LABEL, OTHERS)).toBe("All projects");
  });

  it("prompts to choose before anything is checked", () => {
    const scope = { kind: "compare" as const, slugs: [] };
    expect(scopeLabel(scope, ISTER_SLUG, ISTER_LABEL, OTHERS)).toBe("Compare projects");
  });

  it("joins exactly two short names with a plus sign", () => {
    const shortA: AskScopeProject = { slug: "a", name: "Alpha" };
    const shortB: AskScopeProject = { slug: "b", name: "Beta" };
    const scope = { kind: "compare" as const, slugs: ["a", "b"] };
    expect(scopeLabel(scope, "current", "Current", [shortA, shortB])).toBe("Alpha + Beta");
  });

  it("falls back to a count once two names would not fit the pill", () => {
    const scope = { kind: "compare" as const, slugs: [ISTER_SLUG, "northgate"] };
    // "ISTER TOWER + Northgate Residences" truncates to "ISTER TOWER +…" in a
    // fixed-width pill, which names nothing a plain count does not.
    expect(scopeLabel(scope, ISTER_SLUG, ISTER_LABEL, OTHERS)).toBe("2 projects");
  });

  it("uses a count for three or more, never three names strung together", () => {
    const scope = { kind: "compare" as const, slugs: [ISTER_SLUG, "northgate", "riverside"] };
    expect(scopeLabel(scope, ISTER_SLUG, ISTER_LABEL, OTHERS)).toBe("3 projects");
  });

  it("never names a slug this account was not granted", () => {
    const scope = { kind: "compare" as const, slugs: [ISTER_SLUG, "not-a-real-project"] };
    // One authorised name plus one unmatched slug reads as "one project
    // checked", not as a phantom second name.
    expect(scopeLabel(scope, ISTER_SLUG, ISTER_LABEL, OTHERS)).toBe(ISTER_LABEL);
  });
});

describe("scopeUnavailableNotice", () => {
  it("is null for current — findAnswer is free to try", () => {
    expect(scopeUnavailableNotice({ kind: "current" }, ISTER_SLUG, ISTER_LABEL, OTHERS)).toBeNull();
  });

  it("states the honest limit for All, and names the current project", () => {
    const notice = scopeUnavailableNotice({ kind: "all" }, ISTER_SLUG, ISTER_LABEL, OTHERS);
    expect(notice).toContain(ISTER_LABEL);
    expect(notice).toMatch(/one project at a time/i);
  });

  it("asks for a second project before refusing anything, when only one is checked", () => {
    const scope = { kind: "compare" as const, slugs: [ISTER_SLUG] };
    expect(scopeUnavailableNotice(scope, ISTER_SLUG, ISTER_LABEL, OTHERS)).toMatch(
      /at least one more/i,
    );
  });

  it("names every authorised project being compared, in its own refusal", () => {
    const scope = { kind: "compare" as const, slugs: [ISTER_SLUG, "northgate", "riverside"] };
    const notice = scopeUnavailableNotice(scope, ISTER_SLUG, ISTER_LABEL, OTHERS);
    expect(notice).toContain(ISTER_LABEL);
    expect(notice).toContain("Northgate Residences");
    expect(notice).toContain("Riverside Walk");
  });

  it("compares two OTHER projects, neither of them the one on screen", () => {
    // A reader at ISTER TOWER's own Ask IRIS may still ask to compare two
    // projects that are not this one — the refusal names the pair being
    // compared (Northgate and Riverside), not ISTER TOWER as a third.
    const scope = { kind: "compare" as const, slugs: ["northgate", "riverside"] };
    const notice = scopeUnavailableNotice(scope, ISTER_SLUG, ISTER_LABEL, OTHERS);
    expect(notice).toContain("Northgate Residences");
    expect(notice).toContain("Riverside Walk");
  });

  it("never lets an unauthorised slug count toward the two needed to compare", () => {
    const scope = { kind: "compare" as const, slugs: [ISTER_SLUG, "not-a-real-project"] };
    // Only one AUTHORISED name in the set — this must read as "choose one
    // more", not as a comparison silently run against a slug nobody granted.
    expect(scopeUnavailableNotice(scope, ISTER_SLUG, ISTER_LABEL, OTHERS)).toMatch(
      /at least one more/i,
    );
  });
});

describe("findAmbiguousComparison — natural language override", () => {
  it("is null outside current scope — All and Compare already state their own limit", () => {
    expect(
      findAmbiguousComparison("Compare with Northgate", { kind: "all" }, ISTER_SLUG, OTHERS),
    ).toBeNull();
  });

  it("is null for an ordinary question naming no other project", () => {
    // The mandate's own non-ambiguous case: a plain question, answered
    // against whatever the current scope already is, never flagged.
    expect(
      findAmbiguousComparison(
        "How are two-bedroom apartments selling?",
        { kind: "current" },
        ISTER_SLUG,
        OTHERS,
      ),
    ).toBeNull();
  });

  it("is null for compare-language naming no held project", () => {
    expect(
      findAmbiguousComparison(
        "Compare this quarter with last quarter",
        { kind: "current" },
        ISTER_SLUG,
        OTHERS,
      ),
    ).toBeNull();
  });

  it("catches a project named by its first word alone", () => {
    // The mandate's own example: "Compare ISTER TOWER with Northgate" names
    // Northgate Residences by its first word only.
    const found = findAmbiguousComparison(
      "Compare ISTER TOWER with Northgate",
      { kind: "current" },
      ISTER_SLUG,
      OTHERS,
    );
    expect(found?.otherNames).toEqual(["Northgate Residences"]);
    expect(found?.slugs).toEqual([ISTER_SLUG, "northgate"]);
  });

  it("catches vs and versus the same way it catches compare", () => {
    expect(
      findAmbiguousComparison("Northgate vs Riverside", { kind: "current" }, ISTER_SLUG, OTHERS)
        ?.otherNames,
    ).toEqual(["Northgate Residences", "Riverside Walk"]);
    expect(
      findAmbiguousComparison("Northgate versus Riverside", { kind: "current" }, ISTER_SLUG, OTHERS)
        ?.otherNames,
    ).toEqual(["Northgate Residences", "Riverside Walk"]);
  });

  it("collects every named project, not only the first", () => {
    const found = findAmbiguousComparison(
      "Compare Northgate, Riverside and this project",
      { kind: "current" },
      ISTER_SLUG,
      OTHERS,
    );
    expect(found?.otherNames).toEqual(["Northgate Residences", "Riverside Walk"]);
    expect(found?.slugs).toEqual([ISTER_SLUG, "northgate", "riverside"]);
  });

  it("never treats a project's short first word as a whole-word match", () => {
    // A first word under four letters is too common to trust as a standalone
    // match — "At", "In", "Of" — so a project named "At Northgate" is only
    // ever caught by its FULL name, never by "at" appearing anywhere in an
    // ordinary sentence like the one below ("...flat rate" contains "at").
    const short: AskScopeProject = { slug: "at", name: "At Northgate" };
    expect(
      findAmbiguousComparison("Compare the flat rate", { kind: "current" }, ISTER_SLUG, [short]),
    ).toBeNull();
  });
});

describe("askLink — repeatable query parameters", () => {
  it("sets a single string value once", () => {
    expect(askLink("/alpha/ister-tower", "", { scope: "all" })).toBe(
      "/alpha/ister-tower/ask?scope=all",
    );
  });

  it("repeats an array value as one query parameter per entry, in order", () => {
    const href = askLink("/alpha/ister-tower", "", {
      scope: "compare",
      with: ["ister-tower", "northgate"],
    });
    const url = new URL(href, "https://observer.example");
    expect(url.searchParams.getAll("with")).toEqual(["ister-tower", "northgate"]);
    expect(url.searchParams.get("scope")).toBe("compare");
  });

  it("still carries the period alongside a repeated parameter", () => {
    const href = askLink("/alpha/ister-tower", "year_to_date", {
      with: ["northgate", "riverside"],
    });
    const url = new URL(href, "https://observer.example");
    expect(url.searchParams.get("period")).toBe("year_to_date");
    expect(url.searchParams.getAll("with")).toEqual(["northgate", "riverside"]);
  });
});
