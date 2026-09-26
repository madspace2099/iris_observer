import { describe, expect, it } from "vitest";
import type { MeetingId } from "@observer/contracts";
import {
  LANGUAGES,
  hungarianArticle,
  roomsWord,
  sentence,
  type Language,
  type Sentence,
  type SentenceValues,
} from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "../src/index";
import {
  askPresentersSentence,
  askRecordedSentence,
  askTopApartmentSentence,
} from "../src/ask-computed";
import * as ask from "../src/ask-computed";
import {
  DEAL_LAG_HOURS_SENTENCE,
  DEAL_NOT_OPENED_SENTENCE,
  DEAL_SALES_NEEDED_SENTENCE,
  DEAL_SHOWN_EARLIER_SENTENCE,
  DEAL_STATED_SENTENCE,
  DEAL_UNDATED_SENTENCE,
  DEAL_UNMAPPED_SENTENCE,
  DEAL_UNPLACED_SENTENCE,
} from "../src/deals";
import { count } from "../src/format";
import { TIME_BASELINE_SENTENCE } from "../src/time";
import {
  ATTENTION_FALLING_SENTENCE,
  ATTENTION_NEVER_REPORTED_SENTENCE,
  ATTENTION_NEVER_SHORTLISTED_SENTENCE,
  ATTENTION_SILENT_SENTENCE,
} from "../src/showroom/attention";
import {
  PROJECT_INTENT_SENTENCE,
  PROJECT_NO_OUTCOME_SENTENCE,
  PROJECT_UNIT_OPENED_SENTENCE,
  unitsViewedSentence,
} from "../src/showroom/project";
import {
  SCREENS_OPENED_SENTENCE,
  SCREENS_SHORTLISTED_SENTENCE,
  SCREENS_UNIT_HEADLINE,
} from "../src/showroom/screens";
import {
  VIEWS3_LAST_MONTH_SENTENCE,
  VIEWS3_LAST_WEEK_SENTENCE,
  VIEWS3_PERIOD_MEETINGS,
} from "../src/showroom/views3";
import { sessionsForProject } from "../src/showroom/sessions";

/**
 * EVERY SENTENCE, WHOLE, IN EVERY LANGUAGE.
 *
 * The round before this one proved the words; a word is not what a reader
 * sees. Each sentence that counts is written once per language in that
 * language's own order, and this file states each of them whole — at 1, 3 and
 * 5, in English, Slovak and Hungarian — with the other values it carries set
 * to what a screen would pass (the counts formatted in the project's en-GB
 * locale). Every expected sentence is written out here, not produced by the
 * code under test, so the file is what a reviewer reads to check them.
 */

type Three = readonly [string, string, string];

interface Case {
  readonly name: string;
  readonly entry: Sentence;
  readonly values: (n: number, language: Language) => SentenceValues;
  readonly en: Three;
  readonly sk: Three;
  readonly hu: Three;
}

const COUNTS = [1, 3, 5] as const;
const counted = (n: number) => ({ count: count(n, "en-GB"), n });
const DAY_WORDS: Readonly<Record<Language, string>> = { en: "2 days", sk: "2 dni", hu: "2 nap" };

const CASES: readonly Case[] = [
  {
    name: "deals.ts: open deals with no stage date",
    entry: DEAL_UNDATED_SENTENCE,
    values: (n) => ({ count: n, deals: String(n) }),
    en: [
      "1 open deal carries no stage date and cannot be placed.",
      "3 open deals carry no stage date and cannot be placed.",
      "5 open deals carry no stage date and cannot be placed.",
    ],
    sk: [
      "Pri jednom otvorenom obchode chýba dátum fázy predaja, preto ho nemožno časovo zaradiť.",
      "Pri troch otvorených obchodoch chýba dátum fázy predaja, preto ich nemožno časovo zaradiť.",
      "Pri piatich otvorených obchodoch chýba dátum fázy predaja, preto ich nemožno časovo zaradiť.",
    ],
    hu: [
      "Egy nyitott ügyletnél hiányzik az értékesítési szakasz dátuma, ezért nem lehet időrendbe helyezni.",
      "Három nyitott ügyletnél hiányzik az értékesítési szakasz dátuma, ezért ezeket nem lehet időrendbe helyezni.",
      "Öt nyitott ügyletnél hiányzik az értékesítési szakasz dátuma, ezért ezeket nem lehet időrendbe helyezni.",
    ],
  },
  {
    name: "deals.ts: the deals a connector stated",
    entry: DEAL_STATED_SENTENCE,
    values: (n) => ({ count: n, connector: "the demonstration CRM" }),
    en: [
      "Stated by the demonstration CRM: 1 deal as it stands now.",
      "Stated by the demonstration CRM: 3 deals as they stand now.",
      "Stated by the demonstration CRM: 5 deals as they stand now.",
    ],
    sk: [
      "Aktuálne je evidovaný 1 obchod. Zdroj: the demonstration CRM.",
      "Aktuálne sú evidované 3 obchody. Zdroj: the demonstration CRM.",
      "Aktuálne je evidovaných 5 obchodov. Zdroj: the demonstration CRM.",
    ],
    hu: [
      "Jelenleg 1 ügylet szerepel. Forrás: the demonstration CRM.",
      "Jelenleg 3 ügylet szerepel. Forrás: the demonstration CRM.",
      "Jelenleg 5 ügylet szerepel. Forrás: the demonstration CRM.",
    ],
  },
  {
    name: "deals.ts: deals whose stage word is not mapped",
    entry: DEAL_UNMAPPED_SENTENCE,
    values: (n) => ({ count: n, deals: String(n) }),
    en: [
      "1 deal carries a stage word not mapped yet and sits on no rung.",
      "3 deals carry a stage word not mapped yet and sit on no rung.",
      "5 deals carry a stage word not mapped yet and sit on no rung.",
    ],
    sk: [
      "Pri jednom obchode názov fázy zatiaľ nie je priradený k žiadnemu kroku predajného procesu, preto ho nemožno zaradiť.",
      "Pri troch obchodoch názov fázy zatiaľ nie je priradený k žiadnemu kroku predajného procesu, preto ich nemožno zaradiť.",
      "Pri piatich obchodoch názov fázy zatiaľ nie je priradený k žiadnemu kroku predajného procesu, preto ich nemožno zaradiť.",
    ],
    hu: [
      "Egy ügyletnél a megadott szakasznév még nincs az értékesítési folyamat egyik lépéséhez sem rendelve, ezért az ügyletet nem lehet besorolni.",
      "Három ügyletnél a megadott szakasznév még nincs az értékesítési folyamat egyik lépéséhez sem rendelve, ezért ezeket nem lehet besorolni.",
      "Öt ügyletnél a megadott szakasznév még nincs az értékesítési folyamat egyik lépéséhez sem rendelve, ezért ezeket nem lehet besorolni.",
    ],
  },
  {
    name: "deals.ts: a showing's lag, in hours",
    entry: DEAL_LAG_HOURS_SENTENCE,
    values: (n) => ({ count: n }),
    en: ["1 hour before", "3 hours before", "5 hours before"],
    sk: ["1 hodinu predtým", "3 hodiny predtým", "5 hodín predtým"],
    hu: ["1 órával előtte", "3 órával előtte", "5 órával előtte"],
  },
  {
    name: "deals.ts: dated sales still needed",
    entry: DEAL_SALES_NEEDED_SENTENCE,
    values: (n) => ({ count: n, sales: String(n) }),
    en: [
      "1 more dated sale is needed before a share is stated.",
      "3 more dated sales are needed before a share is stated.",
      "5 more dated sales are needed before a share is stated.",
    ],
    sk: [
      "Aby sme mohli uviesť podiel, potrebujeme ešte jeden predaj s uvedeným dátumom predaja.",
      "Aby sme mohli uviesť podiel, potrebujeme ešte tri predaje s uvedeným dátumom predaja.",
      "Aby sme mohli uviesť podiel, potrebujeme ešte päť predajov s uvedeným dátumom predaja.",
    ],
    hu: [
      "Az arány megadásához még egy olyan eladás kell, amelynél az eladás dátuma is szerepel.",
      "Az arány megadásához még három olyan eladás kell, amelyeknél az eladás dátuma is szerepel.",
      "Az arány megadásához még öt olyan eladás kell, amelyeknél az eladás dátuma is szerepel.",
    ],
  },
  {
    name: "deals.ts: sales shown earlier than the window",
    entry: DEAL_SHOWN_EARLIER_SENTENCE,
    values: (n, language) => ({
      count: n,
      sales: String(n),
      median: 2,
      medianDays: DAY_WORDS[language],
    }),
    en: [
      "1 more was shown earlier than that, a median of 2 days before the date.",
      "3 more were shown earlier than that, a median of 2 days before the date.",
      "5 more were shown earlier than that, a median of 2 days before the date.",
    ],
    sk: [
      "Pri jednom ďalšom predaji ukázali byt už pred sledovaným obdobím, 2 dni pred dátumom predaja.",
      "Pri ďalších troch predajoch ukázali byty už pred sledovaným obdobím. Medián odstupu od dátumu predaja bol 2 dni.",
      "Pri ďalších piatich predajoch ukázali byty už pred sledovaným obdobím. Medián odstupu od dátumu predaja bol 2 dni.",
    ],
    hu: [
      "Egy további eladásnál a lakást már a vizsgált időszak előtt bemutatták, 2 nappal az eladás dátuma előtt.",
      "Három további eladásnál a lakást már a vizsgált időszak előtt bemutatták. A bemutatás mediánban 2 nappal előzte meg az eladás dátumát.",
      "Öt további eladásnál a lakást már a vizsgált időszak előtt bemutatták. A bemutatás mediánban 2 nappal előzte meg az eladás dátumát.",
    ],
  },
  {
    name: "deals.ts: sales whose unit was never opened",
    entry: DEAL_NOT_OPENED_SENTENCE,
    values: (n) => ({ count: n, units: String(n) }),
    en: [
      "1 was not opened in IRIS before the date at all.",
      "3 were not opened in IRIS before the date at all.",
      "5 were not opened in IRIS before the date at all.",
    ],
    sk: [
      "Jeden predaný byt pred dátumom predaja v IRIS ani raz neotvorili.",
      "Tri predané byty pred dátumom predaja v IRIS ani raz neotvorili.",
      "Päť predaných bytov pred dátumom predaja v IRIS ani raz neotvorili.",
    ],
    hu: [
      "Egy eladott lakást az eladás dátuma előtt egyszer sem nyitottak meg az IRIS-ben.",
      "Három eladott lakást az eladásuk dátuma előtt egyszer sem nyitottak meg az IRIS-ben.",
      "Öt eladott lakást az eladásuk dátuma előtt egyszer sem nyitottak meg az IRIS-ben.",
    ],
  },
  {
    name: "deals.ts: sales that cannot be placed",
    entry: DEAL_UNPLACED_SENTENCE,
    values: (n) => ({ count: n, sales: String(n) }),
    en: [
      "1 sale carries no stage date Observer could use or names no unit, and cannot be placed.",
      "3 sales carry no stage date Observer could use or name no unit, and cannot be placed.",
      "5 sales carry no stage date Observer could use or name no unit, and cannot be placed.",
    ],
    sk: [
      "Pri jednom predaji chýba dátum fázy, ktorý vie Observer použiť, alebo nie je uvedené, ktorého bytu sa týka. Preto ho nemožno zaradiť do analýzy.",
      "Pri troch predajoch chýba dátum fázy, ktorý vie Observer použiť, alebo nie je uvedené, ktorých bytov sa týkajú. Preto ich nemožno zaradiť do analýzy.",
      "Pri piatich predajoch chýba dátum fázy, ktorý vie Observer použiť, alebo nie je uvedené, ktorých bytov sa týkajú. Preto ich nemožno zaradiť do analýzy.",
    ],
    hu: [
      "Egy eladásnál nincs az Observer számára használható szakaszdátum, vagy nem derül ki, melyik lakásról van szó. Ezért az eladást nem lehet elhelyezni az elemzésben.",
      "Három eladásnál nincs az Observer számára használható szakaszdátum, vagy nem derül ki, melyik lakásról van szó. Ezért ezeket nem lehet elhelyezni az elemzésben.",
      "Öt eladásnál nincs az Observer számára használható szakaszdátum, vagy nem derül ki, melyik lakásról van szó. Ezért ezeket nem lehet elhelyezni az elemzésben.",
    ],
  },
  {
    name: "attention.ts: units whose attention fell",
    entry: ATTENTION_FALLING_SENTENCE,
    values: (n) => ({ ...counted(n), baseline: "the previous quarter" }),
    en: [
      "1 unit drew materially fewer views than in the previous quarter.",
      "3 units drew materially fewer views than in the previous quarter.",
      "5 units drew materially fewer views than in the previous quarter.",
    ],
    sk: [
      "1 jednotka pritiahla výrazne menej zobrazení než v porovnávacom období (the previous quarter).",
      "3 jednotky pritiahli výrazne menej zobrazení než v porovnávacom období (the previous quarter).",
      "5 jednotiek pritiahlo výrazne menej zobrazení než v porovnávacom období (the previous quarter).",
    ],
    hu: [
      "1 egység lényegesen kevesebb megtekintést kapott, mint az összehasonlító időszakban (the previous quarter).",
      "3 egység lényegesen kevesebb megtekintést kapott, mint az összehasonlító időszakban (the previous quarter).",
      "5 egység lényegesen kevesebb megtekintést kapott, mint az összehasonlító időszakban (the previous quarter).",
    ],
  },
  {
    name: "attention.ts: connected sources gone quiet",
    entry: ATTENTION_SILENT_SENTENCE,
    values: (n) => ({ ...counted(n), hours: 72 }),
    en: [
      "1 connected source has sent nothing for more than 72 hours.",
      "3 connected sources have sent nothing for more than 72 hours.",
      "5 connected sources have sent nothing for more than 72 hours.",
    ],
    sk: [
      "1 pripojený zdroj neposlal nič už viac ako 72 hodín.",
      "3 pripojené zdroje neposlali nič už viac ako 72 hodín.",
      "5 pripojených zdrojov neposlalo nič už viac ako 72 hodín.",
    ],
    hu: [
      "1 csatlakoztatott forrás nem küldött semmit több mint 72 órája.",
      "3 csatlakoztatott forrás nem küldött semmit több mint 72 órája.",
      "5 csatlakoztatott forrás nem küldött semmit több mint 72 órája.",
    ],
  },
  {
    name: "attention.ts: sources that never reported",
    entry: ATTENTION_NEVER_REPORTED_SENTENCE,
    values: (n) => counted(n),
    en: [
      "1 source is listed on this project and has never reported.",
      "3 sources are listed on this project and have never reported.",
      "5 sources are listed on this project and have never reported.",
    ],
    sk: [
      "1 zdroj je uvedený na tomto projekte a nikdy sa neozval.",
      "3 zdroje sú uvedené na tomto projekte a nikdy sa neozvali.",
      "5 zdrojov je uvedených na tomto projekte a nikdy sa neozvalo.",
    ],
    hu: [
      "1 forrás szerepel ezen a projekten, és soha nem jelentkezett.",
      "3 forrás szerepel ezen a projekten, és soha nem jelentkezett.",
      "5 forrás szerepel ezen a projekten, és soha nem jelentkezett.",
    ],
  },
  {
    name: "attention.ts: units opened repeatedly and never shortlisted",
    entry: ATTENTION_NEVER_SHORTLISTED_SENTENCE,
    values: (n) => ({ ...counted(n), minimum: 10 }),
    en: [
      "1 unit with at least 10 observations was never shortlisted in this period.",
      "3 units with at least 10 observations were never shortlisted in this period.",
      "5 units with at least 10 observations were never shortlisted in this period.",
    ],
    sk: [
      "1 jednotka s aspoň 10 pozorovaniami nebola nikdy vybraná v tomto období.",
      "3 jednotky s aspoň 10 pozorovaniami neboli nikdy vybrané v tomto období.",
      "5 jednotiek s aspoň 10 pozorovaniami nebolo nikdy vybraných v tomto období.",
    ],
    hu: [
      "1 egység, amelyről legalább 10 megfigyelés van, soha nem került kiválasztásra ebben az időszakban.",
      "3 egység, amelyről legalább 10 megfigyelés van, soha nem került kiválasztásra ebben az időszakban.",
      "5 egység, amelyről legalább 10 megfigyelés van, soha nem került kiválasztásra ebben az időszakban.",
    ],
  },
  {
    name: "project.ts: meetings in neither cohort",
    entry: PROJECT_NO_OUTCOME_SENTENCE,
    values: (n) => counted(n),
    en: [
      "1 meeting in the period has no recorded outcome and stands in neither cohort.",
      "3 meetings in the period have no recorded outcome and stand in neither cohort.",
      "5 meetings in the period have no recorded outcome and stand in neither cohort.",
    ],
    sk: [
      "1 stretnutie v tomto období nemá zaznamenaný výsledok a nepatrí do žiadnej kohorty.",
      "3 stretnutia v tomto období nemajú zaznamenaný výsledok a nepatria do žiadnej kohorty.",
      "5 stretnutí v tomto období nemá zaznamenaný výsledok a nepatrí do žiadnej kohorty.",
    ],
    hu: [
      "1 találkozónak ebben az időszakban nincs rögzített kimenetele, és nem tartozik egyik csoportba sem.",
      "3 találkozónak ebben az időszakban nincs rögzített kimenetele, és nem tartozik egyik csoportba sem.",
      "5 találkozónak ebben az időszakban nincs rögzített kimenetele, és nem tartozik egyik csoportba sem.",
    ],
  },
  {
    name: "project.ts: a unit opened in meetings",
    entry: PROJECT_UNIT_OPENED_SENTENCE,
    values: (n) => ({ ...counted(n), unit: "A-101", look: "1m 45s" }),
    en: [
      "A-101 was opened in 1 meeting, with a median look of 1m 45s.",
      "A-101 was opened in 3 meetings, with a median look of 1m 45s.",
      "A-101 was opened in 5 meetings, with a median look of 1m 45s.",
    ],
    sk: [
      "Jednotka A-101 bola otvorená v 1 stretnutí, medián dĺžky pohľadu bol 1m 45s.",
      "Jednotka A-101 bola otvorená v 3 stretnutiach, medián dĺžky pohľadu bol 1m 45s.",
      "Jednotka A-101 bola otvorená v 5 stretnutiach, medián dĺžky pohľadu bol 1m 45s.",
    ],
    hu: [
      "Az A-101 egységet 1 találkozón nyitották meg, a megtekintés hosszának mediánja 1m 45s volt.",
      "Az A-101 egységet 3 találkozón nyitották meg, a megtekintés hosszának mediánja 1m 45s volt.",
      "Az A-101 egységet 5 találkozón nyitották meg, a megtekintés hosszának mediánja 1m 45s volt.",
    ],
  },
  {
    name: "project.ts: shortlisted, and the floor plan taken",
    entry: PROJECT_INTENT_SENTENCE,
    values: (n) => ({
      favourites: count(n, "en-GB"),
      f: n,
      pdfOpens: count(n, "en-GB"),
      p: n,
    }),
    en: [
      "Shortlisted 1 time, floor plan opened 1 time.",
      "Shortlisted 3 times, floor plan opened 3 times.",
      "Shortlisted 5 times, floor plan opened 5 times.",
    ],
    sk: [
      "Zaradená do výberu 1 raz, pôdorys otvorený 1 raz.",
      "Zaradená do výberu 3 razy, pôdorys otvorený 3 razy.",
      "Zaradená do výberu 5 ráz, pôdorys otvorený 5 ráz.",
    ],
    hu: [
      "1 alkalommal került a kiválasztottak közé, az alaprajzot 1 alkalommal nyitották meg.",
      "3 alkalommal került a kiválasztottak közé, az alaprajzot 3 alkalommal nyitották meg.",
      "5 alkalommal került a kiválasztottak közé, az alaprajzot 5 alkalommal nyitották meg.",
    ],
  },
  {
    name: "screens.ts: a timeline entry, opened",
    entry: SCREENS_OPENED_SENTENCE,
    values: (n) => counted(n),
    en: ["Opened 1 time", "Opened 3 times", "Opened 5 times"],
    sk: ["Otvorená 1 raz", "Otvorená 3 razy", "Otvorená 5 ráz"],
    hu: ["1 alkalommal megnyitva", "3 alkalommal megnyitva", "5 alkalommal megnyitva"],
  },
  {
    name: "screens.ts: shortlisted in meetings, none followed up",
    entry: SCREENS_SHORTLISTED_SENTENCE,
    values: (n) => ({ ...counted(n), unit: "B-302" }),
    en: [
      "B-302 was shortlisted in 1 meeting, none of which recorded a follow-up.",
      "B-302 was shortlisted in 3 meetings, none of which recorded a follow-up.",
      "B-302 was shortlisted in 5 meetings, none of which recorded a follow-up.",
    ],
    sk: [
      "Jednotka B-302 bola zaradená do výberu v 1 stretnutí a pri ňom nebol zaznamenaný žiadny ďalší krok.",
      "Jednotka B-302 bola zaradená do výberu v 3 stretnutiach a pri žiadnom z nich nebol zaznamenaný ďalší krok.",
      "Jednotka B-302 bola zaradená do výberu v 5 stretnutiach a pri žiadnom z nich nebol zaznamenaný ďalší krok.",
    ],
    hu: [
      "A B-302 egység 1 találkozón került a kiválasztottak közé, és azon nem rögzítettek utánkövetést.",
      "A B-302 egység 3 találkozón került a kiválasztottak közé, és egyiken sem rögzítettek utánkövetést.",
      "A B-302 egység 5 találkozón került a kiválasztottak közé, és egyiken sem rögzítettek utánkövetést.",
    ],
  },
  {
    name: "screens.ts: a unit's headline",
    entry: SCREENS_UNIT_HEADLINE,
    values: (n, language) => ({
      ...counted(n),
      unit: "B-302",
      rooms: roomsWord(2, language),
      area: "63 m²",
      price: "€240,000",
    }),
    en: [
      "B-302 · 2 rooms · 63 m² · €240,000 · opened in 1 meeting",
      "B-302 · 2 rooms · 63 m² · €240,000 · opened in 3 meetings",
      "B-302 · 2 rooms · 63 m² · €240,000 · opened in 5 meetings",
    ],
    sk: [
      "B-302 · 2 izby · 63 m² · €240,000 · otvorená v 1 stretnutí",
      "B-302 · 2 izby · 63 m² · €240,000 · otvorená v 3 stretnutiach",
      "B-302 · 2 izby · 63 m² · €240,000 · otvorená v 5 stretnutiach",
    ],
    hu: [
      "B-302 · 2 szoba · 63 m² · €240,000 · 1 találkozón megnyitva",
      "B-302 · 2 szoba · 63 m² · €240,000 · 3 találkozón megnyitva",
      "B-302 · 2 szoba · 63 m² · €240,000 · 5 találkozón megnyitva",
    ],
  },
  {
    name: "views3.ts: last week, while it runs",
    entry: VIEWS3_LAST_WEEK_SENTENCE,
    values: (n) => ({ count: n }),
    en: ["Last week, first 1 day", "Last week, first 3 days", "Last week, first 5 days"],
    sk: ["Minulý týždeň, prvý 1 deň", "Minulý týždeň, prvé 3 dni", "Minulý týždeň, prvých 5 dní"],
    hu: ["Előző hét, első 1 nap", "Előző hét, első 3 nap", "Előző hét, első 5 nap"],
  },
  {
    name: "views3.ts: last month, while this one runs",
    entry: VIEWS3_LAST_MONTH_SENTENCE,
    values: (n) => ({ count: n }),
    en: ["Last month, first 1 day", "Last month, first 3 days", "Last month, first 5 days"],
    sk: ["Minulý mesiac, prvý 1 deň", "Minulý mesiac, prvé 3 dni", "Minulý mesiac, prvých 5 dní"],
    hu: ["Előző hónap, első 1 nap", "Előző hónap, első 3 nap", "Előző hónap, első 5 nap"],
  },
  {
    name: 'views3.ts: the meetings of the period, where a single one was "1 meetings"',
    entry: VIEWS3_PERIOD_MEETINGS,
    values: (n) => counted(n),
    en: ["1 meeting this period.", "3 meetings this period.", "5 meetings this period."],
    sk: [
      "V tomto období bolo 1 stretnutie.",
      "V tomto období boli 3 stretnutia.",
      "V tomto období bolo 5 stretnutí.",
    ],
    hu: [
      "Ebben az időszakban 1 találkozó volt.",
      "Ebben az időszakban 3 találkozó volt.",
      "Ebben az időszakban 5 találkozó volt.",
    ],
  },
  {
    name: "time.ts: the part-quarter's baseline",
    entry: TIME_BASELINE_SENTENCE,
    values: (n) => ({ count: n }),
    en: [
      "the same 1 day of the previous quarter",
      "the same 3 days of the previous quarter",
      "the same 5 days of the previous quarter",
    ],
    sk: [
      "rovnaký 1 deň predchádzajúceho štvrťroka",
      "rovnaké 3 dni predchádzajúceho štvrťroka",
      "rovnakých 5 dní predchádzajúceho štvrťroka",
    ],
    hu: [
      "az előző negyedév ugyanazon 1 napja",
      "az előző negyedév ugyanazon 3 napja",
      "az előző negyedév ugyanazon 5 napja",
    ],
  },
];

describe.each(CASES)("$name", (c) => {
  it.each([...LANGUAGES])("%s: the whole sentence at 1, 3 and 5", (language) => {
    COUNTS.forEach((n, i) => {
      expect(sentence(language, c.entry, c.values(n, language))).toBe(c[language][i]);
    });
  });
});

/*
 * The two Ask answers that branch. Each is stated whole through the function
 * that chooses the branch, at the pairs the approved text was checked
 * against: presentations / outcomes for the first, opened / presentations /
 * apartments for the second.
 */
describe("ask-computed.ts: the presentations recorded, and how many ended with an outcome", () => {
  const PAIRS = [
    [1, 0],
    [1, 1],
    [3, 1],
    [3, 3],
    [5, 0],
    [5, 2],
    [5, 5],
    [12, 4],
    [7, 5],
  ] as const;
  const expected: Readonly<Record<Language, readonly string[]>> = {
    en: [
      "1 presentation was recorded on Northgate Residences in quarter to date. The agent did not record an outcome at the end of any of them.",
      "1 presentation was recorded on Northgate Residences in quarter to date. The agent recorded an outcome at the end of every presentation.",
      "3 presentations were recorded on Northgate Residences in quarter to date. The agent recorded an outcome at the end of 1 of them.",
      "3 presentations were recorded on Northgate Residences in quarter to date. The agent recorded an outcome at the end of every presentation.",
      "5 presentations were recorded on Northgate Residences in quarter to date. The agent did not record an outcome at the end of any of them.",
      "5 presentations were recorded on Northgate Residences in quarter to date. The agent recorded an outcome at the end of 2 of them.",
      "5 presentations were recorded on Northgate Residences in quarter to date. The agent recorded an outcome at the end of every presentation.",
      "12 presentations were recorded on Northgate Residences in quarter to date. The agent recorded an outcome at the end of 4 of them.",
      "7 presentations were recorded on Northgate Residences in quarter to date. The agent recorded an outcome at the end of 5 of them.",
    ],
    sk: [
      "Pri projekte Northgate Residences bola za obdobie quarter to date zaznamenaná jedna prezentácia. Realitný maklér na konci ani jednej z nich nezadal výsledok stretnutia.",
      "Pri projekte Northgate Residences bola za obdobie quarter to date zaznamenaná jedna prezentácia. Realitný maklér zadal výsledok stretnutia na jej konci.",
      "Pri projekte Northgate Residences boli za obdobie quarter to date zaznamenané 3 prezentácie. Realitný maklér zadal výsledok stretnutia na konci jednej z nich.",
      "Pri projekte Northgate Residences boli za obdobie quarter to date zaznamenané 3 prezentácie. Realitný maklér zadal výsledok stretnutia na konci každej z nich.",
      "Pri projekte Northgate Residences bolo za obdobie quarter to date zaznamenaných 5 prezentácií. Realitný maklér na konci ani jednej z nich nezadal výsledok stretnutia.",
      "Pri projekte Northgate Residences bolo za obdobie quarter to date zaznamenaných 5 prezentácií. Realitný maklér zadal výsledok stretnutia na konci dvoch z nich.",
      "Pri projekte Northgate Residences bolo za obdobie quarter to date zaznamenaných 5 prezentácií. Realitný maklér zadal výsledok stretnutia na konci každej z nich.",
      "Pri projekte Northgate Residences bolo za obdobie quarter to date zaznamenaných 12 prezentácií. Realitný maklér zadal výsledok stretnutia na konci štyroch z nich.",
      "Pri projekte Northgate Residences bolo za obdobie quarter to date zaznamenaných 7 prezentácií. Realitný maklér zadal výsledok stretnutia na konci piatich z nich.",
    ],
    hu: [
      "A Northgate Residences projektnél a quarter to date időszakban egy bemutatót rögzítettek. Az ingatlanértékesítő egyik bemutató végén sem adta meg a találkozó eredményét.",
      "A Northgate Residences projektnél a quarter to date időszakban egy bemutatót rögzítettek. Az ingatlanértékesítő a végén megadta a találkozó eredményét.",
      "A Northgate Residences projektnél a quarter to date időszakban 3 bemutatót rögzítettek. Az ingatlanértékesítő ezek közül 1 bemutató végén adta meg a találkozó eredményét.",
      "A Northgate Residences projektnél a quarter to date időszakban 3 bemutatót rögzítettek. Az ingatlanértékesítő mindhárom végén adta meg a találkozó eredményét.",
      "A Northgate Residences projektnél a quarter to date időszakban 5 bemutatót rögzítettek. Az ingatlanértékesítő egyik bemutató végén sem adta meg a találkozó eredményét.",
      "A Northgate Residences projektnél a quarter to date időszakban 5 bemutatót rögzítettek. Az ingatlanértékesítő ezek közül 2 bemutató végén adta meg a találkozó eredményét.",
      "A Northgate Residences projektnél a quarter to date időszakban 5 bemutatót rögzítettek. Az ingatlanértékesítő mindegyik bemutató végén adta meg a találkozó eredményét.",
      "A Northgate Residences projektnél a quarter to date időszakban 12 bemutatót rögzítettek. Az ingatlanértékesítő ezek közül 4 bemutató végén adta meg a találkozó eredményét.",
      "A Northgate Residences projektnél a quarter to date időszakban 7 bemutatót rögzítettek. Az ingatlanértékesítő ezek közül 5 bemutató végén adta meg a találkozó eredményét.",
    ],
  };

  it.each([...LANGUAGES])("%s: NONE, SOME and ALL at every pair", (language) => {
    expect(
      PAIRS.map(([n, outcomes]) =>
        askRecordedSentence(
          language,
          "en-GB",
          n,
          outcomes,
          "Northgate Residences",
          "quarter to date",
        ),
      ),
    ).toEqual(expected[language]);
  });
});

describe("ask-computed.ts: the apartment opened most", () => {
  const TRIPLES = [
    [1, 1, 1],
    [1, 1, 3],
    [2, 5, 7],
    [3, 3, 4],
    [5, 5, 5],
    [7, 9, 12],
    [5, 9, 12],
    [2, 4, 5],
    [3, 7, 4],
    [4, 4, 1],
  ] as const;
  const expected: Readonly<Record<Language, readonly string[]>> = {
    en: [
      "A-101 was opened in 1 of 1 presentation in quarter to date; 1 different apartment was opened in all.",
      "A-101 was opened in 1 of 1 presentation in quarter to date; 3 different apartments were opened in all.",
      "A-101 was opened in 2 of 5 presentations in quarter to date; 7 different apartments were opened in all.",
      "A-101 was opened in 3 of 3 presentations in quarter to date; 4 different apartments were opened in all.",
      "A-101 was opened in 5 of 5 presentations in quarter to date; 5 different apartments were opened in all.",
      "A-101 was opened in 7 of 9 presentations in quarter to date; 12 different apartments were opened in all.",
      "A-101 was opened in 5 of 9 presentations in quarter to date; 12 different apartments were opened in all.",
      "A-101 was opened in 2 of 4 presentations in quarter to date; 5 different apartments were opened in all.",
      "A-101 was opened in 3 of 7 presentations in quarter to date; 4 different apartments were opened in all.",
      "A-101 was opened in 4 of 4 presentations in quarter to date; 1 different apartment was opened in all.",
    ],
    sk: [
      "Počas jedinej prezentácie v období quarter to date otvorili byt A-101. Bol to jediný byt, ktorý otvorili.",
      "Počas jedinej prezentácie v období quarter to date otvorili byt A-101. Celkovo otvorili 3 rôzne byty.",
      "Byt A-101 otvorili na dvoch z piatich prezentácií v období quarter to date. Celkovo otvorili 7 rôznych bytov.",
      "Byt A-101 otvorili na všetkých troch prezentáciách v období quarter to date. Celkovo otvorili 4 rôzne byty.",
      "Byt A-101 otvorili na všetkých piatich prezentáciách v období quarter to date. Celkovo otvorili 5 rôznych bytov.",
      "Byt A-101 otvorili na 7 z 9 prezentácií v období quarter to date. Celkovo otvorili 12 rôznych bytov.",
      "Byt A-101 otvorili na piatich z 9 prezentácií v období quarter to date. Celkovo otvorili 12 rôznych bytov.",
      "Byt A-101 otvorili na dvoch zo štyroch prezentácií v období quarter to date. Celkovo otvorili 5 rôznych bytov.",
      "Byt A-101 otvorili na troch zo 7 prezentácií v období quarter to date. Celkovo otvorili 4 rôzne byty.",
      "Byt A-101 otvorili na všetkých štyroch prezentáciách v období quarter to date. Celkovo otvorili 1 byt.",
    ],
    hu: [
      "A quarter to date időszak egyetlen bemutatóján megnyitották az A-101-es lakást. Ez volt az egyetlen lakás, amelyet megnyitottak.",
      "A quarter to date időszak egyetlen bemutatóján megnyitották az A-101-es lakást. Összesen 3 különböző lakást nyitottak meg.",
      "A quarter to date időszak 5 bemutatója közül 2 bemutatón megnyitották az A-101-es lakást. Összesen 7 különböző lakást nyitottak meg.",
      "A quarter to date időszak mindhárom bemutatóján megnyitották az A-101-es lakást. Összesen 4 különböző lakást nyitottak meg.",
      "A quarter to date időszak mindegyik bemutatóján megnyitották az A-101-es lakást. Összesen 5 különböző lakást nyitottak meg.",
      "A quarter to date időszak 9 bemutatója közül 7 bemutatón megnyitották az A-101-es lakást. Összesen 12 különböző lakást nyitottak meg.",
      "A quarter to date időszak 9 bemutatója közül 5 bemutatón megnyitották az A-101-es lakást. Összesen 12 különböző lakást nyitottak meg.",
      "A quarter to date időszak 4 bemutatója közül 2 bemutatón megnyitották az A-101-es lakást. Összesen 5 különböző lakást nyitottak meg.",
      "A quarter to date időszak 7 bemutatója közül 3 bemutatón megnyitották az A-101-es lakást. Összesen 4 különböző lakást nyitottak meg.",
      "A quarter to date időszak mindegyik bemutatóján megnyitották az A-101-es lakást. Összesen 1 különböző lakást nyitottak meg.",
    ],
  };

  it.each([...LANGUAGES])("%s: SOME and ALL at every triple", (language) => {
    expect(
      TRIPLES.map(([opened, n, apartments]) =>
        askTopApartmentSentence(
          language,
          "en-GB",
          n,
          "A-101",
          opened,
          apartments,
          "quarter to date",
        ),
      ),
    ).toEqual(expected[language]);
  });
});

/*
 * The one sentence built from parts. Its parts are templates of their own, so
 * it is stated whole through the function that joins them — once with every
 * part a band of rooms and a shortlist, once with the parts that say what the
 * catalogue does not know.
 */
describe("project.ts: the units a replay opened, stated whole", () => {
  const rooms = (n: number, language: Language) =>
    unitsViewedSentence(n, [{ rooms: 2, count: n }], 0, 0, n, language);
  const unknown = (n: number, language: Language) => unitsViewedSentence(n, [], n, n, 0, language);

  it("with a band of rooms and a shortlist", () => {
    const expected: Readonly<Record<Language, Three>> = {
      en: [
        "1 unit opened: 1 with 2 rooms; 1 shortlisted.",
        "3 units opened: 3 with 2 rooms; 3 shortlisted.",
        "5 units opened: 5 with 2 rooms; 5 shortlisted.",
      ],
      sk: [
        "1 jednotka otvorená: 1 × 2-izbová; 1 vybraná.",
        "3 jednotky otvorené: 3 × 2-izbová; 3 vybrané.",
        "5 jednotiek otvorených: 5 × 2-izbová; 5 vybraných.",
      ],
      hu: [
        "1 egység megnyitva: 1 db 2 szobás; 1 kiválasztva.",
        "3 egység megnyitva: 3 db 2 szobás; 3 kiválasztva.",
        "5 egység megnyitva: 5 db 2 szobás; 5 kiválasztva.",
      ],
    };
    for (const language of LANGUAGES) {
      COUNTS.forEach((n, i) => expect(rooms(n, language)).toBe(expected[language][i]));
    }
  });

  it("with rooms not stated, units not in the catalogue, and nothing shortlisted", () => {
    const expected: Readonly<Record<Language, Three>> = {
      en: [
        "1 unit opened: 1 with rooms not stated, 1 not in the catalogue; nothing was shortlisted.",
        "3 units opened: 3 with rooms not stated, 3 not in the catalogue; nothing was shortlisted.",
        "5 units opened: 5 with rooms not stated, 5 not in the catalogue; nothing was shortlisted.",
      ],
      sk: [
        "1 jednotka otvorená: 1 bez uvedeného počtu izieb, 1 mimo katalógu; nič nebolo vybrané.",
        "3 jednotky otvorené: 3 bez uvedeného počtu izieb, 3 mimo katalógu; nič nebolo vybrané.",
        "5 jednotiek otvorených: 5 bez uvedeného počtu izieb, 5 mimo katalógu; nič nebolo vybrané.",
      ],
      hu: [
        "1 egység megnyitva: 1 db szobaszám nélkül, 1 db nem szerepel a katalógusban; semmi sem került kiválasztásra.",
        "3 egység megnyitva: 3 db szobaszám nélkül, 3 db nem szerepel a katalógusban; semmi sem került kiválasztásra.",
        "5 egység megnyitva: 5 db szobaszám nélkül, 5 db nem szerepel a katalógusban; semmi sem került kiválasztásra.",
      ],
    };
    for (const language of LANGUAGES) {
      COUNTS.forEach((n, i) => expect(unknown(n, language)).toBe(expected[language][i]));
    }
  });
});

describe("the Hungarian article, by the first sound", () => {
  it("reads a name, a code letter by its name, and a number aloud", () => {
    expect(hungarianArticle("Northgate Residences")).toBe("a");
    expect(hungarianArticle("ISTER TOWER")).toBe("az");
    expect(hungarianArticle("A-101")).toBe("az");
    expect(hungarianArticle("B-302")).toBe("a");
    expect(hungarianArticle("F-12")).toBe("az");
    expect(hungarianArticle("5 szoba")).toBe("az");
    expect(hungarianArticle("1500")).toBe("az");
    expect(hungarianArticle("12")).toBe("a");
    expect(hungarianArticle("quarter to date", true)).toBe("A");
    expect(hungarianArticle("ISTER TOWER", true)).toBe("Az");
  });
});

describe("a sentence refuses what it cannot write", () => {
  it("names a missing value, and a count that is not a number", () => {
    expect(() => sentence("en", PROJECT_NO_OUTCOME_SENTENCE, { n: 3 })).toThrow(/\{count\}/);
    expect(() => sentence("sk", PROJECT_NO_OUTCOME_SENTENCE, { count: "3", n: "3" })).toThrow(
      /not a number/,
    );
  });
});

describe("the sites write through their sentences", () => {
  const repo = new SyntheticObserverRepository();
  const northgate = { viewer: VIEWERS.developer, tenantSlug: "alpha", projectSlug: "northgate" };
  const meeting = sessionsForProject("prj_northgate01").find((s) => s.units.length > 1);

  it("a replay's units, asked for in each language", async () => {
    expect(meeting).toBeDefined();
    const said = async (language: Language) =>
      (
        await repo.getMeetingReplay({
          ...northgate,
          meetingId: meeting!.meetingId as MeetingId,
          language,
        })
      ).unitsViewed.sentence;
    expect(await said("en")).toMatch(/^\d+ units? opened: /);
    expect(await said("sk")).toMatch(
      /^\d+ (jednotka otvorená|jednotky otvorené|jednotiek otvorených): /,
    );
    expect(await said("hu")).toMatch(/^\d+ egység megnyitva: /);
  });
});

/*
 * Where Slovak writes five as a word, the table must carry it: the fifth cell
 * is optional in the type, so this test is what requires it, beside the data.
 */
describe("ask-computed.ts: who presented, by two independent figures", () => {
  const PAIRS = [
    [1, 1],
    [1, 2],
    [3, 1],
    [3, 3],
    [5, 5],
    [9, 1],
    [9, 2],
    [12, 7],
  ] as const;
  const expected: Readonly<Record<Language, readonly string[]>> = {
    en: [
      "1 person presented the 1 presentation in quarter to date.",
      "2 people presented the 1 presentation in quarter to date.",
      "1 person presented the 3 presentations in quarter to date.",
      "3 people presented the 3 presentations in quarter to date.",
      "5 people presented the 5 presentations in quarter to date.",
      "1 person presented the 9 presentations in quarter to date.",
      "2 people presented the 9 presentations in quarter to date.",
      "7 people presented the 12 presentations in quarter to date.",
    ],
    sk: [
      "V období quarter to date sa uskutočnila jedna prezentácia. Viedol ju jeden realitný maklér.",
      "V období quarter to date sa uskutočnila jedna prezentácia. Viedli ju dvaja realitní makléri.",
      "V období quarter to date sa uskutočnili 3 prezentácie. Viedol ich jeden realitný maklér.",
      "V období quarter to date sa uskutočnili 3 prezentácie. Viedli ich traja realitní makléri.",
      "V období quarter to date sa uskutočnilo 5 prezentácií. Viedlo ich 5 realitných maklérov.",
      "V období quarter to date sa uskutočnilo 9 prezentácií. Viedol ich jeden realitný maklér.",
      "V období quarter to date sa uskutočnilo 9 prezentácií. Viedli ich dvaja realitní makléri.",
      "V období quarter to date sa uskutočnilo 12 prezentácií. Viedlo ich 7 realitných maklérov.",
    ],
    hu: [
      "A quarter to date időszak egyetlen bemutatóját egy ingatlanértékesítő tartotta.",
      "A quarter to date időszakban 1 bemutatót összesen 2 ingatlanértékesítő tartott.",
      "A quarter to date időszakban 3 bemutatót összesen 1 ingatlanértékesítő tartott.",
      "A quarter to date időszakban 3 bemutatót összesen 3 ingatlanértékesítő tartott.",
      "A quarter to date időszakban 5 bemutatót összesen 5 ingatlanértékesítő tartott.",
      "A quarter to date időszakban 9 bemutatót összesen 1 ingatlanértékesítő tartott.",
      "A quarter to date időszakban 9 bemutatót összesen 2 ingatlanértékesítő tartott.",
      "A quarter to date időszakban 12 bemutatót összesen 7 ingatlanértékesítő tartott.",
    ],
  };

  it.each([...LANGUAGES])("%s: at every presentations / agents pair", (language) => {
    expect(
      PAIRS.map(([n, people]) =>
        askPresentersSentence(language, "en-GB", n, people, "quarter to date"),
      ),
    ).toEqual(expected[language]);
  });
});

describe("ask-computed.ts: the apartment opened most, on codes whose suffix is not -es", () => {
  it("hu: the suffix is read from the code's number", () => {
    expect(
      ["A-103", "A-105", "A-106"].map((top) =>
        askTopApartmentSentence("hu", "en-GB", 5, top, 2, 7, "quarter to date"),
      ),
    ).toEqual([
      "A quarter to date időszak 5 bemutatója közül 2 bemutatón megnyitották az A-103-as lakást. Összesen 7 különböző lakást nyitottak meg.",
      "A quarter to date időszak 5 bemutatója közül 2 bemutatón megnyitották az A-105-ös lakást. Összesen 7 különböző lakást nyitottak meg.",
      "A quarter to date időszak 5 bemutatója közül 2 bemutatón megnyitották az A-106-os lakást. Összesen 7 különböző lakást nyitottak meg.",
    ]);
  });
});

describe("ask-computed.ts: the Slovak numeral tables", () => {
  it("carry piatich in the fifth cell wherever five is read from them", () => {
    const tables = Object.entries(ask).flatMap(([name, value]) => {
      const sk = (value as Partial<Sentence>).sk;
      return typeof value === "object" && sk?.numerals !== undefined
        ? Object.entries(sk.numerals).map(([key, cells]) => [`${name}.${key}`, cells[4]])
        : [];
    });
    expect(tables).toEqual([
      ["ASK_RECORDED_SOME_SENTENCE.outcomesWord", "piatich"],
      ["ASK_TOP_APARTMENT_SOME_SENTENCE.openedWord", "piatich"],
      ["ASK_TOP_APARTMENT_SOME_SENTENCE.countWord", "piatich"],
      ["ASK_TOP_APARTMENT_ALL_SENTENCE.allCount", "piatich"],
      // Read only for 2 to 4 agents: five agents take the `other` form, a figure.
      ["ASK_PRESENTERS_SINGLE_SENTENCE.presenters", undefined],
      ["ASK_PRESENTERS_GENERAL_SENTENCE.presenters", undefined],
    ]);
  });
});
