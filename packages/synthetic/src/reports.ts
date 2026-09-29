import { outcomeIsUnknown, type InsightSource, type ShowroomSession } from "@observer/contracts";
import { AGENT_MIN_SAMPLE } from "@observer/metrics";
import {
  AGENT_REGISTER_ROLES,
  DEFAULT_LANGUAGE,
  MEETINGS,
  plural,
  pluralCategory,
  sentence,
  type Language,
  type Sentence,
} from "@observer/readmodels";
import type {
  ProjectSummary,
  ReportScopeView,
  ReportSection,
  ViewContext,
} from "@observer/readmodels";
import { catalogueFor } from "./pulse";
import { buildMeetingList } from "./showroom/project";
import { buildAgentDetail } from "./showroom/screens";
import { count, evidenceRef, percent } from "./format";
import { presentersIn } from "./showroom/sessions";

/**
 * What a report could contain, project by project.
 *
 * The surface exists before the generator does, and this is the honest version
 * of that situation: every section is described, every section says whether it
 * could be written from what this project actually has, and the view states
 * once and plainly that nothing produces a document.
 *
 * The availability is computed from the same sources every other surface reads,
 * so a scheme with no CRM is told which pages of its report would be blank
 * *before* it asks for one. That is the whole value of the screen in this phase:
 * a reader who learns on Friday that the outcome section was never possible has
 * been let down by a product that knew on Monday.
 */

/*
 * THE MANIFEST'S OWN WORDS, IN EACH LANGUAGE A REPORT CAN BE ASKED FOR.
 *
 * A report is printed in the language the export dialog chose, and the
 * manifest's labels, summaries and reasons are the report's own text: nobody
 * else's read model writes them. One record per language, typed alike, so a
 * word missing in one of them is a compile error rather than an English phrase
 * in the middle of a Slovak page. A sentence that counts is a `Sentence`.
 *
 * The Slovak and Hungarian here are DRAFTS for review (P2-17), not approved
 * text: the review sheet states each of them whole, and an approved round
 * replaces them as the earlier rounds replaced the first drafts.
 */
interface SectionWords {
  readonly label: string;
  readonly summary: string;
}

interface ScopeWords {
  readonly periodSummary: SectionWords;
  readonly coverage: SectionWords;
  readonly unitDemand: SectionWords;
  readonly salesAgents: SectionWords;
  readonly outcomes: SectionWords;
  readonly channelSplit: SectionWords;
  readonly singleMeeting: SectionWords;
  readonly appendix: SectionWords;
  readonly noPresentations: string;
  readonly noCatalogue: string;
  readonly noUnitOpened: string;
  readonly nobodyPresented: string;
  readonly noCrm: string;
  readonly allShowroom: string;
  readonly allWebIris: string;
  readonly generation: string;
  readonly milestone: string;
  readonly meetingSequence: SectionWords;
  readonly meetingAppendix: SectionWords;
  readonly meetingLegacy: string;
  readonly meetingGeneration: string;
}

const SCOPE_WORDS: Readonly<Record<Language, ScopeWords>> = {
  en: {
    periodSummary: {
      label: "Period summary",
      summary:
        "The verdict for the period, the presentation figures behind it, and what moved against the baseline.",
    },
    coverage: {
      label: "Presentation coverage",
      summary:
        "Which sections of IRIS the presentations reached, which were routinely skipped, and how deep a typical meeting went.",
    },
    unitDemand: {
      label: "Unit demand",
      summary:
        "Attention unit by unit, which segments draw more interest than their share of stock, and what buyers examined on the units they opened.",
    },
    salesAgents: {
      label: "Sales agents",
      summary:
        "How each person presents, how their meetings end, and where their running order differs from the team's.",
    },
    outcomes: {
      label: "Outcomes and conversion",
      summary:
        "What the recorded outcomes were, and how many meetings progressed further after them.",
    },
    channelSplit: {
      label: "Showroom and WEB IRIS",
      summary:
        "How the period divides between the installation and the browser, and what each channel can and cannot say about dwell.",
    },
    singleMeeting: {
      label: "A single meeting",
      summary:
        "One presentation reconstructed as a sequence: what was shown, in what order, which units were opened and what the meeting recorded at the end.",
    },
    appendix: {
      label: "Evidence appendix",
      summary:
        "Every figure in the report with its period, its filters, its sample size and the reference that resolves to the records underneath it.",
    },
    noPresentations: "No presentations in the period.",
    noCatalogue:
      "No unit catalogue is connected to this project, so units cannot be named or segmented.",
    noUnitOpened: "No presentations in the period, so no unit was opened.",
    nobodyPresented: "Nobody presented on this project in the period.",
    noCrm:
      "No CRM is connected to this project, so no meeting carries an outcome. The section would be blank rather than nil.",
    allShowroom:
      "Every presentation on this project ran on the showroom installation, so there is no split to report.",
    allWebIris:
      "Every presentation on this project ran on WEB IRIS, so there is no split to report.",
    generation:
      "Nothing generates a document yet. This screen states what a report would contain, section by section, from the sources this project actually has.",
    milestone: "Report generation is scheduled for M4 (docs/roadmap.md).",
    meetingSequence: {
      label: "The meeting, as a sequence",
      summary:
        "What was shown, in what order, which units were opened and what the meeting recorded at the end.",
    },
    meetingAppendix: {
      label: "Evidence appendix",
      summary:
        "The session record this summary rests on, with its source, its step count and the reference that resolves to it.",
    },
    meetingLegacy:
      "This meeting came from the legacy import, which records the order of sections and not their timing. The sequence is written; the pacing is not.",
    meetingGeneration:
      "Nothing generates a document yet. This screen states what a meeting summary would contain from the session record.",
  },
  sk: {
    periodSummary: {
      label: "Zhrnutie obdobia",
      summary:
        "Hodnotenie obdobia, čísla prezentácií, na ktorých stojí, a čo sa zmenilo oproti porovnávaciemu obdobiu.",
    },
    coverage: {
      label: "Pokrytie prezentácií",
      summary:
        "Ku ktorým sekciám IRIS sa prezentácie dostali, ktoré sa bežne preskakovali a ako hlboko išlo typické stretnutie.",
    },
    unitDemand: {
      label: "Dopyt po bytoch",
      summary:
        "Pozornosť byt po byte, ktoré segmenty priťahujú viac záujmu, než zodpovedá ich podielu na ponuke, a čo si kupujúci prezerali na bytoch, ktoré otvorili.",
    },
    salesAgents: {
      label: "Realitní makléri",
      summary:
        "Ako kto prezentuje, ako sa končia jeho stretnutia a v čom sa jeho poradie líši od poradia tímu.",
    },
    outcomes: {
      label: "Výsledky a konverzia",
      summary: "Aké výsledky stretnutí boli zaznamenané a koľko stretnutí po nich pokročilo ďalej.",
    },
    channelSplit: {
      label: "Showroom a WEB IRIS",
      summary:
        "Ako sa obdobie delí medzi inštaláciu v showroome a prehliadač a čo každý kanál vie a nevie povedať o čase prezerania.",
    },
    singleMeeting: {
      label: "Jedno stretnutie",
      summary:
        "Jedna prezentácia zrekonštruovaná ako postupnosť: čo sa ukázalo, v akom poradí, ktoré byty sa otvorili a čo stretnutie zaznamenalo na konci.",
    },
    appendix: {
      label: "Príloha s podkladmi",
      summary:
        "Každé číslo v správe s jeho obdobím, filtrami, veľkosťou vzorky a odkazom na záznamy, na ktorých stojí.",
    },
    noPresentations: "V tomto období neprebehla žiadna prezentácia.",
    noCatalogue:
      "K tomuto projektu nie je pripojený katalóg bytov, preto byty nemožno pomenovať ani rozdeliť do segmentov.",
    noUnitOpened: "V tomto období neprebehla žiadna prezentácia, preto sa neotvoril žiadny byt.",
    nobodyPresented: "V tomto období na tomto projekte nikto neprezentoval.",
    noCrm:
      "K tomuto projektu nie je pripojený žiadny CRM, preto žiadne stretnutie nemá výsledok. Sekcia by bola prázdna, nie nulová.",
    allShowroom:
      "Každá prezentácia na tomto projekte prebehla v inštalácii v showroome, takže niet čo rozdeliť.",
    allWebIris: "Každá prezentácia na tomto projekte prebehla vo WEB IRIS, takže niet čo rozdeliť.",
    generation:
      "Dokument zatiaľ nič negeneruje. Táto obrazovka uvádza, čo by správa obsahovala, sekciu po sekcii, zo zdrojov, ktoré tento projekt skutočne má.",
    milestone: "Generovanie správ je naplánované na M4 (docs/roadmap.md).",
    meetingSequence: {
      label: "Stretnutie ako postupnosť",
      summary:
        "Čo sa ukázalo, v akom poradí, ktoré byty sa otvorili a čo stretnutie zaznamenalo na konci.",
    },
    meetingAppendix: {
      label: "Príloha s podkladmi",
      summary:
        "Záznam zo showroomu, na ktorom toto zhrnutie stojí, s jeho zdrojom, počtom krokov a odkazom naň.",
    },
    meetingLegacy:
      "Toto stretnutie pochádza zo staršieho importu, ktorý zaznamenáva poradie sekcií, ale nie ich časovanie. Poradie je zapísané, tempo nie.",
    meetingGeneration:
      "Dokument zatiaľ nič negeneruje. Táto obrazovka uvádza, čo by zhrnutie stretnutia obsahovalo zo záznamu zo showroomu.",
  },
  hu: {
    periodSummary: {
      label: "Az időszak összefoglalója",
      summary:
        "Az időszak értékelése, a mögötte álló bemutatószámok, és hogy mi változott az összehasonlító időszakhoz képest.",
    },
    coverage: {
      label: "A bemutatók lefedettsége",
      summary:
        "Az IRIS mely szakaszaiig jutottak el a bemutatók, melyeket hagyták ki rendszeresen, és milyen mélyre ment egy tipikus találkozó.",
    },
    unitDemand: {
      label: "Lakáskereslet",
      summary:
        "A figyelem lakásonként: mely szegmensek vonzanak több érdeklődést, mint amekkora a kínálatban a részesedésük, és mit néztek meg a vevők a megnyitott lakásokon.",
    },
    salesAgents: {
      label: "Ingatlanértékesítők",
      summary:
        "Ki hogyan mutat be, hogyan végződnek a találkozói, és miben tér el a bemutatási sorrendje a csapatétól.",
    },
    outcomes: {
      label: "Eredmények és konverzió",
      summary: "Milyen eredményeket rögzítettek, és hány találkozó jutott utána tovább.",
    },
    channelSplit: {
      label: "Showroom és WEB IRIS",
      summary:
        "Hogyan oszlik meg az időszak a showroom-telepítés és a böngésző között, és mit tud, illetve mit nem tud elmondani a két csatorna a megtekintési időről.",
    },
    singleMeeting: {
      label: "Egyetlen találkozó",
      summary:
        "Egy bemutató lépésről lépésre: mit mutattak meg, milyen sorrendben, mely lakásokat nyitották meg, és mit rögzítettek a találkozó végén.",
    },
    appendix: {
      label: "Bizonyíték-függelék",
      summary:
        "A jelentés minden adata az időszakával, a szűrőivel, a mintanagyságával és a mögötte álló rekordokra mutató hivatkozással.",
    },
    noPresentations: "Ebben az időszakban nem volt bemutató.",
    noCatalogue:
      "Ehhez a projekthez nincs lakáskatalógus csatlakoztatva, ezért a lakásokat nem lehet megnevezni és szegmensekre bontani.",
    noUnitOpened: "Ebben az időszakban nem volt bemutató, ezért egyetlen lakást sem nyitottak meg.",
    nobodyPresented: "Ebben az időszakban senki sem tartott bemutatót ezen a projekten.",
    noCrm:
      "Ehhez a projekthez nincs CRM csatlakoztatva, ezért egyetlen találkozónak sincs eredménye. A szakasz üres lenne, nem nulla.",
    allShowroom:
      "Ezen a projekten minden bemutató a showroom-telepítésen zajlott, így nincs mit megbontani.",
    allWebIris:
      "Ezen a projekten minden bemutató a WEB IRIS-ben zajlott, így nincs mit megbontani.",
    generation:
      "Dokumentumot egyelőre semmi sem állít elő. Ez a képernyő szakaszonként megmutatja, mit tartalmazna a jelentés azokból a forrásokból, amelyek ehhez a projekthez ténylegesen rendelkezésre állnak.",
    milestone: "A jelentéskészítés az M4 mérföldkőben esedékes (docs/roadmap.md).",
    meetingSequence: {
      label: "A találkozó lépésről lépésre",
      summary:
        "Mit mutattak meg, milyen sorrendben, mely lakásokat nyitották meg, és mit rögzítettek a találkozó végén.",
    },
    meetingAppendix: {
      label: "Bizonyíték-függelék",
      summary:
        "A showroom-rekord, amelyen ez az összefoglaló alapul, a forrásával, a lépésszámával és a rá mutató hivatkozással.",
    },
    meetingLegacy:
      "Ez a találkozó a régi rendszerből importált adatokból származik, amely a szakaszok sorrendjét rögzíti, az időzítésüket nem. A sorrend megvan, a tempó nincs.",
    meetingGeneration:
      "Dokumentumot egyelőre semmi sem állít elő. Ez a képernyő megmutatja, mit tartalmazna a találkozó összefoglalója a showroom-rekordból.",
  },
};

/** "No presentations were recorded in quarter to date, so the section would have nothing to summarise." */
export const REPORT_NOTHING_TO_SUMMARISE: Sentence = {
  en: {
    text: "No presentations were recorded in {period}, so the section would have nothing to summarise.",
  },
  sk: {
    text: "V období {period} sa nezaznamenala žiadna prezentácia, preto by táto sekcia nemala čo zhrnúť.",
  },
  hu: {
    text: "{Az:period} időszakban egyetlen bemutatót sem rögzítettek, így a szakasznak nem lenne mit összefoglalnia.",
  },
};

/** "3 meetings came from the legacy import, …" */
export const REPORT_LEGACY_MEETINGS: Sentence = {
  en: {
    text: "{count} meetings came from the legacy import, which records the order of sections and not their timing. Their sequence would appear; their pacing would not.",
  },
  sk: {
    text: "{frame|n}",
    words: {
      frame: {
        one: "{count} stretnutie pochádza zo staršieho importu, ktorý zaznamenáva poradie sekcií, ale nie ich časovanie. Jeho poradie by sa zobrazilo, tempo nie.",
        few: "{count} stretnutia pochádzajú zo staršieho importu, ktorý zaznamenáva poradie sekcií, ale nie ich časovanie. Ich poradie by sa zobrazilo, tempo nie.",
        other:
          "{count} stretnutí pochádza zo staršieho importu, ktorý zaznamenáva poradie sekcií, ale nie ich časovanie. Ich poradie by sa zobrazilo, tempo nie.",
      },
    },
  },
  hu: {
    text: "{count} találkozó a régi rendszerből importált adatokból származik, amely a szakaszok sorrendjét rögzíti, az időzítésüket nem. A sorrend megjelenne, a tempó nem.",
  },
};

/** "Monika Kováčová, Ján Hruška are below the 20-meeting minimum, …" */
export const REPORT_BELOW_MINIMUM: Sentence = {
  en: {
    text: "{names} {be|n} below the {minimum}-meeting minimum, so their figures would appear as raw counts with no verdict, rank or trend.",
    words: { be: { one: "is", other: "are" } },
  },
  sk: {
    text: "{frame|n}",
    words: {
      frame: {
        one: "{names} nedosahuje minimum {minimum} stretnutí, preto by sa čísla zobrazili iba ako počty, bez hodnotenia, poradia a trendu.",
        few: "{names} zatiaľ nedosiahli minimum {minimum} stretnutí. Ich údaje sa preto zobrazia len ako počty, bez hodnotenia, poradia alebo trendu.",
        other:
          "{names} zatiaľ nedosiahli minimum {minimum} stretnutí. Ich údaje sa preto zobrazia len ako počty, bez hodnotenia, poradia alebo trendu.",
      },
    },
  },
  hu: {
    text: "{frame|n}",
    words: {
      frame: {
        one: "{names} nem éri el {az:minimum} találkozós minimumot, ezért az adatai csak nyers számként jelennének meg, értékelés, rangsor és trend nélkül.",
        other:
          "{names} még nem érték el a legalább {minimum} találkozót. Az adataik ezért csak darabszámként jelennek meg, értékelés, rangsor és trend nélkül.",
      },
    },
  },
};

/** "12% of meetings in the period ended with no outcome recorded, …" */
export const REPORT_UNRECORDED_SHARE: Sentence = {
  en: {
    text: "{share} of meetings in the period ended with no outcome recorded, and every rate in this section would silently drop them.",
  },
  sk: {
    text: "{share} stretnutí v tomto období sa skončilo bez zaznamenaného výsledku a každý pomer v tejto sekcii by ich potichu vynechal.",
  },
  hu: {
    text: "Az időszak találkozóinak {share}-a eredmény rögzítése nélkül zárult, és a szakasz minden aránya szó nélkül kihagyná őket.",
  },
};

/** "A summary can be written for any meeting in the period, but 3 of them carry no timing …" */
export const REPORT_LEGACY_SUMMARY: Sentence = {
  en: {
    text: "A summary can be written for any meeting in the period, but {count} of them carry no timing and would be shown as a sequence rather than a timeline.",
  },
  sk: {
    text: "{frame|n}",
    words: {
      frame: {
        one: "Zhrnutie možno napísať pre ktorékoľvek stretnutie v tomto období, ale {count} z nich nemá časovanie a zobrazilo by sa ako postupnosť, nie ako časová os.",
        few: "V tomto období možno pripraviť zhrnutie ku každému stretnutiu, no pri {count} z nich chýbajú časové údaje. Preto by sa zobrazili ako sled krokov, nie na časovej osi.",
        other:
          "V tomto období možno pripraviť zhrnutie ku každému stretnutiu, no pri {count} z nich chýbajú časové údaje. Preto by sa zobrazili ako sled krokov, nie na časovej osi.",
      },
    },
  },
  hu: {
    text: "{frame|n}",
    words: {
      frame: {
        one: "Az időszak bármely találkozójáról írható összefoglaló, de közülük {count} nem hordoz időzítést, ezért lépéssorként jelenne meg, nem idővonalként.",
        other:
          "Az időszak bármely találkozójáról készülhet összefoglaló, de {count} találkozóhoz nincsenek időadatok. Ezeket ezért a lépések sorrendjében lehetne bemutatni, idővonal nélkül.",
      },
    },
  },
};

/**
 * The noun a section's sample is counted in. English has always printed
 * "meetings" whatever the count; Slovak and Hungarian agree with the count.
 */
function meetingsNoun(language: Language, n: number | null): string {
  return language === "en" ? "meetings" : plural(language, n ?? 0, MEETINGS);
}

const OBSERVED: readonly InsightSource[] = ["IRIS_SHOWROOM_OBSERVED"];
const DERIVED: readonly InsightSource[] = ["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED"];
const WITH_OUTCOME: readonly InsightSource[] = [
  "IRIS_SHOWROOM_OBSERVED",
  "IRIS_SHOWROOM_DERIVED",
  "CRM_OUTCOME_CONTEXT",
];

function share(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

export function buildReportScope(
  context: ViewContext,
  sessions: readonly ShowroomSession[],
  meeting: ShowroomSession | null = null,
): ReportScopeView {
  if (meeting !== null) return buildMeetingReportScope(context, meeting);
  const locale = context.project.locale;
  const language = context.language ?? DEFAULT_LANGUAGE;
  const words = SCOPE_WORDS[language];
  const root = `/${context.tenant.slug}/${context.project.slug}`;
  const crm = context.project.connectedSources.includes("crm");
  const n = sessions.length;

  const recorded = sessions.filter((s) => !outcomeIsUnknown(s.outcome)).length;
  const unrecordedShare = share(n - recorded, n);
  const legacy = sessions.filter((s) => s.timingUnavailable).length;
  const webiris = sessions.filter((s) => s.channel === "webiris").length;
  const catalogue = catalogueFor(context.project.id as string);

  const presenting = presentersIn(sessions)
    .map((agent) => ({
      name: agent.name,
      meetings: sessions.filter((s) => s.agentId === agent.id).length,
    }))
    .filter((a) => a.meetings > 0);
  const thin = presenting.filter((a) => a.meetings < AGENT_MIN_SAMPLE);

  const evidence = (id: string, observations: number) =>
    evidenceRef(
      `report-${context.project.slug}-${id}`,
      "observed_sequence",
      `${root}/report`,
      observations,
    );

  const sections: readonly ReportSection[] = [
    {
      id: "period-summary",
      ...words.periodSummary,
      availability: n === 0 ? "unavailable" : "ready",
      reason:
        n === 0
          ? sentence(language, REPORT_NOTHING_TO_SUMMARISE, {
              period: context.period.label.toLowerCase(),
            })
          : null,
      sources: DERIVED,
      sampleSize: n,
      sampleNoun: meetingsNoun(language, n),
      evidence: n === 0 ? null : evidence("summary", n),
    },
    {
      id: "presentation-coverage",
      ...words.coverage,
      availability: n === 0 ? "unavailable" : legacy > 0 ? "partial" : "ready",
      reason:
        n === 0
          ? words.noPresentations
          : legacy > 0
            ? sentence(language, REPORT_LEGACY_MEETINGS, {
                count: count(legacy, locale),
                n: legacy,
              })
            : null,
      sources: DERIVED,
      sampleSize: n,
      sampleNoun: meetingsNoun(language, n),
      evidence: n === 0 ? null : evidence("coverage", n),
    },
    {
      id: "unit-demand",
      ...words.unitDemand,
      availability: catalogue.length === 0 ? "unavailable" : n === 0 ? "unavailable" : "ready",
      reason: catalogue.length === 0 ? words.noCatalogue : n === 0 ? words.noUnitOpened : null,
      sources: DERIVED,
      sampleSize: n,
      sampleNoun: meetingsNoun(language, n),
      evidence: catalogue.length === 0 || n === 0 ? null : evidence("units", catalogue.length),
    },
    {
      id: "sales-agents",
      ...words.salesAgents,
      availability: presenting.length === 0 ? "unavailable" : thin.length > 0 ? "partial" : "ready",
      reason:
        presenting.length === 0
          ? words.nobodyPresented
          : thin.length > 0
            ? sentence(language, REPORT_BELOW_MINIMUM, {
                names:
                  language === "en"
                    ? thin.map((a) => a.name).join(", ")
                    : new Intl.ListFormat(language, { type: "conjunction" }).format(
                        thin.map((a) => a.name),
                      ),
                n: thin.length,
                minimum: String(AGENT_MIN_SAMPLE),
              })
            : null,
      sources: DERIVED,
      sampleSize: n,
      sampleNoun: meetingsNoun(language, n),
      evidence: presenting.length === 0 ? null : evidence("agents", presenting.length),
    },
    {
      id: "outcomes",
      ...words.outcomes,
      availability: !crm ? "unavailable" : unrecordedShare > 0.2 ? "partial" : "ready",
      reason: !crm
        ? words.noCrm
        : unrecordedShare > 0.2
          ? sentence(language, REPORT_UNRECORDED_SHARE, {
              share: percent(unrecordedShare, locale),
            })
          : null,
      sources: WITH_OUTCOME,
      sampleSize: recorded,
      sampleNoun: meetingsNoun(language, recorded),
      evidence: crm && recorded > 0 ? evidence("outcomes", recorded) : null,
    },
    {
      id: "channel-split",
      ...words.channelSplit,
      availability:
        n === 0 ? "unavailable" : webiris === 0 || webiris === n ? "unavailable" : "ready",
      reason:
        n === 0
          ? words.noPresentations
          : webiris === 0
            ? words.allShowroom
            : webiris === n
              ? words.allWebIris
              : null,
      sources: OBSERVED,
      sampleSize: n,
      sampleNoun: meetingsNoun(language, n),
      evidence: webiris > 0 && webiris < n ? evidence("channel", n) : null,
    },
    {
      id: "meeting-summary",
      ...words.singleMeeting,
      availability: n === 0 ? "unavailable" : legacy > 0 ? "partial" : "ready",
      reason:
        n === 0
          ? words.noPresentations
          : legacy > 0
            ? sentence(language, REPORT_LEGACY_SUMMARY, { count: count(legacy, locale), n: legacy })
            : null,
      sources: OBSERVED,
      sampleSize: n,
      sampleNoun: meetingsNoun(language, n),
      evidence: n === 0 ? null : evidence("meeting", n),
    },
    {
      id: "evidence-appendix",
      ...words.appendix,
      // The one section that is always writable: it describes the report's own
      // provenance, which exists whether or not any given source does.
      availability: "ready",
      reason: null,
      sources: DERIVED,
      sampleSize: null,
      sampleNoun: meetingsNoun(language, null),
      evidence: evidence("appendix", n),
    },
  ];

  return {
    context,
    scope: {
      kind: "project",
      label: `${context.project.name} · ${context.period.label}`,
      projectName: context.project.name,
      meetingId: null,
      agentId: null,
    },
    periodLabel: context.period.label,
    sections,
    generation: {
      state: "preview_only",
      statement: words.generation,
      milestone: words.milestone,
    },
    unavailableCount: sections.filter((s) => s.availability === "unavailable").length,
    evidence: evidence("scope", n),
  };
}

/**
 * One meeting's summary as a report scope — the internal half of M4's
 * "buyer meeting report". The buyer-facing document is a separate,
 * sanitised contract (ADR-0018) and is not this: the scope is stated
 * internal and its two sections are the presentation reconstructed as a
 * sequence and the evidence behind it. A legacy import carries the order
 * of the sections and not their timing, so its summary is partial and says
 * so rather than drawing a timeline it does not have.
 */
function buildMeetingReportScope(context: ViewContext, meeting: ShowroomSession): ReportScopeView {
  const language = context.language ?? DEFAULT_LANGUAGE;
  const words = SCOPE_WORDS[language];
  const root = `/${context.tenant.slug}/${context.project.slug}`;
  const summary = buildMeetingList(context, [meeting])[0];
  const label =
    summary === undefined ? meeting.meetingId : `${summary.label} · ${summary.agentName}`;
  const evidence = (id: string, observations: number) =>
    evidenceRef(
      `report-${context.project.slug}-meeting-${meeting.meetingId}-${id}`,
      "observed_sequence",
      `${root}/report?meeting=${meeting.meetingId}`,
      observations,
    );
  const sections: readonly ReportSection[] = [
    {
      id: "meeting-summary",
      ...words.meetingSequence,
      availability: meeting.timingUnavailable ? "partial" : "ready",
      reason: meeting.timingUnavailable ? words.meetingLegacy : null,
      sources: OBSERVED,
      sampleSize: null,
      sampleNoun: meetingsNoun(language, null),
      evidence: evidence("sequence", meeting.steps.length),
    },
    {
      id: "evidence-appendix",
      ...words.meetingAppendix,
      availability: "ready",
      reason: null,
      sources: OBSERVED,
      sampleSize: null,
      sampleNoun: meetingsNoun(language, null),
      evidence: evidence("appendix", meeting.steps.length),
    },
  ];
  return {
    context,
    scope: {
      kind: "meeting",
      label,
      projectName: context.project.name,
      meetingId: meeting.meetingId,
      agentId: null,
    },
    periodLabel: context.period.label,
    sections,
    generation: {
      state: "preview_only",
      statement: words.meetingGeneration,
      milestone: words.milestone,
    },
    unavailableCount: 0,
    evidence: evidence("scope", meeting.steps.length),
  };
}

/**
 * ONE AGENT'S SUMMARY AS A REPORT SCOPE — THE MANIFEST, NOT THE CONTENT.
 *
 * `ReportSection` is a manifest: what a section would say, whether it can be
 * written, why not, and what sample stands under it. The printed page draws
 * its body from `AgentDetailView` itself, with the same components the
 * agent's own screen uses — `Figure`, `ShareFigure`, `StageFunnel`, the
 * register — so a rate reaches paper with its denominator in words and,
 * below the floor, with its shortfall beside it. A manifest of nine fields
 * cannot carry a floor per figure, and the document does not need it to.
 *
 * Two kinds of gap are stated here, in `reason`. Below `AGENT_MIN_SAMPLE`
 * every section whose figures are rates is `partial`, and its reason is the
 * read model's own suppression sentence — the one the screen leads with. And
 * the one section whose screen region the document does not carry whole
 * says what is missing: the week-by-week series is not printed, the outcome
 * ring reaches paper as a table rather than a shape, and the screen's
 * reading guide is not a section. A document that quietly dropped a region
 * would be the same lie as a zero standing in for a value nobody measured,
 * one level up.
 *
 * The agent has to present on this project in this period, by the rule
 * `getAgentDetail` applies: somebody who does not is not found here, and the
 * answer does not say whether they exist on a project the reader cannot see.
 * "Where else they present" is scoped to the reader's own grants and never
 * to the agent's, for the reason the screen states under the list.
 */
/*
 * THE AGENT SUMMARY'S MANIFEST, IN EACH LANGUAGE A REPORT CAN BE PRINTED IN.
 *
 * English is what the manifest always said. Slovak avoids the past tense and
 * the possessive where either would name the agent's gender, which the
 * product does not hold. Slovak and Hungarian are drafts for review (P2-17).
 */
interface AgentScopeWords {
  readonly activity: SectionWords;
  readonly funnel: SectionWords;
  readonly presentation: SectionWords;
  readonly buyers: SectionWords;
  readonly units: SectionWords;
  readonly projects: SectionWords;
  readonly meetings: SectionWords;
  readonly findings: SectionWords;
  readonly appendix: SectionWords;
  readonly notCarried: string;
  readonly noUnits: string;
  readonly registerKept: string;
  readonly noFindings: string;
  readonly generation: string;
  readonly timedNoun: (n: number) => string;
  readonly listedNoun: (n: number) => string;
}

const AGENT_SCOPE_WORDS: Readonly<Record<Language, AgentScopeWords>> = {
  en: {
    activity: {
      label: "Activity in this period",
      summary:
        "Presentations, the median length, units opened per meeting and core sections reached; follow-ups recorded as needed, and the half no source records; and the outcomes they recorded, each with the count it is a fraction of.",
    },
    funnel: {
      label: "Where their meetings reached",
      summary:
        "Five observed states, each a count of meetings that reached it against the count it is a fraction of. Nothing here says one stage produced the next.",
    },
    presentation: {
      label: "How they present",
      summary:
        "Their running order, with the median stay in each section. Above the floor, the share of their timed presentation time each section takes and the team's median beside it; below the floor, neither.",
    },
    buyers: {
      label: "What it met",
      summary:
        "What their buyers opened, by apartment size, and how their meetings ended: counts of their own meetings, with the share above the floor and the project's own rate beside it.",
    },
    units: {
      label: "The apartments they keep opening",
      summary:
        "Units opened in the largest share of their meetings, at most six, with how often each was shortlisted. An association with their habit and nothing more.",
    },
    projects: {
      label: "Where else they present",
      summary:
        "The projects this account holds on which they also presented in the period, with the meeting count on each.",
    },
    meetings: {
      label: "Their most recent meetings",
      summary:
        "At most eight, newest first, each with its length, sections, units opened, shortlist, recorded outcome and follow-up state. The visitor column names the buyer where the contact gave consent to be named, beside a privacy-safe label; otherwise the label alone.",
    },
    findings: {
      label: "What this period found",
      summary:
        "The findings their own screen states, each with its baseline, its evidence and its caveat.",
    },
    appendix: {
      label: "Evidence appendix",
      summary:
        "Every section of this summary with its state, its sample in its own noun, and the reference that resolves to the records underneath it.",
    },
    notCarried:
      "Not in this document: the week-by-week series of their presentations, because a line is read as a direction whatever is written beneath it and paper cannot say otherwise; the outcome ring as a shape, whose slices are printed as a table under What it met; and the screen's reading guide. Everything else on their screen is here, from the same read model.",
    noUnits: "No meeting of theirs in the period opened an apartment in the catalogue.",
    registerKept:
      "Kept for the sales team: the rows of this register are the meeting drill-down's own material, which this account does not open. Every one of these meetings is counted in the sections above.",
    noFindings: "Nothing on their screen reached a finding in the period.",
    generation:
      "Nothing generates a document yet. This screen states what one agent's summary would contain, from the read model their own screen draws.",
    timedNoun: () => "timed meetings",
    listedNoun: () => "meetings listed",
  },
  sk: {
    activity: {
      label: "Aktivita v tomto období",
      summary:
        "Prezentácie, medián ich dĺžky, počet bytov otvorených na stretnutie a základné sekcie, ku ktorým sa dostali. Ďalej to, či bol ďalší kontakt označený za potrebný; o tom, či sa skutočne uskutočnil, však nemá záznam žiadny zdroj. Napokon zaznamenané výsledky stretnutí, pri každom aj počet, z ktorého sa počíta jeho podiel.",
    },
    funnel: {
      label: "Kam sa stretnutia dostali",
      summary:
        "5 pozorovaných stavov. Pri každom je uvedené, koľko stretnutí sa doň dostalo, aj celkový počet stretnutí, z ktorého sa podiel počíta. To neznamená, že jeden stav spôsobil ďalší.",
    },
    presentation: {
      label: "Ako prezentuje",
      summary:
        "Poradie sekcií na stretnutiach makléra a medián času stráveného v každej z nich. Nad hranicou sa pri každej sekcii uvádza aj jej podiel na meranom čase maklérovej prezentácie a vedľa neho medián tímu. Pod hranicou sa neuvádza ani podiel, ani medián tímu.",
    },
    buyers: {
      label: "Kupujúci a výsledky",
      summary:
        "Ktoré veľkosti bytov kupujúci otvárali a ako sa končili stretnutia tohto makléra: údaje sa uvádzajú ako počty jeho vlastných stretnutí. Nad hranicou je pri nich aj podiel a vedľa neho rovnaká miera za celý projekt.",
    },
    units: {
      label: "Byty, ku ktorým sa opakovane vracia",
      summary:
        "Najviac 6 bytov, ktoré otvorili na najväčšom podiele maklérových stretnutí. Pri každom vidno, koľkokrát ho pridali do obľúbených. Ide len o súvislosť s tým, ako maklér zvykne prezentovať, o nič viac.",
    },
    projects: {
      label: "Kde ešte prezentuje",
      summary:
        "Ďalšie projekty tohto konta s prezentáciami v tomto období a s počtom stretnutí na každom.",
    },
    meetings: {
      label: "Posledné stretnutia",
      summary:
        "Najviac 8 stretnutí, od najnovšieho. Pri každom je uvedená dĺžka, sekcie, otvorené byty, byty pridané do obľúbených, zaznamenaný výsledok a stav ďalšieho kontaktu. V stĺpci Návštevník je meno kupujúceho vedľa označenia, ktoré chráni jeho súkromie, iba ak kontakt súhlasil s uvedením mena. Inak sa zobrazí len toto označenie.",
    },
    findings: {
      label: "Zistenia za obdobie",
      summary: "Zistenia z maklérskej obrazovky, každé s porovnaním, podkladmi a výhradou.",
    },
    appendix: {
      label: "Príloha s podkladmi",
      summary:
        "Každá sekcia tohto zhrnutia so stavom, vzorkou vo vlastnom podstatnom mene a odkazom na záznamy pod ňou.",
    },
    notCarried:
      "V tomto dokumente chýba týždenný priebeh prezentácií: čiaru čitateľ vníma ako smer vývoja bez ohľadu na text pod ňou a na papieri sa to nedá vysvetliť inak. Chýba aj grafický prstenec výsledkov, hoci jeho výseky sú vytlačené v tabuľke pod nadpisom Kupujúci a výsledky, a návod na čítanie obrazovky. Všetko ostatné z maklérovej obrazovky tu je, z rovnakého dátového modelu.",
    noUnits: "Žiadne stretnutie v tomto období neotvorilo byt z katalógu.",
    registerKept:
      "Vyhradené pre obchodný tím: riadky tohto registra patria k detailu stretnutia, ktorý toto konto neotvára. Každé z týchto stretnutí je započítané v sekciách vyššie.",
    noFindings: "Nič na maklérskej obrazovke v tomto období nedosiahlo úroveň zistenia.",
    generation:
      "Dokument zatiaľ nič negeneruje. Táto obrazovka uvádza, čo by obsahovalo zhrnutie jedného makléra, z dátového modelu, ktorý kreslí maklérska obrazovka.",
    timedNoun: (n) =>
      pluralCategory("sk", n) === "one"
        ? "stretnutie s meraným časom"
        : pluralCategory("sk", n) === "few"
          ? "stretnutia s meraným časom"
          : "stretnutí s meraným časom",
    listedNoun: (n) =>
      pluralCategory("sk", n) === "one"
        ? "uvedené stretnutie"
        : pluralCategory("sk", n) === "few"
          ? "uvedené stretnutia"
          : "uvedených stretnutí",
  },
  hu: {
    activity: {
      label: "Aktivitás ebben az időszakban",
      summary:
        "A bemutatók száma és medián hossza, a találkozónként megnyitott lakások, valamint az elért alapvető szakaszok. Az is látszik, hogy jelöltek-e szükséges utánkövetést; arról viszont egyik forrás sem vezet nyilvántartást, hogy az valóban megtörtént-e. Végül a rögzített találkozóeredmények szerepelnek, mindegyiknél azzal a darabszámmal, amelyből az arányát számolják.",
    },
    funnel: {
      label: "Meddig jutottak a találkozói",
      summary:
        "5 megfigyelt állapot. Mindegyiknél látszik, hány találkozó jutott el odáig, és hány találkozóból számolják az arányt. Ebből nem következik, hogy az egyik szakasz okozta a következőt.",
    },
    presentation: {
      label: "Hogyan mutat be",
      summary:
        "Az értékesítő bemutatóin követett szakaszsorrend és az egyes szakaszokban töltött idő mediánja. A küszöb felett szakaszonként az is látszik, mekkora részt tesz ki a mért bemutatási időből, mellette pedig a csapat medián ideje. A küszöb alatt ez a 2 adat nem jelenik meg.",
    },
    buyers: {
      label: "Vevők és eredmények",
      summary:
        "A vevők által megnyitott lakások mérete és a találkozók kimenetele az értékesítő saját találkozóinak darabszámai szerint látható. A küszöb felett megjelenik az ezekből számolt arány és mellette a projekt megfelelő aránya is.",
    },
    units: {
      label: "A lakások, amelyeket újra meg újra megnyit",
      summary:
        "Legfeljebb 6 lakás, amelyeket az értékesítő találkozóinak legnagyobb hányadában nyitottak meg. Mindegyiknél látszik, hányszor került a Kedvencek listára. Ez csak az értékesítő bemutatási szokásaival mutat összefüggést, ennél többet nem állít.",
    },
    projects: {
      label: "Hol mutat még be",
      summary:
        "Azok a projektek, amelyekhez ennek a fióknak hozzáférése van, és amelyeken az időszakban szintén bemutatott, mindegyiken a találkozók számával.",
    },
    meetings: {
      label: "A legutóbbi találkozói",
      summary:
        "Legfeljebb 8 találkozó, a legújabbal kezdve. Mindegyiknél szerepel az időtartam, a szakaszok, a megnyitott lakások, a Kedvencek listára tett lakások, a rögzített eredmény és az utánkövetés állapota. A Látogató oszlopban a vevő neve csak akkor jelenik meg a személyes adatokat védő megjelölés mellett, ha az érintett hozzájárult a nevének feltüntetéséhez. Egyébként csak a megjelölés látható.",
    },
    findings: {
      label: "Az időszak megállapításai",
      summary:
        "A saját képernyőjén szereplő megállapítások, mindegyik az összevetéssel, a bizonyítékkal és a kikötéssel.",
    },
    appendix: {
      label: "Bizonyíték-függelék",
      summary:
        "Az összefoglaló minden szakasza az állapotával, a mintájával a saját főnevében, és a hivatkozással az alatta lévő rekordokra.",
    },
    notCarried:
      "Ebben a dokumentumban nincs benne a bemutatók heti idősora: a vonalat az ember akkor is irányként értelmezi, ha más magyarázat áll alatta, és ezt nyomtatásban nem lehet felülírni. Az eredménygyűrű ábrája sem szerepel, de a szeletei táblázatban láthatók a Vevők és eredmények szakaszban; a képernyő értelmezési útmutatója is kimarad. A képernyő összes többi adata ugyanabból az adatmodellből szerepel itt.",
    noUnits: "Egyetlen találkozója sem nyitott meg katalógusbeli lakást az időszakban.",
    registerKept:
      "Az értékesítői csapatnak fenntartva: a lista sorai a találkozó részletnézetéhez tartoznak, amelyet ez a fiók nem nyit meg. Mindegyik találkozó szerepel a fenti szakaszok számaiban.",
    noFindings: "A képernyőjén semmi sem ért el megállapítást az időszakban.",
    generation:
      "Dokumentumot még semmi sem állít elő. Ez a képernyő azt mutatja meg, mit tartalmazna egy értékesítő összefoglalója, abból az adatmodellből, amelyet a saját képernyője rajzol.",
    timedNoun: () => "mért idejű találkozó",
    listedNoun: () => "listázott találkozó",
  },
};

export function buildAgentReportScope(
  context: ViewContext,
  sessions: readonly ShowroomSession[],
  visibleProjects: readonly ProjectSummary[],
  agentId: string,
): ReportScopeView | null {
  const view = buildAgentDetail(context, sessions, visibleProjects, agentId);
  if (view === null) return null;
  const root = `/${context.tenant.slug}/${context.project.slug}`;
  const n = view.sampleSize;
  const language = context.language ?? DEFAULT_LANGUAGE;
  const words = AGENT_SCOPE_WORDS[language];
  const scopeWords = SCOPE_WORDS[language];
  const evidence = (id: string, observations: number) =>
    evidenceRef(
      `report-${context.project.slug}-agent-${agentId}-${id}`,
      "observed_sequence",
      `${root}/report?agent=${agentId}`,
      observations,
    );

  /*
   * A section of rates, under the floor, is writable with a stated gap: the
   * figures stand as raw counts with their shortfall, and no verdict, rank or
   * trend is drawn from them. The sentence is the read model's, not this
   * file's, so the manifest and the page lead with the same words.
   */
  const rates = (gap: string | null = null): Pick<ReportSection, "availability" | "reason"> => {
    const reasons = [view.suppressionNote, gap].filter((s): s is string => s !== null);
    return reasons.length === 0
      ? { availability: "ready", reason: null }
      : { availability: "partial", reason: reasons.join(" ") };
  };

  /* What the document does not carry of the screen, said once and in full. */
  const notCarried = words.notCarried;

  const sections: readonly ReportSection[] = [
    {
      id: "agent-activity",
      label: words.activity.label,
      summary: words.activity.summary,
      ...rates(),
      sources: DERIVED,
      sampleSize: n,
      sampleNoun: meetingsNoun(language, n),
      evidence: evidence("activity", n),
    },
    {
      id: "agent-funnel",
      label: words.funnel.label,
      summary: words.funnel.summary,
      availability: "ready",
      reason: null,
      sources: OBSERVED,
      sampleSize: n,
      sampleNoun: meetingsNoun(language, n),
      evidence: evidence("funnel", n),
    },
    {
      id: "agent-presentation",
      label: words.presentation.label,
      summary: words.presentation.summary,
      ...rates(notCarried),
      sources: DERIVED,
      sampleSize: view.profile.timedMeetings,
      sampleNoun: words.timedNoun(view.profile.timedMeetings),
      evidence: evidence("presentation", view.profile.timedMeetings),
    },
    {
      id: "agent-buyers",
      label: words.buyers.label,
      summary: words.buyers.summary,
      ...rates(),
      sources: DERIVED,
      sampleSize: n,
      sampleNoun: meetingsNoun(language, n),
      evidence: evidence("buyers", n),
    },
    {
      id: "agent-units",
      label: words.units.label,
      summary: words.units.summary,
      ...(view.commonUnits.length === 0
        ? {
            availability: "unavailable" as const,
            reason: words.noUnits,
          }
        : rates()),
      sources: DERIVED,
      sampleSize: n,
      sampleNoun: meetingsNoun(language, n),
      evidence: view.commonUnits.length === 0 ? null : evidence("units", n),
    },
    {
      id: "agent-projects",
      label: words.projects.label,
      summary: words.projects.summary,
      availability: "ready",
      reason: null,
      sources: OBSERVED,
      sampleSize: null,
      sampleNoun: meetingsNoun(language, null),
      evidence: evidence("projects", view.projects.length),
    },
    {
      id: "agent-meetings",
      label: words.meetings.label,
      summary: words.meetings.summary,
      /* The register is the meeting drill-down's material, and it keeps the drill-down's audience. */
      ...(AGENT_REGISTER_ROLES.includes(context.viewer.role)
        ? { availability: "ready" as const, reason: null }
        : {
            availability: "unavailable" as const,
            reason: words.registerKept,
          }),
      sources: OBSERVED,
      /* A section drawn blank lists nothing, so it counts nothing as listed (P2-16). */
      sampleSize: AGENT_REGISTER_ROLES.includes(context.viewer.role)
        ? view.recentMeetings.length
        : null,
      sampleNoun: words.listedNoun(view.recentMeetings.length),
      evidence: evidence("meetings", view.recentMeetings.length),
    },
    {
      id: "agent-findings",
      label: words.findings.label,
      summary: words.findings.summary,
      availability: view.findings.length === 0 ? "unavailable" : "ready",
      reason: view.findings.length === 0 ? words.noFindings : null,
      sources: DERIVED,
      sampleSize: n,
      sampleNoun: meetingsNoun(language, n),
      evidence: view.findings.length === 0 ? null : evidence("findings", view.findings.length),
    },
    {
      id: "evidence-appendix",
      label: words.appendix.label,
      summary: words.appendix.summary,
      availability: "ready",
      reason: null,
      sources: DERIVED,
      sampleSize: null,
      sampleNoun: meetingsNoun(language, null),
      evidence: evidence("appendix", n),
    },
  ];

  return {
    context,
    scope: {
      kind: "agent",
      label: `${view.name} · ${context.period.label}`,
      projectName: context.project.name,
      meetingId: null,
      agentId,
    },
    periodLabel: context.period.label,
    sections,
    generation: {
      state: "preview_only",
      statement: words.generation,
      milestone: scopeWords.milestone,
    },
    unavailableCount: sections.filter((s) => s.availability === "unavailable").length,
    evidence: evidence("scope", n),
  };
}
