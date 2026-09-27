import {
  MEETINGS,
  hungarianArticle,
  plural,
  slovakZForm,
  type Language,
  type ReportSectionAvailability,
  type Sentence,
} from "@observer/readmodels";

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

/** "1 of 9 carry a stated gap, and each says what it is." */
export const REPORT_PARTIAL_SECTIONS: Sentence = {
  en: { text: "{count} of {total} carry a stated gap, and each says what it is." },
  sk: {
    text: "{frame|n}",
    words: {
      frame: {
        one: "{count} {from} {total} má uvedenú medzeru a každá uvádza, o akú ide.",
        few: "{count} {from} {total} majú uvedenú medzeru a každá uvádza, o akú ide.",
        other: "{count} {from} {total} má uvedenú medzeru a každá uvádza, o akú ide.",
      },
    },
  },
  hu: { text: "{total} szakaszból {count} kimondott hiányt hordoz, és mindegyik megmondja, mit." },
};

/**
 * ONE AGENT'S SUMMARY: THE PAGE'S OWN WORDS, IN EACH LANGUAGE.
 *
 * The agent summary draws its figures and sentences from `AgentDetailView`,
 * which writes them in the request's language; what is left is the page's
 * frame, and it lives here. Slovak avoids the past tense and the possessive
 * where either would name the agent's gender, which the product does not
 * hold; a name stands after a dash instead. Drafts for review (P2-17).
 */
export interface AgentReportWords {
  readonly kicker: string;
  readonly lede: (organisation: string) => string;
  readonly crumbAgents: string;
  readonly crumbSummary: string;
  readonly everyWritable: string;
  readonly ofMeetings: (total: number) => string;
  readonly unitColumns: readonly [string, string, string, string];
  readonly ofTheirMeetings: string;
  readonly neverShortlisted: string;
  readonly followUp: string;
  readonly noFollowUpSource: string;
  readonly outcomesTheyRecorded: string;
  readonly recordedNote: (name: string) => string;
  readonly funnelLabel: (name: string) => string;
  readonly presentationCaption: (
    name: string,
    below: boolean,
    n: number,
    minimum: number,
  ) => string;
  readonly presentationColumns: readonly [string, string, string, string, string];
  readonly notTimed: string;
  readonly ofTimed: (n: number) => string;
  readonly buyersCaption: (name: string, below: boolean, n: number, minimum: number) => string;
  readonly buyersColumns: readonly [string, string, string, string];
  readonly noneOpened: string;
  readonly ofEveryMeeting: string;
  readonly outcomeCaption: (name: string, below: boolean, n: number, minimum: number) => string;
  readonly outcomeColumns: readonly [string, string, string];
  readonly unitsCaption: (name: string, period: string) => string;
  readonly noOtherProject: string;
  readonly projectMeetings: (n: number, period: string) => string;
  readonly thisProject: string;
  readonly projectsNote: string;
  readonly registerCaption: (name: string, period: string) => string;
  readonly registerEmpty: (name: string, period: string) => string;
  readonly registerLink: string;
  readonly registerRest: string;
  readonly appendixCaption: string;
}

/* "8 stretnutí", "8 találkozó": a count of meetings in the language's own form. */
const meetingsIn = (language: Language, n: number) =>
  `${String(n)} ${plural(language, n, MEETINGS)}`;

export const AGENT_REPORT_WORDS: Readonly<Record<Language, AgentReportWords>> = {
  en: {
    kicker: "Agent summary",
    lede: (organisation) =>
      `Presenting for ${organisation}. One agent's summary, drawn from the read model their own screen draws, with the same figures at the same sample and the same floor. The audience is internal: nothing here is a score, and a buyer-facing document is a separate contract that is not assembled here.`,
    crumbAgents: "Sales Agents",
    crumbSummary: "Summary",
    everyWritable: "Every section can be written from what this agent's screen has.",
    ofMeetings: (total) => `of ${String(total)} meetings`,
    unitColumns: ["Unit", "Meetings that opened it", "Share of their meetings", "Shortlisted"],
    ofTheirMeetings: "of their meetings",
    neverShortlisted: "Never shortlisted",
    followUp: "Follow-up",
    noFollowUpSource: "No source records whether a follow-up happened.",
    outcomesTheyRecorded: "Outcomes they recorded",
    recordedNote: (name) =>
      `What ${name} entered on the showroom’s outcome widget as a purchase or a reservation. It is the agent’s own record — not a reservation and not a sale, and no CRM or other system of record has confirmed it: Observer links no deal to a meeting.`,
    funnelLabel: (name) => `Stages ${name}'s meetings reached`,
    presentationCaption: (name, below, n, minimum) =>
      below
        ? `${name}'s running order: where each section falls on average across their meetings, not one meeting's path, with their median stay in it. Neither the share of their timed time nor the team's median is printed beside their stops: at ${String(n)} meetings, ${String(minimum - n)} short of ${String(minimum)}, a share would be a rate read as a verdict and the comparison a judgement about how somebody works, drawn from a sample too thin to carry either.`
        : `${name}'s running order: where each section falls on average across their meetings, not one meeting's path, with their median stay in it, the share of their timed presentation time it takes, and the team's median beside it, since a section time on its own has no scale.`,
    presentationColumns: [
      "Order",
      "Section",
      "Their median stay",
      "Share of their timed time",
      "Team median stay",
    ],
    notTimed: "Not timed",
    ofTimed: (n) => `of ${String(n)} timed meetings`,
    buyersCaption: (name, below, n, minimum) =>
      below
        ? `Meetings of ${name}'s in which at least one apartment of that size was opened. A meeting that showed a one-room flat and a four-room penthouse counts in both, so these do not sum to the meeting count. The project's own rate is not set beside them: at ${String(n)} meetings, ${String(minimum - n)} short of ${String(minimum)}, that comparison would be a judgement about how somebody works drawn from a sample too thin to carry one.`
        : `Each row is one size of apartment: the share of ${name}'s meetings in which at least one unit of that size was opened, and the same rate over every meeting on the project in the period. The rows do not sum to one and this is not a mix — a meeting that showed a one-room flat and a four-room penthouse counts in both.`,
    buyersColumns: ["Apartments", "Meetings that opened one", "Share of their meetings", "Project"],
    noneOpened: "None opened",
    ofEveryMeeting: "of every meeting on the project",
    outcomeCaption: (name, below, n, minimum) =>
      `How ${name}'s meetings ended: parts of one whole, every meeting of theirs in the period, by the outcome recorded at the end of it. ${String(n)} meetings is the denominator. Meetings with no outcome recorded are a row of their own rather than being folded into one that says something happened.${below ? ` No share is printed beside the counts: at ${String(n)} meetings, ${String(minimum - n)} short of ${String(minimum)}, a rate over this person's meetings is not a figure to act on, and each count already carries the denominator it is a fraction of.` : ""}`,
    outcomeColumns: ["Outcome", "Meetings", "Share"],
    unitsCaption: (name, period) =>
      `Units opened in the largest share of ${name}'s meetings in ${period.toLowerCase()}, at most six. An association with this presenter's habit and nothing more: a unit opened in most of somebody's meetings may be the one the buyers ask for or the one the agent reaches for.`,
    noOtherProject:
      "No other project this account may open holds a meeting of theirs in this period.",
    projectMeetings: (n, period) =>
      `${String(n)} meeting${n === 1 ? "" : "s"} in ${period.toLowerCase()}`,
    thisProject: "This project",
    projectsNote:
      "Scoped to the projects this account holds, never to the projects the agent holds. An agency selling for two developers is the ordinary arrangement, and a list that showed the rest of it would be a commercial fact about somebody else read off a staff page.",
    registerCaption: (name, period) =>
      `${name}'s most recent meetings in ${period.toLowerCase()}, newest first, at most eight.`,
    registerEmpty: (name, period) =>
      `No meeting of ${name}'s falls inside ${period.toLowerCase()}.`,
    registerLink: "Every meeting of theirs in this period",
    registerRest: " is the register these eight are taken from.",
    appendixCaption:
      "Every section of this summary with its state, its sample in its own noun, and the evidence reference it rests on.",
  },
  sk: {
    kicker: "Zhrnutie makléra",
    lede: (organisation) =>
      `Prezentuje pre ${organisation}. Zhrnutie jedného makléra z toho istého dátového modelu, ktorý kreslí maklérska obrazovka, s rovnakými číslami pri rovnakej vzorke a rovnakej hranici. Určené na interné použitie: nič tu nie je skóre a dokument pre kupujúceho je samostatná zmluva, ktorá sa tu nezostavuje.`,
    crumbAgents: "Makléri",
    crumbSummary: "Zhrnutie",
    everyWritable: "Každú sekciu možno napísať z toho, čo má maklérska obrazovka.",
    ofMeetings: (total) =>
      `${slovakZForm(total)} ${String(total)} ${total === 1 ? "stretnutia" : "stretnutí"}`,
    unitColumns: ["Byt", "Stretnutia, ktoré ho otvorili", "Podiel stretnutí", "Obľúbené"],
    ofTheirMeetings: "zo stretnutí",
    neverShortlisted: "Nikdy nepridaný do obľúbených",
    followUp: "Ďalší kontakt",
    noFollowUpSource: "Žiadny zdroj nezaznamenáva, či sa ďalší kontakt uskutočnil.",
    outcomesTheyRecorded: "Zaznamenané výsledky",
    recordedNote: (name) =>
      `Záznamy z widgetu výsledkov v showroome, kde ${name} označuje kúpu alebo rezerváciu. Je to vlastný záznam makléra — nie rezervácia ani predaj, a žiadne CRM ani iný systém záznamov ho nepotvrdil: Observer nespája žiadny obchod so stretnutím.`,
    funnelLabel: (name) => `Fázy, ktoré dosiahli stretnutia – ${name}`,
    presentationCaption: (name, below, n, minimum) =>
      below
        ? `Poradie sekcií – ${name}: kde každá sekcia v priemere padne naprieč stretnutiami, nie cesta jedného stretnutia, s mediánom času v nej. Podiel na meranom čase ani medián tímu sa vedľa zastávok netlačí: pri vzorke ${meetingsIn("sk", n)}, keď chýba ${String(minimum - n)} do ${String(minimum)}, by podiel bol mierou čítanou ako hodnotenie a porovnanie úsudkom o tom, ako niekto pracuje, z príliš tenkej vzorky na oboje.`
        : `Poradie sekcií – ${name}: kde každá sekcia v priemere padne naprieč stretnutiami, nie cesta jedného stretnutia, s mediánom času v nej, podielom na meranom čase prezentácie a vedľa neho mediánom tímu, pretože čas sekcie sám osebe nemá mierku.`,
    presentationColumns: [
      "Poradie",
      "Sekcia",
      "Medián času",
      "Podiel meraného času",
      "Medián tímu",
    ],
    notTimed: "Bez merania času",
    ofTimed: (n) =>
      `${slovakZForm(n)} ${String(n)} ${n === 1 ? "stretnutia s meraným časom" : "stretnutí s meraným časom"}`,
    buyersCaption: (name, below, n, minimum) =>
      below
        ? `Stretnutia – ${name}, na ktorých sa otvoril aspoň jeden byt danej veľkosti. Stretnutie, ktoré ukázalo jednoizbový byt aj štvorizbový penthouse, sa počíta v oboch, takže súčet nedáva počet stretnutí. Miera celého projektu sa vedľa neuvádza: pri vzorke ${meetingsIn("sk", n)}, keď chýba ${String(minimum - n)} do ${String(minimum)}, by také porovnanie bolo úsudkom o tom, ako niekto pracuje, z príliš tenkej vzorky.`
        : `Každý riadok je jedna veľkosť bytu: podiel stretnutí – ${name}, na ktorých sa otvoril aspoň jeden byt tej veľkosti, a rovnaká miera za všetky stretnutia na projekte v období. Riadky nedávajú súčet jedna a nejde o skladbu — stretnutie, ktoré ukázalo jednoizbový byt aj štvorizbový penthouse, sa počíta v oboch.`,
    buyersColumns: ["Byty", "Stretnutia, ktoré nejaký otvorili", "Podiel stretnutí", "Projekt"],
    noneOpened: "Žiadny otvorený",
    ofEveryMeeting: "zo všetkých stretnutí na projekte",
    outcomeCaption: (name, below, n, minimum) =>
      `Ako sa skončili stretnutia – ${name}: časti jedného celku, všetky stretnutia v období podľa výsledku zaznamenaného na ich konci. Menovateľ: ${meetingsIn("sk", n)}. Stretnutia bez zaznamenaného výsledku majú vlastný riadok, namiesto toho, aby sa zlúčili s riadkom, ktorý tvrdí, že sa niečo stalo.${below ? ` Vedľa počtov sa netlačí podiel: pri vzorke ${meetingsIn("sk", n)}, keď chýba ${String(minimum - n)} do ${String(minimum)}, miera nad stretnutiami tohto človeka nie je číslo, podľa ktorého konať, a každý počet už nesie menovateľa, ktorého je podielom.` : ""}`,
    outcomeColumns: ["Výsledok", "Stretnutia", "Podiel"],
    unitsCaption: (name, period) =>
      `Byty otvorené v najväčšom podiele stretnutí – ${name} (${period.toLowerCase()}), najviac šesť. Súvislosť so zvykom tohto prezentujúceho a nič viac: byt otvorený na väčšine stretnutí môže byť ten, na ktorý sa pýtajú kupujúci, alebo ten, po ktorom siaha maklér.`,
    noOtherProject:
      "V tomto období nie je na žiadnom inom projekte tohto konta žiadna ďalšia prezentácia.",
    projectMeetings: (n, period) => `${meetingsIn("sk", n)} (${period.toLowerCase()})`,
    thisProject: "Tento projekt",
    projectsNote:
      "Obmedzené na projekty tohto konta, nikdy nie na projekty makléra. Agentúra, ktorá predáva pre dvoch developerov, je bežné usporiadanie, a zoznam, ktorý by ukázal zvyšok, by bol obchodným faktom o niekom inom vyčítaným zo stránky zamestnanca.",
    registerCaption: (name, period) =>
      `Posledné stretnutia – ${name} (${period.toLowerCase()}), od najnovšieho, najviac osem.`,
    registerEmpty: (name, period) =>
      `V období (${period.toLowerCase()}) nie je žiadne stretnutie – ${name}.`,
    registerLink: "Všetky stretnutia v tomto období",
    registerRest: " sú register, z ktorého je týchto osem vybraných.",
    appendixCaption:
      "Každá sekcia tohto zhrnutia so stavom, vzorkou vo vlastnom podstatnom mene a odkazom na podklady, na ktorých stojí.",
  },
  hu: {
    kicker: "Értékesítői összefoglaló",
    lede: (organisation) =>
      `${hungarianArticle(organisation, true)} ${organisation} megbízásából mutat be. Egy értékesítő összefoglalója, ugyanabból az adatmodellből, amelyet a saját képernyője rajzol, ugyanazokkal a számokkal, ugyanakkora mintán és ugyanazzal a küszöbbel. Belső használatra: semmi sem pontszám itt, a vevőnek szóló dokumentum pedig külön szerződés, amely itt nem készül.`,
    crumbAgents: "Értékesítők",
    crumbSummary: "Összefoglaló",
    everyWritable: "Minden szakasz megírható abból, ami az értékesítő képernyőjén van.",
    ofMeetings: (total) => `${String(total)} találkozó közül`,
    unitColumns: ["Lakás", "Találkozók, amelyek megnyitották", "A találkozói aránya", "Kedvencek"],
    ofTheirMeetings: "a találkozói közül",
    neverShortlisted: "Soha nem került a kedvencek közé",
    followUp: "Utánkövetés",
    noFollowUpSource: "Egyetlen forrás sem rögzíti, megtörtént-e az utánkövetés.",
    outcomesTheyRecorded: "Rögzített eredményei",
    recordedNote: (name) =>
      `Amit ${name} a showroom eredménymezőjében vásárlásként vagy foglalásként rögzített. Ez az értékesítő saját bejegyzése — nem foglalás és nem eladás, és sem CRM, sem más nyilvántartó rendszer nem erősítette meg: az Observer egyetlen ügyletet sem köt találkozóhoz.`,
    funnelLabel: (name) => `${name} találkozóinak elért szakaszai`,
    presentationCaption: (name, below, n, minimum) =>
      below
        ? `${name} sorrendje: hol áll átlagosan az egyes szakasz a találkozói során — nem egyetlen találkozó útja —, a benne töltött medián idővel. A mért idejéből való részarány és a csapat mediánja nem szerepel a megállók mellett: ${meetingsIn("hu", n)} mellett (a szükséges szám ${String(minimum)}, ${String(minimum - n)} hiányzik) egy részarány értékelésként olvasott arány lenne, az összevetés pedig ítélet arról, hogyan dolgozik valaki, túl vékony mintából bármelyikhez.`
        : `${name} sorrendje: hol áll átlagosan az egyes szakasz a találkozói során — nem egyetlen találkozó útja —, a benne töltött medián idővel, a mért bemutatási idejéből való részarányával és mellette a csapat mediánjával, mert egy szakaszidőnek önmagában nincs mércéje.`,
    presentationColumns: [
      "Sorrend",
      "Szakasz",
      "Medián idő",
      "A mért idő aránya",
      "A csapat mediánja",
    ],
    notTimed: "Nincs időmérés",
    ofTimed: (n) => `${String(n)} mért idejű találkozó közül`,
    buyersCaption: (name, below, n, minimum) =>
      below
        ? `${name} találkozói, amelyeken legalább egy ilyen méretű lakást megnyitottak. Egy találkozó, amely egyszobás lakást és négyszobás penthouse-t is mutatott, mindkettőben számít, így ezek összege nem adja ki a találkozók számát. A projekt saját aránya nem áll mellettük: ${meetingsIn("hu", n)} mellett (a szükséges szám ${String(minimum)}, ${String(minimum - n)} hiányzik) ez az összevetés ítélet lenne arról, hogyan dolgozik valaki, túl vékony mintából.`
        : `Minden sor egy lakásméret: ${name} találkozóinak az a része, amelyen legalább egy ilyen méretű lakást megnyitottak, és ugyanez az arány a projekt összes találkozóján az időszakban. A sorok összege nem egy, és ez nem összetétel — egy találkozó, amely egyszobás lakást és négyszobás penthouse-t is mutatott, mindkettőben számít.`,
    buyersColumns: [
      "Lakások",
      "Találkozók, amelyek megnyitottak egyet",
      "A találkozói aránya",
      "Projekt",
    ],
    noneOpened: "Egyet sem nyitottak meg",
    ofEveryMeeting: "a projekt összes találkozójából",
    outcomeCaption: (name, below, n, minimum) =>
      `Hogyan zárultak ${name} találkozói: egy egész részei, az időszak összes találkozója a végén rögzített eredmény szerint. A nevező: ${meetingsIn("hu", n)}. A rögzített eredmény nélküli találkozók külön sort kapnak, ahelyett hogy beolvadnának egy olyanba, amely azt állítja, hogy történt valami.${below ? ` A darabszámok mellett nincs részarány: ${meetingsIn("hu", n)} mellett (a szükséges szám ${String(minimum)}, ${String(minimum - n)} hiányzik) az ember találkozóin számolt arány nem olyan szám, amely alapján cselekedni lehet, és minden darabszám már hordozza a nevezőjét.` : ""}`,
    outcomeColumns: ["Eredmény", "Találkozók", "Arány"],
    unitsCaption: (name, period) =>
      `A lakások, amelyeket ${name} találkozóinak legnagyobb részében megnyitottak (${period.toLowerCase()}), legfeljebb hat. Összefüggés a bemutató szokásával, semmi több: egy lakás, amelyet valakinek a legtöbb találkozóján megnyitnak, lehet az, amelyet a vevők kérnek, vagy az, amelyhez az értékesítő nyúl.`,
    noOtherProject: "Ebben az időszakban a fiók egyetlen másik projektjén sincs találkozója.",
    projectMeetings: (n, period) => `${meetingsIn("hu", n)} (${period.toLowerCase()})`,
    thisProject: "Ez a projekt",
    projectsNote:
      "Csak a fiók projektjeire szűkítve, soha nem az értékesítőéire. Egy ügynökség, amely két fejlesztőnek értékesít, a megszokott felállás, és egy lista, amely a többit is megmutatná, egy másik félről szóló üzleti tény lenne, egy munkatársi oldalról kiolvasva.",
    registerCaption: (name, period) =>
      `${name} legutóbbi találkozói (${period.toLowerCase()}), a legújabbal kezdve, legfeljebb nyolc.`,
    registerEmpty: (name, period) =>
      `${name} egyetlen találkozója sem esik az időszakba (${period.toLowerCase()}).`,
    registerLink: "Az időszak összes találkozója",
    registerRest: " az a lista, amelyből ez a nyolc származik.",
    appendixCaption:
      "Az összefoglaló minden szakasza az állapotával, a mintájával a saját főnevében, és a bizonyíték hivatkozásával, amelyen áll.",
  },
};
