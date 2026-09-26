import { OUTCOME_LABELS, outcomeIsUnknown, type ShowroomSession } from "@observer/contracts";
import { DEFAULT_IRIS_ASSIST_POLICY } from "@observer/metrics";
import {
  plural,
  sentence,
  type AskAnswer,
  type AskSession,
  type Language,
  type PluralForms,
  type Sentence,
  type SentenceIn,
  type ViewContext,
} from "@observer/readmodels";

import { buildAssistedSales, dealsFor } from "./deals";
import { count, evidenceRef } from "./format";
import { catalogueFor } from "./pulse";
import { presentersIn, sessionsForProject } from "./showroom/sessions";

/**
 * ASK IRIS ANSWERS THAT ARE COMPUTED, NOT SCRIPTED.
 *
 * The landing's prepared answers (`buildAskSession`) are the synthetic
 * scenario's own prose: "viewings held at 46, offers fell from 17 to 12". That
 * is what a scenario is for, and it is a fabrication the moment it is printed
 * over a project whose meetings are its own showroom's — which is what the
 * landing did, under a marker reading "Live meetings", until this file.
 *
 * So a project a session source delivers for gets only what can be worked out
 * from what was delivered: counts with their denominators, in the period on
 * screen, and nothing that reads as a verdict. Four questions, not forty. The
 * rest of what Ask IRIS can say about real data is the tool layer's
 * (`apps/web/src/lib/ai/tools.ts`), which reads the same repository.
 *
 * The IRIS-assisted answer is offered on any project with a CRM, scripted or
 * delivered, because it was never scripted: it is `buildAssistedSales`' own
 * headline and note (ADR-0039).
 */

/*
 * The words these answers count in, each beside the answers that use it. The
 * Slovak and Hungarian forms are the ones a count takes standing alone or as a
 * subject; a sentence that governs another case chooses its forms when it is
 * translated.
 */

export const ASK_PRESENTATIONS: PluralForms = {
  en: { one: "presentation", other: "presentations" },
  sk: { one: "prezentácia", few: "prezentácie", other: "prezentácií" },
  hu: { one: "prezentáció", other: "prezentáció" },
};

export const ASK_RECORDED: PluralForms = {
  en: { one: "was recorded", other: "were recorded" },
  sk: { one: "bola zaznamenaná", few: "boli zaznamenané", other: "bolo zaznamenaných" },
  hu: { one: "lett rögzítve", other: "lett rögzítve" },
};

export const ASK_APARTMENTS_OPENED: PluralForms = {
  en: { one: "different apartment was opened", other: "different apartments were opened" },
  sk: {
    one: "rôzny byt bol otvorený",
    few: "rôzne byty boli otvorené",
    other: "rôznych bytov bolo otvorených",
  },
  hu: { one: "különböző lakás lett megnyitva", other: "különböző lakás lett megnyitva" },
};

export const ASK_PEOPLE_PRESENTED: PluralForms = {
  en: { one: "person presented", other: "people presented" },
  sk: { one: "človek prezentoval", few: "ľudia prezentovali", other: "ľudí prezentovalo" },
  hu: { one: "ember prezentált", other: "ember prezentált" },
};

const meetingsWord = (n: number, locale: string, language: Language): string =>
  `${count(n, locale)} ${plural(language, n, ASK_PRESENTATIONS)}`;

/*
 * The answers' sentences, each written once per language in that language's
 * own order. A count in a subject takes the entries above; a count the
 * sentence puts in another case takes that case's forms here, as its own.
 */

/*
 * THE FIRST ANSWER: HOW MANY PRESENTATIONS WERE RECORDED, AND AT THE END OF
 * HOW MANY OF THEM THE AGENT RECORDED AN OUTCOME.
 *
 * Three sentences — NONE, SOME and ALL — and `askRecordedSentence` chooses
 * between them, as `unitsViewedSentence` chooses between a shortlist and none.
 * The two figures are independent, and "at the end of every one of them" is
 * true only when they are equal. A template cannot branch on equality; the
 * caller can.
 *
 * The first clause is the same in all three. English is today's sentence in
 * all three: it has no wording of its own for none or for all.
 */

const RECORDED_EN: SentenceIn<"en"> = {
  text: "{count} {presentations|n} {recorded|n} on {project} in {period}, and the agent recorded an outcome at the end of {outcomes} of them.",
  words: { presentations: ASK_PRESENTATIONS.en, recorded: ASK_RECORDED.en },
};

/* The first clause. In Slovak the count turns the verb, the participle and the noun together. */
const RECORDED_SK: PluralForms["sk"] = {
  one: "Pri projekte {project} bola za obdobie {period} zaznamenaná jedna prezentácia.",
  few: "Pri projekte {project} boli za obdobie {period} zaznamenané {count} prezentácie.",
  other: "Pri projekte {project} bolo za obdobie {period} zaznamenaných {count} prezentácií.",
};

const RECORDED_HU: PluralForms["hu"] = {
  one: "{Az:project} projektnél {az:period} időszakban egy bemutatót rögzítettek.",
  other: "{Az:project} projektnél {az:period} időszakban {count} bemutatót rögzítettek.",
};

/** `outcomes === 0`. */
export const ASK_RECORDED_NONE_SENTENCE: Sentence = {
  en: RECORDED_EN,
  sk: {
    text: "{recorded|n} Realitný maklér na konci ani jednej z nich nezadal výsledok stretnutia.",
    words: { recorded: RECORDED_SK },
  },
  hu: {
    text: "{recorded|n} Az ingatlanértékesítő egyik bemutató végén sem adta meg a találkozó eredményét.",
    words: { recorded: RECORDED_HU },
  },
};

/** `0 < outcomes < count`. */
export const ASK_RECORDED_SOME_SENTENCE: Sentence = {
  en: RECORDED_EN,
  sk: {
    text: "{recorded|n} Realitný maklér zadal výsledok stretnutia na konci {#outcomesWord|o} z nich.",
    words: { recorded: RECORDED_SK },
    numerals: { outcomesWord: ["jednej", "dvoch", "troch", "štyroch"] },
  },
  hu: {
    text: "{recorded|n} Az ingatlanértékesítő ezek közül {outcomes} bemutató végén adta meg a találkozó eredményét.",
    words: { recorded: RECORDED_HU },
  },
};

/** `outcomes === count`. */
export const ASK_RECORDED_ALL_SENTENCE: Sentence = {
  en: RECORDED_EN,
  sk: {
    text: "{recorded|n} {all|n}",
    words: {
      recorded: RECORDED_SK,
      all: {
        one: "Realitný maklér zadal výsledok stretnutia na jej konci.",
        few: "Realitný maklér zadal výsledok stretnutia na konci každej z nich.",
        other: "Realitný maklér zadal výsledok stretnutia na konci každej z nich.",
      },
    },
  },
  hu: {
    text: "{recorded|n} {all|n}",
    words: {
      recorded: RECORDED_HU,
      all: {
        one: "Az ingatlanértékesítő a végén megadta a találkozó eredményét.",
        few: "Az ingatlanértékesítő {#allWord|n} végén adta meg a találkozó eredményét.",
        other: "Az ingatlanértékesítő mindegyik bemutató végén adta meg a találkozó eredményét.",
      },
    },
    /* The first cell is never read: at 1 the `one` form runs. */
    numerals: { allWord: ["", "mindkettő", "mindhárom", "mindegyik"] },
  },
};

/** The first answer: NONE, SOME or ALL, chosen here by the two figures. */
export function askRecordedSentence(
  language: Language,
  locale: string,
  n: number,
  outcomes: number,
  project: string,
  period: string,
): string {
  const entry =
    outcomes === 0
      ? ASK_RECORDED_NONE_SENTENCE
      : outcomes === n
        ? ASK_RECORDED_ALL_SENTENCE
        : ASK_RECORDED_SOME_SENTENCE;
  return sentence(language, entry, {
    count: count(n, locale),
    n,
    project,
    period,
    outcomes: count(outcomes, locale),
    outcomesWord: count(outcomes, locale),
    o: outcomes,
    allWord: count(n, locale),
  });
}

/*
 * THE SECOND ANSWER: THE APARTMENT OPENED MOST.
 *
 * Two sentences, and `askTopApartmentSentence` chooses: ALL when the apartment
 * was opened in every presentation, SOME otherwise. There is no NONE branch,
 * and there must not be one: the apartment opened most was, by definition,
 * opened at least once. Do not add a third branch.
 *
 * English is today's sentence in both.
 */

const TOP_APARTMENT_EN: SentenceIn<"en"> = {
  text: "{top} was opened in {opened} of {count} {presentations|n} in {period}; {apartments} {different|m} in all.",
  words: { presentations: ASK_PRESENTATIONS.en, different: ASK_APARTMENTS_OPENED.en },
};

const DIFFERENT_APARTMENTS_SK: PluralForms["sk"] = {
  one: "rôzny byt",
  few: "rôzne byty",
  other: "rôznych bytov",
};

/** `opened < count`. */
export const ASK_TOP_APARTMENT_SOME_SENTENCE: Sentence = {
  en: TOP_APARTMENT_EN,
  sk: {
    text: "Byt {top} otvorili na {#openedWord|o} z {#countWord|n} prezentácií v období {period}. Celkovo otvorili {apartments} {different|m}.",
    words: { different: DIFFERENT_APARTMENTS_SK },
    numerals: {
      openedWord: ["jednej", "dvoch", "troch", "štyroch"],
      countWord: ["jednej", "dvoch", "troch", "štyroch"],
    },
  },
  hu: {
    text: "{Az:period} időszak {count} bemutatója közül {opened} bemutatón megnyitották {az:top}-es lakást. Összesen {apartments} különböző lakást nyitottak meg.",
  },
};

/** `opened === count`. */
export const ASK_TOP_APARTMENT_ALL_SENTENCE: Sentence = {
  en: TOP_APARTMENT_EN,
  sk: {
    text: "{all|n}",
    words: {
      all: {
        one: "Počas jedinej prezentácie v období {period} otvorili byt {top}. Bol to jediný byt, ktorý otvorili.",
        few: "Byt {top} otvorili na všetkých {#allCount|n} prezentáciách v období {period}. Celkovo otvorili {apartments} {different|m}.",
        other:
          "Byt {top} otvorili na všetkých {#allCount|n} prezentáciách v období {period}. Celkovo otvorili {apartments} {different|m}.",
      },
      different: DIFFERENT_APARTMENTS_SK,
    },
    /* The first cell is never read: at 1 the `one` form runs. */
    numerals: { allCount: ["", "dvoch", "troch", "štyroch"] },
  },
  hu: {
    text: "{all|n}",
    words: {
      all: {
        one: "{Az:period} időszak egyetlen bemutatóján megnyitották {az:top}-es lakást. Ez volt az egyetlen lakás, amelyet megnyitottak.",
        few: "{Az:period} időszak {#allWord|n} bemutatóján megnyitották {az:top}-es lakást. Összesen {apartments} különböző lakást nyitottak meg.",
        other:
          "{Az:period} időszak mindegyik bemutatóján megnyitották {az:top}-es lakást. Összesen {apartments} különböző lakást nyitottak meg.",
      },
    },
    /* The first cell is never read: at 1 the `one` form runs. Attributive, as a noun follows. */
    numerals: { allWord: ["", "mindkét", "mindhárom", "mindegyik"] },
  },
};

/** The second answer: SOME or ALL, chosen here by the two figures. */
export function askTopApartmentSentence(
  language: Language,
  locale: string,
  n: number,
  top: string,
  opened: number,
  apartments: number,
  period: string,
): string {
  const entry = opened === n ? ASK_TOP_APARTMENT_ALL_SENTENCE : ASK_TOP_APARTMENT_SOME_SENTENCE;
  return sentence(language, entry, {
    top,
    opened: count(opened, locale),
    openedWord: count(opened, locale),
    o: opened,
    count: count(n, locale),
    countWord: count(n, locale),
    allCount: count(n, locale),
    allWord: count(n, locale),
    n,
    period,
    apartments: count(apartments, locale),
    m: apartments,
  });
}

/** "2 people presented the 3 presentations in quarter to date." */
export const ASK_PRESENTERS_SENTENCE: Sentence = {
  en: {
    text: "{people} {presented|p} the {count} {presentations|n} in {period}.",
    words: { presented: ASK_PEOPLE_PRESENTED.en, presentations: ASK_PRESENTATIONS.en },
  },
  sk: {
    text: "{people} {presented|p} v období {period} {count} {presentations|n}.",
    words: {
      presented: ASK_PEOPLE_PRESENTED.sk,
      /* The object: the accusative. */
      presentations: { one: "prezentáciu", few: "prezentácie", other: "prezentácií" },
    },
  },
  hu: {
    text: "{Az:period} időszak {count} prezentációját {people} ember tartotta.",
  },
};

/** "Which sales followed a showing in IRIS?", or null where no CRM is connected. */
export function assistedSalesAnswer(context: ViewContext): AskAnswer | null {
  const root = `/${context.tenant.slug}/${context.project.slug}`;
  const project = context.project.id as string;
  const assisted = buildAssistedSales(
    dealsFor(project),
    sessionsForProject(project),
    DEFAULT_IRIS_ASSIST_POLICY,
    context.project.locale,
    context.project.timeZone,
    (code) =>
      catalogueFor(project).some((u) => u.code === code)
        ? `${root}/units/${encodeURIComponent(code)}`
        : null,
    (meetingId) => `${root}/meetings/${encodeURIComponent(meetingId)}`,
    context.language,
  );
  if (assisted.source !== "crm") return null;

  return {
    question: "Which sales followed a showing in IRIS?",
    answer: assisted.headline,
    figures: [
      {
        label: `Within ${String(assisted.windowHours)} hours of a showing`,
        value: `${String(assisted.assisted)} of ${String(assisted.datedSales)}`,
        note: assisted.shareDisplay ?? `a share needs ${String(assisted.minimumSales)} dated sales`,
      },
      { label: "Shown earlier than that", value: String(assisted.shownEarlier), note: null },
      { label: "Not opened in IRIS before the date", value: String(assisted.notShown), note: null },
    ],
    evidence: evidenceRef(
      "ask.iris-assisted",
      "observed_sequence",
      `${root}/flow`,
      assisted.datedSales,
    ),
    actionLabel: "Open the sales on Sales Flow",
    actionHref: `${root}/flow`,
    followUps: [],
    caveat: assisted.note,
  };
}

/** The Ask IRIS session of a project whose meetings were delivered by its own source. */
export function buildDeliveredAskSession(
  context: ViewContext,
  sessions: readonly ShowroomSession[],
  selectionLabel: string | null,
): AskSession {
  const locale = context.project.locale;
  const language = context.language;
  const root = `/${context.tenant.slug}/${context.project.slug}`;
  const period = context.period.label.toLowerCase();
  const n = sessions.length;
  const answers: AskAnswer[] = [];

  /* --- how many, and how they ended ------------------------------------------ */
  const recorded = sessions.filter((s) => !outcomeIsUnknown(s.outcome));
  const byOutcome = new Map<ShowroomSession["outcome"], number>();
  for (const s of recorded) byOutcome.set(s.outcome, (byOutcome.get(s.outcome) ?? 0) + 1);
  answers.push({
    question: "How many presentations were recorded, and how did they end?",
    answer:
      n === 0
        ? `No presentation was recorded on ${context.project.name} in ${period}.`
        : askRecordedSentence(language, locale, n, recorded.length, context.project.name, period),
    figures: [...byOutcome.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([outcome, k]) => ({
        label: OUTCOME_LABELS[outcome],
        value: `${count(k, locale)} of ${count(n, locale)}`,
        note: null,
      })),
    evidence: evidenceRef("ask.delivered.meetings", "observed_sequence", `${root}/meetings`, n),
    actionLabel: "Open the meetings",
    actionHref: `${root}/meetings`,
    followUps: ["Which apartments were opened most?", "Who presented, and how many meetings each?"],
    caveat:
      "A recorded outcome is what the agent selected in the room. It labels the presentation and is not a verified sale.",
  });

  /* --- which apartments -------------------------------------------------------- */
  const opened = new Map<string, number>();
  for (const s of sessions) {
    for (const code of new Set(s.units.map((u) => u.unitCode))) {
      opened.set(code, (opened.get(code) ?? 0) + 1);
    }
  }
  const ranked = [...opened.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = ranked[0];
  answers.push({
    question: "Which apartments were opened most?",
    answer:
      top === undefined
        ? n === 0
          ? `No presentation was recorded in ${period}, so no apartment was opened.`
          : `No apartment was opened in any of the ${meetingsWord(n, locale, language)} in ${period}.`
        : askTopApartmentSentence(language, locale, n, top[0], top[1], ranked.length, period),
    figures: ranked.slice(0, 3).map(([code, k]) => ({
      label: code,
      value: `${count(k, locale)} of ${count(n, locale)}`,
      note: "presentations that opened it",
    })),
    evidence: evidenceRef("ask.delivered.units", "observed_sequence", `${root}/units`, n),
    actionLabel: "Open the unit register",
    actionHref: `${root}/units`,
    followUps: ["How many presentations were recorded, and how did they end?"],
    caveat:
      "Opened means the unit's view was entered during a presentation. It says nothing about who asked for it.",
  });

  /* --- who presented ------------------------------------------------------------- */
  const presenters = presentersIn(sessions)
    .map((p) => ({ name: p.name, meetings: sessions.filter((s) => s.agentId === p.id).length }))
    .filter((p) => p.meetings > 0)
    .sort((a, b) => b.meetings - a.meetings || a.name.localeCompare(b.name));
  answers.push({
    question: "Who presented, and how many meetings each?",
    answer:
      presenters.length === 0
        ? `Nobody presented on ${context.project.name} in ${period}.`
        : sentence(language, ASK_PRESENTERS_SENTENCE, {
            people: count(presenters.length, locale),
            p: presenters.length,
            count: count(n, locale),
            n,
            period,
          }),
    figures: presenters.slice(0, 3).map((p) => ({
      label: p.name,
      value: `${count(p.meetings, locale)} of ${count(n, locale)}`,
      note: null,
    })),
    evidence: evidenceRef("ask.delivered.agents", "observed_sequence", `${root}/agents`, n),
    actionLabel: "Open Sales Agents",
    actionHref: `${root}/agents`,
    followUps: ["How many presentations were recorded, and how did they end?"],
    caveat:
      "How many, not how well. Volume is a workload figure, and nobody is compared below twenty meetings each.",
  });

  const assisted = assistedSalesAnswer(context);
  if (assisted !== null) answers.push(assisted);

  return {
    context: {
      projectLabel: context.project.name,
      periodLabel: context.period.label,
      selectionLabel,
    },
    suggestions: answers.map((a) => a.question),
    answers,
  };
}
