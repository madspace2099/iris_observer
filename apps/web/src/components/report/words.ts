import type { Language, ReportSectionAvailability, Sentence } from "@observer/readmodels";

/**
 * EVERY WORD THE PRINTED REPORT WRITES ITSELF, IN EACH LANGUAGE IT CAN BE ASKED FOR.
 *
 * The report page draws its figures and most of its sentences from the read
 * models, which write them in the language on the request. What is left is the
 * page's own frame — titles, captions, column heads, the cover's notes — and it
 * lives here, one record per language, typed alike, so a phrase missing in one
 * language is a compile error rather than English in the middle of a Slovak
 * page. A sentence that counts is a `Sentence`, whose forms agree with the
 * count in each language.
 *
 * English is the words these pages always printed. The Slovak and Hungarian
 * are DRAFTS for review (P2-17), not approved text.
 */
export interface ReportWords {
  readonly availability: Readonly<Record<ReportSectionAvailability, string>>;
  readonly print: string;
  readonly report: string;
  readonly title: string;
  readonly lede: string;
  readonly audience: string;
  readonly attribution: (version: string, date: string) => string;
  readonly everyWritable: string;
  readonly leftOut: string;
  readonly meetingsInPeriod: string;
  readonly windowMeetings: (window: string) => string;
  readonly median: (display: string) => string;
  readonly coverageColumns: readonly [string, string, string];
  readonly unitDemandCaption: string;
  readonly unitDemandColumns: readonly [string, string, string, string, string, string];
  readonly agentsCaption: string;
  readonly agentsColumns: readonly [string, string, string, string];
  readonly belowSample: string;
  readonly noOutcome: string;
  readonly outcomesCaption: string;
  readonly outcomesColumns: readonly [string, string, string];
  readonly ladderIntro: string;
  readonly channelSplit: readonly [string, string, string, string, string];
  readonly meetingsCaption: string;
  readonly meetingsColumns: readonly [string, string, string, string];
  readonly appendixCaption: string;
  readonly appendixColumns: readonly [string, string, string, string];
  readonly meetingSummary: string;
  readonly meetingLede: string;
  readonly meetings: string;
  readonly summary: string;
  readonly started: string;
  readonly length: string;
  readonly presentedBy: string;
  readonly recordedOutcome: string;
  readonly sessionCaption: string;
}

export const REPORT_WORDS: Readonly<Record<Language, ReportWords>> = {
  en: {
    availability: { ready: "Ready", partial: "Partial", unavailable: "Blank" },
    print: "Print or save as PDF",
    report: "Report",
    title: "Internal sales-intelligence report",
    lede: "The internal report, drawn on a page: every section the export dialog describes, from the same read models the screens use, in the same order. Print it through the browser; no generator writes a file yet. The audience is internal, and a buyer-facing document is a separate contract that is not assembled here.",
    audience: "Audience: internal.",
    attribution: (version, date) => `Attribution policy ${version}, effective ${date}.`,
    everyWritable: "Every section can be written from what this project has.",
    leftOut: "Left out at the reader’s request",
    meetingsInPeriod: "Meetings in the period",
    windowMeetings: (window) => `${window} · meetings`,
    median: (display) => `median ${display}`,
    coverageColumns: ["Section", "Share of time", "Median dwell"],
    unitDemandCaption:
      "Each room-count segment against its share of the stock: attention, favourites and comparisons.",
    unitDemandColumns: [
      "Segment",
      "Available units",
      "Share of stock",
      "Share of attention",
      "Share of favourites",
      "Share of comparisons",
    ],
    agentsCaption:
      "Every presenter on the project in the period, in roster order. A roster, never a ranking.",
    agentsColumns: [
      "Agent",
      "Meetings",
      "Median duration",
      "Progressed, of meetings with an outcome",
    ],
    belowSample: "Below the reporting sample",
    noOutcome: "No outcome recorded",
    outcomesCaption: "How the period's meetings ended, as the agents recorded them.",
    outcomesColumns: ["Outcome", "Meetings", "Share"],
    ladderIntro: "The deal ladder, as the CRM states it.",
    channelSplit: [
      "The register carries the split:",
      "showroom meetings",
      " and ",
      "WEB IRIS meetings",
      ", each with its own total.",
    ],
    meetingsCaption:
      "The most recent meetings in the period. Each opens as a replay, or as a brief if it has not run.",
    meetingsColumns: ["Meeting", "Agent", "Started", "Outcome"],
    appendixCaption: "Every section of this report with the evidence reference it rests on.",
    appendixColumns: ["Section", "State", "Sample", "Evidence"],
    meetingSummary: "Meeting summary",
    meetingLede:
      "One presentation, reconstructed from the session record and printed as a sequence. The audience is internal: the buyer-facing meeting report is a separate, sanitised contract and is not assembled here.",
    meetings: "Meetings",
    summary: "Summary",
    started: "Started",
    length: "Length",
    presentedBy: "Presented by",
    recordedOutcome: "Recorded outcome",
    sessionCaption: "The session record behind this summary.",
  },
  sk: {
    availability: { ready: "Pripravené", partial: "Čiastočné", unavailable: "Prázdne" },
    print: "Vytlačiť alebo uložiť ako PDF",
    report: "Správa",
    title: "Interná správa o predaji",
    lede: "Interná správa zobrazená na stránke: každá sekcia, ktorú opisuje dialóg exportu, z tých istých dátových modelov, aké používajú obrazovky, v rovnakom poradí. Vytlačte ju cez prehliadač; súbor zatiaľ nič negeneruje. Správa je určená na interné použitie a dokument pre kupujúceho je samostatná zmluva, ktorá sa tu nezostavuje.",
    audience: "Určené na interné použitie.",
    attribution: (version, date) => `Pravidlo atribúcie ${version}, platné od ${date}.`,
    everyWritable: "Každú sekciu možno napísať z toho, čo tento projekt má.",
    leftOut: "Vynechané na žiadosť čitateľa",
    meetingsInPeriod: "Stretnutia v období",
    windowMeetings: (window) => `${window} · stretnutia`,
    median: (display) => `medián ${display}`,
    coverageColumns: ["Sekcia", "Podiel času", "Medián času"],
    unitDemandCaption:
      "Každý segment podľa počtu izieb oproti jeho podielu na ponuke: pozornosť, obľúbené a porovnania.",
    unitDemandColumns: [
      "Segment",
      "Voľné byty",
      "Podiel na ponuke",
      "Podiel pozornosti",
      "Podiel obľúbených",
      "Podiel porovnaní",
    ],
    agentsCaption:
      "Každý, kto v tomto období na projekte prezentoval, v poradí zoznamu. Zoznam, nikdy nie rebríček.",
    agentsColumns: [
      "Maklér",
      "Stretnutia",
      "Medián trvania",
      "Pokročilo, zo stretnutí s výsledkom",
    ],
    belowSample: "Pod veľkosťou vzorky pre správu",
    noOutcome: "Výsledok nezaznamenaný",
    outcomesCaption: "Ako sa stretnutia v tomto období skončili, podľa záznamov maklérov.",
    outcomesColumns: ["Výsledok", "Stretnutia", "Podiel"],
    ladderIntro: "Rebrík obchodov, ako ho uvádza CRM.",
    channelSplit: [
      "Rozdelenie nesie register:",
      "stretnutia v showroome",
      " a ",
      "stretnutia vo WEB IRIS",
      ", každé s vlastným súčtom.",
    ],
    meetingsCaption:
      "Najnovšie stretnutia v tomto období. Každé sa otvorí ako záznam, alebo ako podklad, ak ešte neprebehlo.",
    meetingsColumns: ["Stretnutie", "Maklér", "Začiatok", "Výsledok"],
    appendixCaption: "Každá sekcia tejto správy s odkazom na podklady, na ktorých stojí.",
    appendixColumns: ["Sekcia", "Stav", "Vzorka", "Podklady"],
    meetingSummary: "Zhrnutie stretnutia",
    meetingLede:
      "Jedna prezentácia zrekonštruovaná zo záznamu zo showroomu a vytlačená ako postupnosť. Určené na interné použitie: správa o stretnutí pre kupujúceho je samostatná, očistená zmluva a tu sa nezostavuje.",
    meetings: "Stretnutia",
    summary: "Zhrnutie",
    started: "Začiatok",
    length: "Dĺžka",
    presentedBy: "Prezentoval(a)",
    recordedOutcome: "Zaznamenaný výsledok",
    sessionCaption: "Záznam zo showroomu, z ktorého toto zhrnutie vychádza.",
  },
  hu: {
    availability: { ready: "Kész", partial: "Részleges", unavailable: "Üres" },
    print: "Nyomtatás vagy mentés PDF-ként",
    report: "Jelentés",
    title: "Belső értékesítési jelentés",
    lede: "A belső jelentés egy oldalon: minden szakasz, amelyet az exportálási párbeszédablak leír, ugyanazokból az adatmodellekből, amelyeket a képernyők használnak, ugyanabban a sorrendben. A böngészőből nyomtatható; fájlt egyelőre semmi sem állít elő. A jelentés belső használatra készül, a vevőnek szóló dokumentum külön szerződés, és nem itt áll össze.",
    audience: "Belső használatra.",
    attribution: (version, date) => `Hozzárendelési szabály: ${version}, hatályos: ${date}.`,
    everyWritable: "Minden szakasz megírható abból, ami ehhez a projekthez rendelkezésre áll.",
    leftOut: "Az olvasó kérésére kihagyva",
    meetingsInPeriod: "Találkozók az időszakban",
    windowMeetings: (window) => `${window} · találkozók`,
    median: (display) => `medián: ${display}`,
    coverageColumns: ["Szakasz", "Időarány", "Medián idő"],
    unitDemandCaption:
      "Minden szobaszám szerinti szegmens a kínálatban való részesedéséhez mérve: figyelem, kedvencek és összehasonlítások.",
    unitDemandColumns: [
      "Szegmens",
      "Szabad lakások",
      "Részesedés a kínálatból",
      "Részesedés a figyelemből",
      "Részesedés a kedvencekből",
      "Részesedés az összehasonlításokból",
    ],
    agentsCaption:
      "Mindenki, aki ebben az időszakban bemutatót tartott a projekten, a névsor sorrendjében. Névsor, soha nem rangsor.",
    agentsColumns: [
      "Értékesítő",
      "Találkozók",
      "Medián időtartam",
      "Továbblépett, az eredménnyel zárult találkozókból",
    ],
    belowSample: "A jelentés mintanagysága alatt",
    noOutcome: "Nincs rögzített eredmény",
    outcomesCaption: "Hogyan zárultak az időszak találkozói, ahogy az értékesítők rögzítették.",
    outcomesColumns: ["Eredmény", "Találkozók", "Arány"],
    ladderIntro: "Az ügyletek lépcsője, ahogy a CRM rögzíti.",
    channelSplit: [
      "A megosztást a nyilvántartás mutatja:",
      "showroom-találkozók",
      " és ",
      "WEB IRIS-találkozók",
      ", mindkettő a saját összesítésével.",
    ],
    meetingsCaption:
      "Az időszak legutóbbi találkozói. Mindegyik visszajátszásként nyílik meg, vagy felkészítő anyagként, ha még nem zajlott le.",
    meetingsColumns: ["Találkozó", "Értékesítő", "Kezdés", "Eredmény"],
    appendixCaption: "A jelentés minden szakasza az alátámasztó hivatkozással, amelyen alapul.",
    appendixColumns: ["Szakasz", "Állapot", "Minta", "Alátámasztás"],
    meetingSummary: "A találkozó összefoglalója",
    meetingLede:
      "Egy bemutató a showroom-rekordból rekonstruálva és lépéssorként nyomtatva. Belső használatra: a vevőnek szóló találkozójelentés külön, megtisztított szerződés, és nem itt áll össze.",
    meetings: "Találkozók",
    summary: "Összefoglaló",
    started: "Kezdés",
    length: "Időtartam",
    presentedBy: "Bemutatta",
    recordedOutcome: "Rögzített eredmény",
    sessionCaption: "Az a showroom-rekord, amelyen ez az összefoglaló alapul.",
  },
};

/** "1 of 8 sections would be blank, and each says why." */
export const REPORT_BLANK_SECTIONS: Sentence = {
  en: { text: "{count} of {total} sections would be blank, and each says why." },
  sk: {
    text: "{frame|n}",
    words: {
      frame: {
        one: "{count} {from} {total} sekcií by bola prázdna a každá uvádza prečo.",
        few: "{count} {from} {total} sekcií by boli prázdne a každá uvádza prečo.",
        other: "{count} {from} {total} sekcií by bolo prázdnych a každá uvádza prečo.",
      },
    },
  },
  hu: { text: "{total} szakaszból {count} üres lenne, és mindegyik megmondja, miért." },
};

/** "2 of 8 left out at the reader's request." */
export const REPORT_LEFT_OUT_SECTIONS: Sentence = {
  en: { text: "{count} of {total} left out at the reader's request." },
  sk: {
    text: "{frame|n}",
    words: {
      frame: {
        one: "{count} {from} {total} bola vynechaná na žiadosť čitateľa.",
        few: "{count} {from} {total} boli vynechané na žiadosť čitateľa.",
        other: "{count} {from} {total} bolo vynechaných na žiadosť čitateľa.",
      },
    },
  },
  hu: { text: "{total} szakaszból {count} az olvasó kérésére kimaradt." },
};

/** "Where the team's presentation time goes, … 74 of 74 meetings, every step timed." */
export const REPORT_COVERAGE_CAPTION: Sentence = {
  en: {
    text: "Where the team's presentation time goes, section by section, with the team's median dwell. Shares are of the time the source could time: {timed} of {total} meetings, every step timed.",
  },
  sk: {
    text: "Kam ide čas prezentácií tímu, sekcia po sekcii, s mediánom času tímu. Podiely sú z času, ktorý zdroj dokázal zmerať: {timed} {from} {total} stretnutí, každý krok zmeraný.",
  },
  hu: {
    text: "Hová megy a csapat bemutatóideje, szakaszonként, a csapat medián idejével. Az arányok abból az időből számolódnak, amelyet a forrás mérni tudott: {total} találkozóból {timed}, minden lépés mérve.",
  },
};

/** "19 of 20 meetings needed" — the shortfall a figure below the floor prints beside itself. */
export const REPORT_MEETINGS_NEEDED: Sentence = {
  en: { text: "{count} of {minimum} meetings needed" },
  sk: { text: "{count} z potrebných {minimum} stretnutí" },
  hu: { text: "{count} a szükséges {minimum} találkozóból" },
};
