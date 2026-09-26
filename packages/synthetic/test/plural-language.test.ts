import { describe, expect, it } from "vitest";
import type { MeetingId } from "@observer/contracts";
import {
  DAYS,
  DEFAULT_LANGUAGE,
  LANGUAGES,
  MEETINGS,
  ROOMS_WORD,
  TIMES,
  plural,
  roomsWord,
  type Language,
  type PluralForms,
  type ReplayStep,
} from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "../src/index";
import {
  ASK_APARTMENTS_OPENED,
  ASK_PEOPLE_PRESENTED,
  ASK_PRESENTATIONS,
  ASK_RECORDED,
} from "../src/ask-computed";
import {
  DEAL_DEALS,
  DEAL_HOURS,
  DEAL_NOT_OPENED,
  DEAL_OPEN_DEALS,
  DEAL_SALES,
  DEAL_SALES_NEEDED,
  DEAL_SHOWN_EARLIER,
} from "../src/deals";
import { FORMAT_DAYS, days } from "../src/format";
import { periodsAt } from "../src/time";
import {
  ATTENTION_NEVER_REPORTED,
  ATTENTION_NEVER_SHORTLISTED,
  ATTENTION_SOURCES_LISTED,
  ATTENTION_SOURCES_SILENT,
  ATTENTION_UNITS,
} from "../src/showroom/attention";
import { PROJECT_NO_OUTCOME, PROJECT_UNITS_OPENED, PROJECT_VIEWS } from "../src/showroom/project";
import { meetings } from "../src/showroom/views3";
import { sessionsForProject } from "../src/showroom/sessions";

/**
 * THE LANGUAGE OF THE WORDS, AND THE PLURAL FORMS IT CHOOSES.
 *
 * Every hand-written English plural in the read models now goes through
 * `plural`, with its three languages' forms written beside the sentence that
 * uses it. This proves each of them against the rules the two traps are
 * about, with every expected word written out here rather than produced by
 * the helper under test:
 *
 *   - Slovak: 1, 2, 4 and 5 each take their form, and 2 and 4 the same one
 *   - Hungarian: 1 and 5 take the same, singular, noun
 *   - English: exactly the words the product printed before
 *
 * and that the language and the locale are two facts: the locale formats the
 * figure, the language picks the word, and neither is read from the other.
 */

interface Expected {
  /** The site or sites, as they read at 94622e4, that print this entry. */
  readonly sites: string;
  readonly entry: PluralForms;
  readonly en: readonly [one: string, other: string];
  /** 1 · 2 and 4 · 5. */
  readonly sk: readonly [one: string, few: string, other: string];
  /** 1 and 5 alike. */
  readonly hu: string;
}

const EXPECTED: readonly Expected[] = [
  {
    sites: "readmodels/words.ts:17",
    entry: ROOMS_WORD,
    en: ["room", "rooms"],
    sk: ["izba", "izby", "izieb"],
    hu: "szoba",
  },
  {
    sites: "ask-computed.ts:31",
    entry: ASK_PRESENTATIONS,
    en: ["presentation", "presentations"],
    sk: ["prezentácia", "prezentácie", "prezentácií"],
    hu: "prezentáció",
  },
  {
    sites: "ask-computed.ts:97",
    entry: ASK_RECORDED,
    en: ["was recorded", "were recorded"],
    sk: ["bola zaznamenaná", "boli zaznamenané", "bolo zaznamenaných"],
    hu: "lett rögzítve",
  },
  {
    sites: "ask-computed.ts:130",
    entry: ASK_APARTMENTS_OPENED,
    en: ["different apartment was opened", "different apartments were opened"],
    sk: ["rôzny byt bol otvorený", "rôzne byty boli otvorené", "rôznych bytov bolo otvorených"],
    hu: "különböző lakás lett megnyitva",
  },
  {
    sites: "ask-computed.ts:154",
    entry: ASK_PEOPLE_PRESENTED,
    en: ["person presented", "people presented"],
    sk: ["človek prezentoval", "ľudia prezentovali", "ľudí prezentovalo"],
    hu: "ember prezentált",
  },
  {
    sites:
      "words.ts DAYS: days on a rung (deals.ts), the bucket labels (views3.ts), the baseline label (time.ts)",
    entry: DAYS,
    en: ["day", "days"],
    sk: ["deň", "dni", "dní"],
    hu: "nap",
  },
  {
    sites: "deals.ts:245",
    entry: DEAL_OPEN_DEALS,
    en: ["open deal", "open deals"],
    sk: ["otvorený obchod", "otvorené obchody", "otvorených obchodov"],
    hu: "nyitott ügylet",
  },
  {
    sites: "deals.ts:251, deals.ts:255",
    entry: DEAL_DEALS,
    en: ["deal", "deals"],
    sk: ["obchod", "obchody", "obchodov"],
    hu: "ügylet",
  },
  {
    sites: "deals.ts:289",
    entry: DEAL_HOURS,
    en: ["hour", "hours"],
    sk: ["hodina", "hodiny", "hodín"],
    hu: "óra",
  },
  {
    sites: "deals.ts:451",
    entry: DEAL_SALES_NEEDED,
    en: ["more dated sale is needed", "more dated sales are needed"],
    sk: [
      "ďalší datovaný predaj je potrebný",
      "ďalšie datované predaje sú potrebné",
      "ďalších datovaných predajov je potrebných",
    ],
    hu: "további datált eladás szükséges",
  },
  {
    sites: "deals.ts:460",
    entry: DEAL_SHOWN_EARLIER,
    en: ["more was shown earlier", "more were shown earlier"],
    sk: ["ďalší bol ukázaný skôr", "ďalšie boli ukázané skôr", "ďalších bolo ukázaných skôr"],
    hu: "további korábban lett megmutatva",
  },
  {
    sites: "deals.ts:463",
    entry: DEAL_NOT_OPENED,
    en: ["was not opened", "were not opened"],
    sk: ["nebol otvorený", "neboli otvorené", "nebolo otvorených"],
    hu: "nem lett megnyitva",
  },
  {
    sites: "deals.ts:469",
    entry: DEAL_SALES,
    en: ["sale", "sales"],
    sk: ["predaj", "predaje", "predajov"],
    hu: "eladás",
  },
  {
    sites: "words.ts MEETINGS: the count of meetings every screen shares",
    entry: MEETINGS,
    en: ["meeting", "meetings"],
    sk: ["stretnutie", "stretnutia", "stretnutí"],
    hu: "találkozó",
  },
  {
    sites: "words.ts TIMES: occasions, in project.ts and screens.ts",
    entry: TIMES,
    en: ["time", "times"],
    sk: ["raz", "razy", "ráz"],
    hu: "alkalommal",
  },
  {
    sites: "format.ts:104",
    entry: FORMAT_DAYS,
    en: ["day", "days"],
    sk: ["deň", "dni", "dní"],
    hu: "nap",
  },
  {
    sites: "showroom/attention.ts:207, showroom/attention.ts:407 (the noun)",
    entry: ATTENTION_UNITS,
    en: ["unit", "units"],
    sk: ["jednotka", "jednotky", "jednotiek"],
    hu: "egység",
  },
  {
    sites: "showroom/attention.ts:339",
    entry: ATTENTION_SOURCES_SILENT,
    en: ["connected source has sent nothing", "connected sources have sent nothing"],
    sk: [
      "pripojený zdroj neposlal nič",
      "pripojené zdroje neposlali nič",
      "pripojených zdrojov neposlalo nič",
    ],
    hu: "csatlakoztatott forrás nem küldött semmit",
  },
  {
    sites: "showroom/attention.ts:340 (source is / sources are)",
    entry: ATTENTION_SOURCES_LISTED,
    en: ["source is listed", "sources are listed"],
    sk: ["zdroj je uvedený", "zdroje sú uvedené", "zdrojov je uvedených"],
    hu: "forrás szerepel",
  },
  {
    sites: "showroom/attention.ts:340 (has / have)",
    entry: ATTENTION_NEVER_REPORTED,
    en: ["has never reported", "have never reported"],
    sk: ["sa nikdy neozval", "sa nikdy neozvali", "sa nikdy neozvalo"],
    hu: "soha nem jelentkezett",
  },
  {
    sites: "showroom/attention.ts:407 (was / were)",
    entry: ATTENTION_NEVER_SHORTLISTED,
    en: ["was never shortlisted", "were never shortlisted"],
    sk: ["nebola nikdy vybraná", "neboli nikdy vybrané", "nebolo nikdy vybraných"],
    hu: "soha nem került kiválasztásra",
  },
  {
    sites: "showroom/project.ts:766 and :767, one clause",
    entry: PROJECT_NO_OUTCOME,
    en: ["has no recorded outcome and stands", "have no recorded outcome and stand"],
    sk: [
      "nemá zaznamenaný výsledok a nepatrí",
      "nemajú zaznamenaný výsledok a nepatria",
      "nemá zaznamenaný výsledok a nepatrí",
    ],
    hu: "nincs rögzített kimenetele, és nem tartozik",
  },
  {
    sites: "showroom/project.ts:1056",
    entry: PROJECT_UNITS_OPENED,
    en: ["unit opened", "units opened"],
    sk: ["jednotka otvorená", "jednotky otvorené", "jednotiek otvorených"],
    hu: "egység megnyitva",
  },
  {
    sites: "showroom/project.ts:1101",
    entry: PROJECT_VIEWS,
    en: ["view", "views"],
    sk: ["zobrazenie", "zobrazenia", "zobrazení"],
    hu: "megtekintés",
  },
];

describe("the languages", () => {
  it("are Slovak, English and Hungarian, and English until a reader can choose", () => {
    expect([...LANGUAGES]).toEqual(["sk", "en", "hu"]);
    expect(DEFAULT_LANGUAGE).toBe("en");
  });
});

describe.each(EXPECTED)("$sites", ({ entry, en, sk, hu }) => {
  it("Slovak: 1, 2, 4 and 5 each take their form, and 2 and 4 the same", () => {
    expect(plural("sk", 1, entry)).toBe(sk[0]);
    expect(plural("sk", 2, entry)).toBe(sk[1]);
    expect(plural("sk", 4, entry)).toBe(sk[1]);
    expect(plural("sk", 5, entry)).toBe(sk[2]);
    expect(plural("sk", 2, entry)).toBe(plural("sk", 4, entry));
  });

  it("Hungarian: 1 and 5 take the same, singular, form", () => {
    expect(plural("hu", 1, entry)).toBe(hu);
    expect(plural("hu", 5, entry)).toBe(hu);
  });

  it("English: the words the product printed before", () => {
    expect(plural("en", 1, entry)).toBe(en[0]);
    expect(plural("en", 2, entry)).toBe(en[1]);
    expect(plural("en", 0, entry)).toBe(en[1]);
  });
});

describe("the rules, where n === 1 was wrong", () => {
  it("Slovak keeps 22 in the form of 5, not of 2: its few is 2 to 4 alone", () => {
    expect(plural("sk", 22, MEETINGS)).toBe("stretnutí");
    expect(plural("sk", 0, MEETINGS)).toBe("stretnutí");
  });

  it("a fraction takes Slovak's fourth form where the entry can be counted in halves", () => {
    expect(roomsWord(1.5, "sk")).toBe("1.5 izby");
    expect(roomsWord(1.5, "hu")).toBe("1.5 szoba");
    expect(roomsWord(1.5, "en")).toBe("1.5 rooms");
    expect(days(1.5, "sk")).toBe("1.5 dňa");
  });
});

describe("the sites print through their entries", () => {
  it("rooms, days and meetings, whole sentences' worth, in each language", () => {
    expect(roomsWord(1, "en")).toBe("1 room");
    expect(roomsWord(3, "en")).toBe("3 rooms");
    expect(roomsWord(3, "sk")).toBe("3 izby");
    expect(roomsWord(5, "sk")).toBe("5 izieb");
    expect(roomsWord(5, "hu")).toBe("5 szoba");
    expect(roomsWord(null, "sk")).toBe("Rooms not stated");
    expect(days(1)).toBe("1 day");
    expect(days(2, "sk")).toBe("2 dni");
    expect(meetings(1, "en-GB")).toBe("1 meeting");
    expect(meetings(4, "en-GB", "sk")).toBe("4 stretnutia");
    expect(meetings(5, "en-GB", "hu")).toBe("5 találkozó");
  });

  it("the period's baseline counts its days in the language asked for", () => {
    const at = new Date("2026-07-03T10:00:00+02:00"); // two days into the quarter
    expect(periodsAt(at, "Europe/Bratislava").quarter_to_date.baselineLabel).toBe(
      "the same 2 days of the previous quarter",
    );
    expect(periodsAt(at, "Europe/Bratislava", "sk").quarter_to_date.baselineLabel).toBe(
      "rovnaké 2 dni predchádzajúceho štvrťroka",
    );
  });
});

describe("the language and the locale are two facts", () => {
  it("an en-GB locale with the Slovak language: a Slovak word, an English number", () => {
    expect(meetings(1234, "en-GB", "sk")).toBe("1,234 stretnutí");
  });

  it("and the other way round: a Slovak number, an English word", () => {
    // Slovak groups thousands with a no-break space.
    expect(meetings(1234, "sk-SK", "en")).toBe("1 234 meetings");
  });
});

describe("the request carries the language to the words", () => {
  const repo = new SyntheticObserverRepository();
  const northgate = { viewer: VIEWERS.developer, tenantSlug: "alpha", projectSlug: "northgate" };
  const meeting = sessionsForProject("prj_northgate01").find((s) => s.units.length > 0);

  it("puts the language asked for on the view's context, whatever the locale", async () => {
    for (const language of ["sk", "hu", "en"] satisfies Language[]) {
      const flow = await repo.getSalesFlow({ ...northgate, period: "quarter_to_date", language });
      expect(flow.context.language).toBe(language);
      expect(flow.context.project.locale).toBe("en-GB");
    }
  });

  it("chooses a replay's words by it, and English by default", async () => {
    expect(meeting).toBeDefined();
    const ask = (language: Language) =>
      repo.getMeetingReplay({ ...northgate, meetingId: meeting!.meetingId as MeetingId, language });
    const units = (steps: readonly ReplayStep[]) =>
      steps.filter((s) => s.kind === "unit").map((s) => s.detail ?? "");

    const english = units((await ask(DEFAULT_LANGUAGE)).steps);
    const slovak = units((await ask("sk")).steps);
    expect(english.length).toBeGreaterThan(0);
    expect(english.every((d) => /^\d+ views? · /.test(d))).toBe(true);
    expect(slovak.every((d) => /^\d+ (zobrazenie|zobrazenia|zobrazení) · /.test(d))).toBe(true);
  });
});
