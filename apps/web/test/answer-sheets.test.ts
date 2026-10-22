import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DEFAULT_LANGUAGE, type Viewer } from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "@observer/synthetic";

import { ChecksRegister, CheckQuestions, StateList } from "../src/components/attention";

/**
 * WHAT NEEDS ATTENTION AND THE BRIEFING READ AT A GLANCE (ADR-0058).
 *
 * The owner, 2026-10-22: less text, a hierarchy by type size, the rest behind
 * an "i". These hold the structure: what stands in view, what stands behind
 * the `i`, and that nothing a reader needs went with it.
 */

const repo = new SyntheticObserverRepository();
const SHARK = {
  viewer: VIEWERS.developerShark as Viewer,
  tenantSlug: "shark",
  projectSlug: "shark-residence",
  period: "quarter_to_date",
  language: DEFAULT_LANGUAGE,
} as const;

/** The markup with every InfoTip panel cut out: what is in view without a press. */
const inView = (html: string) =>
  html.replace(/<div id="info-[^"]*" popover="auto"[^>]*>[\s\S]*?<\/div>/g, "");
/** Only the InfoTip panels. */
const panels = (html: string) =>
  (html.match(/<div id="info-[^"]*" popover="auto"[^>]*>[\s\S]*?<\/div>/g) ?? []).join("\n");

const view = await repo.getAttention(SHARK);

describe("a raised state", () => {
  const html = renderToStaticMarkup(
    createElement(StateList, { states: view.states, period: "quarter_to_date", language: "en" }),
  );

  it("keeps its title, its sentence and its action in view", () => {
    const state = view.states[0];
    expect(state, "Shark raises a state this quarter").toBeDefined();
    expect(inView(html)).toContain(state?.alert.title);
    expect(inView(html)).toContain(state?.alert.detail.replace(/&/g, "&amp;"));
    expect(inView(html)).toContain(state?.alert.actionLabel ?? "");
  });

  it("puts its tier, evidence, sample, rank and sources behind the i beside its title", () => {
    expect(html).toMatch(/<\/h3><button[^>]*class="iris-info"[^>]*aria-label="About /);
    expect(panels(html)).toMatch(/Observed: These facts were recorded/);
    expect(panels(html)).toMatch(/records · Observed · n = 150 presentations · Rank 1 of 1/);
    expect(panels(html)).toContain("Source:");
    for (const gone of ["Rank 1 of", "n = 150", "Source:", "ox-tier", "ox-evidence"]) {
      expect(inView(html), gone).not.toContain(gone);
    }
  });

  it("states a sample too thin to rank in view, and ranks it nowhere", () => {
    const [first] = view.states;
    if (first === undefined) throw new Error("no state");
    const thin = { ...first, belowMinimum: true, sampleSize: 11, minimumSampleSize: 20 };
    const out = renderToStaticMarkup(
      createElement(StateList, { states: [thin], period: "quarter_to_date", language: "en" }),
    );
    expect(inView(out)).toContain("11 of 20 presentations — stated, not ranked");
    expect(out).not.toContain("Rank ");
  });
});

describe("the register", () => {
  const html = renderToStaticMarkup(
    createElement(ChecksRegister, {
      checks: view.checks,
      states: view.states,
      period: "quarter_to_date",
    }),
  );

  it("is a list of every check, each naming its answer, what it found and its next step", () => {
    expect(html).toMatch(/^<ul class="sheet-checks" aria-label="Every check, and what it found">/);
    expect(html.match(/<li class="sheet-check"/g)).toHaveLength(view.checks.length);
    for (const part of ["answer", "found", "step"]) {
      expect(html.match(new RegExp(`data-part="${part}"`, "g")), part).toHaveLength(
        view.checks.length,
      );
    }
    expect(html).not.toContain("<table");
  });

  it("asks its questions behind the i, not in the rows", () => {
    const questions = renderToStaticMarkup(createElement(CheckQuestions, { checks: view.checks }));
    expect(questions.match(/<p>/g)).toHaveLength(view.checks.length);
    expect(questions).toContain("Is a follow-up past the deadline it was given?");
    expect(html).not.toContain("Is a follow-up past the deadline it was given?");
  });
});

/*
 * The pages themselves, read as source with comments stripped, as
 * `flow-claims.test.ts` reads Sales Flow: each explanation is inside the
 * InfoTip beside its title.
 */
const source = (page: string) =>
  readFileSync(
    resolve(import.meta.dirname, `../src/app/(app)/[tenantSlug]/[projectSlug]/${page}/page.tsx`),
    "utf8",
  )
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ");

describe("What needs attention", () => {
  const page = source("attention");

  it("heads with the answer and counts the answers from the read model", () => {
    expect(page).toMatch(/title=\{\s*raised === 0/);
    expect(page).not.toMatch(/\blede=/);
    expect(page).toContain("{view.tally[state]}");
  });

  it("puts the colour rule and the ordering rule behind the i beside Raised in this period", () => {
    expect(page).toMatch(
      /<InfoTip id="raised"[\s\S]*Red is kept for a record going missing right now[\s\S]*Severity first, then how much each one is about\.[\s\S]*<\/InfoTip>/,
    );
    expect(page).not.toContain("<Method");
  });
});

describe("the Briefing", () => {
  const page = source("showroom");

  it("heads with the verdict and keeps the clause it rests on behind the figures' i", () => {
    expect(page).toContain("title={home.verdict}");
    expect(page).not.toMatch(/\blede=/);
    expect(page).toMatch(/<InfoTip id="figures"[\s\S]*\{home\.because\}[\s\S]*<\/InfoTip>/);
  });

  it("draws the plan without its key, and the key behind the building's i", () => {
    expect(page).toMatch(/<StackPlan[\s\S]*keyed=\{false\}/);
    expect(page).toMatch(/<InfoTip id="building"[\s\S]*<StackPlanKey[\s\S]*<\/InfoTip>/);
  });

  it("gives each door one way in", () => {
    expect(page).toMatch(/<h3 className="ox-row-name">\{door\.label\}<\/h3>/);
    expect(page.match(/href=\{dynamicRoute\(withPeriod\(door\.href, period\)\)\}/g)).toHaveLength(
      1,
    );
  });
});
