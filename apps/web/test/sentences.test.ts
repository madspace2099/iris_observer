import { describe, expect, it } from "vitest";
import {
  LANGUAGES,
  sentence,
  type Language,
  type Sentence,
  type SentenceValues,
} from "@observer/readmodels";
import { STACK_VIEWS_SENTENCE } from "@/components/product/StackPlan";
import { EXPORT_BLANK_SENTENCE } from "@/components/report/ExportReport";
import { DEMAND_ATTENTION_ASKED_SENTENCE } from "@/components/units/DemandAttention";

/**
 * THE COMPONENTS' SENTENCES, WHOLE.
 *
 * The same proof as `packages/synthetic/test/sentences.test.ts`, for the three
 * sentences a component writes itself: at 1, 3 and 5, in English, Slovak and
 * Hungarian, each written out here as the screen shows it. The period is the
 * label the units page passes, as it passes it.
 */

type Three = readonly [string, string, string];

interface Case {
  readonly name: string;
  readonly entry: Sentence;
  readonly values: (n: number) => SentenceValues;
  readonly en: Three;
  readonly sk: Three;
  readonly hu: Three;
}

const COUNTS = [1, 3, 5] as const;

const CASES: readonly Case[] = [
  {
    name: "StackPlan.tsx: a cell's views and people",
    entry: STACK_VIEWS_SENTENCE,
    values: (n) => ({ views: n, people: n, trend: "rising" }),
    en: [
      "1 meaningful view from 1 person, rising",
      "3 meaningful views from 3 people, rising",
      "5 meaningful views from 5 people, rising",
    ],
    sk: [
      "1 zmysluplné zobrazenie od 1 človeka, rising",
      "3 zmysluplné zobrazenia od 3 ľudí, rising",
      "5 zmysluplných zobrazení od 5 ľudí, rising",
    ],
    hu: [
      "1 érdemi megtekintés 1 embertől, rising",
      "3 érdemi megtekintés 3 embertől, rising",
      "5 érdemi megtekintés 5 embertől, rising",
    ],
  },
  {
    name: "ExportReport.tsx: sections that would be blank",
    entry: EXPORT_BLANK_SENTENCE,
    values: (n) => ({ count: n }),
    en: [
      "1 section would be blank and cannot be included.",
      "3 sections would be blank and cannot be included.",
      "5 sections would be blank and cannot be included.",
    ],
    sk: [
      "1 sekcia by bola prázdna a nemožno ju zahrnúť.",
      "3 sekcie by boli prázdne a nemožno ich zahrnúť.",
      "5 sekcií by bolo prázdnych a nemožno ich zahrnúť.",
    ],
    hu: [
      "1 szakasz üres lenne, ezért nem vehető fel.",
      "3 szakasz üres lenne, ezért nem vehető fel.",
      "5 szakasz üres lenne, ezért nem vehető fel.",
    ],
  },
  {
    name: "DemandAttention.tsx: the meetings the two questions were asked of",
    entry: DEMAND_ATTENTION_ASKED_SENTENCE,
    values: (n) => ({ count: n, period: "Quarter to date" }),
    en: [
      "Asked of one meeting in Quarter to date.",
      "Asked of 3 meetings in Quarter to date.",
      "Asked of 5 meetings in Quarter to date.",
    ],
    sk: [
      "Vyhodnotené z jedného stretnutia v období Quarter to date.",
      "Vyhodnotené z 3 stretnutí v období Quarter to date.",
      "Vyhodnotené z 5 stretnutí v období Quarter to date.",
    ],
    hu: [
      "Egy találkozó alapján vizsgálva, a Quarter to date időszakban.",
      "3 találkozó alapján vizsgálva, a Quarter to date időszakban.",
      "5 találkozó alapján vizsgálva, a Quarter to date időszakban.",
    ],
  },
];

describe.each(CASES)("$name", (c) => {
  it.each([...LANGUAGES])("%s: the whole sentence at 1, 3 and 5", (language: Language) => {
    COUNTS.forEach((n, i) => {
      expect(sentence(language, c.entry, c.values(n))).toBe(c[language][i]);
    });
  });
});
