import { DEFAULT_LANGUAGE, LANGUAGES, type Language, type ReportScope } from "@observer/readmodels";

/**
 * THE LANGUAGE A PRINTED REPORT IS ASKED FOR IN, FROM ITS ADDRESS.
 *
 * The screens are English. A report is a document a reader takes away, and the
 * export dialog lets them ask for it in any language the product writes; the
 * choice travels as `?lang=` on the report page's address, and from there on
 * the read-model request as `OverviewQuery.language` — the words' language,
 * never the project's locale, which still formats every figure and date.
 *
 * Anything that is not one of `LANGUAGES` — a code the product does not write,
 * a parameter given twice — is the default. A report link always opens.
 */
export function languageFrom(value: string | readonly string[] | undefined): Language {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value)
    ? (value as Language)
    : DEFAULT_LANGUAGE;
}

/**
 * `href` asking for `language`. The default is the absence of the parameter,
 * as the default period is for `withPeriod`, so an English report keeps the
 * address it always had.
 */
export function withLanguage(href: string, language: Language): string {
  const [path, query] = href.split("?");
  const params = new URLSearchParams(query ?? "");
  if (language === DEFAULT_LANGUAGE) params.delete("lang");
  else params.set("lang", language);
  const search = params.toString();
  return search.length === 0 ? (path ?? href) : `${path}?${search}`;
}

/**
 * THE LANGUAGES EACH DOCUMENT IS WRITTEN IN, WHOLE.
 *
 * A report half in Slovak is not half done, it is wrong: a reader cannot tell
 * which of its sentences were translated and which were left standing. So a
 * language is offered for a scope only once every word that scope's page
 * prints is written in it — the page's own, its components', and every read
 * model's it draws — and the list grows scope by scope as that becomes true.
 *
 * Here rather than beside the dialog, because the page reads it too: a
 * `?lang=` typed by hand is the same request the dialog makes, and it gets the
 * same answer.
 */
export const WRITTEN_IN: Readonly<Record<ReportScope["kind"], readonly Language[]>> = {
  project: ["en", "sk", "hu"],
  meeting: ["en", "sk", "hu"],
  agent: ["en", "sk", "hu"],
};

/** `language` where `kind` is written in it; otherwise the default, whole, rather than a mixture. */
export function writtenLanguage(kind: ReportScope["kind"], language: Language): Language {
  return WRITTEN_IN[kind].includes(language) ? language : DEFAULT_LANGUAGE;
}

/** Each language by its own name, as a reader looks for it in a list: never translated. */
export const LANGUAGE_NAMES: Readonly<Record<Language, string>> = {
  en: "English",
  sk: "Slovenčina",
  hu: "Magyar",
};
