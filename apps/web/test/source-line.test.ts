import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  INSIGHT_SOURCES,
  INSIGHT_SOURCE_LABELS,
  type EvidenceId,
  type EvidenceTier,
  type InsightSource,
} from "@observer/contracts";
import { LANGUAGES } from "@observer/readmodels";

import { FindingList } from "@/components/product/Finding";
import { Sources } from "@/components/product/Provenance";
import { Timeline } from "@/components/product/Timeline";
import { SOURCE_LINE_WORDS } from "@/components/report/words";

const SHEET = readFileSync(
  resolve(import.meta.dirname, "../../../packages/ui/src/observer-product.css"),
  "utf8",
);

/**
 * ONE SOURCE, ONE NAME, ON EVERY SCREEN (ADR-0052, the second round).
 *
 * The owner, recording the demo, could not read "IRIS observed / IRIS
 * calculated / CRM outcome". Sales Flow said its sources as one line in words;
 * the other screens and the printed report kept the chips. `Sources` prints the
 * same line now, in the page's or the report's language, and no screen indexes
 * the contract's short labels.
 */
describe("the source line", () => {
  it("is the same words in the same order on every screen, in the language asked for", () => {
    const sources = ["IRIS_SHOWROOM_OBSERVED", "CRM_OUTCOME_CONTEXT"] as const;
    for (const language of LANGUAGES) {
      const html = renderToStaticMarkup(createElement(Sources, { sources, language }));
      const { lead, words } = SOURCE_LINE_WORDS[language];
      expect(html).toContain(`<b>${lead}:</b>`);
      expect(html).toContain(`data-src="IRIS_SHOWROOM_OBSERVED">${words.IRIS_SHOWROOM_OBSERVED}<`);
      expect(html).toContain(`data-src="CRM_OUTCOME_CONTEXT"> · ${words.CRM_OUTCOME_CONTEXT}<`);
      for (const label of Object.values(INSIGHT_SOURCE_LABELS)) {
        expect(html, `${language}: "${label}"`).not.toContain(`>${label}<`);
      }
    }
  });

  it("is written for every source in every language, never as English in Slovak or Hungarian", () => {
    for (const language of LANGUAGES) {
      for (const source of INSIGHT_SOURCES) {
        const word = SOURCE_LINE_WORDS[language].words[source];
        expect(word.trim().length, `${language} ${source}`).toBeGreaterThan(0);
        if (language !== "en") expect(word).not.toBe(SOURCE_LINE_WORDS.en.words[source]);
      }
    }
  });

  it("is said once under a journey whose steps share it, and per step where two feeds meet", () => {
    const step = (id: string, sources: readonly InsightSource[]) => ({
      id,
      when: "11:15",
      label: `Step ${id}`,
      sources,
    });
    const render = (steps: readonly ReturnType<typeof step>[]) =>
      renderToStaticMarkup(
        createElement(Timeline, { steps, period: "quarter_to_date", language: "en" }),
      );
    const count = (html: string) => html.split('class="iris-srcs"').length - 1;

    const room = ["IRIS_SHOWROOM_OBSERVED"] as const;
    const shared = render([step("a", room), step("b", room), step("c", room)]);
    expect(count(shared)).toBe(1);
    expect(shared.indexOf('class="iris-srcs"')).toBeGreaterThan(shared.indexOf("</ol>"));

    const mixed = render([step("a", ["WEBIRIS_CONTEXT"]), step("b", room), step("c", room)]);
    expect(count(mixed)).toBe(3);
  });

  it("is the only way a screen names a source: no file indexes the contract's short labels", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const path = join(dir, entry);
        return statSync(path).isDirectory() ? walk(path) : [path];
      });
    const src = resolve(import.meta.dirname, "../src");
    const readers = walk(src)
      .filter((file) => /\.tsx?$/.test(file))
      .filter((file) => /INSIGHT_SOURCE_LABELS\s*\[/.test(readFileSync(file, "utf8")));
    expect(readers).toEqual([]);
  });

  /* Review round 8: the same source sentence stood under every finding, down the report. */
  it("is a finding's `i` on screen, and printed on paper", () => {
    const finding = {
      id: "f:1",
      statement: "Two-room flats were opened in 98% of meetings.",
      baseline: null,
      soWhat: "Interest is concentrated.",
      nextStep: null,
      evidence: {
        evidenceId: "units" as EvidenceId,
        tier: "observed_sequence" as EvidenceTier,
        href: "",
        observationCount: 82,
      },
      sampleSize: 82,
      sources: ["IRIS_SHOWROOM_OBSERVED"] as const,
      caveat: null,
    };
    const html = renderToStaticMarkup(
      createElement(FindingList, {
        findings: [finding],
        period: "quarter_to_date",
        language: "en",
      }),
    );
    const foot = html.slice(html.indexOf('class="ox-finding-foot"'));
    expect(foot).toMatch(
      /^class="ox-finding-foot"><span class="ox-finding-sources"><span class="iris-srcs">/,
    );
    expect(foot).toMatch(/<button[^>]*aria-label="About Source"/);
    expect(foot).toContain('id="info-finding-src-f-1"');
    expect(html.split('class="iris-srcs"')).toHaveLength(3);
    expect(SHEET).toMatch(/\.ox-finding-foot > \.ox-finding-sources \{\s*display: none;/);
  });
});
