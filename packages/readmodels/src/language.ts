/**
 * THE LANGUAGE OF THE WORDS, AND NOTHING ELSE.
 *
 * Three languages: Slovak, English and Hungarian. The language chooses the
 * words a view is written in; the locale (`ProjectSummary.locale`) formats its
 * numbers, money and dates. They are two facts, and neither is derived from the
 * other: a Hungarian reader of a Slovak project reads Hungarian words and the
 * figures as that project formats them.
 *
 * It lives here, beside the read models, rather than in the synthetic generator,
 * because the repository that replaces the generator takes the same request and
 * has to choose the same words.
 */
export const LANGUAGES = ["sk", "en", "hu"] as const;
export type Language = (typeof LANGUAGES)[number];

/** Every caller passes this until the reader can choose. */
export const DEFAULT_LANGUAGE: Language = "en";

/**
 * A word or a phrase as each language writes it after a count, beside the
 * sentence that uses it.
 *
 * Each language carries the categories its own plural rules give a count:
 * English two, Slovak three — and a fourth where the count can be a fraction —
 * and Hungarian two, which are the same singular form, for the reason on
 * `plural`.
 */
export interface PluralForms {
  readonly en: { readonly one: string; readonly other: string };
  /** 1 · 2 to 4 · 0 and 5 and above · and a fraction, "1,5", where the count can be one. */
  readonly sk: {
    readonly one: string;
    readonly few: string;
    readonly other: string;
    readonly many?: string;
  };
  /** Both singular. See `plural`. */
  readonly hu: { readonly one: string; readonly other: string };
}

const RULES: Readonly<Record<Language, Intl.PluralRules>> = {
  sk: new Intl.PluralRules("sk"),
  en: new Intl.PluralRules("en"),
  hu: new Intl.PluralRules("hu"),
};

/**
 * THE FORM A COUNT TAKES, CHOSEN BY THE LANGUAGE'S OWN RULES.
 *
 * `n === 1 ? "day" : "days"` is English, and English alone.
 *
 * Slovak has three forms for a count: one for 1, one for 2 to 4, and one for 0
 * and 5 and above (`one`, `few`, `other`) — "1 deň", "3 dni", "5 dní". The
 * pattern `n === 1 ? a : b` is wrong from 2 to 4, not only above 5.
 *
 * In Hungarian, after a numeral the noun stays SINGULAR: 5 találkozó, not 5
 * találkozók. Intl.PluralRules gives Hungarian a `one` and an `other` slot,
 * and the Hungarian `other` slot takes the SINGULAR form. If anyone writes the
 * plural there, every count in the product is wrong, and the type check will
 * not notice.
 *
 * The form is chosen for the figure as printed, so a caller that prints a
 * rounded value passes the rounded value. A fraction takes Slovak's fourth
 * form, `many` — "1,5 izby", the genitive singular — and an entry for
 * something that can be counted in halves, a room or a day, carries it. A count
 * of meetings is never a fraction, and its entry carries three.
 */
export function plural(language: Language, n: number, forms: PluralForms): string {
  const category = RULES[language].select(n);
  const set: Readonly<Record<string, string>> = forms[language];
  return set[category] ?? forms[language].other;
}
