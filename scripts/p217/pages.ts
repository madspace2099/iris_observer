/**
 * THE ELEVEN REPORT PAGES THE P2-17 SHEETS WERE CUT FROM, AND HOW EACH IS ADDRESSED.
 *
 * One list for the two readers of it: the dump (`dump.p217.ts`), which
 * writes them out, and the frame-language gate (`e2e/frame-language.spec.ts`),
 * which fails on English in a Slovak or Hungarian page. Neither imports the
 * other, because a Playwright file that imports a test file registers its tests.
 */

/** The eleven pages of the 09-27 dump, by the key the approval sheets use. */
export const PAGES = [
  "petra /alpha/northgate/report",
  "petra /alpha/northgate/report?period=year_to_date",
  "petra /alpha/northgate/report?period=last_28_days",
  "petra /alpha/riverside/report",
  "petra /alpha/ister-tower/report",
  "tomas /alpha/northgate/report",
  "tomas /alpha/northgate/report?agent=agt_akhilesh",
  "tomas /alpha/northgate/report?meeting=mtg_ng0132",
  "tomas /alpha/ister-tower/report",
  "tomas /alpha/ister-tower/report?agent=observer-review-harness",
  "tomas /alpha/ister-tower/report?meeting=d4c6a9e1-228c-460c-ab3e-2c235ff2de79",
] as const;

export const VIEWER = { petra: "Petra Novák", tomas: "Tomáš Varga" } as const;
export const LANGUAGES = ["en", "sk", "hu"] as const;
/** English is the page as addressed; the others carry `lang`, as the export dialog writes it. */
export const withLanguage = (path: string, language: string): string =>
  language === "en" ? path : `${path}${path.includes("?") ? "&" : "?"}lang=${language}`;
