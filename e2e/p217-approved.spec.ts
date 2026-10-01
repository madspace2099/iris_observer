import { expect, test } from "@playwright/test";
import { signInAs } from "./sign-in";

/**
 * THE APPROVED P2-17 TEXTS, ON THE PAGE (BEKOTES1).
 *
 * The texts wired from Máté's question sheet (2026-10-01) are proven at the
 * function that writes them (`packages/synthetic/test/p217-approved.test.ts`,
 * `apps/web/test/p217-approved.test.ts`). Where the synthetic world renders a
 * branch, it is proven here too, on the report page as a reader opens it:
 * below the floor at 4 meetings and at 15, a single name below the minimum,
 * the deal ladder's opening, and the Hungarian shortfalls. Every expected
 * string is the approved text with the page's own figures, written out.
 *
 * The pages the P2-17 dump reads are measured there as well (`pnpm
 * p217:compare`); the agent pages below are not among the dump's eleven, which
 * is why this spec exists.
 */

const CASES: readonly {
  readonly who: string;
  readonly path: string;
  readonly texts: readonly string[];
}[] = [
  {
    who: "Petra Novák",
    path: "/alpha/northgate/report?lang=hu",
    texts: [
      "Ebben az időszakban 19 találkozója volt, 1-gyel kevesebb az értékeléshez szükséges 20-nál. A számok láthatók, de rangsort és trendet nem állapítanak meg.",
      "Ebben az időszakban 18 találkozója volt, 2-vel kevesebb az értékeléshez szükséges 20-nál. A számok láthatók, de rangsort és trendet nem állapítanak meg.",
      "Ebben az időszakban 15 találkozója volt, 5-tel kevesebb az értékeléshez szükséges 20-nál. A számok láthatók, de rangsort és trendet nem állapítanak meg.",
      "Az arányokat a mérhető időből számolják: 74 találkozóból 74-et rögzítettek időadatokkal, minden lépésnél.",
    ],
  },
  {
    who: "Petra Novák",
    path: "/alpha/northgate/report?period=last_28_days&lang=hu",
    texts: [
      "Ebben az időszakban 12 találkozója volt, 8-cal kevesebb az értékeléshez szükséges 20-nál. A számok láthatók, de rangsort és trendet nem állapítanak meg.",
      "Az arányokat a mérhető időből számolják: 39 találkozóból 39-et rögzítettek időadatokkal, minden lépésnél.",
    ],
  },
  {
    who: "Petra Novák",
    path: "/alpha/northgate/report?lang=sk",
    texts: [
      "Podľa demonštračného CRM je aktuálne evidovaných 60 obchodov.",
      "21 stratených obchodov sa počíta osobitne vedľa rebríka.",
    ],
  },
  {
    who: "Tomáš Varga",
    path: "/alpha/northgate/report?agent=agt_akhilesh&lang=sk",
    texts: [
      "Akhilesh Undev: Poradie sekcií ukazuje, na ktorom mieste sa každá z nich v priemere objavuje počas stretnutí. Nejde o priebeh konkrétneho stretnutia. Pri každej sekcii je medián času stráveného v nej, jej podiel na meranom čase prezentácií a medián tímu na porovnanie; samotný čas sekcie by nemal mierku.",
      "Akhilesh Undev: Takto sa skončili stretnutia v danom období: všetkých 22 stretnutí je rozdelených podľa výsledku zaznamenaného na ich konci. Menovateľom je 22 stretnutí. Tie, pri ktorých výsledok nezaznamenali, majú vlastný riadok; nezaraďujú sa do riadka, ktorý naznačuje, že sa niečo stalo.",
    ],
  },
  {
    who: "Tomáš Varga",
    path: "/alpha/ister-tower/report?agent=agt_sabina&period=last_28_days&lang=sk",
    texts: [
      "Sabina Diallo: pri každej sekcii je uvedené, na ktorom mieste býva v priemere naprieč stretnutiami a aký je medián času stráveného v nej. Nejde o priebeh konkrétneho stretnutia. Podiel na meranom čase makléra ani medián tímu sa vedľa jednotlivých sekcií neuvádzajú. Pri 4 stretnutiach chýba do hranice 20 ešte 16; podiel by sa dal čítať ako hodnotenie a porovnanie s tímom ako úsudok o práci makléra, hoci vzorka je na oboje príliš malá.",
      "Sabina Diallo: tie stretnutia tohto makléra, na ktorých otvorili aspoň 1 byt danej veľkosti. Ak na tom istom stretnutí ukázali 1-izbový byt aj 4-izbový penthouse, započíta sa do oboch skupín. Súčet týchto počtov preto nie je počtom stretnutí. Vedľa počtov nie je podiel za celý projekt: pri 4 stretnutiach, teda 16 pod hranicou 20, by porovnanie naznačovalo hodnotenie práce makléra na základe príliš malej vzorky.",
      "Sabina Diallo: všetky stretnutia tohto makléra v danom období sú rozdelené podľa výsledku zaznamenaného na ich konci. Menovateľom sú 4 stretnutia. Tie bez zaznamenaného výsledku majú vlastný riadok; nezaraďujú sa do riadka, ktorý naznačuje, že sa niečo stalo. Vedľa počtov nie sú podiely: pri 4 stretnutiach chýba do hranice 20 ešte 16, takže z takto vypočítanej miery nemožno vychádzať pri rozhodovaní. Pri každom počte už je uvedený menovateľ, z ktorého sa podiel počíta.",
    ],
  },
  {
    who: "Tomáš Varga",
    path: "/alpha/northgate/report?agent=agt_lucia&lang=sk",
    texts: [
      " Pri 15 stretnutiach chýba do hranice 20 ešte 5; ",
      ": pri 15 stretnutiach, keď do hranice 20 chýba 5, by porovnanie",
      " Menovateľom je 15 stretnutí. ",
      ": pri 15 stretnutiach chýba do hranice 20 ešte 5, takže",
    ],
  },
  {
    who: "Tomáš Varga",
    path: "/beta/kingsford/report?lang=sk",
    texts: [
      "Eva Lindqvist: počet stretnutí zatiaľ nedosiahol minimum 20. Údaje sa preto zobrazia len ako počty, bez hodnotenia, poradia alebo trendu.",
    ],
  },
  {
    who: "Tomáš Varga",
    path: "/beta/kingsford/report?lang=hu",
    texts: [
      "Eva Lindqvist: még nincs meg a 20 találkozós minimum. Az adatok ezért csak darabszámként jelennek meg, értékelés, rangsor és trend nélkül.",
    ],
  },
];

for (const { who, path, texts } of CASES) {
  test(`${who} · ${path}: the approved text is on the page`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "the report's words do not vary with width");
    await signInAs(page, who);
    await page.goto(path, { waitUntil: "networkidle" });
    const body = await page.locator("body").innerText();
    for (const text of texts) expect(body, text).toContain(text);
  });
}
