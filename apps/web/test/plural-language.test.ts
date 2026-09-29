import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  MEETINGS,
  plural,
  type AskThreadSummary,
  type EvidenceRef,
  type PluralForms,
} from "@observer/readmodels";
import { ASK_CONSOLE_PREPARED } from "@/components/ask/AskConsole";
import { THREAD_TURNS, ThreadList } from "@/components/ask/ThreadList";
import { Evidence, PROVENANCE_RECORDS } from "@/components/product/Provenance";
import { STACK_MEANINGFUL_VIEWS, STACK_PEOPLE } from "@/components/product/StackPlan";
import { DEMAND_MINUTES } from "@/components/project/DemandSignals";
import { counted } from "@/components/project/Reading";
import { EXPORT_SECTIONS } from "@/components/report/ExportReport";

/**
 * THE COMPONENTS' PLURAL FORMS.
 *
 * The same proof as `packages/synthetic/test/plural-language.test.ts`, for the
 * plurals a component writes itself: every expected word spelled out here,
 * Slovak's 1, 2, 4 and 5, Hungarian's singular after 1 and 5, and English as
 * it was. Two components are rendered, so the language is seen to reach the
 * words through the prop and not only through the entry.
 */

interface Expected {
  readonly sites: string;
  readonly entry: PluralForms;
  readonly en: readonly [one: string, other: string];
  readonly sk: readonly [one: string, few: string, other: string];
  readonly hu: string;
}

const EXPECTED: readonly Expected[] = [
  {
    sites: "components/ask/AskConsole.tsx:164",
    entry: ASK_CONSOLE_PREPARED,
    en: ["prepared question", "prepared questions"],
    sk: ["pripravená otázka", "pripravené otázky", "pripravených otázok"],
    hu: "előkészített kérdés",
  },
  {
    sites: "components/ask/ThreadList.tsx:73",
    entry: THREAD_TURNS,
    en: ["turn", "turns"],
    sk: ["výmena", "výmeny", "výmen"],
    hu: "forduló",
  },
  {
    sites: "components/product/Provenance.tsx:171",
    entry: PROVENANCE_RECORDS,
    en: ["record", "records"],
    sk: ["záznam", "záznamy", "záznamov"],
    hu: "bejegyzés",
  },
  {
    sites: "components/product/StackPlan.tsx:220 (views)",
    entry: STACK_MEANINGFUL_VIEWS,
    en: ["meaningful view", "meaningful views"],
    sk: ["zmysluplné zobrazenie", "zmysluplné zobrazenia", "zmysluplných zobrazení"],
    hu: "érdemi megtekintés",
  },
  {
    sites: "components/product/StackPlan.tsx:220 (people)",
    entry: STACK_PEOPLE,
    en: ["person", "people"],
    sk: ["človek", "ľudia", "ľudí"],
    hu: "ember",
  },
  {
    sites: "components/project/Reading.tsx:146, for DemandSignals' minutes",
    entry: DEMAND_MINUTES,
    en: ["minute", "minutes"],
    sk: ["minúta", "minúty", "minút"],
    hu: "perc",
  },
  {
    sites: "components/report/ExportReport.tsx:266",
    entry: EXPORT_SECTIONS,
    en: ["section", "sections"],
    sk: ["sekcia", "sekcie", "sekcií"],
    hu: "szakasz",
  },
];

describe.each(EXPECTED)("$sites", ({ entry, en, sk, hu }) => {
  it("Slovak: 1, 2, 4 and 5 each take their form, and 2 and 4 the same", () => {
    expect(plural("sk", 1, entry)).toBe(sk[0]);
    expect(plural("sk", 2, entry)).toBe(sk[1]);
    expect(plural("sk", 4, entry)).toBe(sk[1]);
    expect(plural("sk", 5, entry)).toBe(sk[2]);
  });

  it("Hungarian: 1 and 5 take the same, singular, form", () => {
    expect(plural("hu", 1, entry)).toBe(hu);
    expect(plural("hu", 5, entry)).toBe(hu);
  });

  it("English: the words the screen printed before", () => {
    expect(plural("en", 1, entry)).toBe(en[0]);
    expect(plural("en", 2, entry)).toBe(en[1]);
  });
});

describe("Reading's count and noun", () => {
  it("prints the count raw and the noun in the language asked for", () => {
    expect(counted(1, MEETINGS)).toBe("1 meeting");
    expect(counted(12, DEMAND_MINUTES)).toBe("12 minutes");
    expect(counted(3, MEETINGS, "sk")).toBe("3 stretnutia");
    expect(counted(7, DEMAND_MINUTES, "hu")).toBe("7 perc");
  });
});

describe("the language reaches the words through the prop", () => {
  const thread: AskThreadSummary = {
    threadId: "thr_1",
    title: "Which units drew attention",
    askedAt: "2026-08-20T10:00:00.000Z",
    askedAtDisplay: "20 Aug",
    projectLabel: "Northgate",
    periodLabel: "Quarter to date",
    selectionLabel: null,
    pinned: false,
    turnCount: 3,
    origin: "typed",
    href: "/alpha/northgate/ask/thr_1",
  } as AskThreadSummary;
  const render = (language?: "sk" | "en" | "hu") =>
    renderToStaticMarkup(
      createElement(ThreadList, {
        threads: [thread],
        period: "quarter_to_date",
        label: "Conversations",
        ...(language === undefined ? {} : { language }),
      }),
    );

  it("a thread's length, English by default and Slovak when asked", () => {
    expect(render()).toContain("3 turns");
    expect(render("sk")).toContain("3 výmeny");
    expect(render("hu")).toContain("3 forduló");
  });

  it("an evidence link's count, in Hungarian singular after five", () => {
    const evidence = {
      evidenceId: "ev_units",
      tier: "observed_sequence",
      href: "",
      observationCount: 5,
    } as unknown as EvidenceRef;
    const html = (language?: "sk" | "en" | "hu") =>
      renderToStaticMarkup(
        createElement(Evidence, {
          evidence,
          period: "quarter_to_date",
          ...(language === undefined ? {} : { language }),
        }),
      );
    expect(html()).toContain("5 records");
    expect(html("hu")).toContain("5 bejegyzés");
    expect(html("sk")).toContain("5 záznamov");
  });
});
