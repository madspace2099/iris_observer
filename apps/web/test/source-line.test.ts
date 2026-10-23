import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  INSIGHT_SOURCES,
  type EvidenceId,
  type EvidenceTier,
  type InsightSource,
} from "@observer/contracts";
import { LANGUAGES } from "@observer/readmodels";

import { FindingList } from "@/components/product/Finding";
import { Timeline } from "@/components/product/Timeline";
import { INSIGHT_SOURCE_WORDS } from "@/components/report/words";

const SRC = resolve(import.meta.dirname, "../src");
const UI = resolve(import.meta.dirname, "../../../packages/ui/src");

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

/**
 * NO SOURCE LINE ON ANY SCREEN (the owner, 2026-10-23, ADR-0052).
 *
 * "Source: recorded in the showroom by the IRIS app · calculated by Observer
 * from showroom recordings" stood under every chart, finding and panel, and on
 * every section of the printed report. The owner took it off all of them. The
 * read models keep `sources`, the report's CSV keeps its source column, and the
 * evidence links still open the records a claim rests on. These cases hold the
 * line off at its source of truth, so it cannot come back one screen at a time.
 */
describe("the source line", () => {
  it("has no component, no class and no rule left to draw it", () => {
    const code = walk(SRC).filter((file) => /\.(tsx?|css)$/.test(file));
    const sheets = walk(UI).filter((file) => file.endsWith(".css"));
    const drawers = [...code, ...sheets].filter((file) =>
      /SourceChips|<Sources\b|\biris-srcs?\b|ox-(finding|report)-sources|INSIGHT_SOURCE_LABELS\s*\[/.test(
        readFileSync(file, "utf8"),
      ),
    );
    expect(drawers.map((file) => relative(SRC, file))).toEqual([]);
  });

  it("is said by the CSV's source column alone", () => {
    const readers = walk(SRC)
      .filter((file) => /\.tsx?$/.test(file))
      .filter((file) =>
        /import\s*\{[^}]*\bINSIGHT_SOURCE_WORDS\b[^}]*\}\s*from/.test(readFileSync(file, "utf8")),
      )
      .map((file) => relative(SRC, file).replace(/\\/g, "/"));
    expect(readers).toEqual(["components/report/figures.ts"]);
  });

  it("keeps the CSV's words for every source in every language, never English in Slovak or Hungarian", () => {
    for (const language of LANGUAGES) {
      for (const source of INSIGHT_SOURCES) {
        const word = INSIGHT_SOURCE_WORDS[language][source];
        expect(word.trim().length, `${language} ${source}`).toBeGreaterThan(0);
        if (language !== "en") expect(word).not.toBe(INSIGHT_SOURCE_WORDS.en[source]);
      }
    }
  });

  it("is under no finding and no journey, in any language", () => {
    const sources: readonly InsightSource[] = ["IRIS_SHOWROOM_OBSERVED", "CRM_OUTCOME_CONTEXT"];
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
      sources,
      caveat: null,
    };
    for (const language of LANGUAGES) {
      const html = [
        renderToStaticMarkup(
          createElement(FindingList, { findings: [finding], period: "quarter_to_date", language }),
        ),
        renderToStaticMarkup(
          createElement(Timeline, {
            steps: [{ id: "a", when: "11:15", label: "Step a" }],
            period: "quarter_to_date",
            language,
          }),
        ),
      ].join("\n");
      for (const word of Object.values(INSIGHT_SOURCE_WORDS[language])) {
        expect(html, `${language}: "${word}"`).not.toContain(word);
      }
      /* The finding still says what it rests on: its count and its evidence. */
      expect(html).toContain("n = 82");
    }
  });
});
