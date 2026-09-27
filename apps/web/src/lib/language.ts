import { DEFAULT_LANGUAGE, LANGUAGES, type Language } from "@observer/readmodels";

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

/** Each language by its own name, as a reader looks for it in a list: never translated. */
export const LANGUAGE_NAMES: Readonly<Record<Language, string>> = {
  en: "English",
  sk: "Slovenčina",
  hu: "Magyar",
};
